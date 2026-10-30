import { toast } from 'sonner';
import { useStore } from '../store';
import type { DebugStep } from '../types';
import { api } from './api';
import { isWatchable } from './completions';
import { parseDiagnostics } from './diagnostics';
import { editorBridge } from './editor';
import { LANGUAGE_META } from './languages';

export const MAX_WATCHES = 8;

export function addWatch(name: string): boolean {
  const { language, watches } = useStore.getState();
  const trimmed = name.trim();
  if (!isWatchable(language, trimmed)) {
    toast.error(`"${trimmed}" isn't a variable name`);
    return false;
  }
  const current = watches[language];
  if (current.includes(trimmed)) return true;
  if (current.length >= MAX_WATCHES) {
    toast.error(`You can watch up to ${MAX_WATCHES} variables`, { description: 'Remove one first.' });
    return false;
  }
  useStore.setState({ watches: { ...watches, [language]: [...current, trimmed] } });
  return true;
}

export function removeWatch(name: string) {
  const { language, watches } = useStore.getState();
  useStore.setState({ watches: { ...watches, [language]: watches[language].filter((w) => w !== name) } });
}

export async function startDebugging() {
  const state = useStore.getState();
  const { language } = state;
  const watches = state.watches[language];
  if (state.debug?.status === 'running') return;

  if (!watches.length) {
    useStore.setState({ bottomTab: 'debug' });
    toast.info('Choose a variable to watch first', { description: 'Select a variable in your code and click "Debug", or type its name in the Debugger tab.' });
    return;
  }
  if (state.serverConfig && !state.serverConfig.debuggers[language]) {
    useStore.setState({ bottomTab: 'debug' });
    toast.error(`The ${LANGUAGE_META[language].label} debugger isn't available on the server`, {
      description: language === 'cpp' ? 'C++ debugging needs gdb installed on the server.' : `Install ${LANGUAGE_META[language].label} on the server.`,
    });
    return;
  }

  const testIndex = Math.max(0, state.tests.findIndex((t) => t.id === state.activeTestId));
  const code = editorBridge.getCode(language);
  const base = { language, code, testIndex, watches: [...watches], steps: [], truncated: false, maxSteps: 0, stdout: '', stderr: '' };
  useStore.setState({ debug: { ...base, status: 'running' }, debugStep: 0, bottomTab: 'debug' });

  try {
    const result = await api.debug({ language, code, cppStandard: state.settings.cppStandard, input: state.tests[testIndex].input, watches });
    if (!result.compile.ok) {
      editorBridge.setDiagnostics(language, parseDiagnostics(language, result.compile.output));
      useStore.setState({ debug: { ...base, status: 'error', compile: result.compile, message: 'Compilation failed.' } });
      return;
    }
    const steps = result.steps;
    useStore.setState({
      debug: { ...base, ...result, status: 'done' },
      // A crash is most interesting at the end; otherwise start at the beginning like a debugger.
      debugStep: result.error ? Math.max(0, steps.length - 1) : 0,
    });
    if (!steps.length && !result.error) toast.info('No lines were executed while watching these variables.');
  } catch (err) {
    useStore.setState({ debug: { ...base, status: 'error', message: err instanceof Error ? err.message : 'The debugger failed.' } });
  }
}

export function goToStep(index: number) {
  const steps = useStore.getState().debug?.steps ?? [];
  if (!steps.length) return;
  useStore.setState({ debugStep: Math.min(Math.max(index, 0), steps.length - 1) });
}

export const stepBy = (delta: number) => goToStep(useStore.getState().debugStep + delta);

export function stopDebugging() {
  useStore.setState({ debug: null, debugStep: 0 });
}

export function debugVariable(name: string | null) {
  if (!name) {
    toast.info('Put the cursor on a variable (or select it) to debug it.');
    return;
  }
  if (addWatch(name)) void startDebugging();
}

export function changedAt(steps: DebugStep[], index: number): Set<string> {
  const current = steps[index]?.values ?? {};
  const previous = steps[index - 1]?.values ?? {};
  return new Set(Object.keys(current).filter((name) => index > 0 && previous[name] !== current[name]));
}

export interface HistoryEntry {
  step: number;
  line: number;
  value: string | undefined;
}

export function historyOf(steps: DebugStep[], name: string, limit = 500): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let last: string | undefined = undefined;
  steps.forEach((step, i) => {
    const value = step.values[name];
    if (value !== last) {
      entries.push({ step: i, line: step.line, value });
      last = value;
    }
  });
  return entries.slice(0, limit);
}
