import {
  ArrowLeftToLine,
  Bug,
  Copy,
  Eraser,
  ListChecks,
  Loader2,
  Minus,
  MoreHorizontal,
  PanelBottom,
  PanelRight,
  Plus,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
  Type,
  Wand2,
  X,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useElementWidth } from '../hooks';
import { sendToAssistant } from '../lib/assistant';
import type { Comparison } from '../lib/compare';
import { isFailing, LANGUAGE_META, TONE_BG, TONE_TEXT, VERDICT_META } from '../lib/languages';
import { changeIoFontSize, IO_FONT, toggleTestPanelPosition } from '../lib/layout';
import { copyText } from '../lib/platform';
import { runTests } from '../lib/runner';
import { clearAllTests, clearResults, restoreSamples } from '../lib/testcases';
import { checkerOptions, compareResult, useRunSummary, useVerdict } from '../lib/verdict';
import { useStore } from '../store';
import type { BottomTab, Settings, TestCase, TestResult, Verdict } from '../types';
import { DebuggerPanel } from './DebuggerPanel';
import { Linkified } from './Linkified';
import { PremiumIcon, type IconName } from './PremiumIcon';
import { ProblemPanel } from './ProblemPanel';
import { Button, cn, EmptyState, Kbd, Tip } from './ui';

const MAX_OUTPUT_LINES = 2000;

/** A faint wash plus a 2px rule on the left edge, in the verdict's color. */
const TONE_WASH = {
  success: 'bg-success/[0.05] shadow-[inset_2px_0_0_var(--success)]',
  danger: 'bg-danger/[0.06] shadow-[inset_2px_0_0_var(--danger)]',
  warning: 'bg-warning/[0.06] shadow-[inset_2px_0_0_var(--warning)]',
  info: 'bg-info/[0.05] shadow-[inset_2px_0_0_var(--info)]',
  muted: 'bg-panel-2',
} as const;

const TONE_HALO = {
  success: 'ring-success/15',
  danger: 'ring-danger/15',
  warning: 'ring-warning/15',
  info: 'ring-info/15',
  muted: 'ring-transparent',
} as const;

const VERDICT_ICON: Record<Verdict, IconName> = {
  AC: 'check',
  WA: 'cross',
  TLE: 'clock',
  RE: 'warning',
  CE: 'warning',
  OLE: 'warning',
  IE: 'warning',
  DONE: 'info',
};

function TabButton({ tab, label, badge }: { tab: BottomTab; label: string; badge?: ReactNode }) {
  const active = useStore((s) => s.bottomTab === tab);
  return (
    <button
      type="button"
      onClick={() => useStore.getState().setBottomTab(tab)}
      title={label}
      aria-pressed={active}
      className={cn(
        'relative flex h-full shrink-0 items-center gap-1.5 text-[12.5px] font-medium transition-colors',
        active ? 'text-fg' : 'text-muted hover:text-fg',
      )}
    >
      {label}
      {badge}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg" />}
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
  const locked = useStore((s) => s.settings.layoutLocked);
  const allPassed = summary && summary.passed === summary.total;

  return (
    <div className="@container flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-stretch gap-5 overflow-x-auto border-b border-line pr-1.5 pl-4 [scrollbar-width:none]">
        <TabButton
          tab="tests"
          label="Testcases"
          badge={
            summary && (
              <span
                className={cn(
                  'rounded-[5px] px-1.5 py-px text-[10.5px] font-semibold tabular-nums',
                  allPassed ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger',
                )}
              >
                {summary.passed}/{summary.total}
              </span>
            )
          }
        />
        <TabButton tab="console" label="Console" badge={compileFailed && <span className="size-1.5 rounded-full bg-danger" />} />
        <TabButton
          tab="debug"
          label="Debugger"
          badge={debugStatus === 'running' ? <Loader2 className="size-3 animate-spin text-accent" /> : debugStatus && <span className="size-1.5 rounded-full bg-warning" />}
        />
        <TabButton tab="problem" label="Problem" badge={hasProblem && <span className="size-1.5 rounded-full bg-accent" />} />
        <div className="flex-1" />
        <div className="flex items-center">
          <Tip
            label={locked ? 'Layout is locked (Alt+K to unlock)' : ioPosition === 'bottom' ? 'Move this panel to the right' : 'Move this panel to the bottom'}
            keys={locked ? undefined : ['Alt', 'L']}
          >
            <Button variant="ghost" size="icon-sm" onClick={toggleTestPanelPosition} aria-label="Move panel" className={cn(locked && 'opacity-40')}>
              {ioPosition === 'bottom' ? <PanelRight /> : <PanelBottom />}
            </Button>
          </Tip>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'tests' ? <TestPanel /> : tab === 'console' ? <ConsolePanel /> : tab === 'debug' ? <DebuggerPanel /> : <ProblemPanel />}
      </div>
    </div>
  );
}

