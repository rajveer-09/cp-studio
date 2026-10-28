import { spawn, type ChildProcess } from 'node:child_process';
import { config } from '../config.js';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timeMs: number;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  spawnError?: string;
}

export interface ProcessOptions {
  cwd: string;
  input?: string;
  timeoutMs: number;
  maxOutputBytes?: number;
}

// User programs only get the variables they need to run. In particular the
// server's secrets (GEMINI_API_KEY, ACCESS_KEY…) are never passed down.
const PASSED_ENV = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'JAVA_HOME',
]);

export const childEnv: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => PASSED_ENV.has(key.toUpperCase()))),
  PYTHONIOENCODING: 'utf-8',
  PYTHONDONTWRITEBYTECODE: '1',
};

export function killTree(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (config.isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL'); // the child leads its own process group (detached)
    } catch {
      child.kill('SIGKILL');
    }
  }
}

export function runProcess(cmd: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  const maxOutput = options.maxOutputBytes ?? config.limits.maxOutputBytes;
  const maxStderr = config.limits.maxStderrBytes;

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let settled = false;

    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: childEnv,
      windowsHide: true,
      detached: !config.isWindows,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, options.timeoutMs);

    const finish = (partial: Partial<ProcessResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: null,
        signal: null,
        timeMs: Math.round(performance.now() - startedAt),
        timedOut,
        outputLimitExceeded,
        ...partial,
      });
    };

    child.stdout!.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutput) {
        if (!outputLimitExceeded) {
          outputLimitExceeded = true;
          killTree(child);
        }
        return;
      }
      stdout.push(chunk);
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      if (stderrBytes < maxStderr) stderr.push(chunk.subarray(0, maxStderr - stderrBytes));
      stderrBytes += chunk.length;
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({ spawnError: err.code === 'ENOENT' ? `Command not found: ${cmd}` : err.message });
    });

    child.on('close', (exitCode, signal) => finish({ exitCode, signal }));

    // The program may exit without reading all of its input (EPIPE): that's fine.
    child.stdin!.on('error', () => {});
    child.stdin!.end(options.input ?? '');
  });
}

class Semaphore {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async use<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.max) this.active++;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export const processSlots = new Semaphore(config.limits.maxConcurrentProcesses);
