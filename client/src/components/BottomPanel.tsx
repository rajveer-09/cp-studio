import { Bug, Copy, FileText, FlaskConical, Loader2, PanelBottom, PanelRight, Plus, Terminal, Wand2, X } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { sendToAssistant } from '../lib/assistant';
import type { Comparison } from '../lib/compare';
import { isFailing, LANGUAGE_META, TONE_BG, TONE_TEXT, VERDICT_META } from '../lib/languages';
import { copyText } from '../lib/platform';
import { checkerOptions, compareResult, useRunSummary, useVerdict } from '../lib/verdict';
import { useStore } from '../store';
import type { BottomTab, Settings, TestCase, TestResult } from '../types';
import { DebuggerPanel } from './DebuggerPanel';
import { Linkified } from './Linkified';
import { Button, cn, EmptyState, Kbd, Segmented, Tip } from './ui';

const TONE_SURFACE = {
  success: 'border-success/25 bg-success/8',
  danger: 'border-danger/25 bg-danger/8',
  warning: 'border-warning/25 bg-warning/8',
  info: 'border-info/25 bg-info/8',
  muted: 'border-line bg-panel-2',
} as const;

const MAX_OUTPUT_LINES = 2000;

function TabButton({ tab, icon, label, badge }: { tab: BottomTab; icon: ReactNode; label: string; badge?: ReactNode }) {
  const active = useStore((s) => s.bottomTab === tab);
  return (
    <button
      type="button"
      onClick={() => useStore.getState().setBottomTab(tab)}
      title={label}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition [&_svg]:size-3.5',
        active ? 'bg-panel-2 text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      {icon}
      <span className="hidden @md:inline">{label}</span>
      {badge}
    </button>
  );
}

export function BottomPanel() {
  const tab = useStore((s) => s.bottomTab);
  const summary = useRunSummary();
  const compileFailed = useStore((s) => s.compile?.ok === false);
  const hasProblem = useStore((s) => s.problem.trim().length > 0);
  const debugStatus = useStore((s) => s.debug?.status);
  const ioPosition = useStore((s) => s.settings.ioPosition);
  const toggleLayout = () => useStore.getState().updateSettings({ ioPosition: ioPosition === 'bottom' ? 'right' : 'bottom' });

  return (
    <div className="@container flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2">
        <TabButton
          tab="tests"
          icon={<FlaskConical />}
          label="Testcases"
          badge={
            summary && (
              <span className={cn('ml-0.5 font-mono text-[11px]', summary.passed === summary.total ? 'text-success' : 'text-danger')}>
                {summary.passed}/{summary.total}
              </span>
            )
          }
        />
        <TabButton tab="console" icon={<Terminal />} label="Console" badge={compileFailed && <span className="size-1.5 rounded-full bg-danger" />} />
        <TabButton
          tab="debug"
          icon={<Bug />}
          label="Debugger"
          badge={debugStatus === 'running' ? <Loader2 className="animate-spin text-accent" /> : debugStatus && <span className="size-1.5 rounded-full bg-warning" />}
        />
        <TabButton tab="problem" icon={<FileText />} label="Problem" badge={hasProblem && <span className="size-1.5 rounded-full bg-accent" />} />
        <div className="flex-1" />
        <Tip label={ioPosition === 'bottom' ? 'Move this panel to the right' : 'Move this panel to the bottom'} keys={['Alt', 'L']}>
          <Button variant="ghost" size="icon-sm" onClick={toggleLayout} aria-label="Move panel">
            {ioPosition === 'bottom' ? <PanelRight /> : <PanelBottom />}
          </Button>
        </Tip>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'tests' ? <TestPanel /> : tab === 'console' ? <ConsolePanel /> : tab === 'debug' ? <DebuggerPanel /> : <ProblemPanel />}
      </div>
    </div>
  );
}

