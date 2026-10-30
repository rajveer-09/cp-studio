import { Bookmark, Check, ChevronDown, Clock, Copy, Download, ExternalLink, FlaskConical, Pencil, RotateCcw, Wand2, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
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
  requestLeetCodeDriver,
} from '../lib/problems';
import { restoreSamples } from '../lib/testcases';
import { useStore } from '../store';
import type { Platform, ProblemMeta } from '../types';
import { Button, Tip } from './ui';

// Math typesetting (KaTeX) is only downloaded when a statement is shown.
const Statement = lazy(() => import('./Statement'));

function CodeforcesGuide({ url, onClose }: { url: string; onClose: () => void }) {
  const link = useRef<HTMLAnchorElement>(null);
  // React refuses to render javascript: URLs, so the bookmark's href is set directly.
  useEffect(() => link.current?.setAttribute('href', bookmarkletHref()), []);
  const id = /\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)/.exec(url);

  return (
    <div className="relative mt-2.5 rounded-lg border border-line bg-panel-2/60 p-3 text-[12.5px] leading-relaxed">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2 right-2 rounded p-0.5 text-subtle hover:text-fg">
        <X className="size-3.5" />
      </button>
      <p className="mb-2 pr-6 text-muted">
        Codeforces blocks automated downloads, so CP Studio reads the problem from the page you open in your browser:
      </p>
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
      <form
        onSubmit={submit}
        className="flex h-8 items-center rounded-lg border border-line bg-panel-2/50 transition-colors focus-within:border-accent/60"
      >
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

function ProblemHeader({ meta, editing, onToggleEdit }: { meta: ProblemMeta; editing: boolean; onToggleEdit: () => void }) {
  const language = useStore((s) => s.language);
  const aiEnabled = useStore((s) => s.serverConfig?.aiEnabled);
  const [busy, setBusy] = useState(false);

  const starter = async () => {
    setBusy(true);
    await requestLeetCodeDriver();
    setBusy(false);
  };
  const remove = () => useStore.setState({ problem: '', problemMeta: null });

  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 pr-2 pl-4">
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
      <Button size="sm" variant="ghost" onClick={onToggleEdit}>
        {editing ? <Check /> : <Pencil />}
        {editing ? 'Done' : 'Edit'}
      </Button>
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
      <pre className="max-h-64 overflow-auto px-3 pb-2.5 font-mono text-[12.5px] leading-relaxed">{text.replace(/\n$/, '') || <span className="text-subtle italic">(empty)</span>}</pre>
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

export function ProblemPanel() {
  const problem = useStore((s) => s.problem);
  const meta = useStore((s) => s.problemMeta);
  const setProblem = useStore((s) => s.setProblem);
  const [editing, setEditing] = useState(false);
  const showEditor = !meta || editing;

  return (
    <div className="flex h-full flex-col">
      <ImportBar />
      {meta && <ProblemHeader meta={meta} editing={editing} onToggleEdit={() => setEditing((e) => !e)} />}
      <div className="min-h-0 flex-1 overflow-auto">
        {showEditor ? (
          <div className="flex h-full flex-col p-3">
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder={'Import a problem above, or paste the statement here.\n\nThe AI assistant reads it, which makes /fix, /hint and generated tests much more accurate.'}
              className="h-full min-h-32 w-full resize-none rounded-lg border border-line bg-panel-2/60 p-3 text-[13px] leading-relaxed placeholder:text-subtle focus:border-accent/60"
            />
          </div>
        ) : (
          <div className="@container max-w-[860px] px-4 pt-4 pb-6">
            <Suspense fallback={<div className="h-40" />}>
              <Statement content={problem || '_No statement._'} />
            </Suspense>
            {meta?.samples?.length ? <SampleTests samples={meta.samples} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}
