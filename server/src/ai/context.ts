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

/** full: everything the AI needs to debug. code: no test data, for explaining or analysing the code itself. */
export type ContextScope = 'full' | 'code';

const MAX_TESTS = 6;
const MAX_DETAILED_TESTS = 3;

function str(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}\n… [truncated ${value.length - max} characters]` : value;
}

/** Keeps the start and the end (where outputs usually differ), dropping the middle of long text. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${text.slice(0, head)}\n… [${text.length - max} characters omitted] …\n${text.slice(-tail)}`;
}

export function parseContext(raw: unknown): CodeContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const ctx = raw as Record<string, unknown>;
  if (!isLanguage(ctx.language) || typeof ctx.code !== 'string') return null;

  const selection = ctx.selection as Record<string, unknown> | null | undefined;
  const compile = ctx.compile as Record<string, unknown> | null | undefined;
  const tests = Array.isArray(ctx.tests) ? ctx.tests.slice(0, MAX_TESTS) : [];
  const text = (value: unknown, max: number) => (typeof value === 'string' ? clip(value, max) : '');

  return {
    language: ctx.language,
    cppStandard: str(ctx.cppStandard, 20) || 'c++17',
    code: str(ctx.code, 60_000),
    problem: str(ctx.problem, 8_000),
    selection:
      selection && typeof selection.text === 'string' && selection.text.trim()
        ? { startLine: Number(selection.startLine) || 1, endLine: Number(selection.endLine) || 1, text: str(selection.text, 8_000) }
        : null,
    compile: compile ? { ok: Boolean(compile.ok), output: text(compile.output, 4_000) } : null,
    resultsStale: Boolean(ctx.resultsStale),
    tests: tests.map((t: Record<string, unknown>, i) => ({
      index: Number(t.index) || i + 1,
      active: Boolean(t.active),
      input: text(t.input, 1_500),
      expected: text(t.expected, 1_200),
      output: typeof t.output === 'string' ? clip(t.output, 1_200) : undefined,
      stderr: typeof t.stderr === 'string' ? clip(t.stderr, 1_500) : undefined,
      verdict: typeof t.verdict === 'string' ? t.verdict.slice(0, 60) : undefined,
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

const passed = (verdict?: string) => verdict === 'Accepted' || verdict === 'Finished';

function formatTests(ctx: CodeContext, scope: ContextScope): string {
  if (!ctx.tests.length) return '## Test cases\n(none yet)';

  const summary = ctx.tests.map((t) => `Test ${t.index}: ${t.verdict ?? 'not run'}`).join(', ');
  if (scope === 'code') return `## Test results\n${summary}`;

  // Passing tests say little; spend the tokens on the failing ones (and the one the user is looking at).
  const detailed = new Set(
    ctx.tests
      .filter((t) => t.active || !passed(t.verdict))
      .slice(0, MAX_DETAILED_TESTS)
      .map((t) => t.index),
  );
  const tests = ctx.tests.map((t) => {
    const header = `### Test ${t.index}${t.active ? ' (currently selected)' : ''}${t.verdict ? ` — ${t.verdict}${t.timeMs !== undefined ? `, ${t.timeMs} ms` : ''}` : ''}`;
    if (!detailed.has(t.index)) return header;
    const parts = [header, `Input:\n${block(t.input)}`];
    parts.push(t.expected.trim() ? `Expected output:\n${block(t.expected)}` : 'Expected output: (not provided)');
    if (t.output !== undefined) parts.push(`Actual output:\n${block(t.output || '(empty)')}`);
    if (t.stderr?.trim()) parts.push(`Stderr / runtime error:\n${block(t.stderr)}`);
    return parts.join('\n');
  });
  return `## Test cases\n${tests.join('\n\n')}`;
}

export function formatContext(ctx: CodeContext, scope: ContextScope = 'full'): string {
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
  } else if (ctx.compile?.output.trim() && scope === 'full') {
    sections.push(`## Compiler warnings\n${block(ctx.compile.output)}`);
  }

  sections.push(formatTests(ctx, scope));
  return `# Workspace context\n\n${sections.join('\n\n')}`;
}
