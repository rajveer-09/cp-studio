import { AlertTriangle, Bug, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Loader2, MousePointerClick, X } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { addWatch, changedAt, goToStep, historyOf, removeWatch, startDebugging, stepBy, stopDebugging } from '../lib/debugger';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META } from '../lib/languages';
import { useStore } from '../store';
import type { DebugSession } from '../types';
import { Linkified } from './Linkified';
import { Button, cn, Kbd, Tip } from './ui';

function WatchBar() {
  const watches = useStore((s) => s.watches[s.language]);
  const running = useStore((s) => s.debug?.status === 'running');
  const hasSession = useStore((s) => Boolean(s.debug));
  const caseNumber = useStore((s) => s.tests.findIndex((t) => t.id === s.activeTestId) + 1);
  const [draft, setDraft] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim() && addWatch(draft)) setDraft('');
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
      <span className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">
        <Eye className="size-3.5" />
        Watch
      </span>
      {watches.map((name) => (
        <span key={name} className="flex h-6 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 pr-1 pl-2 font-mono text-xs text-accent">
          {name}
          <button
            type="button"
            onClick={() => removeWatch(name)}
            aria-label={`Stop watching ${name}`}
            className="rounded p-0.5 opacity-60 hover:bg-accent/20 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <form onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={watches.length ? '+ variable' : 'variable name, e.g. sum'}
          spellCheck={false}
          className="h-6 w-36 rounded-md border border-dashed border-line-strong bg-transparent px-2 font-mono text-xs placeholder:text-subtle focus:border-accent/60"
        />
      </form>
      <div className="flex-1" />
      <span className="text-[11.5px] text-subtle">Input: Case {caseNumber}</span>
      <Tip label="Run with the debugger" keys={['F8']}>
        <Button size="sm" variant="primary" onClick={startDebugging} loading={running} disabled={!watches.length}>
          {!running && <Bug />}
          {hasSession ? 'Restart' : 'Start debugging'}
        </Button>
      </Tip>
      {hasSession && !running && (
        <Tip label="Close the debug session">
          <Button size="icon-sm" variant="ghost" onClick={stopDebugging} aria-label="Close debugger">
            <X />
          </Button>
        </Tip>
      )}
    </div>
  );
}

function Card({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-[150px] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-panel-2/60">
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1 text-[11px] font-semibold tracking-wider text-subtle uppercase">
        {title}
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function Banner({ tone, children }: { tone: 'warning' | 'danger'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs',
        tone === 'danger' ? 'border-danger/25 bg-danger/8 text-danger' : 'border-warning/25 bg-warning/8 text-warning',
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SessionView({ debug }: { debug: DebugSession }) {
  const stepIndex = useStore((s) => s.debugStep);
  const stale = useStore((s) => s.code[debug.language] !== debug.code);
  const steps = debug.steps;
  const step = steps[stepIndex];
  const changed = useMemo(() => changedAt(steps, stepIndex), [steps, stepIndex]);
  const [picked, setPicked] = useState(debug.watches[0]);
  const selected = debug.watches.includes(picked) ? picked : debug.watches[0];
  const history = useMemo(() => historyOf(steps, selected), [steps, selected]);
  const currentEntry = history.findLast((h) => h.step <= stepIndex);

  const iconButton = (label: string, onClick: () => void, icon: ReactNode, keys?: string[]) => (
    <Tip label={label} keys={keys}>
      <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
        {icon}
      </Button>
    </Tip>
  );

  return (
    <div className="flex h-full flex-col">
      {steps.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
          <div className="flex items-center">
            {iconButton('First step', () => goToStep(0), <ChevronsLeft />)}
            {iconButton('Previous step', () => stepBy(-1), <ChevronLeft />, ['Alt', ','])}
            {iconButton('Next step', () => stepBy(1), <ChevronRight />, ['Alt', '.'])}
            {iconButton('Last step', () => goToStep(steps.length - 1), <ChevronsRight />)}
          </div>
          <span className="text-xs tabular-nums">
            Step <b>{stepIndex + 1}</b> of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => editorBridge.revealLine(step.line)}
            className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-fg"
          >
            line {step.line}
          </button>
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={stepIndex}
            onChange={(e) => goToStep(Number(e.target.value))}
            aria-label="Execution timeline"
            className="debug-slider min-w-24 flex-1"
          />
        </div>
      )}

      {stale && (
        <Banner tone="warning">
          Your code changed after this run, so these values may be out of date.{' '}
          <button type="button" onClick={startDebugging} className="font-semibold underline underline-offset-2">
            Run again
          </button>
        </Banner>
      )}
      {debug.truncated && (
        <Banner tone="warning">
          Stopped after {steps.length} steps (the debugger's limit). Use a smaller input to follow the whole run.
        </Banner>
      )}
      {debug.error && (
        <Banner tone="danger">
          Runtime error{debug.errorLine ? ` at line ${debug.errorLine}` : ''}: {debug.error}
          {debug.errorLine && (
            <button type="button" onClick={() => editorBridge.revealLine(debug.errorLine!)} className="ml-2 font-semibold underline underline-offset-2">
              Go to line
            </button>
          )}
        </Banner>
      )}

      {steps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-[13px] text-muted">
          No lines of your code ran{debug.error ? ' before the error' : ''}. Check the input of Case {debug.testIndex + 1}.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-auto p-3 @xl:grid-cols-2 @xl:overflow-hidden">
          <Card title={<span>Variables · before line {step.line} runs</span>}>
            <div className="divide-y divide-line">
              {debug.watches.map((name) => {
                const value = step.values[name];
                const isChanged = changed.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPicked(name)}
                    className={cn('flex w-full items-start gap-3 px-3 py-1.5 text-left font-mono text-[12.5px] hover:bg-hover', selected === name && 'bg-hover')}
                  >
                    <span className="w-20 shrink-0 truncate text-accent">{name}</span>
                    {value === undefined ? (
                      <span className="font-sans text-xs text-subtle italic">not in scope here</span>
                    ) : (
                      <span className={cn('min-w-0 flex-1 break-all', isChanged && 'rounded bg-warning/15 px-1')}>{value}</span>
                    )}
                    {isChanged && <span className="shrink-0 pt-0.5 font-sans text-[10px] font-semibold text-warning uppercase">changed</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card
            title="History"
            actions={
              debug.watches.length > 1 && (
                <div className="flex flex-wrap gap-1 normal-case">
                  {debug.watches.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPicked(name)}
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[11px] tracking-normal',
                        selected === name ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg',
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )
            }
          >
            {history.map((entry) => (
              <button
                key={entry.step}
                type="button"
                onClick={() => goToStep(entry.step)}
                className={cn('flex w-full items-center gap-3 px-3 py-1 text-left text-xs hover:bg-hover', entry === currentEntry && 'bg-accent/10')}
              >
                <span className="w-12 shrink-0 text-subtle tabular-nums">#{entry.step + 1}</span>
                <span className="w-12 shrink-0 font-mono text-subtle">L{entry.line}</span>
                <span className="min-w-0 flex-1 truncate font-mono">
                  {entry.value ?? <i className="font-sans text-subtle">not in scope</i>}
                </span>
              </button>
            ))}
          </Card>
        </div>
      )}

      {(debug.stdout || debug.stderr) && (
        <details className="shrink-0 border-t border-line px-3 py-1.5 text-xs">
          <summary className="cursor-pointer text-muted select-none">Program output</summary>
          <pre className="mt-1 max-h-28 overflow-auto font-mono whitespace-pre-wrap">
            {debug.stdout}
            {debug.stderr && <span className="text-warning">{debug.stderr}</span>}
          </pre>
        </details>
      )}
    </div>
  );
}

export function DebuggerPanel() {
  const language = useStore((s) => s.language);
  const debug = useStore((s) => s.debug);
  const available = useStore((s) => s.serverConfig?.debuggers?.[s.language] ?? true);
  const label = LANGUAGE_META[language].label;

  let body: ReactNode;
  if (!available) {
    body = (
      <div className="m-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 p-3 text-[13px] text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {language === 'cpp'
          ? 'C++ debugging needs gdb on the server. Install gdb (it is included in the Docker image) or set GDB in server/.env.'
          : `${label} isn't installed on the server, so it can't be debugged yet.`}
      </div>
    );
  } else if (!debug || debug.language !== language) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid size-10 place-items-center rounded-2xl bg-accent/12 text-accent">
          <Bug className="size-5" />
        </div>
        <div className="max-w-md space-y-1.5 text-[13px] text-muted">
          <p className="font-medium text-fg">See how your variables change, line by line</p>
          <p className="flex items-center justify-center gap-1.5">
            <MousePointerClick className="size-3.5" /> Select a variable in your code and click <b className="text-fg">Debug</b>, or press <Kbd keys={['Alt', 'W']} />
          </p>
          <p>The program runs on the selected test case and every step is recorded. Step forward and back, or click any change in the history.</p>
        </div>
      </div>
    );
  } else if (debug.status === 'running') {
    body = (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" />
        Running your code under the debugger on Case {debug.testIndex + 1}…
      </div>
    );
  } else if (debug.status === 'error') {
    body = (
      <div className="h-full overflow-auto p-3">
        <div className="rounded-lg border border-danger/30 bg-danger/8 p-3 text-[13px] text-danger">{debug.message}</div>
        {debug.compile?.output && (
          <pre className="mt-2 font-mono text-xs whitespace-pre-wrap text-danger">
            <Linkified text={debug.compile.output} />
          </pre>
        )}
      </div>
    );
  } else {
    body = <SessionView debug={debug} />;
  }

  return (
    <div className="@container flex h-full flex-col">
      <WatchBar />
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
