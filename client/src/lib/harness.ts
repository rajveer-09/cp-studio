import { useStore } from '../store';
import type { CodeFile, Language } from '../types';
import { editorBridge } from './editor';

/**
 * LeetCode problems run with a "driver": code before the Solution class (headers, ListNode/TreeNode) and after it
 * (reads a test from stdin, calls the method, prints the answer). Like LeetCode, the tab can show only the class:
 * the driver is kept on the file (`harness`) and put back around the code whenever it runs.
 */
const START = /^\s*(?:#pragma\s+region|\/\/\s*#region|#region)\b.*LeetCode harness/;
const END = /^\s*(?:#pragma\s+endregion|\/\/\s*#endregion|#endregion)\b/;

export type Harness = NonNullable<CodeFile['harness']>;

/** Splits a program with a driver region above and below the Solution class; null for anything else. */
export function splitHarness(code: string): { body: string; harness: Harness } | null {
  const lines = code.split('\n');
  const regions: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!START.test(lines[i])) continue;
    const end = lines.findIndex((line, j) => j > i && END.test(line));
    if (end < 0) return null;
    regions.push([i, end]);
    i = end;
  }
  if (regions.length !== 2) return null;
  const [[firstStart, firstEnd], [lastStart]] = regions;
  if (lines.slice(0, firstStart).some((l) => l.trim())) return null;
  if (lines.slice(regions[1][1] + 1).some((l) => l.trim())) return null;

  let from = firstEnd + 1;
  let to = lastStart; // exclusive
  while (from < to && !lines[from].trim()) from++;
  while (to > from && !lines[to - 1].trim()) to--;
  return {
    body: `${lines.slice(from, to).join('\n')}\n`,
    harness: { before: `${lines.slice(0, from).join('\n')}\n`, after: lines.slice(to).join('\n') },
  };
}

/** The driver and the class back together, as a full program (also how "Show the driver" restores a tab). */
export const joinHarness = (body: string, harness: Harness) => `${harness.before}${body.endsWith('\n') ? body : `${body}\n`}${harness.after}`;

const lineCount = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

export interface Program {
  /** What is compiled and run. */
  code: string;
  /** Lines of driver above the user's code (0 without a hidden driver). */
  offset: number;
  /** Lines of the user's code. */
  lines: number;
}

/** The program for a tab: its code, with the hidden driver around it when it has one. */
export function programOf(language: Language, fileId: string): Program {
  const body = editorBridge.getCode(language, fileId);
  const harness = useStore.getState().files[language].find((f) => f.id === fileId)?.harness;
  if (!harness) return { code: body, offset: 0, lines: lineCount(body) };
  return { code: joinHarness(body, harness), offset: lineCount(harness.before), lines: lineCount(body) };
}

/**
 * Line numbers in compiler and runtime messages point into the full program; this moves them to the tab's own lines,
 * and names lines in the hidden driver as such (they can't be clicked to).
 */
export function toTabLines(output: string, program: Program): string {
  if (!program.offset || !output) return output;
  const map = (n: number) => n - program.offset;
  const inTab = (n: number) => map(n) >= 1 && map(n) <= program.lines;
  return output
    .replace(/\b(main\.cpp|[\w$]+\.java):(\d+)/g, (_, file: string, n: string) => (inTab(+n) ? `${file}:${map(+n)}` : `LeetCode driver (line ${n})`))
    .replace(/(main\.py", line )(\d+)/g, (_, prefix: string, n: string) => (inTab(+n) ? `${prefix}${map(+n)}` : `driver", line ${n}`));
}

/** A line of the full program as a line of the tab, or null when it is in the hidden driver. */
export const tabLine = (line: number, program: Program): number | null => {
  const n = line - program.offset;
  return n >= 1 && n <= program.lines ? n : null;
};

/**
 * Applies the "show / hide the LeetCode driver" setting to every tab: hiding splits tabs that contain the driver
 * (also older tabs); showing writes it back into the code. Each change can be undone in the editor.
 */
export function applyDriverVisibility(hidden: boolean) {
  const state = useStore.getState();
  for (const language of Object.keys(state.files) as Language[]) {
    for (const file of state.files[language]) {
      const code = editorBridge.getCode(language, file.id);
      if (hidden && !file.harness) {
        const split = splitHarness(code);
        if (!split) continue;
        setFile(language, file.id, split.body, split.harness);
      } else if (!hidden && file.harness) {
        setFile(language, file.id, joinHarness(code, file.harness), undefined);
        editorBridge.foldHarness(language, file.id);
      }
    }
  }
}

function setFile(language: Language, fileId: string, code: string, harness: Harness | undefined) {
  useStore.setState((s) => ({
    files: { ...s.files, [language]: s.files[language].map((f) => (f.id === fileId ? { ...f, harness } : f)) },
  }));
  editorBridge.setCode(language, code, fileId);
}
