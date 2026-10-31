import fs from 'node:fs';
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

/**
 * CPU cores this container may use, from its cgroup quota (e.g. 0.1 on a small cloud instance), or null
 * when unlimited or unknown. os.availableParallelism() reports the host's cores, which can be far more.
 */
function cgroupCpuLimit(): number | null {
  const read = (file: string) => {
    try {
      return fs.readFileSync(file, 'utf8').trim();
    } catch {
      return '';
    }
  };
  const [quota, period] = read('/sys/fs/cgroup/cpu.max').split(/\s+/); // cgroup v2: "10000 100000" or "max 100000"
  if (quota && quota !== 'max' && Number(period) > 0) return Number(quota) / Number(period);
  const v1Quota = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
  const v1Period = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
  return v1Quota > 0 && v1Period > 0 ? v1Quota / v1Period : null;
}

const cpuLimit = isWindows ? null : cgroupCpuLimit();

/** Comma- or space-separated values, without blanks or duplicates. */
function list(value: string): string[] {
  return [...new Set(value.split(/[,\s]+/).filter(Boolean))];
}

export const config = {
  isWindows,
  port: positiveInt('PORT', 3001),
  /** Optional shared password. When set, every API call must send it in the `x-access-key` header. */
  accessKey: text('ACCESS_KEY'),
  trustProxy: text('TRUST_PROXY'),
  clientDist: path.resolve(serverRoot, '../client/dist'),

  gemini: {
    /** GEMINI_API_KEYS (comma-separated) and/or GEMINI_API_KEY; duplicates are ignored. */
    apiKeys: list(`${text('GEMINI_API_KEYS')},${text('GEMINI_API_KEY')}`),
    model: text('GEMINI_MODEL', 'gemini-3.6-flash'),
    /** Used in order once every key has run out of quota on the main model (quotas are per model). */
    fallbackModels: list(text('GEMINI_FALLBACK_MODELS', 'gemini-3.5-flash-lite,gemini-3.1-flash-lite')),
  },

  toolchain: {
    cxx: text('CXX', 'g++'),
    javac: text('JAVAC', 'javac'),
    java: text('JAVA', 'java'),
    python: text('PYTHON', isWindows ? 'python' : 'python3'),
    gdb: text('GDB', 'gdb'),
    /** A directory with a precompiled bits/stdc++.h (bits/stdc++.h.gch), built into the Docker image. */
    cxxPchDir: text('CXX_PCH_DIR'),
  },

  /** A GitHub OAuth App, for "Save to GitHub" (optional). Users sign in with their own accounts. */
  github: {
    clientId: text('GITHUB_CLIENT_ID'),
    clientSecret: text('GITHUB_CLIENT_SECRET'),
    /** The site's public address, if it can't be worked out from requests (e.g. https://cp-studio.onrender.com). */
    publicUrl: text('PUBLIC_URL'),
  },

  /** CPU cores allowed by the container (null: no limit found). */
  cpuLimit,

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
    // With a CPU quota (e.g. 0.1 core), programs running side by side would share it and all look slow.
    maxConcurrentProcesses: positiveInt(
      'MAX_CONCURRENT_RUNS',
      cpuLimit !== null ? Math.max(1, Math.min(os.availableParallelism(), Math.floor(cpuLimit))) : Math.max(2, os.availableParallelism()),
    ),
  },
};

export const aiEnabled = config.gemini.apiKeys.length > 0;
export const githubEnabled = Boolean(config.github.clientId && config.github.clientSecret);
