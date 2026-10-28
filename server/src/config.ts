import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(serverRoot, '.env'));
} catch {
  // No .env file: rely on real environment variables (e.g. in production).
}

const isWindows = process.platform === 'win32';

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function text(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  isWindows,
  port: positiveInt('PORT', 3001),
  /** Optional shared password. When set, every API call must send it in the `x-access-key` header. */
  accessKey: text('ACCESS_KEY'),
  trustProxy: text('TRUST_PROXY'),
  clientDist: path.resolve(serverRoot, '../client/dist'),

  gemini: {
    apiKey: text('GEMINI_API_KEY'),
    model: text('GEMINI_MODEL', 'gemini-3.6-flash'),
  },

  toolchain: {
    cxx: text('CXX', 'g++'),
    javac: text('JAVAC', 'javac'),
    java: text('JAVA', 'java'),
    python: text('PYTHON', isWindows ? 'python' : 'python3'),
    gdb: text('GDB', 'gdb'),
  },

  debugger: {
    maxSteps: 2000,
    timeLimitMs: 15_000,
  },

  limits: {
    compileTimeoutMs: 30_000,
    defaultTimeLimitMs: 2_000,
    minTimeLimitMs: 250,
    maxTimeLimitMs: 10_000,
    maxOutputBytes: 1024 * 1024,
    maxStderrBytes: 64 * 1024,
    maxCodeBytes: 200 * 1024,
    maxInputBytes: 2 * 1024 * 1024,
    maxTests: 30,
    maxConcurrentProcesses: positiveInt('MAX_CONCURRENT_RUNS', Math.max(2, os.availableParallelism())),
  },
};

export const aiEnabled = config.gemini.apiKey.length > 0;
