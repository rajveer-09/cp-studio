import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { cleanPaths, type Workspace } from '../runner/index.js';
import { cppExecutable, describeExit } from '../runner/languages.js';
import { MiSession, type MiTuple } from './mi.js';
import { clip, inRanges, type TraceOutcome, type TraceStep } from './types.js';

const SIGNALS: Record<string, string> = {
  SIGSEGV: 'Segmentation fault: invalid memory access or stack overflow',
  SIGFPE: 'Arithmetic error: division by zero?',
  SIGABRT: 'Program aborted (failed assertion or uncaught exception)',
};

/** Line of each name's first appearance outside hidden code; before it, gdb would only show uninitialised garbage. */
function firstAppearance(code: string, names: string[], hidden: [number, number][]): Map<string, number> {
  const lines = code.split('\n');
  const find = (name: string) => lines.findIndex((l, i) => !inRanges(i + 1, hidden) && new RegExp(`\\b${name}\\b`).test(l)) + 1;
  return new Map(names.map((name) => [name, find(name) || 1]));
}

/** Last line of main(): once execution gets there, the rest is destructors and runtime shutdown. */
function mainEndLine(code: string): number {
  const lines = code.split('\n');
  const start = lines.findIndex((l) => /\bmain\s*\(/.test(l));
  let depth = 0;
  for (let i = Math.max(start, 0); i < lines.length; i++) {
    const text = lines[i].replace(/\/\/.*$/, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    for (const ch of text) {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return i + 1;
    }
  }
  return lines.length;
}

/**
 * How to read a variable. gdb builds without Python pretty printers (e.g. MinGW) print STL containers as
 * raw libstdc++ internals, so for those we read the underlying data (or, for trees and hash tables, the size).
 */
type ValueKind = 'plain' | 'vector' | 'string' | 'tree' | 'hash';

function kindOf(raw: string): ValueKind {
  if (raw.includes('_M_node_count')) return 'tree';
  if (raw.includes('_M_element_count')) return 'hash';
  if (raw.includes('_M_start') && raw.includes('_M_finish')) return 'vector';
  if (raw.includes('_M_dataplus')) return 'string';
  return 'plain';
}

/** Drops pretty-printer prefixes ("std::vector of length 3, capacity 4 = "), also inside nested containers. */
function tidy(raw: string): string {
  if (/^std::[\w:]+ (?:of length 0|with 0 elements)/.test(raw)) return '{}';
  return clip(raw.replace(/std::[\w:]+ (?:of length \d+(?:, capacity \d+)?|with \d+ elements?) = /g, ''));
}

const MAX_ROWS = 12;
const MAX_ITEMS = 64;
type Evaluated = { ok: true; value: string } | { ok: false; outOfScope: boolean };

async function evaluate(gdb: MiSession, expr: string): Promise<Evaluated> {
  const result = await gdb.command(`-data-evaluate-expression "${expr}"`);
  if (result.cls === 'done') return { ok: true, value: String(result.data.value ?? '') };
  return { ok: false, outOfScope: /No symbol|not in scope/i.test(String(result.data.msg)) };
}

/** Reads a raw value of a known kind; nested containers (vector<vector<int>>, vector<string>) element by element. */
async function readAs(gdb: MiSession, expr: string, kind: ValueKind): Promise<string | null> {
  if (kind === 'tree' || kind === 'hash') {
    const count = await evaluate(gdb, kind === 'tree' ? `${expr}._M_t._M_impl._M_node_count` : `${expr}._M_h._M_element_count`);
    return count.ok ? `(${count.value} element${count.value === '1' ? '' : 's'})` : null;
  }
  if (kind === 'string') {
    const text = await evaluate(gdb, `${expr}._M_dataplus._M_p`);
    return text.ok ? tidy(text.value.replace(/^0x[\da-f]+ /i, '')) : null;
  }
  if (kind === 'plain') {
    const value = await evaluate(gdb, expr);
    return value.ok ? tidy(value.value) : null;
  }
  const length = `(${expr}._M_impl._M_finish - ${expr}._M_impl._M_start)`;
  // Capped: a vector that isn't constructed yet can claim any length, and gdb would try to read all of it.
  const [items, count] = await Promise.all([
    evaluate(gdb, `*${expr}._M_impl._M_start@(${length} > ${MAX_ITEMS} ? ${MAX_ITEMS} : ${length})`),
    evaluate(gdb, length),
  ]);
  // An empty vector makes the @-expression itself fail.
  if (!items.ok) return items.outOfScope ? null : '{}';
  const total = count.ok ? Number(count.value) || 0 : 0;
  const inner = kindOf(items.value);
  if (inner === 'plain') return tidy(total > MAX_ITEMS ? items.value.replace(/}$/, ', …}') : items.value);
  const shown = Math.min(total, MAX_ROWS);
  const parts = await Promise.all(Array.from({ length: shown }, (_, i) => readAs(gdb, `${expr}._M_impl._M_start[${i}]`, inner)));
  return clip(`{${parts.map((p) => p ?? '?').join(', ')}${total > shown ? ', …' : ''}}`);
}

/** Reads all visible watches with pipelined commands, so a step costs about one round trip. */
async function readValues(gdb: MiSession, names: string[], kinds: Map<string, ValueKind>): Promise<Record<string, string>> {
  const read = async (name: string): Promise<[string, string | null]> => {
    const known = kinds.get(name);
    if (known) return [name, await readAs(gdb, name, known)];
    const first = await evaluate(gdb, name);
    if (!first.ok) return [name, null];
    const kind = kindOf(first.value);
    if (kind === 'plain') return [name, tidy(first.value)];
    kinds.set(name, kind);
    return [name, await readAs(gdb, name, kind)];
  };
  const values: Record<string, string> = {};
  for (const [name, value] of await Promise.all(names.map(read))) if (value !== null) values[name] = value;
  return values;
}

/** A line with nothing but a closing brace: locals may already be destroyed there, so it isn't recorded. */
const isClosingBrace = (text: string) => /^\s*}\s*;?\s*(\/\/.*)?$/.test(text);

