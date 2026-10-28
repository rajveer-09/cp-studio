import os from 'node:os';
import { config } from '../config.js';
import type { Language } from './languages.js';
import { runProcess } from './process.js';

export interface ToolchainInfo {
  available: boolean;
  version: string;
}

export interface Toolchains {
  languages: Record<Language, ToolchainInfo>;
  gdb: ToolchainInfo;
}

const CACHE_MS = 60_000;
let cache: { at: number; value: Promise<Toolchains> } | null = null;

async function probe(cmd: string, args: string[]): Promise<ToolchainInfo> {
  const result = await runProcess(cmd, args, { cwd: os.tmpdir(), timeoutMs: 15_000 });
  const available = !result.spawnError && !result.timedOut && result.exitCode === 0;
  const firstLine = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/)[0] ?? '';
  return { available, version: available ? firstLine : '' };
}

export function getToolchains(): Promise<Toolchains> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const { cxx, javac, python, gdb } = config.toolchain;
    cache = {
      at: Date.now(),
      value: Promise.all([
        probe(cxx, ['--version']),
        probe(javac, ['-version']),
        probe(python, ['--version']),
        probe(gdb, ['--version']),
      ]).then(([cpp, java, py, gdbInfo]) => ({ languages: { cpp, java, python: py }, gdb: gdbInfo })),
    };
  }
  return cache.value;
}
