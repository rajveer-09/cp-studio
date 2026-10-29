import type { CompareMode } from '../types';

export interface CompareOptions {
  mode: CompareMode;
  /** Allowed absolute or relative error for decimal numbers (like judges' floating-point checkers); 0 = exact. */
  floatTolerance: number;
  ignoreCase: boolean;
}

export interface DiffRow {
  expected: string | null;
  actual: string | null;
  status: 'same' | 'changed' | 'missing' | 'extra';
  badTokens: Set<number>;
}

export interface Comparison {
  equal: boolean;
  rows: DiffRow[];
  summary: string | null;
  formatOnly: boolean;
}

/** Splits output into lines, ignoring CRLF vs LF, trailing spaces and trailing blank lines. */
export function normalizeLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export const tokenize = (line: string) => line.split(/\s+/).filter(Boolean);

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function tokensEqual(actual: string, expected: string, options: CompareOptions): boolean {
  if (actual === expected) return true;
  if (options.ignoreCase && actual.toLowerCase() === expected.toLowerCase()) return true;
  // Tolerance only applies to decimals: two different integers are always a wrong answer.
  if (options.floatTolerance > 0 && NUMBER.test(actual) && NUMBER.test(expected) && /[.eE]/.test(actual + expected)) {
    const a = Number(actual);
    const e = Number(expected);
    return Math.abs(a - e) <= options.floatTolerance * Math.max(1, Math.abs(e));
  }
  return false;
}

function lineTokensDiffer(actual: string, expected: string, options: CompareOptions): Set<number> {
  const a = tokenize(actual);
  const e = tokenize(expected);
  const bad = new Set<number>();
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] === undefined || e[i] === undefined || !tokensEqual(a[i], e[i], options)) bad.add(i);
  }
  return bad;
}

function linesEqual(actual: string, expected: string, options: CompareOptions): boolean {
  if (actual === expected) return true;
  if (options.mode === 'lines' && actual.replace(/\S+/g, 'x') !== expected.replace(/\S+/g, 'x')) return false;
  return lineTokensDiffer(actual, expected, options).size === 0;
}

const show = (text: string) => `"${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`;

export function compareOutputs(actual: string, expected: string, options: CompareOptions): Comparison {
  const a = normalizeLines(actual);
  const e = normalizeLines(expected);

  const rows: DiffRow[] = [];
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    const exp = e[i] ?? null;
    const act = a[i] ?? null;
    if (exp === null) rows.push({ expected: null, actual: act, status: 'extra', badTokens: new Set() });
    else if (act === null) rows.push({ expected: exp, actual: null, status: 'missing', badTokens: new Set() });
    else if (linesEqual(act, exp, options)) rows.push({ expected: exp, actual: act, status: 'same', badTokens: new Set() });
    else rows.push({ expected: exp, actual: act, status: 'changed', badTokens: lineTokensDiffer(act, exp, options) });
  }

  if (options.mode === 'lines') {
    const first = rows.findIndex((r) => r.status !== 'same');
    if (first < 0) return { equal: true, rows, summary: null, formatOnly: false };
    const row = rows[first];
    const n = first + 1;
    const summary =
      row.status === 'missing'
        ? `Output ended early: line ${n} should be ${show(row.expected!)}`
        : row.status === 'extra'
          ? `Extra output at line ${n}: ${show(row.actual!)}`
          : row.badTokens.size === 0
            ? `Line ${n}: same values, but the spacing differs`
            : `Line ${n}: expected ${show(row.expected!)}, found ${show(row.actual!)}`;
    return { equal: false, rows, summary, formatOnly: false };
  }

  // Token mode: compare the whole output as one sequence of words, like most online judges.
  const aTokens = a.flatMap((line, i) => tokenize(line).map((text) => ({ text, line: i + 1 })));
  const eTokens = e.flatMap((line, i) => tokenize(line).map((text) => ({ text, line: i + 1 })));
  for (let k = 0; k < Math.max(aTokens.length, eTokens.length); k++) {
    const at = aTokens[k];
    const et = eTokens[k];
    if (at && et && tokensEqual(at.text, et.text, options)) continue;
    const summary = !at
      ? `Output ended early: expected ${show(et.text)} (line ${et.line}) but your output has nothing more`
      : !et
        ? `Extra output: ${show(at.text)} on line ${at.line} after the expected answer ended`
        : `Line ${et.line}: expected ${show(et.text)}, found ${show(at.text)}`;
    return { equal: false, rows, summary, formatOnly: false };
  }
  // Worth pointing out when only whitespace differs (not differences the user chose to ignore, like case).
  const sameWords = aTokens.length === eTokens.length && aTokens.every((t, k) => t.text === eTokens[k].text);
  return { equal: true, rows, summary: null, formatOnly: sameWords && a.join('\n') !== e.join('\n') };
}
