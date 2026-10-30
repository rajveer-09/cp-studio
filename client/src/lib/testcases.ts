import { toast } from 'sonner';
import { uid, useStore, type AppState } from '../store';
import type { TestCase } from '../types';

function replaceTests(tests: TestCase[], message: string) {
  const state = useStore.getState();
  const before: Partial<AppState> = {
    tests: state.tests,
    activeTestId: state.activeTestId,
    results: state.results,
    lastRun: state.lastRun,
    compile: state.compile,
  };
  useStore.setState({ tests, activeTestId: tests[0].id, results: {}, lastRun: null, compile: null, bottomTab: 'tests' });
  toast.success(message, { action: { label: 'Undo', onClick: () => useStore.setState(before) } });
}

/** Leaves a single empty test case. */
export function clearAllTests() {
  replaceTests([{ id: uid(), input: '', expected: '' }], 'All test cases deleted');
}

/** Puts back the sample tests of the imported problem. */
export function restoreSamples() {
  const samples = useStore.getState().problemMeta?.samples;
  if (!samples?.length) return;
  replaceTests(
    samples.map((t) => ({ id: uid(), input: t.input, expected: t.expected })),
    `Restored ${samples.length} sample test${samples.length === 1 ? '' : 's'}`,
  );
}

/** Keeps the tests, forgets their outputs and verdicts. */
export function clearResults() {
  useStore.setState({ results: {}, lastRun: null, compile: null });
}
