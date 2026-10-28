import path from 'node:path';
import { config } from '../config.js';

export const LANGUAGES = ['cpp', 'java', 'python'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CPP_STANDARDS = ['c++14', 'c++17', 'c++20', 'c++23'] as const;
export type CppStandard = (typeof CPP_STANDARDS)[number];

interface Command {
  cmd: string;
  args: string[];
}

export interface BuildPlan {
  sourceFile: string;
  extraFiles?: Record<string, string>;
  compile: Command;
  run: Command;
}

/**
 * Pre-included in C++ debug builds. Not every gdb can redirect the program's stdin/stdout
 * (the Windows builds can't), so the program redirects itself before main() runs.
 */
const CPP_DEBUG_PRELUDE = `#include <cstdio>
namespace cp_studio_debug {
struct Redirect {
    Redirect() {
        std::freopen("input.txt", "r", stdin);
        std::freopen("stdout.txt", "w", stdout);
        std::freopen("stderr.txt", "w", stderr);
    }
};
static Redirect redirect;
}
`;

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

export function isCppStandard(value: unknown): value is CppStandard {
  return CPP_STANDARDS.includes(value as CppStandard);
}

/** Java requires the file name to match the public class, so detect it instead of forcing `Main`. */
function javaClassName(code: string): string {
  return /public\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/.exec(code)?.[1] ?? 'Main';
}

export type BuildMode = 'run' | 'debug';

export const cppExecutable = config.isWindows ? 'main.exe' : 'main';

export function planBuild(language: Language, code: string, dir: string, cppStandard: CppStandard, mode: BuildMode): BuildPlan {
  const { toolchain, isWindows } = config;

  switch (language) {
    case 'cpp': {
      const exe = cppExecutable;
      const optimisation = mode === 'debug' ? ['-g', '-O0', '-include', 'cp_debug_prelude.h'] : ['-O2'];
      const compileArgs = [`-std=${cppStandard}`, ...optimisation, '-pipe', '-Wall', 'main.cpp', '-o', exe];
      // Deep recursion is common in CP: raise the stack limit (256 MB on Windows, unlimited elsewhere).
      if (isWindows) compileArgs.push('-Wl,--stack,268435456');
      return {
        sourceFile: 'main.cpp',
        extraFiles: mode === 'debug' ? { 'cp_debug_prelude.h': CPP_DEBUG_PRELUDE } : undefined,
        compile: { cmd: toolchain.cxx, args: compileArgs },
        run: isWindows
          ? { cmd: path.join(dir, exe), args: [] }
          : { cmd: 'sh', args: ['-c', 'ulimit -s unlimited 2>/dev/null || ulimit -s 524288 2>/dev/null; exec ./main'] },
      };
    }
    case 'java': {
      const className = javaClassName(code);
      return {
        sourceFile: `${className}.java`,
        compile: { cmd: toolchain.javac, args: ['-encoding', 'UTF-8', ...(mode === 'debug' ? ['-g'] : []), `${className}.java`] },
        run: { cmd: toolchain.java, args: ['-Xss256m', '-Xmx512m', '-XX:+UseSerialGC', '-cp', '.', className] },
      };
    }
    case 'python':
      return {
        sourceFile: 'main.py',
        // Byte-compiling first turns syntax errors into a proper "Compilation Error".
        compile: { cmd: toolchain.python, args: ['-m', 'py_compile', 'main.py'] },
        run: { cmd: toolchain.python, args: ['main.py'] },
      };
  }
}

const WINDOWS_EXIT_CODES: Record<number, string> = {
  0xc0000005: 'Access violation: invalid memory access (out-of-bounds index or null pointer?)',
  0xc00000fd: 'Stack overflow: recursion too deep?',
  0xc0000094: 'Integer division by zero',
  0xc000008e: 'Floating-point division by zero',
  0xc0000409: 'Program aborted (failed assertion or buffer overrun)',
  0xc0000017: 'Out of memory',
  3: 'Program aborted (failed assertion or abort())',
};

const SIGNALS: Partial<Record<NodeJS.Signals, string>> = {
  SIGSEGV: 'Segmentation fault: invalid memory access or stack overflow',
  SIGFPE: 'Floating point exception: division by zero?',
  SIGABRT: 'Program aborted (failed assertion, abort() or uncaught exception)',
  SIGBUS: 'Bus error: invalid memory access',
  SIGKILL: 'Killed (out of memory?)',
};

export function describeExit(exitCode: number | null, signal: NodeJS.Signals | null): string {
  if (signal) return SIGNALS[signal] ?? `Terminated by signal ${signal}`;
  if (exitCode !== null && WINDOWS_EXIT_CODES[exitCode]) return WINDOWS_EXIT_CODES[exitCode];
  return `Exited with code ${exitCode}`;
}
