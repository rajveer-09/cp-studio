import { toast } from 'sonner';
import { useStore } from '../store';
import type { ChatMessage, Language } from '../types';
import { api, type AiContext } from './api';
import { normalizeLines } from './compare';
import { editorBridge } from './editor';
import { isFailing, VERDICT_META } from './languages';
import { keyLabel } from './platform';
import { runTests } from './runner';
import { testVerdict } from './verdict';

export interface AssistantCommand {
  name: string;
  description: string;
  kind: 'fix' | 'tests' | 'chat';
}

export const COMMANDS: AssistantCommand[] = [
  { name: 'fix', description: 'Find the bug and propose a fix you can review', kind: 'fix' },
  { name: 'debug', description: 'Explain why the output is wrong', kind: 'chat' },
  { name: 'hint', description: 'A nudge without spoiling the solution', kind: 'chat' },
  { name: 'explain', description: 'Explain the code or your selection', kind: 'chat' },
  { name: 'optimize', description: 'Make it faster (great for TLE)', kind: 'chat' },
  { name: 'complexity', description: 'Time and space complexity', kind: 'chat' },
  { name: 'tests', description: 'Generate edge-case test cases', kind: 'tests' },
];

let controller: AbortController | null = null;

export const stopAssistant = () => controller?.abort();

export function focusAssistant() {
  useStore.getState().setAssistantOpen(true);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('assistant-input')?.focus()));
}

const sameCode = (a: string, b: string) => normalizeLines(a).join('\n') === normalizeLines(b).join('\n');

export function buildContext(): AiContext {
  const s = useStore.getState();
  const code = editorBridge.getCode(s.language);
  const resultsValid = s.lastRun?.language === s.language;

  const indexed = s.tests.map((test, i) => ({
    test,
    index: i + 1,
    result: resultsValid ? s.results[test.id] : undefined,
    verdict: resultsValid ? testVerdict(s, test.id) : undefined,
  }));
  // Most relevant first (selected test, then failing ones), capped at 6, then back in natural order.
  const rank = (x: (typeof indexed)[number]) => (x.test.id === s.activeTestId ? 0 : isFailing(x.verdict) ? 1 : 2);
  const chosen = [...indexed].sort((a, b) => rank(a) - rank(b)).slice(0, 6).sort((a, b) => a.index - b.index);

  return {
    language: s.language,
    cppStandard: s.settings.cppStandard,
    code,
    problem: s.problem,
    selection: editorBridge.selection(),
    compile: resultsValid && s.compile ? { ok: s.compile.ok, output: s.compile.output } : null,
    resultsStale: resultsValid && s.lastRun!.code !== code,
    tests: chosen.map(({ test, index, result, verdict }) => ({
      index,
      active: test.id === s.activeTestId,
      input: test.input,
      expected: test.expected,
      output: result && result.outcome !== 'CE' ? result.stdout : undefined,
      stderr: result ? [result.message, result.stderr].filter(Boolean).join('\n') || undefined : undefined,
      verdict: verdict ? VERDICT_META[verdict].label : undefined,
      timeMs: result && result.outcome !== 'CE' ? result.timeMs : undefined,
    })),
  };
}

function historyForModel(chat: ChatMessage[]) {
  return chat
    .filter((m) => (m.status === 'done' || m.status === undefined) && (m.content.trim() || m.fix))
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.fix ? `${m.content}\n\n(I proposed a fix: ${m.fix.summary} The user ${m.fix.status} it.)` : m.content,
    }));
}

export async function sendToAssistant(raw: string): Promise<void> {
  const text = raw.trim();
  const state = useStore.getState();
  if (!text || state.aiBusy) return;
  if (!state.serverConfig?.aiEnabled) {
    toast.error('The AI assistant is not configured on the server.');
    return;
  }

  const match = /^\/(\w+)\s*([\s\S]*)$/.exec(text);
  const command = match ? COMMANDS.find((c) => c.name === match[1].toLowerCase()) : undefined;
  if (match && !command) {
    toast.error(`Unknown command /${match[1]}`, { description: 'Type / to see the available commands.' });
    return;
  }
  const argument = match && command ? match[2].trim() : text;

  const history = historyForModel(state.chat);
  state.addMessage({ role: 'user', content: text, status: 'done' });
  const replyId = state.addMessage({ role: 'assistant', content: '', status: 'pending' });
  const update = state.updateMessage;

  controller = new AbortController();
  const { signal } = controller;
  useStore.setState({ aiBusy: true, assistantOpen: true });

  try {
    const context = buildContext();
    if (command?.kind === 'fix') {
      await requestFix(replyId, context, argument, signal);
    } else if (command?.kind === 'tests') {
      await requestTests(replyId, context, signal);
    } else {
      await api.chat(
        { history, prompt: argument, command: command?.name, context },
        (delta) => update(replyId, (m) => ({ content: m.content + delta, status: 'streaming' })),
        signal,
      );
      update(replyId, (m) => ({ status: 'done', content: m.content || '_The AI returned an empty response._' }));
    }
  } catch (err) {
    if (signal.aborted) update(replyId, (m) => ({ status: 'done', content: m.content ? `${m.content}\n\n_Stopped._` : '_Stopped._' }));
    else update(replyId, { status: 'error', content: err instanceof Error ? err.message : 'Something went wrong.' });
  } finally {
    controller = null;
    useStore.setState({ aiBusy: false });
  }
}

