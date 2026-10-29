import { isLanguage, type Language } from '../runner/languages.js';

export interface CodeContext {
  language: Language;
  cppStandard: string;
  code: string;
  problem: string;
  selection: { startLine: number; endLine: number; text: string } | null;
  compile: { ok: boolean; output: string } | null;
  resultsStale: boolean;
  tests: {
    index: number;
    active: boolean;
    input: string;
    expected: string;
    output?: string;
    stderr?: string;
    verdict?: string;
    timeMs?: number;
  }[];
}

const MAX_TESTS = 6;

function str(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}\n… [truncated ${value.length - max} characters]` : value;
}

function optionalStr(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? str(value, max) : undefined;
}

export function parseContext(raw: unknown): CodeContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const ctx = raw as Record<string, unknown>;
  if (!isLanguage(ctx.language) || typeof ctx.code !== 'string') return null;

  const selection = ctx.selection as Record<string, unknown> | null | undefined;
  const compile = ctx.compile as Record<string, unknown> | null | undefined;
  const tests = Array.isArray(ctx.tests) ? ctx.tests.slice(0, MAX_TESTS) : [];

  return {
    language: ctx.language,
    cppStandard: str(ctx.cppStandard, 20) || 'c++17',
    code: str(ctx.code, 60_000),
    problem: str(ctx.problem, 12_000),
    selection:
      selection && typeof selection.text === 'string' && selection.text.trim()
        ? { startLine: Number(selection.startLine) || 1, endLine: Number(selection.endLine) || 1, text: str(selection.text, 8_000) }
        : null,
    compile: compile ? { ok: Boolean(compile.ok), output: str(compile.output, 6_000) } : null,
    resultsStale: Boolean(ctx.resultsStale),
    tests: tests.map((t: Record<string, unknown>, i) => ({
      index: Number(t.index) || i + 1,
      active: Boolean(t.active),
      input: str(t.input, 3_000),
      expected: str(t.expected, 3_000),
      output: optionalStr(t.output, 3_000),
      stderr: optionalStr(t.stderr, 3_000),
      verdict: optionalStr(t.verdict, 60),
      timeMs: typeof t.timeMs === 'number' ? t.timeMs : undefined,
    })),
  };
}

const LANGUAGE_INFO: Record<Language, { label: string; fence: string }> = {
  cpp: { label: 'C++', fence: 'cpp' },
  java: { label: 'Java', fence: 'java' },
  python: { label: 'Python 3', fence: 'python' },
};

function block(content: string, fence = ''): string {
  return `\`\`\`${fence}\n${content.replace(/\s+$/, '')}\n\`\`\``;
}

function withLineNumbers(code: string): string {
  const lines = code.split(/\r?\n/);
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width)} | ${line}`).join('\n');
}

export function formatContext(ctx: CodeContext): string {
  const { label, fence } = LANGUAGE_INFO[ctx.language];
  const sections: string[] = [];

  sections.push(`## Language\n${label}${ctx.language === 'cpp' ? ` (g++ -std=${ctx.cppStandard} -O2)` : ''}`);

  if (ctx.problem.trim()) sections.push(`## Problem statement\n${ctx.problem.trim()}`);

  sections.push(`## Current code (line numbers added for reference only)\n${block(withLineNumbers(ctx.code), fence)}`);

  if (ctx.selection) {
    sections.push(`## Code the user has selected (lines ${ctx.selection.startLine}-${ctx.selection.endLine})\n${block(ctx.selection.text, fence)}`);
  }

  if (ctx.resultsStale) {
    sections.push('## Note\nThe code was edited after the compilation/test results below were produced, so they may be out of date.');
  }

  if (ctx.compile && !ctx.compile.ok) {
    sections.push(`## Last compilation FAILED\n${block(ctx.compile.output)}`);
  } else if (ctx.compile?.output.trim()) {
    sections.push(`## Compiler warnings\n${block(ctx.compile.output)}`);
  }

  if (ctx.tests.length) {
    const tests = ctx.tests.map((t) => {
      const header = [`### Test ${t.index}${t.active ? ' (currently selected)' : ''}`];
      if (t.verdict) header.push(`verdict: ${t.verdict}${t.timeMs !== undefined ? `, ${t.timeMs} ms` : ''}`);
      const parts = [header.join(' — '), `Input:\n${block(t.input)}`];
      parts.push(t.expected.trim() ? `Expected output:\n${block(t.expected)}` : 'Expected output: (not provided)');
      if (t.output !== undefined) parts.push(`Actual output:\n${block(t.output || '(empty)')}`);
      if (t.stderr?.trim()) parts.push(`Stderr / runtime error:\n${block(t.stderr)}`);
      return parts.join('\n');
    });
    sections.push(`## Test cases\n${tests.join('\n\n')}`);
  } else {
    sections.push('## Test cases\n(none yet)');
  }

  return `# Workspace context\n\n${sections.join('\n\n')}`;
}
