import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import { describeExit, planBuild, type BuildMode, type BuildPlan, type CppStandard, type Language } from './languages.js';
import { processSlots, runProcess, type ProcessResult } from './process.js';

export interface CompileResult {
  ok: boolean;
  output: string;
  timeMs: number;
}

export type TestStatus = 'ok' | 'runtime_error' | 'time_limit' | 'output_limit' | 'internal_error';

export interface TestRunResult {
  id: string;
  status: TestStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
  message?: string;
}

export interface RunRequest {
  language: Language;
  code: string;
  cppStandard: CppStandard;
  timeLimitMs: number;
  tests: { id: string; input: string }[];
}

export interface Workspace {
  dir: string;
  plan: BuildPlan;
  compile: CompileResult;
  /** Failures that may succeed next time (missing compiler, timeout) are not cached. */
  transient: boolean;
}

export const WORK_ROOT = path.join(os.tmpdir(), 'cp-studio-runs');
const MAX_CACHED_WORKSPACES = 40;

// Compiled programs keyed by a hash of (language, flags, code): "Run all" and
// re-runs of unchanged code skip compilation entirely.
const workspaces = new Map<string, Promise<Workspace>>();

export async function initRunner() {
  await fs.rm(WORK_ROOT, { recursive: true, force: true });
  await fs.mkdir(WORK_ROOT, { recursive: true });
}

export function cleanPaths(text: string, dir: string): string {
  return text.split(dir + path.sep).join('').split(dir).join('.');
}

export const MISSING_TOOLCHAIN: Record<Language, string> = {
  cpp: 'g++ was not found on the server. Install GCC (MSYS2/WinLibs on Windows) or set CXX in server/.env.',
  java: 'javac was not found on the server. Install a JDK (17+) or set JAVAC/JAVA in server/.env.',
  python: 'Python was not found on the server. Install Python 3 or set PYTHON in server/.env.',
};

async function prepareWorkspace(key: string, language: Language, code: string, cppStandard: CppStandard, mode: BuildMode): Promise<Workspace> {
  const dir = path.join(WORK_ROOT, key);
  await fs.mkdir(dir, { recursive: true });
  const plan = planBuild(language, code, dir, cppStandard, mode);
  await fs.writeFile(path.join(dir, plan.sourceFile), code);
  for (const [name, content] of Object.entries(plan.extraFiles ?? {})) await fs.writeFile(path.join(dir, name), content);

  const result = await processSlots.use(() =>
    runProcess(plan.compile.cmd, plan.compile.args, {
      cwd: dir,
      timeoutMs: config.limits.compileTimeoutMs,
      maxOutputBytes: 256 * 1024,
    }),
  );

  let output = cleanPaths(`${result.stdout}${result.stderr}`, dir).trim();
  if (result.spawnError) output = MISSING_TOOLCHAIN[language];
  else if (result.timedOut) output += '\nCompilation timed out.';

  return {
    dir,
    plan,
    compile: { ok: result.exitCode === 0 && !result.timedOut && !result.spawnError, output, timeMs: result.timeMs },
    transient: Boolean(result.spawnError) || result.timedOut,
  };
}

export function getWorkspace(language: Language, code: string, cppStandard: CppStandard, mode: BuildMode = 'run'): Promise<Workspace> {
  const key = createHash('sha256').update(`${language}\0${cppStandard}\0${mode}\0${code}`).digest('hex').slice(0, 24);

  const cached = workspaces.get(key);
  if (cached) {
    workspaces.delete(key); // re-insert to mark as most recently used
    workspaces.set(key, cached);
    return cached;
  }

  const workspace = prepareWorkspace(key, language, code, cppStandard, mode);
  workspaces.set(key, workspace);
  workspace.then(
    (ws) => ws.transient && workspaces.delete(key),
    () => workspaces.delete(key),
  );

  while (workspaces.size > MAX_CACHED_WORKSPACES) {
    const [oldestKey, oldest] = workspaces.entries().next().value!;
    workspaces.delete(oldestKey);
    oldest.then((ws) => fs.rm(ws.dir, { recursive: true, force: true })).catch(() => {});
  }
  return workspace;
}

/**
 * On a CPU quota (e.g. 0.1 core) a program gets only a slice of each second, so its real running time is
 * many times its CPU time. The hard stop allows for that; the verdict uses the measured CPU time.
 */
const SLOWDOWN = config.cpuLimit !== null && config.cpuLimit < 1 ? Math.min(10, 1 / config.cpuLimit) : 1;

function toTestResult(id: string, result: ProcessResult, ws: Workspace, language: Language, timeLimitMs: number): TestRunResult {
  const base = {
    id,
    stdout: result.stdout,
    stderr: cleanPaths(result.stderr, ws.dir),
    exitCode: result.exitCode,
    timeMs: result.timeMs,
  };
  if (result.spawnError) return { ...base, status: 'internal_error', message: MISSING_TOOLCHAIN[language] };
  if (result.timedOut || (result.cpuMeasured && result.timeMs > timeLimitMs)) return { ...base, status: 'time_limit' };
  if (result.outputLimitExceeded) return { ...base, status: 'output_limit', message: 'Output exceeded 1 MB' };
  if (result.exitCode !== 0 || result.signal) {
    return { ...base, status: 'runtime_error', message: describeExit(result.exitCode, result.signal) };
  }
  return { ...base, status: 'ok' };
}

export async function execute(request: RunRequest): Promise<{ compile: CompileResult; results: TestRunResult[] }> {
  const ws = await getWorkspace(request.language, request.code, request.cppStandard);
  if (!ws.compile.ok) return { compile: ws.compile, results: [] };

  // Tests run one after another so each gets the CPU to itself and times stay meaningful.
  const results: TestRunResult[] = [];
  for (const test of request.tests) {
    const result = await processSlots.use(() =>
      runProcess(ws.plan.run.cmd, ws.plan.run.args, {
        cwd: ws.dir,
        input: test.input,
        timeoutMs: Math.round(request.timeLimitMs * SLOWDOWN) + (SLOWDOWN > 1 ? 1000 : 0),
        cpuTime: true,
      }),
    );
    results.push(toTestResult(test.id, result, ws, request.language, request.timeLimitMs));
  }
  return { compile: ws.compile, results };
}
