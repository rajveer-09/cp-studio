import { toast } from 'sonner';
import { activeFileOf, useStore } from '../store';
import type { Outcome, TestResult } from '../types';
import { api, type RunResponse } from './api';
import { parseDiagnostics } from './diagnostics';
import { editorBridge } from './editor';
import { VERDICT_META } from './languages';
import { programOf, toTabLines } from './harness';
import { recordActivity, recordProblem } from './problems';
import { runSummary, testVerdict } from './verdict';

export interface RunSummary {
  passed: number;
  total: number;
  compileOk: boolean;
  failing: { index: number; verdict: string }[];
}

const OUTCOMES: Record<RunResponse['results'][number]['status'], Outcome> = {
  ok: 'ok',
  time_limit: 'TLE',
  runtime_error: 'RE',
  output_limit: 'OLE',
  internal_error: 'IE',
};

function toResult(raw: RunResponse['results'][number]): TestResult {
  return {
    outcome: OUTCOMES[raw.status],
    stdout: raw.stdout.replace(/\r\n/g, '\n'),
    stderr: raw.stderr,
    timeMs: raw.timeMs,
    exitCode: raw.exitCode,
    message: raw.message,
  };
}

export async function runTests(mode: 'current' | 'all'): Promise<RunSummary | null> {
  const state = useStore.getState();
  if (state.running) return null;

  const { language, settings } = state;
  const tests = mode === 'all' ? state.tests : state.tests.filter((t) => t.id === state.activeTestId);
  const fileId = activeFileOf(state, language).id;
  const code = editorBridge.getCode(language, fileId);
  // With a hidden LeetCode driver, the program is the driver around the tab's code.
  const program = programOf(language, fileId);
  if (!code.trim()) {
    toast.error('Write some code first.');
    return null;
  }

  useStore.setState({ running: mode, runningIds: tests.map((t) => t.id) });
  recordActivity('run');
  try {
    const ran = await api.run({
      language,
      code: program.code,
      cppStandard: settings.cppStandard,
      timeLimitMs: settings.timeLimitMs,
      tests: tests.map((t) => ({ id: t.id, input: t.input })),
    });
    // Errors point at the tab's own lines (and say so when they are in the hidden driver).
    const response = {
      ...ran,
      compile: { ...ran.compile, output: toTabLines(ran.compile.output, program) },
      results: ran.results.map((r) => ({ ...r, stderr: toTabLines(r.stderr, program) })),
    };

    const results = { ...useStore.getState().results };
    for (const test of tests) {
      const raw = response.results.find((r) => r.id === test.id);
      results[test.id] = raw ? toResult(raw) : { outcome: 'CE', stdout: '', stderr: '', timeMs: 0, exitCode: null };
    }
    editorBridge.setDiagnostics(language, parseDiagnostics(language, response.compile.output));

    useStore.setState((s) => ({
      results,
      compile: response.compile,
      lastRun: {
        language,
        fileId,
        code,
        testIds: tests.map((t) => t.id),
        maxTimeMs: Math.max(0, ...tests.map((t) => results[t.id].timeMs)),
        compileOk: response.compile.ok,
      },
      bottomTab: s.bottomTab === 'problem' || s.bottomTab === 'debug' ? 'tests' : s.bottomTab,
    }));

    const after = useStore.getState();
    const failing = tests
      .map((t) => ({ id: t.id, index: after.tests.indexOf(t) + 1, verdict: testVerdict(after, t.id)! }))
      .filter((f) => f.verdict !== 'AC' && f.verdict !== 'DONE');
    const { passed, total } = runSummary(after)!;

    // Jump to the first failing test so the problem is visible right away.
    if (mode === 'all' && failing.length) useStore.setState({ activeTestId: failing[0].id });

    if (!response.compile.ok) toast.error('Compilation failed', { description: 'See the error in the output panel.' });
    else if (mode === 'all') {
      if (passed === total) {
        toast.success(total === 1 ? 'Test passed' : `All ${total} tests passed`);
        if (total > 0) recordProblem('solved');
      }
      else toast.error(`${passed}/${total} tests passed`, { description: `First failure: Test ${failing[0].index} (${VERDICT_META[failing[0].verdict].label})` });
    }

    return {
      passed,
      total,
      compileOk: response.compile.ok,
      failing: failing.map((f) => ({ index: f.index, verdict: VERDICT_META[f.verdict].label })),
    };
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Run failed');
    return null;
  } finally {
    useStore.setState({ running: null, runningIds: [] });
  }
}
