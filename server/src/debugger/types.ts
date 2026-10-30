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

export const MAX_VALUE_LENGTH = 300;

export function clip(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)} …` : text;
}