/**
 * At a variable's declaration line the program hasn't initialised it yet, so its value is garbage.
 * Loop headers are the exception: coming back to `for (int i…)` from below, `i` is meaningful.
 */
function isInitialised(name: string, line: number, prevLine: number | undefined, declaredAt: Map<string, number>, lines: string[]) {
  const declared = declaredAt.get(name)!;
  if (line !== declared) return line > declared;
  return /^\s*for\s*\(/.test(lines[line - 1] ?? '') && prevLine !== undefined && prevLine > line;
}

export async function traceCpp(ws: Workspace, code: string, input: string, watches: string[], hidden: [number, number][] = []): Promise<TraceOutcome> {
  const { maxSteps, timeLimitMs } = config.debugger;
  const deadline = Date.now() + timeLimitMs;
  await fs.writeFile(path.join(ws.dir, 'input.txt'), input);
  await fs.rm(path.join(ws.dir, 'stdout.txt'), { force: true });
  await fs.rm(path.join(ws.dir, 'stderr.txt'), { force: true });

  const gdb = new MiSession(config.toolchain.gdb, ['--interpreter=mi2', '--quiet', '--nx', path.join(ws.dir, cppExecutable)], ws.dir);
  const steps: TraceStep[] = [];
  let truncated = false;
  let error: string | undefined;
  let errorLine: number | undefined;
  let exitCode: number | null = null;
  // Hard stop: if the program blocks or gdb stops answering, killing gdb ends every pending wait.
  const killer = setTimeout(() => {
    truncated = true;
    gdb.kill();
  }, timeLimitMs + 3000);

  try {
    for (const setting of ['confirm off', 'pagination off', 'print elements 50', 'print repeats 10', 'print address off', 'disable-randomization off']) {
      await gdb.command(`-gdb-set ${setting}`);
    }
    await gdb.command('-enable-pretty-printing');
    await gdb.command('-break-insert -f main');

    let stop: MiTuple | null = await gdb.exec('-exec-run');
    if (!stop && gdb.spawnError) throw new Error(`The C++ debugger needs gdb. ${gdb.spawnError}. Install gdb or set GDB in server/.env.`);
    if (!stop) error = 'The debugger could not start the program.';

    // Now inside main() (static initialisers have run). A breakpoint at the start of every line of the user's
    // code: between them the program runs at full speed, so library calls and loops written on one line cost
    // nothing, yet every line the user wrote (functions, lambdas, recursion) is seen. Hidden code (a LeetCode
    // harness) gets no breakpoints and runs like library code.
    const listing = await gdb.command('-symbol-list-lines main.cpp');
    const codeLines = [...new Set(((listing.data.lines ?? []) as MiTuple[]).map((l) => Number(l.line)))].filter(
      (l) => l > 0 && !inRanges(l, hidden),
    );
    await Promise.all(codeLines.map((l) => gdb.command(`-break-insert main.cpp:${l}`)));
    // Function names from some gdb builds are unreliable, so main() is recognised by its stack depth.
    const mainDepth = Number((await gdb.command('-stack-info-depth')).data.depth);

    const declaredAt = firstAppearance(code, watches, hidden);
    const lastLineOfMain = mainEndLine(code);
    const sourceLines = code.split('\n');
    const kinds = new Map<string, ValueKind>();
    const lastLineAtDepth = new Map<number, number>();
    let recording = true;

    while (stop) {
      const reason = String(stop.reason ?? '');
      if (reason.startsWith('exited')) {
        exitCode = reason === 'exited' ? parseInt(String(stop['exit-code'] ?? '1'), 8) : 0;
        break;
      }

      const frame = (stop.frame ?? {}) as MiTuple;
      const line = Number(frame.line);
      const inUserCode = typeof frame.file === 'string' && /(^|[\\/])main\.cpp$/.test(frame.file) && line > 0 && !inRanges(line, hidden);

      if (reason === 'signal-received') {
        const signal = String(stop['signal-name'] ?? '');
        error = SIGNALS[signal] ?? describeExit(null, signal as NodeJS.Signals);
        const stack = await gdb.command('-stack-list-frames');
        const frames = ((stack.data.stack ?? []) as MiTuple[]).map((f) => (f.frame ?? f) as MiTuple);
        errorLine = Number(frames.find((f) => typeof f.file === 'string' && /main\.cpp$/.test(f.file))?.line) || undefined;
        break;
      }

      if (recording && (Date.now() > deadline || steps.length >= maxSteps)) {
        truncated = true;
        break;
      }

      if (!recording || !inUserCode) {
        // Hidden code, or main() has finished: run on to the next user line (or the end of the program).
        stop = await gdb.exec('-exec-continue');
        continue;
      }

      const brace = isClosingBrace(sourceLines[line - 1] ?? '');
      // On its declaration line a variable isn't constructed yet (reading it can even stall gdb), except in a loop header.
      const loopHeader = /^\s*for\s*\(/.test(sourceLines[line - 1] ?? '');
      const candidates = brace ? [] : watches.filter((name) => line > declaredAt.get(name)! || (loopHeader && line === declaredAt.get(name)));
      const [depthResult, allValues] = await Promise.all([gdb.command('-stack-info-depth'), readValues(gdb, candidates, kinds)]);
      const depth = Number(depthResult.data.depth);
      // Compare with the previous line *in this same function call*, not one inside a callee.
      const prevLine = lastLineAtDepth.get(depth);
      for (const d of lastLineAtDepth.keys()) if (d > depth) lastLineAtDepth.delete(d);
      lastLineAtDepth.set(depth, line);

      if (!brace) {
        const values = Object.fromEntries(
          Object.entries(allValues).filter(([name]) => isInitialised(name, line, prevLine, declaredAt, sourceLines)),
        );
        steps.push({ line, values });
      }

      // After main's return statement only destructors and runtime shutdown remain: stop recording.
      const mayExitMain = line === lastLineOfMain || /^\s*return\b/.test(sourceLines[line - 1] ?? '');
      if (mayExitMain && depth === mainDepth) {
        recording = false;
        await gdb.command('-break-delete');
      }
      stop = await gdb.exec('-exec-continue');
    }
  } finally {
    clearTimeout(killer);
    gdb.kill();
  }

  const read = (file: string) => fs.readFile(path.join(ws.dir, file), 'utf8').catch(() => '');
  return {
    steps,
    truncated,
    stdout: await read('stdout.txt'),
    stderr: cleanPaths(await read('stderr.txt'), ws.dir),
    error,
    errorLine,
    exitCode,
  };
}
