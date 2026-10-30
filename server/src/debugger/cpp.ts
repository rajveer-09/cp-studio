import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { cleanPaths, type Workspace } from '../runner/index.js';
import { cppExecutable, describeExit } from '../runner/languages.js';
import { MiSession, type MiTuple } from './mi.js';
import { clip, type TraceOutcome, type TraceStep } from './types.js';

const SIGNALS: Record<string, string> = {
  SIGSEGV: 'Segmentation fault: invalid memory access or stack overflow',
  SIGFPE: 'Arithmetic error: division by zero?',
  SIGABRT: 'Program aborted (failed assertion or uncaught exception)',
};

/** Line of each name's first appearance; before it, gdb would only show uninitialised garbage. */
function firstAppearance(code: string, names: string[]): Map<string, number> {
  const lines = code.split('\n');
  return new Map(names.map((name) => [name, lines.findIndex((l) => new RegExp(`\\b${name}\\b`).test(l)) + 1 || 1]));
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
 * How to read a variable. gdb builds without Python pretty printers (e.g. MinGW) print std::vector and
 * std::string as raw libstdc++ internals, so for those we read the underlying data directly.
 */
type ValueKind = 'plain' | 'vector' | 'string';

function expressionFor(name: string, kind: ValueKind): string {
  if (kind === 'vector') return `"*${name}._M_impl._M_start@(${name}._M_impl._M_finish - ${name}._M_impl._M_start)"`;
  if (kind === 'string') return `${name}._M_dataplus._M_p`;
  return name;
}

function kindOf(raw: string): ValueKind {
  if (raw.includes('_M_start') && raw.includes('_M_finish')) return 'vector';
  if (raw.includes('_M_dataplus')) return 'string';
  return 'plain';
}

function tidy(raw: string): string {
  if (/^std::[\w:]+ (?:of length 0|with 0 elements)/.test(raw)) return '{}';
  return clip(raw.replace(/^std::[\w:]+ (?:of length \d+(?:, capacity \d+)?|with \d+ elements?) = /, ''));
}

/** Reads all visible watches with pipelined commands: one round trip per step instead of one per variable. */
async function readValues(gdb: MiSession, names: string[], kinds: Map<string, ValueKind>): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  const read = (name: string) => {
    const kind = kinds.get(name) ?? 'plain';
    return gdb.command(`-data-evaluate-expression ${expressionFor(name, kind)}`).then((result) => ({ name, kind, result }));
  };

  const retry: string[] = [];
  for (const { name, kind, result } of await Promise.all(names.map(read))) {
    if (result.cls !== 'done') {
      // "No symbol" means out of scope; for an empty vector the @-expression itself fails.
      if (kind === 'vector' && !/No symbol/.test(String(result.data.msg))) values[name] = '{}';
      continue;
    }
    const raw = String(result.data.value ?? '');
    if (kind === 'plain' && kindOf(raw) !== 'plain') {
      kinds.set(name, kindOf(raw));
      retry.push(name);
    } else {
      values[name] = tidy(raw);
    }
  }
  for (const { name, result } of await Promise.all(retry.map(read))) {
    values[name] = result.cls === 'done' ? tidy(String(result.data.value ?? '')) : '{}';
  }
  return values;
}

/**
 * At a variable's declaration line the program hasn't initialised it yet, so its value is garbage.
 * Loop headers are the exception: coming back to `for (int i…)` from below, `i` is meaningful.
 */
function isInitialised(name: string, line: number, prevLine: number | undefined, declaredAt: Map<string, number>, lines: string[]) {
  const declared = declaredAt.get(name)!;
  if (line !== declared) return line > declared;
  return /^\s*for\s*\(/.test(lines[line - 1] ?? '') && prevLine !== undefined && prevLine > line;
}

export async function traceCpp(ws: Workspace, code: string, input: string, watches: string[]): Promise<TraceOutcome> {
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

    // Now inside main() (static initialisers have run). A breakpoint on every function in the user's file
    // lets us step *over* calls (fast: library code is never entered) yet still stop in the user's functions.
    await gdb.command('-interpreter-exec console "rbreak main.cpp:."');
    // Function names from some gdb builds are unreliable, so main() is recognised by its stack depth.
    const mainDepth = Number((await gdb.command('-stack-info-depth')).data.depth);

    const declaredAt = firstAppearance(code, watches);
    const lastLineOfMain = mainEndLine(code);
    const sourceLines = code.split('\n');
    const kinds = new Map<string, ValueKind>();
    const lastLineAtDepth = new Map<number, number>();
    let recording = true;
    let resumedFromLibrary = false;

    while (stop) {
      const reason = String(stop.reason ?? '');
      if (reason.startsWith('exited')) {
        exitCode = reason === 'exited' ? parseInt(String(stop['exit-code'] ?? '1'), 8) : 0;
        break;
      }

      const frame = (stop.frame ?? {}) as MiTuple;
      const line = Number(frame.line);
      const inUserCode = typeof frame.file === 'string' && /(^|[\\/])main\.cpp$/.test(frame.file) && line > 0;

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
        // Library code, or main() has finished: run until we're back in user code (or the program ends).
        stop = recording ? ((await gdb.exec('-exec-finish')) ?? (await gdb.exec('-exec-continue'))) : await gdb.exec('-exec-continue');
        resumedFromLibrary = true;
        continue;
      }

      // Returning from a library call lands mid-line; that line was already recorded.
      if (!resumedFromLibrary) {
        const candidates = watches.filter((name) => line >= declaredAt.get(name)!);
        const [depthResult, allValues] = await Promise.all([gdb.command('-stack-info-depth'), readValues(gdb, candidates, kinds)]);
        const depth = Number(depthResult.data.depth);
        // Compare with the previous line *in this same function call*, not one inside a callee.
        const prevLine = lastLineAtDepth.get(depth);
        for (const d of lastLineAtDepth.keys()) if (d > depth) lastLineAtDepth.delete(d);
        lastLineAtDepth.set(depth, line);

        const values = Object.fromEntries(
          Object.entries(allValues).filter(([name]) => isInitialised(name, line, prevLine, declaredAt, sourceLines)),
        );
        steps.push({ line, values });

        // After main's return statement only destructors and runtime shutdown remain: stop recording.
        const mayExitMain = line === lastLineOfMain || /^\s*return\b/.test(sourceLines[line - 1] ?? '');
        if (mayExitMain && depth === mainDepth) {
          recording = false;
          await gdb.command('-break-delete');
        }
      }
      resumedFromLibrary = false;
      stop = recording ? await gdb.exec('-exec-next') : await gdb.exec('-exec-continue');
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
