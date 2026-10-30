/** The program is paused *before* `line` runs; `values` holds each watched variable that is in scope. */
export interface TraceStep {
  line: number;
  values: Record<string, string>;
}

export interface TraceOutcome {
  steps: TraceStep[];
  truncated: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  errorLine?: number;
  exitCode: number | null;
}

/**
 * Line ranges (1-based, inclusive) of "LeetCode harness" regions: code that reads the input and prints the
 * answer around the user's method. The debuggers never stop or record there.
 */
export function harnessRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  const lines = code.split('\n');
  let start = 0;
  lines.forEach((line, i) => {
    if (!start && /\bregion\b.*LeetCode harness/.test(line)) start = i + 1;
    else if (start && /^\s*(?:#pragma\s+endregion|\/\/\s*#endregion|#endregion)\b/.test(line)) {
      ranges.push([start, i + 1]);
      start = 0;
    }
  });
  if (start) ranges.push([start, lines.length]);
  return ranges;
}

export const inRanges = (line: number, ranges: [number, number][]) => ranges.some(([a, b]) => line >= a && line <= b);

/** "3-20,40-90", for the Python and Java tracers' command lines. */
export const rangesArg = (ranges: [number, number][]) => ranges.map(([a, b]) => `${a}-${b}`).join(',') || '-';

export const MAX_VALUE_LENGTH = 300;

export function clip(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)} …` : text;
}