async function requestFix(replyId: string, context: AiContext, instruction: string, signal: AbortSignal) {
  const fix = await api.fix({ context, instruction }, signal);
  const unchanged = sameCode(fix.fixedCode, context.code);

  const parts = [`**Root cause:** ${fix.rootCause}`];
  if (fix.changes.length) parts.push(fix.changes.map((c) => `- ${c}`).join('\n'));
  if (unchanged) parts.push('No changes are needed: the AI thinks your code is already correct.');

  useStore.getState().updateMessage(replyId, {
    status: 'done',
    content: parts.join('\n\n'),
    fix: unchanged ? undefined : { ...fix, originalCode: context.code, language: context.language, status: 'pending' },
  });
  if (!unchanged) openFixReview(replyId);
}

async function requestTests(replyId: string, context: AiContext, signal: AbortSignal) {
  const { tests } = await api.tests({ context }, signal);
  useStore.getState().updateMessage(replyId, {
    status: 'done',
    content: tests.length
      ? `Here ${tests.length === 1 ? 'is 1 edge-case test' : `are ${tests.length} edge-case tests`}. The expected outputs were worked out by the AI, so double-check them before trusting a verdict.`
      : "I couldn't come up with new test cases for this code.",
    tests: tests.length ? { items: tests, added: false } : undefined,
  });
}

export function addGeneratedTests(messageId: string) {
  const state = useStore.getState();
  const message = state.chat.find((m) => m.id === messageId);
  if (!message?.tests || message.tests.added) return;

  const ids = message.tests.items.map((t) => state.addTest({ input: t.input, expected: t.expectedOutput }, false));
  state.updateMessage(messageId, { tests: { ...message.tests, added: true } });
  state.setActiveTest(ids[0]);
  toast.success(`Added ${ids.length} test case${ids.length > 1 ? 's' : ''}`, { description: `Press ${keyLabel('Mod')}+Shift+Enter to run them all.` });
}

export function openFixReview(messageId: string) {
  const fix = useStore.getState().chat.find((m) => m.id === messageId)?.fix;
  if (!fix) return;
  useStore.setState({
    review: { code: fix.fixedCode, language: fix.language, title: 'Review AI fix', summary: fix.summary, basedOn: fix.originalCode, messageId },
  });
}

export function reviewCodeBlock(code: string, language: Language) {
  useStore.setState({
    review: { code, language, title: 'Apply code from chat', summary: 'This replaces your whole file with the code block. Check the diff first.' },
  });
}

export function rejectReview() {
  const { review, updateMessage } = useStore.getState();
  if (review?.messageId) updateMessage(review.messageId, (m) => (m.fix ? { fix: { ...m.fix, status: 'rejected' } } : {}));
  useStore.setState({ review: null });
  editorBridge.focus();
}

export async function acceptReview(finalCode: string) {
  const state = useStore.getState();
  const review = state.review;
  if (!review) return;

  if (review.language !== state.language) state.setLanguage(review.language);
  editorBridge.setCode(review.language, finalCode);
  if (review.messageId) state.updateMessage(review.messageId, (m) => (m.fix ? { fix: { ...m.fix, status: 'applied' } } : {}));
  useStore.setState({ review: null });
  toast.success('Changes applied', { description: `Press ${keyLabel('Mod')}+Z in the editor to undo.` });
  editorBridge.focus();

  if (!useStore.getState().tests.some((t) => t.input.trim() || t.expected.trim())) return;
  const summary = await runTests('all');
  if (!summary) return;

  const content = !summary.compileOk
    ? 'I re-ran your tests after applying the change, but **compilation failed**. Check the output panel, or ask me to `/fix` it.'
    : summary.passed === summary.total
      ? summary.total === 1
        ? '✅ I re-ran your test after applying the change and **it passed**.'
        : `✅ I re-ran all ${summary.total} tests after applying the change and **all of them passed**.`
      : `I re-ran your tests after applying the change: **${summary.passed}/${summary.total} passed**. Still failing: ${summary.failing
          .map((f) => `Test ${f.index} (${f.verdict})`)
          .join(', ')}. Try \`/debug\` or \`/fix\` again.`;
  useStore.getState().addMessage({ role: 'assistant', content, status: 'done' });
}