function TestChip({ index, test, active }: { index: number; test: TestCase; active: boolean }) {
  const verdict = useVerdict(test.id);
  const running = useStore((s) => s.runningIds.includes(test.id));
  const canRemove = useStore((s) => s.tests.length > 1);
  const { setActiveTest, removeTest } = useStore.getState();

  return (
    <div
      className={cn(
        'group flex h-7 shrink-0 items-center rounded-md border text-xs font-medium transition',
        active ? 'border-line-strong bg-panel-2 text-fg' : 'border-transparent text-muted hover:bg-hover hover:text-fg',
      )}
    >
      <button type="button" onClick={() => setActiveTest(test.id)} className="flex h-full items-center gap-1.5 pr-2 pl-2.5">
        {running ? (
          <Loader2 className="size-3 animate-spin text-accent" />
        ) : (
          <span className={cn('size-1.5 rounded-full', verdict ? TONE_BG[VERDICT_META[verdict].tone] : 'bg-line-strong')} />
        )}
        Case {index + 1}
      </button>
      {canRemove && (
        <button
          type="button"
          aria-label={`Delete case ${index + 1}`}
          onClick={() => removeTest(test.id)}
          className="mr-1 -ml-1 hidden rounded p-0.5 text-subtle group-hover:block hover:bg-hover hover:text-fg"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function checkerLabel(settings: Settings) {
  const parts = [settings.compareMode === 'tokens' ? 'tokens' : 'exact lines'];
  if (settings.floatTolerance) parts.push(`±${settings.floatTolerance}`);
  if (settings.ignoreCase) parts.push('any case');
  return parts.join(' · ');
}

function VerdictBar({ result, test }: { result: TestResult; test: TestCase }) {
  const verdict = useVerdict(test.id)!;
  const settings = useStore((s) => s.settings);
  const aiEnabled = useStore((s) => s.serverConfig?.aiEnabled);
  const meta = VERDICT_META[verdict];
  const comparison = verdict === 'AC' || verdict === 'WA' ? compareResult(result, test.expected, checkerOptions(settings)) : null;

  let detail: ReactNode = '';
  if (verdict === 'AC') detail = `${result.timeMs} ms${comparison?.formatOnly ? ' · spacing/line breaks differ from the expected output (the checker ignores that)' : ''}`;
  else if (verdict === 'DONE') detail = `${result.timeMs} ms · add an expected output to get a verdict`;
  else if (verdict === 'WA') detail = comparison?.summary;
  else if (verdict === 'TLE') detail = `Took longer than ${settings.timeLimitMs} ms`;
  else if (verdict === 'CE') detail = 'Fix the errors shown below';
  else detail = result.message ?? '';

  return (
    <div className={cn('mx-3 mb-2 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-1.5', TONE_SURFACE[meta.tone])}>
      <span className={cn('text-[15px] font-semibold', TONE_TEXT[meta.tone])}>{meta.label}</span>
      <span className="min-w-0 text-xs text-muted">{detail}</span>
      <div className="flex-1" />
      {(verdict === 'AC' || verdict === 'WA') && (
        <Tip label="How outputs are compared (change in Settings)">
          <button type="button" onClick={() => useStore.getState().openDialog('settings')} className="text-[11px] text-subtle hover:text-fg">
            Checker: {checkerLabel(settings)}
          </button>
        </Tip>
      )}
      {isFailing(verdict) && aiEnabled && verdict !== 'IE' && (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => sendToAssistant('/debug')}>
            <Bug />
            Explain
          </Button>
          <Button size="sm" variant="primary" onClick={() => sendToAssistant('/fix')}>
            <Wand2 />
            Fix with AI
          </Button>
        </div>
      )}
    </div>
  );
}

function IOBox({ label, actions, children }: { label: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[140px] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-panel-2/60 transition-colors focus-within:border-accent/60">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 pr-1.5 pl-3 text-[11px] font-semibold tracking-wider text-subtle uppercase">
        {label}
        <div className="flex items-center gap-1 normal-case">{actions}</div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

const textareaClass =
  'h-full w-full resize-none bg-transparent px-3 pb-2 font-mono text-[13px] leading-relaxed text-fg placeholder:text-subtle';

function Tokens({ text, bad, tone }: { text: string; bad: Set<number>; tone: 'expected' | 'actual' }) {
  let index = -1;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (!part || /^\s+$/.test(part)) return part;
        index++;
        return bad.has(index) ? (
          <mark key={i} className={cn('rounded-sm px-0.5 text-fg', tone === 'expected' ? 'bg-success/30' : 'bg-danger/35')}>
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

function DiffLine({ n, kind, children }: { n?: number; kind: 'same' | 'expected' | 'actual'; children: ReactNode }) {
  return (
    <div className={cn('flex px-2', kind === 'expected' && 'bg-success/8', kind === 'actual' && 'bg-danger/10')}>
      <span className="w-7 shrink-0 pr-2 text-right text-subtle/70 select-none">{n}</span>
      <span
        className={cn(
          'w-8 shrink-0 pt-px font-sans text-[10px] font-semibold uppercase select-none',
          kind === 'expected' ? 'text-success' : 'text-danger',
        )}
      >
        {kind === 'expected' ? 'exp' : kind === 'actual' ? 'you' : ''}
      </span>
      <span className="whitespace-pre">{children}</span>
    </div>
  );
}

function DiffView({ comparison }: { comparison: Comparison }) {
  return (
    <div className="h-full overflow-auto pb-2 font-mono text-[12.5px] leading-relaxed">
      {comparison.summary && (
        <div className="sticky top-0 z-10 border-b border-line bg-panel-2 px-3 py-1 font-sans text-[11.5px] text-danger">{comparison.summary}</div>
      )}
      {comparison.rows.slice(0, MAX_OUTPUT_LINES).map((row, i) =>
        row.status === 'same' ? (
          <DiffLine key={i} n={i + 1} kind="same">
            {row.actual || ' '}
          </DiffLine>
        ) : (
          <Fragment key={i}>
            {row.expected !== null && (
              <DiffLine n={i + 1} kind="expected">
                <Tokens text={row.expected} bad={row.badTokens} tone="expected" />
              </DiffLine>
            )}
            <DiffLine n={row.expected === null ? i + 1 : undefined} kind="actual">
              {row.actual === null ? <i className="font-sans text-subtle">(missing)</i> : <Tokens text={row.actual} bad={row.badTokens} tone="actual" />}
            </DiffLine>
          </Fragment>
        ),
      )}
      {comparison.rows.length > MAX_OUTPUT_LINES && <div className="px-3 text-subtle">… {comparison.rows.length - MAX_OUTPUT_LINES} more lines</div>}
    </div>
  );
}

function OutputView({ test, result, running, view }: { test: TestCase; result?: TestResult; running: boolean; view: 'output' | 'diff' }) {
  const compileOutput = useStore((s) => s.compile?.output);
  const settings = useStore((s) => s.settings);
  const verdict = useVerdict(test.id);

  if (running) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" />
        Running…
      </div>
    );
  }
  if (!result) {
    return (
      <EmptyState>
        Run your code to see the output
        <div className="mt-2">
          <Kbd keys={['Mod', 'Enter']} />
        </div>
      </EmptyState>
    );
  }
  if (result.outcome === 'CE') {
    return (
      <pre className="h-full overflow-auto px-3 pb-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-danger">
        <Linkified text={compileOutput || 'Compilation failed.'} />
      </pre>
    );
  }

  const comparison = test.expected.trim() ? compareResult(result, test.expected, checkerOptions(settings)) : null;
  if (view === 'diff' && comparison) return <DiffView comparison={comparison} />;

  const lines = result.stdout ? result.stdout.replace(/\n$/, '').split('\n') : [];
  const mismatched = (i: number) => verdict === 'WA' && comparison?.rows[i] && comparison.rows[i].status !== 'same';

  return (
    <div className="h-full overflow-auto pb-2 font-mono text-[13px] leading-relaxed">
      {lines.length === 0 ? (
        <div className="px-3 text-subtle italic">(no output)</div>
      ) : (
        lines.slice(0, MAX_OUTPUT_LINES).map((line, i) => (
          <div key={i} className={cn('flex px-3', mismatched(i) && 'bg-danger/12')}>
            <span className="w-7 shrink-0 pr-3 text-right text-subtle/70 select-none">{i + 1}</span>
            <span className="whitespace-pre">{line || ' '}</span>
          </div>
        ))
      )}
      {lines.length > MAX_OUTPUT_LINES && <div className="px-3 text-subtle">… {lines.length - MAX_OUTPUT_LINES} more lines</div>}
      {(result.stderr || (result.outcome === 'RE' && result.message)) && (
        <div className="mx-3 mt-2 rounded-md border border-warning/30 bg-warning/8 p-2">
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-warning uppercase">stderr</div>
          <pre className="text-xs whitespace-pre-wrap text-fg/90">
            <Linkified text={result.stderr || result.message || ''} />
          </pre>
        </div>
      )}
    </div>
  );
}

function TestPanel() {
  const tests = useStore((s) => s.tests);
  const activeId = useStore((s) => s.activeTestId);
  const active = tests.find((t) => t.id === activeId) ?? tests[0];
  const result = useStore((s) => s.results[active.id]);
  const running = useStore((s) => s.runningIds.includes(active.id));
  const verdict = useVerdict(active.id);
  const { addTest, duplicateTest, updateTest } = useStore.getState();

  // Wrong answers open in the diff view; the user's choice sticks until the next result.
  const [view, setView] = useState<'output' | 'diff' | null>(null);
  useEffect(() => setView(null), [active.id, result]);
  const effectiveView = view ?? (verdict === 'WA' ? 'diff' : 'output');
  const canDiff = Boolean(result && result.outcome === 'ok' && active.expected.trim());

  return (
    <div className="@container flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-3 pt-2.5 pb-2">
        {tests.map((test, i) => (
          <TestChip key={test.id} index={i} test={test} active={test.id === active.id} />
        ))}
        <Tip label="Add test case" keys={['Alt', 'N']}>
          <Button variant="ghost" size="icon-sm" onClick={() => addTest()} aria-label="Add test case">
            <Plus />
          </Button>
        </Tip>
        <Tip label="Duplicate this case">
          <Button variant="ghost" size="icon-sm" onClick={() => duplicateTest(active.id)} aria-label="Duplicate test case">
            <Copy />
          </Button>
        </Tip>
      </div>

      {result && !running && <VerdictBar result={result} test={active} />}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto px-3 pb-3 @2xl:grid-cols-3 @2xl:overflow-hidden">
        <IOBox label="Input">
          <textarea
            value={active.input}
            onChange={(e) => updateTest(active.id, { input: e.target.value })}
            placeholder="Program input (stdin)"
            spellCheck={false}
            className={textareaClass}
          />
        </IOBox>
        <IOBox label="Expected output">
          <textarea
            value={active.expected}
            onChange={(e) => updateTest(active.id, { expected: e.target.value })}
            placeholder="Optional: add it to get Accepted / Wrong Answer"
            spellCheck={false}
            className={textareaClass}
          />
        </IOBox>
        <IOBox
          label="Your output"
          actions={
            <>
              {canDiff && !running && (
                <Segmented
                  value={effectiveView}
                  onChange={setView}
                  options={[
                    { value: 'output', label: 'Output' },
                    { value: 'diff', label: 'Diff' },
                  ]}
                />
              )}
              {result?.stdout && (
                <Tip label="Copy output">
                  <Button variant="ghost" size="icon-sm" onClick={() => copyText(result.stdout)} aria-label="Copy output">
                    <Copy />
                  </Button>
                </Tip>
              )}
            </>
          }
        >
          <OutputView test={active} result={result} running={running} view={effectiveView} />
        </IOBox>
      </div>
    </div>
  );
}

function ConsolePanel() {
  const compile = useStore((s) => s.compile);
  const lastRun = useStore((s) => s.lastRun);
  const activeIndex = useStore((s) => s.tests.findIndex((t) => t.id === s.activeTestId));
  const result = useStore((s) => s.results[s.activeTestId]);

  if (!compile || !lastRun) {
    return <EmptyState icon={<Terminal />}>Compiler messages and stderr appear here after you run your code.</EmptyState>;
  }

  const runtimeOutput = [result?.message, result?.stderr].filter(Boolean).join('\n');
  return (
    <div className="h-full space-y-3 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed">
      <section className="rounded-lg border border-line bg-panel-2/60">
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5 font-sans text-xs">
          <span className="font-semibold text-muted">Compiler · {LANGUAGE_META[lastRun.language].label}</span>
          {compile.ok ? (
            <span className="text-success">✓ Compiled in {compile.timeMs} ms</span>
          ) : (
            <span className="text-danger">✗ Compilation failed</span>
          )}
        </div>
        <pre className={cn('px-3 py-2 whitespace-pre-wrap', !compile.ok && 'text-danger')}>
          {compile.output ? <Linkified text={compile.output} /> : <span className="text-subtle">No errors or warnings.</span>}
        </pre>
      </section>
      {runtimeOutput && result?.outcome !== 'CE' && (
        <section className="rounded-lg border border-line bg-panel-2/60">
          <div className="border-b border-line px-3 py-1.5 font-sans text-xs font-semibold text-muted">stderr · Case {activeIndex + 1}</div>
          <pre className="px-3 py-2 whitespace-pre-wrap">
            <Linkified text={runtimeOutput} />
          </pre>
        </section>
      )}
    </div>
  );
}

function ProblemPanel() {
  const problem = useStore((s) => s.problem);
  const setProblem = useStore((s) => s.setProblem);
  return (
    <div className="flex h-full flex-col p-3">
      <textarea
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder={'Paste the problem statement here (optional).\n\nThe AI assistant reads it, which makes /fix, /hint and /tests much more accurate.'}
        className="h-full w-full resize-none rounded-lg border border-line bg-panel-2/60 p-3 text-[13px] leading-relaxed placeholder:text-subtle focus:border-accent/60"
      />
    </div>
  );
}
