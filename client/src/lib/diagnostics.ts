import type { Language } from '../types';

export interface Diagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

export function parseDiagnostics(language: Language, output: string): Diagnostic[] {
  const lines = output.split(/\r?\n/);
  const result: Diagnostic[] = [];

  if (language === 'cpp') {
    for (const line of lines) {
      const m = /^main\.cpp:(\d+):(\d+):\s+(fatal error|error|warning):\s+(.*)$/.exec(line);
      if (m) result.push({ line: +m[1], column: +m[2], severity: m[3] === 'warning' ? 'warning' : 'error', message: m[4] });
    }
  } else if (language === 'java') {
    lines.forEach((line, i) => {
      const m = /^[\w$]+\.java:(\d+):\s+(error|warning):\s+(.*)$/.exec(line);
      if (!m) return;
      // javac prints the source line and then a caret under the error column.
      const caret = lines[i + 2]?.indexOf('^') ?? -1;
      result.push({ line: +m[1], column: caret >= 0 ? caret + 1 : 1, severity: m[2] === 'warning' ? 'warning' : 'error', message: m[3] });
    });
  } else {
    let line = 0;
    for (const text of lines) {
      const m = /File "(?:[^"]*[\\/])?main\.py", line (\d+)/.exec(text);
      if (m) line = +m[1];
    }
    const message = lines.filter((l) => l.trim()).pop() ?? 'Error';
    if (line) result.push({ line, column: 1, severity: 'error', message });
  }
  return result;
}

export const LOCATION_PATTERN = /main\.cpp:(\d+)(?::(\d+))?|[\w$]+\.java:(\d+)|main\.py", line (\d+)/g;
