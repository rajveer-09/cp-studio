import {
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Gauge,
  Lightbulb,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Tag,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { LANGUAGE_META } from '../lib/languages';
import { copyText } from '../lib/platform';
import {
  bookmarkletHref,
  codeforcesUrl,
  detectPlatform,
  importProblem,
  PLATFORM_META,
  PLATFORM_ORDER,
  openProblemTabs,
  openSubmission,
  requestLeetCodeDriver,
  submitHelperVersion,
  PLATFORM_COLORS,
  topicName,
} from '../lib/problems';
import { applyDriverVisibility } from '../lib/harness';
import { helperImports } from '../lib/sheet';
import { restoreSamples } from '../lib/testcases';
import { DEFAULT_SETTINGS, useStore } from '../store';
import type { Platform, ProblemMeta, Settings } from '../types';
import { Button, cn, Tip } from './ui';

// Math typesetting (KaTeX) is only downloaded when a statement is shown.
const Statement = lazy(() => import('./Statement'));

function CodeforcesGuide({ url, onClose }: { url: string; onClose?: () => void }) {
  const link = useRef<HTMLAnchorElement>(null);
  // React refuses to render javascript: URLs, so the bookmark's href is set directly.
  useEffect(() => link.current?.setAttribute('href', bookmarkletHref()), []);
  const id = /\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)/.exec(url);

  return (
    <div className="relative mt-2.5 rounded-lg border border-line bg-panel-2/60 p-3 text-[12.5px] leading-relaxed">
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2 right-2 rounded p-0.5 text-subtle hover:text-fg">
          <X className="size-3.5" />
        </button>
      )}
      <p className="mb-2 pr-6 text-muted">Codeforces blocks automated downloads, so CP Studio reads the problem from the page you open in your browser:</p>
      <ol className="space-y-1.5">
        <li className="flex flex-wrap items-center gap-1.5">
          <b>1.</b> Drag
          <a
            ref={link}
            onClick={(e) => {
              e.preventDefault();
              toast.info('Drag this button to your bookmarks bar', { description: 'Then click it on any Codeforces problem page.' });
            }}
            className="btn-primary inline-flex cursor-grab items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
          >
            <Bookmark className="size-3" />
            Send to CP Studio
          </a>
          to your bookmarks bar (only once).
        </li>
        <li className="flex flex-wrap items-center gap-1.5">
          <b>2.</b>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2">
            Open {id ? `${id[1]}${id[2].toUpperCase()}` : 'the problem'} on Codeforces
            <ExternalLink className="size-3" />
          </a>
        </li>
        <li>
          <b>3.</b> Click the bookmark on that page. The statement and sample tests appear here.
        </li>
      </ol>
    </div>
  );
}

function ImportBar() {
  const lastPlatform = useStore((s) => s.problemMeta?.platform);
  const [platform, setPlatform] = useState<Platform>(lastPlatform ?? 'codeforces');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeforces, setCodeforces] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = ref.trim();
    if (!text) return;
    const target = detectPlatform(text) ?? platform;
    setPlatform(target);
    if (target === 'codeforces') {
      const url = codeforcesUrl(text);
      if (url) setCodeforces(url);
      else toast.error('Use a Codeforces problem like 1915A, or paste its URL.');
      return;
    }
    setBusy(true);
    const ok = await importProblem(target, text);
    setBusy(false);
    if (ok) setRef('');
  };

  return (
    <div className="shrink-0 border-b border-line px-4 py-2.5">
      <form onSubmit={submit} className="flex h-8 items-center rounded-lg border border-line bg-panel-2/50 transition-colors focus-within:border-accent/60">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Platform"
              className="flex h-full shrink-0 items-center gap-1.5 rounded-l-lg border-r border-line pr-2 pl-3 text-[12.5px] font-medium hover:bg-hover"
            >
              {PLATFORM_META[platform].label}
              <ChevronDown className="size-3.5 text-subtle" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className="popover z-50 w-44 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
              <DropdownMenu.RadioGroup
                value={platform}
                onValueChange={(p) => {
                  setPlatform(p as Platform);
                  setCodeforces(null);
                }}
              >
                {PLATFORM_ORDER.map((p) => (
                  <DropdownMenu.RadioItem
                    key={p}
                    value={p}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover"
                  >
                    {PLATFORM_META[p].label}
                    <DropdownMenu.ItemIndicator>
                      <Check className="size-3.5 text-accent" />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <input
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            const detected = detectPlatform(e.target.value);
            if (detected) setPlatform(detected);
          }}
          placeholder={PLATFORM_META[platform].placeholder}
          spellCheck={false}
          aria-label="Problem number or URL"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[12.5px] placeholder:text-subtle"
        />
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!ref.trim()} className="mr-[3px] h-6 rounded-md px-2.5">
          {!busy && <Download />}
          Import
        </Button>
      </form>
      {codeforces && <CodeforcesGuide url={codeforces} onClose={() => setCodeforces(null)} />}
    </div>
  );
}