function CaseTab({ index, test, active }: { index: number; test: TestCase; active: boolean }) {
  const verdict = useVerdict(test.id);
  const timeMs = useStore((s) => s.results[test.id]?.timeMs);
  const running = useStore((s) => s.runningIds.includes(test.id));
  const canRemove = useStore((s) => s.tests.length > 1);
  const { setActiveTest, removeTest } = useStore.getState();
  const tone = verdict ? VERDICT_META[verdict].tone : 'muted';

  return (
    <div
      className={cn(
        'group flex h-7 shrink-0 items-center rounded-md text-[12.5px] font-medium transition-colors',
        active ? 'bg-hover text-fg ring-1 ring-line-strong ring-inset' : 'text-muted hover:bg-hover/60 hover:text-fg',
      )}
    >
      <button
        type="button"
        onClick={() => setActiveTest(test.id)}
        title={verdict ? `${VERDICT_META[verdict].label}${timeMs !== undefined && verdict !== 'CE' ? ` · ${timeMs} ms` : ''}` : 'Not run yet'}
        className="flex h-full items-center gap-2 px-2.5"
      >
        {running ? (
          <Loader2 className="size-3 animate-spin text-accent" />
        ) : (
          <span className={cn('size-1.5 rounded-full ring-[3px]', verdict ? TONE_BG[tone] : 'bg-line-strong', TONE_HALO[tone])} />
        )}
        Case {index + 1}
      </button>
      {canRemove && (
        <button
          type="button"
          aria-label={`Delete case ${index + 1}`}
          onClick={() => removeTest(test.id)}
          className="mr-1 -ml-1.5 hidden rounded p-0.5 text-subtle group-hover:block hover:bg-hover hover:text-fg"
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

function VerdictLine({ result, test }: { result: TestResult; test: TestCase }) {
  const verdict = useVerdict(test.id)!;
  const settings = useStore((s) => s.settings);
  const aiEnabled = useStore((s) => s.serverConfig?.aiEnabled);
  const meta = VERDICT_META[verdict];
  const comparison = verdict === 'AC' || verdict === 'WA' ? compareResult(result, test.expected, checkerOptions(settings)) : null;
  const time = verdict !== 'CE' ? `${result.timeMs} ms` : '';

  let detail: ReactNode = '';
  if (verdict === 'AC') detail = comparison?.formatOnly ? 'Spacing or line breaks differ from the expected output; the checker ignores that.' : '';
  else if (verdict === 'DONE') detail = 'Add an expected output to get a verdict.';
  else if (verdict === 'WA') detail = comparison?.summary;
  else if (verdict === 'TLE') detail = `Took longer than the ${settings.timeLimitMs} ms limit.`;
  else if (verdict === 'CE') detail = 'See the errors in the output column.';
  else detail = result.message ?? '';

  return (
    <div className={cn('flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line py-2 pr-2 pl-3.5', TONE_WASH[meta.tone])}>
      <span className="flex items-center gap-1.5">
        <PremiumIcon name={VERDICT_ICON[verdict]} tone={meta.tone === 'muted' ? undefined : meta.tone} className="text-[14px]" />
        <span className={cn('text-[13px] font-semibold', TONE_TEXT[meta.tone])}>{meta.label}</span>
      </span>
      {time && <span className="text-[12px] text-subtle tabular-nums">{time}</span>}
      {detail && <span className="min-w-0 text-[12px] text-muted">{detail}</span>}
      <div className="flex-1" />
      {(verdict === 'AC' || verdict === 'WA') && (
        <Tip label="How outputs are compared (change in Settings)">
          <button type="button" onClick={() => useStore.getState().openDialog('settings')} className="text-[11.5px] text-subtle transition-colors hover:text-fg">
            Checker: {checkerLabel(settings)}
          </button>
        </Tip>
      )}
      {isFailing(verdict) && aiEnabled && verdict !== 'IE' && (
        <div className="flex items-center gap-1">
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

/** One of the input / expected / output columns: a caption row, then the content. Actions show on hover. */
function IOColumn({ label, meta, actions, controls, children }: { label: string; meta?: ReactNode; actions?: ReactNode; controls?: ReactNode; children: ReactNode }) {
  return (
    <div className="group/io flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel-2/70 pr-1.5 pl-3.5">
        <span className="text-[12px] font-medium text-muted transition-colors group-focus-within/io:text-fg">{label}</span>
        {meta && <span className="text-[11px] text-subtle tabular-nums">{meta}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/io:opacity-100 group-hover/io:opacity-100">{actions}</div>
        {controls}
      </div>
      <div className="min-h-0 flex-1 pt-2">{children}</div>
    </div>
  );
}

function ColumnAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tip label={label}>
      <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} className="size-6 [&_svg]:size-3.5">
        {children}
      </Button>
    </Tip>
  );
}

function ViewToggle({ value, onChange }: { value: 'output' | 'diff'; onChange: (view: 'output' | 'diff') => void }) {
  return (
    <div className="ml-1 flex items-center rounded-md bg-hover/70 p-0.5 text-[11.5px] font-medium">
      {(['output', 'diff'] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChange(view)}
          className={cn('h-5 rounded px-2 capitalize transition-colors', value === view ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

const lineCount = (text: string) => {
  const n = text ? text.replace(/\n$/, '').split('\n').length : 0;
  return n ? `${n} line${n === 1 ? '' : 's'}` : undefined;
};

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-3.5 [&_svg]:text-muted';

function TextSizeRow() {
  const size = useStore((s) => s.settings.ioFontSize);
  const step = 'grid size-6 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg disabled:opacity-30 [&_svg]:size-3.5';
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 text-[13px]">
      <span className="flex items-center gap-2">
        <Type className="size-3.5 text-muted" />
        Text size
      </span>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => changeIoFontSize(-1)} disabled={size <= IO_FONT.min} aria-label="Smaller text" className={step}>
          <Minus />
        </button>
        <span className="w-6 text-center text-xs tabular-nums">{size}</span>
        <button type="button" onClick={() => changeIoFontSize(1)} disabled={size >= IO_FONT.max} aria-label="Larger text" className={step}>
          <Plus />
        </button>
      </div>
    </div>
  );
}

function TestsMenu({ activeId, index }: { activeId: string; index: number }) {
  const samples = useStore((s) => s.problemMeta?.samples?.length ?? 0);
  const hasResults = useStore((s) => Object.keys(s.results).length > 0);
  const { duplicateTest, removeTest } = useStore.getState();

  return (
    <DropdownMenu.Root>
      <Tip label="More test case actions">
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More test case actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="popover z-50 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Item onSelect={() => duplicateTest(activeId)} className={menuItem}>
            <Copy />
            Duplicate case {index + 1}
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => removeTest(activeId)} className={menuItem}>
            <Trash2 />
            Delete case {index + 1}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          {samples > 0 && (
            <DropdownMenu.Item onSelect={restoreSamples} className={menuItem}>
              <RotateCcw />
              Restore problem samples ({samples})
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={clearResults} disabled={!hasResults} className={menuItem}>
            <Eraser />
            Clear results
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={clearAllTests} className={cn(menuItem, 'text-danger [&_svg]:text-danger')}>
            <Trash2 />
            Delete all test cases
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <TextSizeRow />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const textareaClass = 'h-full w-full resize-none bg-transparent px-3.5 pb-3 font-mono leading-[1.65] text-fg placeholder:font-sans placeholder:text-[12.5px] placeholder:text-subtle';

function Tokens({ text, bad, tone }: { text: string; bad: Set<number>; tone: 'expected' | 'actual' }) {
  let index = -1;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (!part || /^\s+$/.test(part)) return part;
        index++;
        return bad.has(index) ? (
          <mark key={i} className={cn('rounded-sm px-0.5 text-fg', tone === 'expected' ? 'bg-success/25' : 'bg-danger/30')}>
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

const missing = <i className="font-sans text-[0.9em] text-subtle">(missing)</i>;

/** Expected and actual output side by side, one row per line, differing words highlighted. */
function DiffView({ comparison }: { comparison: Comparison }) {
  const cell = 'min-w-0 px-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]';
  return (
    <div className="h-full overflow-auto pb-3 font-mono leading-[1.65]">
      <div className="sticky top-0 z-10 grid grid-cols-[2.25rem_1fr_1fr] border-b border-line bg-panel font-sans text-[11px] font-medium">
        <span />
        <span className="px-2.5 py-1 text-success">Expected</span>
        <span className="border-l border-line px-2.5 py-1 text-danger">Your output</span>
      </div>
      {comparison.rows.slice(0, MAX_OUTPUT_LINES).map((row, i) => {
        const differs = row.status !== 'same';
        return (
          <div key={i} className="grid grid-cols-[2.25rem_1fr_1fr]">
            <span className="pr-2 text-right text-subtle/60 tabular-nums select-none">{i + 1}</span>
            <span className={cn(cell, differs && 'bg-success/[0.07] shadow-[inset_2px_0_0_var(--success)]')}>
              {row.expected === null ? missing : differs ? <Tokens text={row.expected} bad={row.badTokens} tone="expected" /> : row.expected || ' '}
            </span>
            <span className={cn(cell, 'border-l border-line', differs && 'bg-danger/[0.08]')}>
              {row.actual === null ? missing : differs ? <Tokens text={row.actual} bad={row.badTokens} tone="actual" /> : row.actual || ' '}
            </span>
          </div>
        );
      })}
      {comparison.rows.length > MAX_OUTPUT_LINES && <div className="px-3.5 text-subtle">… {comparison.rows.length - MAX_OUTPUT_LINES} more lines</div>}
    </div>
  );
}

function OutputView({ test, result, running, view }: { test: TestCase; result?: TestResult; running: boolean; view: 'output' | 'diff' }) {
  const compileOutput = useStore((s) => s.compile?.output);
  const settings = useStore((s) => s.settings);
  const verdict = useVerdict(test.id);

  if (running) {
    return (
      <div className="flex h-full items-center justify-center gap-2 font-sans text-[12.5px] text-muted">
        <Loader2 className="size-3.5 animate-spin" />
        Running…
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center font-sans text-[12.5px] text-subtle">
        Run your code to see the output
        <Kbd keys={['Mod', 'Enter']} />
      </div>
    );
  }
  if (result.outcome === 'CE') {
    return (
      <pre className="h-full overflow-auto px-3.5 pb-3 font-mono text-[0.92em] leading-[1.65] whitespace-pre-wrap text-danger">
        <Linkified text={compileOutput || 'Compilation failed.'} />
      </pre>
    );
  }

  const comparison = test.expected.trim() ? compareResult(result, test.expected, checkerOptions(settings)) : null;
  if (view === 'diff' && comparison) return <DiffView comparison={comparison} />;

  const lines = result.stdout ? result.stdout.replace(/\n$/, '').split('\n') : [];
  const mismatched = (i: number) => verdict === 'WA' && comparison?.rows[i] && comparison.rows[i].status !== 'same';

  return (
    <div className="h-full overflow-auto pb-3 font-mono leading-[1.65]">
      {lines.length === 0 ? (
        <div className="px-3.5 font-sans text-[12.5px] text-subtle italic">No output</div>
      ) : (
        lines.slice(0, MAX_OUTPUT_LINES).map((line, i) => (
          <div key={i} className={cn('flex pr-3', mismatched(i) && 'bg-danger/[0.08] shadow-[inset_2px_0_0_var(--danger)]')}>
            <span className="w-9 shrink-0 pr-2.5 text-right text-subtle/60 tabular-nums select-none">{i + 1}</span>
            <span className="whitespace-pre">{line || ' '}</span>
          </div>
        ))
      )}
      {lines.length > MAX_OUTPUT_LINES && <div className="px-3.5 text-subtle">… {lines.length - MAX_OUTPUT_LINES} more lines</div>}
      {(result.stderr || (result.outcome === 'RE' && result.message)) && (
        <div className="mt-3 border-t border-line px-3.5 pt-2">
          <div className="mb-1 font-sans text-[11.5px] font-medium text-warning">stderr</div>
          <pre className="text-[0.92em] whitespace-pre-wrap text-fg/85">
            <Linkified text={result.stderr || result.message || ''} />
          </pre>
        </div>
      )}
    </div>
  );
}

/** Ctrl/⌘ + wheel over the columns changes their text size, like zooming in an editor. */
function useWheelTextSize(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pending = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      pending += e.deltaY;
      if (Math.abs(pending) < 40) return; // trackpads send many tiny steps
      changeIoFontSize(pending < 0 ? 1 : -1);
      pending = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);
}

function TestPanel() {
  const tests = useStore((s) => s.tests);
  const activeId = useStore((s) => s.activeTestId);
  const active = tests.find((t) => t.id === activeId) ?? tests[0];
  const result = useStore((s) => s.results[active.id]);
  const running = useStore((s) => s.runningIds.includes(active.id));
  const verdict = useVerdict(active.id);
  const aiEnabled = useStore((s) => s.serverConfig?.aiEnabled);
  const busy = useStore((s) => Boolean(s.running));
  const fontSize = useStore((s) => s.settings.ioFontSize);
  const locked = useStore((s) => s.settings.layoutLocked);
  const { addTest, updateTest } = useStore.getState();
  const index = tests.indexOf(active);

  const columnsRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(columnsRef);
  const sideBySide = width === 0 || width >= 560;
  useWheelTextSize(columnsRef);

  // Wrong answers open in the diff view; the user's choice sticks until the next result.
  const [view, setView] = useState<'output' | 'diff' | null>(null);
  useEffect(() => setView(null), [active.id, result]);
  const effectiveView = view ?? (verdict === 'WA' ? 'diff' : 'output');
  const canDiff = Boolean(result && result.outcome === 'ok' && active.expected.trim());
  const outputUsable = Boolean(result && result.outcome === 'ok' && result.stdout && result.stdout !== active.expected);
  const handle = cn('io-handle', locked && 'io-handle-locked');

  return (
    <div className="@container flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-2">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {tests.map((test, i) => (
            <CaseTab key={test.id} index={i} test={test} active={test.id === active.id} />
          ))}
          <Tip label="Add test case" keys={['Alt', 'N']}>
            <Button variant="ghost" size="icon-sm" onClick={() => addTest()} aria-label="Add test case" className="shrink-0">
              <Plus />
            </Button>
          </Tip>
        </div>
        <div className="flex-1" />
        <Tip label="Run all test cases" keys={['Mod', 'Shift', 'Enter']}>
          <Button size="sm" variant="ghost" onClick={() => runTests('all')} disabled={busy} className="shrink-0">
            <ListChecks />
            <span className="hidden @lg:inline">Run all</span>
          </Button>
        </Tip>
        <Tip label={aiEnabled ? 'Generate edge cases and tests with AI' : 'Needs the AI assistant'} keys={['Alt', 'G']}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useStore.getState().openDialog('generateTests')}
            disabled={!aiEnabled}
            className="shrink-0 [&_svg]:text-accent"
          >
            <Sparkles />
            <span className="hidden @lg:inline">Generate</span>
          </Button>
        </Tip>
        <TestsMenu activeId={active.id} index={index} />
      </div>

      {result && !running && <VerdictLine result={result} test={active} />}

      <div ref={columnsRef} className="min-h-0 flex-1" style={{ fontSize }}>
        <PanelGroup
          key={sideBySide ? 'columns' : 'rows'}
          direction={sideBySide ? 'horizontal' : 'vertical'}
          autoSaveId={sideBySide ? 'cp-io-columns' : 'cp-io-rows'}
        >
          <Panel id="io-input" order={1} minSize={12} defaultSize={33}>
            <IOColumn
              label="Input"
              meta={lineCount(active.input)}
              actions={
                active.input && (
                  <>
                    <ColumnAction label="Copy input" onClick={() => copyText(active.input)}>
                      <Copy />
                    </ColumnAction>
                    <ColumnAction label="Clear input" onClick={() => updateTest(active.id, { input: '' })}>
                      <Eraser />
                    </ColumnAction>
                  </>
                )
              }
            >
              <textarea
                value={active.input}
                onChange={(e) => updateTest(active.id, { input: e.target.value })}
                placeholder="Program input (stdin)"
                spellCheck={false}
                aria-label="Input"
                className={textareaClass}
              />
            </IOColumn>
          </Panel>
          <PanelResizeHandle disabled={locked} className={handle} />
          <Panel id="io-expected" order={2} minSize={12} defaultSize={33}>
            <IOColumn
              label="Expected output"
              meta={lineCount(active.expected)}
              actions={
                <>
                  {outputUsable && (
                    <ColumnAction label="Use your output as the expected output" onClick={() => updateTest(active.id, { expected: result!.stdout })}>
                      <ArrowLeftToLine />
                    </ColumnAction>
                  )}
                  {active.expected && (
                    <>
                      <ColumnAction label="Copy expected output" onClick={() => copyText(active.expected)}>
                        <Copy />
                      </ColumnAction>
                      <ColumnAction label="Clear expected output" onClick={() => updateTest(active.id, { expected: '' })}>
                        <Eraser />
                      </ColumnAction>
                    </>
                  )}
                </>
              }
            >
              <textarea
                value={active.expected}
                onChange={(e) => updateTest(active.id, { expected: e.target.value })}
                placeholder="Optional. Add it to get a verdict."
                spellCheck={false}
                aria-label="Expected output"
                className={textareaClass}
              />
            </IOColumn>
          </Panel>
          <PanelResizeHandle disabled={locked} className={handle} />
          <Panel id="io-output" order={3} minSize={12} defaultSize={34}>
            <IOColumn
              label="Your output"
              meta={result?.stdout && !running ? lineCount(result.stdout) : undefined}
              actions={
                result?.stdout && (
                  <ColumnAction label="Copy output" onClick={() => copyText(result.stdout)}>
                    <Copy />
                  </ColumnAction>
                )
              }
              controls={canDiff && !running && <ViewToggle value={effectiveView} onChange={setView} />}
            >
              <OutputView test={active} result={result} running={running} view={effectiveView} />
            </IOColumn>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

function ConsoleSection({ title, status, children }: { title: ReactNode; status?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line last:border-b-0">
      <div className="flex h-9 items-center justify-between gap-3 px-3.5">
        <span className="text-[12px] font-medium text-muted">{title}</span>
        {status}
      </div>
      <div className="px-3.5 pb-3">{children}</div>
    </section>
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
    <div className="h-full overflow-auto font-mono text-[12.5px] leading-[1.65]">
      <ConsoleSection
        title={
          <>
            Compiler <span className="text-subtle">· {LANGUAGE_META[lastRun.language].label}</span>
          </>
        }
        status={
          <span className={cn('flex items-center gap-1 font-sans text-[12px]', compile.ok ? 'text-success' : 'text-danger')}>
            <PremiumIcon name={compile.ok ? 'check' : 'cross'} />
            {compile.ok ? `Compiled in ${compile.timeMs} ms` : 'Compilation failed'}
          </span>
        }
      >
        <pre className={cn('whitespace-pre-wrap', !compile.ok && 'text-danger')}>
          {compile.output ? <Linkified text={compile.output} /> : <span className="font-sans text-subtle">No errors or warnings.</span>}
        </pre>
      </ConsoleSection>
      {runtimeOutput && result?.outcome !== 'CE' && (
        <ConsoleSection title={`stderr · Case ${activeIndex + 1}`}>
          <pre className="whitespace-pre-wrap">
            <Linkified text={runtimeOutput} />
          </pre>
        </ConsoleSection>
      )}
    </div>
  );
}
