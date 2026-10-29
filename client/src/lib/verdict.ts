import { useStore, type AppState } from '../store';
import type { Settings, TestResult, Verdict } from '../types';
import { compareOutputs, type CompareOptions, type Comparison } from './compare';
import { isFailing } from './languages';

export const checkerOptions = (settings: Settings): CompareOptions => ({
  mode: settings.compareMode,
  floatTolerance: settings.floatTolerance,
  ignoreCase: settings.ignoreCase,
});

// Outputs can be large: compare each result once per (expected output, checker settings).
const cache = new WeakMap<TestResult, { key: string; comparison: Comparison }>();

export function compareResult(result: TestResult, expected: string, options: CompareOptions): Comparison {
  const key = `${options.mode}|${options.floatTolerance}|${options.ignoreCase}|${expected}`;
  const hit = cache.get(result);
  if (hit?.key === key) return hit.comparison;
  const comparison = compareOutputs(result.stdout, expected, options);
  cache.set(result, { key, comparison });
  return comparison;
}

export function verdictOf(result: TestResult | undefined, expected: string, options: CompareOptions): Verdict | undefined {
  if (!result) return undefined;
  if (result.outcome !== 'ok') return result.outcome;
  if (!expected.trim()) return 'DONE';
  return compareResult(result, expected, options).equal ? 'AC' : 'WA';
}

export function testVerdict(state: AppState, testId: string): Verdict | undefined {
  const test = state.tests.find((t) => t.id === testId);
  return test && verdictOf(state.results[testId], test.expected, checkerOptions(state.settings));
}

export const useVerdict = (testId: string) => useStore((s) => testVerdict(s, testId));

export function runSummary(state: AppState): { passed: number; total: number } | null {
  if (!state.lastRun) return null;
  const ids = state.lastRun.testIds.filter((id) => state.tests.some((t) => t.id === id));
  const passed = ids.filter((id) => {
    const verdict = testVerdict(state, id);
    return verdict !== undefined && !isFailing(verdict);
  }).length;
  return { passed, total: ids.length };
}

export function useRunSummary() {
  const text = useStore((s) => {
    const summary = runSummary(s);
    return summary ? `${summary.passed}/${summary.total}` : '';
  });
  if (!text) return null;
  const [passed, total] = text.split('/').map(Number);
  return { passed, total };
}