/** Statement palettes, as color-variable overrides on the statement area ('theme' keeps the editor theme's). */
const STATEMENT_PALETTES: Record<Settings['statementColors'], { label: string; swatch: [string, string]; vars?: CSSProperties }> = {
  theme: { label: 'Editor theme', swatch: ['var(--panel)', 'var(--fg)'] },
  paper: {
    label: 'Paper',
    swatch: ['#fbf7ee', '#2b2721'],
    vars: {
      '--panel': '#fbf7ee',
      '--panel-2': '#f3ecdc',
      '--hover': '#efe6d2',
      '--fg': '#2b2721',
      '--muted': '#5f574b',
      '--subtle': '#8a8172',
      '--border': '#e6dcc8',
      '--border-strong': '#d6c9ae',
      '--accent': '#b45309',
      colorScheme: 'light',
    } as CSSProperties,
  },
  night: {
    label: 'Night',
    swatch: ['#0b0e14', '#c9d1d9'],
    vars: {
      '--panel': '#0b0e14',
      '--panel-2': '#121722',
      '--hover': '#161c28',
      '--fg': '#c9d1d9',
      '--muted': '#8b949e',
      '--subtle': '#6e7681',
      '--border': '#1d2330',
      '--border-strong': '#2a3242',
      '--accent': '#79c0ff',
      colorScheme: 'dark',
    } as CSSProperties,
  },
};

const DRIVER_CHOICES: { id: Settings['leetcodeDriver']; label: string; hint: string }[] = [
  { id: 'hidden', label: 'Only the Solution class', hint: 'Like LeetCode; the driver is added when it runs' },
  { id: 'shown', label: 'Show the driver code', hint: 'In the tab, folded above and below' },
];

const LAYOUTS: { id: Settings['statementLayout']; label: string; hint: string }[] = [
  { id: 'enhanced', label: 'Enhanced', hint: 'LeetCode-style reading layout' },
  { id: 'standard', label: 'Standard', hint: 'As imported from the judge' },
];

const menuItem = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover';
const menuLabel = 'px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase';

/** The Problem section's own settings: auto-fill on the judge, and how the statement reads. */
function ProblemSettings({ helper, leetcode }: { helper: boolean; leetcode: boolean }) {
  const driver = useStore((s) => s.settings.leetcodeDriver);
  const colors = useStore((s) => s.settings.statementColors);
  const size = useStore((s) => s.settings.statementSize);
  const layout = useStore((s) => s.settings.statementLayout);
  const update = useStore.getState().updateSettings;
  return (
    <DropdownMenu.Root>
      <Tip label="Problem settings">
        <DropdownMenu.Trigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Problem settings">
            <SettingsIcon />
          </Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="popover z-50 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Label className={menuLabel}>Auto-fill on the judge</DropdownMenu.Label>
          <DropdownMenu.Item onSelect={() => useStore.getState().openDialog('submitHelper')} className={menuItem}>
            <Zap className={cn('size-3.5', helper ? 'text-success' : 'text-muted')} />
            <span className="flex-1">{helper ? 'Helper installed' : 'Set up auto-fill…'}</span>
            {helper && <Check className="size-3.5 text-success" />}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          {leetcode && (
            <>
              <DropdownMenu.Label className={menuLabel}>LeetCode driver</DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={driver}
                onValueChange={(v) => {
                  update({ leetcodeDriver: v as Settings['leetcodeDriver'] });
                  applyDriverVisibility(v !== 'shown');
                }}
              >
                {DRIVER_CHOICES.map((c) => (
                  <DropdownMenu.RadioItem key={c.id} value={c.id} onSelect={(e) => e.preventDefault()} className={cn(menuItem, 'items-start')}>
                    <span className="flex-1">
                      <span className="block">{c.label}</span>
                      <span className="block text-[11.5px] text-subtle">{c.hint}</span>
                    </span>
                    <DropdownMenu.ItemIndicator>
                      <Check className="mt-0.5 size-3.5 text-accent" />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Label className={menuLabel}>Display</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={layout} onValueChange={(v) => update({ statementLayout: v as Settings['statementLayout'] })}>
            {LAYOUTS.map((l) => (
              <DropdownMenu.RadioItem key={l.id} value={l.id} onSelect={(e) => e.preventDefault()} className={cn(menuItem, 'items-start')}>
                <span className="flex-1">
                  <span className="block">{l.label}</span>
                  <span className="block text-[11.5px] text-subtle">{l.hint}</span>
                </span>
                <DropdownMenu.ItemIndicator>
                  <Check className="mt-0.5 size-3.5 text-accent" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Label className={menuLabel}>Statement colors</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={colors} onValueChange={(v) => update({ statementColors: v as Settings['statementColors'] })}>
            {(Object.keys(STATEMENT_PALETTES) as Settings['statementColors'][]).map((key) => (
              <DropdownMenu.RadioItem key={key} value={key} onSelect={(e) => e.preventDefault()} className={menuItem}>
                <span
                  className="flex h-4 w-6 items-center justify-center rounded border border-line-strong text-[9px] font-bold"
                  style={{ background: STATEMENT_PALETTES[key].swatch[0], color: STATEMENT_PALETTES[key].swatch[1] }}
                >
                  Aa
                </span>
                <span className="flex-1">{STATEMENT_PALETTES[key].label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="size-3.5 text-accent" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <div className="flex items-center justify-between px-2 py-1.5 text-[13px]">
            <span>Text size</span>
            <span className="flex items-center gap-1">
              <Button
                size="icon-sm"
                onClick={() => update({ statementSize: Math.max(12, size - 1) })}
                disabled={size <= 12}
                aria-label="Smaller statement text"
              >
                <Minus />
              </Button>
              <span className="w-7 text-center font-mono text-[12.5px] tabular-nums">{size}</span>
              <Button size="icon-sm" onClick={() => update({ statementSize: Math.min(20, size + 1) })} disabled={size >= 20} aria-label="Larger statement text">
                <Plus />
              </Button>
            </span>
          </div>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item
            disabled={colors === DEFAULT_SETTINGS.statementColors && size === DEFAULT_SETTINGS.statementSize && layout === DEFAULT_SETTINGS.statementLayout}
            onSelect={(e) => {
              e.preventDefault();
              update({
                statementColors: DEFAULT_SETTINGS.statementColors,
                statementSize: DEFAULT_SETTINGS.statementSize,
                statementLayout: DEFAULT_SETTINGS.statementLayout,
              });
            }}
            className={cn(menuItem, 'text-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-40')}
          >
            <RotateCcw className="size-3.5" />
            Reset problem settings
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ProblemHeader({ meta }: { meta: ProblemMeta }) {
  const language = useStore((s) => s.language);
  const aiEnabled = useStore((s) => s.serverConfig?.aiEnabled);
  const [busy, setBusy] = useState(false);
  // Set by the helper before the app starts, so reading it once is enough.
  const [helper] = useState(() => Boolean(submitHelperVersion()));

  const starter = async () => {
    setBusy(true);
    await requestLeetCodeDriver();
    setBusy(false);
  };
  const remove = () => useStore.setState({ problem: '', problemMeta: null });
  const enhanced = useStore((s) => s.settings.statementLayout !== 'standard');

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 pr-2 pl-4">
      {enhanced ? (
        // The title is at the top of the statement; here just where it is from.
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
          <span className="size-2 shrink-0 rounded-full" style={{ background: PLATFORM_COLORS[meta.platform] }} />
          <span className="font-medium text-fg">{PLATFORM_META[meta.platform].label}</span>
          <span aria-hidden className="text-subtle">
            /
          </span>
          <span className="truncate font-mono text-[12px]">{meta.id}</span>
        </span>
      ) : (
        <div className="flex min-w-0 flex-col">
          <a href={meta.url} target="_blank" rel="noreferrer" className="group flex min-w-0 items-center gap-1.5 text-[14px] font-semibold tracking-[-0.01em]">
            <span className="truncate group-hover:underline group-hover:underline-offset-2">{meta.title}</span>
            <ExternalLink className="size-3.5 shrink-0 text-subtle" />
          </a>
          <span className="flex items-center gap-1.5 text-[11.5px] text-subtle">
            {PLATFORM_META[meta.platform].label}
            {meta.timeLimitMs && (
              <>
                <span aria-hidden>·</span>
                <Clock className="size-3" />
                {meta.timeLimitMs / 1000} s
              </>
            )}
          </span>
        </div>
      )}
      <div className="flex-1" />
      {meta.programs?.[language] ? (
        <Tip label={`Put the ${LANGUAGE_META[language].label} starter back in its tab (Ctrl+Z undoes it)`}>
          <Button size="sm" onClick={() => openProblemTabs(meta, { only: language, overwrite: true })}>
            <RotateCcw />
            Reset starter
          </Button>
        </Tip>
      ) : (
        meta.functionBased && (
          <Tip label={aiEnabled ? `${LANGUAGE_META[language].label} starter code plus a main() that reads the tests` : 'Needs the AI assistant'}>
            <Button size="sm" onClick={starter} loading={busy} disabled={!aiEnabled}>
              {!busy && <Wand2 />}
              Starter + main()
            </Button>
          </Tip>
        )
      )}
      <Tip
        label={
          helper
            ? `Open the ${PLATFORM_META[meta.platform].label} submit page with your ${LANGUAGE_META[language].label} code filled in`
            : `Copy your ${LANGUAGE_META[language].label} code and open the ${PLATFORM_META[meta.platform].label} submit page`
        }
      >
        <Button size="sm" variant="primary" onClick={() => openSubmission(meta)}>
          <Send />
          Submit
        </Button>
      </Tip>
      <ProblemSettings helper={helper} leetcode={Boolean(meta.functionBased)} />
      <Tip label="Remove problem (tests stay)">
        <Button size="icon-sm" variant="ghost" onClick={remove} aria-label="Remove problem">
          <X />
        </Button>
      </Tip>
    </div>
  );
}

function SampleBlock({ label, text }: { label: string; text: string }) {
  const copy = () => copyText(text).then(() => toast.success(`${label} copied`, { duration: 1200 }));
  return (
    <div className="group min-w-0">
      <div className="flex h-8 items-center justify-between pr-1.5 pl-3 text-[11.5px] font-medium text-subtle">
        {label}
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="rounded p-1 text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-hover hover:text-fg focus-visible:opacity-100"
        >
          <Copy className="size-3.5" />
        </button>
      </div>
      <pre className="max-h-64 overflow-auto px-3 pb-2.5 font-mono text-[12.5px] leading-relaxed">
        {text.replace(/\n$/, '') || <span className="text-subtle italic">(empty)</span>}
      </pre>
    </div>
  );
}

/** The judge's sample tests, shown under the statement like on the original site. */
function SampleTests({ samples }: { samples: { input: string; expected: string }[] }) {
  const inUse = useStore(
    (s) => s.tests.length === samples.length && samples.every((t, i) => s.tests[i].input === t.input && s.tests[i].expected === t.expected),
  );

  return (
    <section className="mt-8 border-t border-line pt-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Sample tests</h3>
        <span className="text-[12px] text-subtle tabular-nums">{samples.length}</span>
        <div className="flex-1" />
        {inUse ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="size-3.5" />
            These are your test cases
          </span>
        ) : (
          <Tip label="Replace your test cases with these samples (undo available)">
            <Button size="sm" variant="ghost" onClick={restoreSamples} className="[&_svg]:text-accent">
              <FlaskConical />
              Use as test cases
            </Button>
          </Tip>
        )}
      </div>
      <div className="space-y-2.5">
        {samples.map((t, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-line">
            <div className="flex h-8 items-center border-b border-line bg-panel-2/50 px-3 text-[12px] font-medium">Example {i + 1}</div>
            <div className="grid divide-y divide-line @lg:grid-cols-2 @lg:divide-x @lg:divide-y-0">
              <SampleBlock label="Input" text={t.input} />
              <SampleBlock label="Output" text={t.expected} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] px-2.5 py-1 text-[12px] font-medium text-muted [&_svg]:size-3.5">
    {children}
  </span>
);

/** Enhanced display: the title at the top of the statement, with the facts as chips (like LeetCode's problem page). */
/** LeetCode's difficulty colors, toned to read on dark and light statement colors alike. */
const DIFFICULTY_COLORS = { Easy: '#12a89a', Medium: '#c98500', Hard: '#e2457b' } as const;

/** A practice sheet's hint, behind a spoiler so it's only read when wanted. */
function HintBox({ hint }: { hint: string }) {
  return (
    <p className="mt-2.5 flex gap-2 rounded-lg border border-warning/25 bg-warning/[0.07] px-3 py-2 text-[0.92em] leading-relaxed text-fg">
      <Lightbulb className="mt-[0.2em] size-[1em] shrink-0 text-warning" />
      {hint}
    </p>
  );
}

function StandardHint({ hint }: { hint: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="mb-4">
      <button type="button" onClick={() => setShown((s) => !s)} aria-expanded={shown} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-warning hover:underline">
        <Lightbulb className="size-3.5" />
        {shown ? 'Hide hint' : 'Show hint'}
      </button>
      {shown && <HintBox hint={hint} />}
    </div>
  );
}

/** A sheet problem opened before its statement arrived from Codeforces. */
function StatementPending({ meta }: { meta: ProblemMeta }) {
  const [helper] = useState(helperImports);
  return (
    <div className="rounded-xl border border-line bg-panel-2/40 p-4 text-[13px] leading-relaxed">
      {helper ? (
        <>
          <p className="flex items-center gap-2 font-medium text-fg">
            <Loader2 className="size-4 animate-spin text-accent" />
            Getting the statement from Codeforces…
          </p>
          <p className="mt-1.5 text-muted">
            The CP Studio helper opened the problem in a new tab to read it; that tab closes by itself and the statement and samples appear here.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => window.open(`${meta.url}#cp-studio-import`, '_blank')}>
              <RotateCcw />
              Try again
            </Button>
            <span className="text-[12px] text-subtle">Nothing yet? Sign in to Codeforces in that tab first.</span>
          </div>
        </>
      ) : (
        <>
          <p className="font-medium text-fg">Bring in the statement and samples</p>
          <CodeforcesGuide url={meta.url} />
          <p className="mt-3 text-[12.5px] text-muted">
            Or{' '}
            <button type="button" onClick={() => useStore.getState().openDialog('submitHelper')} className="font-medium text-accent underline underline-offset-2">
              install the CP Studio helper
            </button>{' '}
            and <b className="font-medium text-fg">Solve</b> on the sheet brings statements in by itself.
          </p>
        </>
      )}
      <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-subtle">You can start coding now. The samples become your test cases when they arrive.</p>
    </div>
  );
}

function EnhancedTitle({ meta, examples }: { meta: ProblemMeta; examples: number }) {
  const judge = PLATFORM_META[meta.platform].label;
  const [showTopics, setShowTopics] = useState(false);
  const [showHint, setShowHint] = useState(false);
  return (
    <header className="mb-6">
      <h1 className="text-[1.45em] leading-snug font-semibold tracking-[-0.015em] text-fg">{meta.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {meta.difficulty && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ color: DIFFICULTY_COLORS[meta.difficulty], background: `color-mix(in srgb, ${DIFFICULTY_COLORS[meta.difficulty]} 14%, transparent)` }}
          >
            {meta.difficulty}
          </span>
        )}
        {meta.rating ? (
          <Chip>
            <Gauge />
            Rating {meta.rating}
          </Chip>
        ) : null}
        {meta.tags?.length ? (
          <button type="button" onClick={() => setShowTopics((s) => !s)} aria-expanded={showTopics} className="rounded-full">
            <Chip>
              <Tag />
              Topics
              <ChevronDown className={cn('transition', showTopics && 'rotate-180')} />
            </Chip>
          </button>
        ) : null}
        {meta.hint && (
          <button type="button" onClick={() => setShowHint((s) => !s)} aria-expanded={showHint} className="rounded-full">
            <Chip>
              <Lightbulb className="text-warning" />
              Hint
              <ChevronDown className={cn('transition', showHint && 'rotate-180')} />
            </Chip>
          </button>
        )}
        <Chip>
          <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[meta.platform] }} />
          {judge}
        </Chip>
        {meta.timeLimitMs && (
          <Chip>
            <Clock />
            {meta.timeLimitMs / 1000} s
          </Chip>
        )}
        {examples > 0 && (
          <Chip>
            <FlaskConical />
            {examples} example{examples === 1 ? '' : 's'}
          </Chip>
        )}
        <a
          href={meta.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg"
        >
          Open on {judge}
          <ExternalLink className="size-3" />
        </a>
      </div>
      {showTopics && meta.tags?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {meta.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-muted">
              {topicName(tag)}
            </span>
          ))}
        </div>
      ) : null}
      {showHint && meta.hint && <HintBox hint={meta.hint} />}
    </header>
  );
}

function SampleValue({ label, text }: { label: string; text: string }) {
  const copy = () => copyText(text).then(() => toast.success(`${label} copied`, { duration: 1200 }));
  return (
    <div className="group/value">
      <div className="flex items-center gap-2">
        <span className="text-[0.95em] font-semibold text-fg">{label}:</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="rounded p-0.5 text-subtle opacity-0 transition group-hover/value:opacity-100 hover:text-fg focus-visible:opacity-100"
        >
          <Copy className="size-3.5" />
        </button>
      </div>
      <pre className="mt-1 overflow-x-auto font-mono text-[0.9em] leading-relaxed text-[color-mix(in_srgb,var(--fg)_85%,var(--muted))]">
        {text.replace(/\n$/, '') || <span className="text-subtle italic">(empty)</span>}
      </pre>
    </div>
  );
}

/** "Use as test cases", or a note that they already are. */
function UseSamples({ samples }: { samples: { input: string; expected: string }[] }) {
  const inUse = useStore(
    (s) => s.tests.length === samples.length && samples.every((t, i) => s.tests[i].input === t.input && s.tests[i].expected === t.expected),
  );
  return inUse ? (
    <span className="flex items-center gap-1 text-xs text-success">
      <Check className="size-3.5" />
      These are your test cases
    </span>
  ) : (
    <Tip label="Replace your test cases with these samples (undo available)">
      <Button size="sm" variant="ghost" onClick={restoreSamples} className="[&_svg]:text-accent">
        <FlaskConical />
        Use as test cases
      </Button>
    </Tip>
  );
}

/**
 * Enhanced display of the judge's samples, LeetCode style: "Example 1:" over a block with a rule on its left. When
 * the statement already shows its examples (LeetCode), only the "Use as test cases" row remains.
 */
function EnhancedSamples({ samples, inStatement }: { samples: { input: string; expected: string }[]; inStatement: boolean }) {
  return (
    <section className="mt-8">
      {!inStatement &&
        samples.map((t, i) => (
          <div key={i} className="mt-6 first:mt-0">
            <h4 className="mb-2.5 text-[1em] font-semibold text-fg">Example {i + 1}:</h4>
            <div className="space-y-3 border-l-2 border-line-strong pl-4">
              <SampleValue label="Input" text={t.input} />
              <SampleValue label="Output" text={t.expected} />
            </div>
          </div>
        ))}
      <div className={cn('flex items-center gap-2 border-t border-line pt-4 text-[12.5px] text-muted', !inStatement && 'mt-8')}>
        {samples.length} sample test{samples.length === 1 ? '' : 's'}
        <div className="flex-1" />
        <UseSamples samples={samples} />
      </div>
    </section>
  );
}

export function ProblemPanel() {
  const problem = useStore((s) => s.problem);
  const meta = useStore((s) => s.problemMeta);
  const setProblem = useStore((s) => s.setProblem);
  // An imported statement is shown as the judge wrote it; the box is only for pasting one when nothing is imported.
  const showEditor = !meta;
  const palette = useStore((s) => STATEMENT_PALETTES[s.settings.statementColors] ?? STATEMENT_PALETTES.theme);
  const size = useStore((s) => s.settings.statementSize);
  const enhanced = useStore((s) => s.settings.statementLayout !== 'standard');

  return (
    <div className="flex h-full flex-col">
      {/* The whole Problem section (search, heading, statement) shares the chosen reading colors. */}
      <div
        className="flex min-h-0 flex-1 flex-col bg-panel text-fg"
        style={showEditor ? undefined : ({ ...palette.vars, '--statement-size': `${size}px` } as CSSProperties)}
      >
        <ImportBar />
        {meta && <ProblemHeader meta={meta} />}
        <div className="min-h-0 flex-1 overflow-auto">
          {showEditor ? (
            <div className="flex h-full flex-col p-3">
              <textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder={
                  'Import a problem above, or paste the statement here.\n\nThe AI assistant reads it, which makes /fix, /hint and generated tests much more accurate.'
                }
                className="h-full min-h-32 w-full resize-none rounded-lg border border-line bg-panel-2/60 p-3 text-[13px] leading-relaxed placeholder:text-subtle focus:border-accent/60"
              />
            </div>
          ) : (
            <div className={cn('@container', enhanced ? 'mx-auto max-w-[780px] px-6 pt-6 pb-10' : 'max-w-[860px] px-4 pt-4 pb-6')}>
              {enhanced && meta && <EnhancedTitle meta={meta} examples={meta.samples?.length ?? 0} />}
              {!enhanced && meta?.hint && <StandardHint hint={meta.hint} />}
              {meta?.platform === 'codeforces' && !problem.trim() ? (
                <StatementPending meta={meta} />
              ) : (
                <Suspense fallback={<div className="h-40" />}>
                  <Statement content={problem || '_No statement._'} enhanced={enhanced} />
                </Suspense>
              )}
              {meta?.samples?.length ? (
                enhanced ? (
                  <EnhancedSamples samples={meta.samples} inStatement={/^#{3,4} Example\b/m.test(problem)} />
                ) : (
                  <SampleTests samples={meta.samples} />
                )
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
