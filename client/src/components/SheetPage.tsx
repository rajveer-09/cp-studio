import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Code2,
  ExternalLink,
  Info,
  Lightbulb,
  MoreHorizontal,
  NotebookPen,
  RotateCcw,
  Search,
  Shuffle,
  Star,
  Users,
  X,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import data from '../data/codeforcesSheet.json';
import {
  openSheetProblem,
  progressOf,
  setSheetNote,
  setSheetStatus,
  sheetKey,
  toggleSheetStar,
  useAutoSolved,
  type AutoSolved,
  type Progress,
  type Sheet,
  type SheetProblem,
  type SheetTopic,
} from '../lib/sheet';
import { topicName } from '../lib/problems';
import { useStore } from '../store';
import type { SheetEntry, SheetStatus } from '../types';
import { PageShell } from './PageShell';
import { Button, cn, Tip } from './ui';

const SHEET = data as Sheet;
const ALL = SHEET.topics.flatMap((t) => t.problems.map((p) => ({ problem: p, topic: t })));

/** Codeforces' rank colors for a rating, toned to read on dark and light; the number is always shown too. */
function ratingColor(rating: number): string {
  if (rating < 1200) return '#8b949e'; // newbie
  if (rating < 1400) return '#3fb950'; // pupil
  if (rating < 1600) return '#2bb5a7'; // specialist
  return '#5b8def'; // expert
}

const LEVEL_COLOR = { Easy: '#12a89a', Medium: '#c98500', Hard: '#e2457b' } as const;
type Level = keyof typeof LEVEL_COLOR;
const LEVEL_SHORT: Record<Level, string> = { Easy: 'Easy', Medium: 'Med.', Hard: 'Hard' };

interface LevelCount {
  level: Level;
  total: number;
  solved: number;
}

/**
 * LeetCode-style progress: one ring cut into Easy / Medium / Hard arcs sized by how many problems each has, each
 * filled as far as you've solved. Hovering an arc (or its tile) shows that level in the middle.
 */
function ProgressDonut({ levels, solved, total, attempting, focus, onFocus }: { levels: LevelCount[]; solved: number; total: number; attempting: number; focus: Level | null; onFocus: (l: Level | null) => void }) {
  const size = 172;
  const stroke = 10;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const gap = 7;
  // A dash drawn with round caps, so its visible length (caps included) is exactly `length`.
  const dash = (from: number, length: number) => ({
    strokeDasharray: `${Math.max(length - stroke, 0.001)} ${c}`,
    strokeDashoffset: -(from + stroke / 2),
  });
  let start = 0;
  const arcs = levels.map((l) => {
    const length = (l.total / total) * c;
    const arc = { ...l, from: start + gap / 2, length: length - gap };
    start += length;
    return arc;
  });
  const focused = levels.find((l) => l.level === focus);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={`${solved} of ${total} solved: ${levels.map((l) => `${l.level} ${l.solved} of ${l.total}`).join(', ')}`}
      >
        {arcs.map((a) => (
          <g
            key={a.level}
            onMouseEnter={() => onFocus(a.level)}
            onMouseLeave={() => onFocus(null)}
            className="transition-opacity duration-200"
            style={{ opacity: focus && focus !== a.level ? 0.3 : 1 }}
          >
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`color-mix(in srgb, ${LEVEL_COLOR[a.level]} 20%, transparent)`} strokeWidth={stroke} strokeLinecap="round" {...dash(a.from, a.length)} />
            {a.solved > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={LEVEL_COLOR[a.level]}
                strokeWidth={stroke}
                strokeLinecap="round"
                className="transition-[stroke-dasharray] duration-500"
                {...dash(a.from, (a.length * a.solved) / a.total)}
              />
            )}
            {/* A wider, invisible band so the arc is easy to point at. */}
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="transparent" strokeWidth={stroke + 16} pointerEvents="stroke" {...dash(a.from, a.length)} />
          </g>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        {focused ? (
          <>
            <div className="text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {focused.solved && (focused.solved / focused.total) * 100 < 1 ? '<1' : Math.floor((focused.solved / focused.total) * 100)}
              <span className="text-[16px] text-muted">%</span>
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[12px] text-muted">
              <span className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[focused.level] }} />
              {focused.level} · {focused.solved}/{focused.total}
            </div>
          </>
        ) : (
          <>
            <div className="text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {solved}
              <span className="text-[15px] font-medium text-muted">/{total}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-1 text-[12.5px] font-medium text-success">
              <Check className="size-3.5" strokeWidth={2.5} />
              Solved
            </div>
            {attempting > 0 && <div className="mt-0.5 text-[11.5px] text-subtle">{attempting} attempting</div>}
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_META: Record<SheetStatus, { label: string; tone: string; icon: ReactNode }> = {
  todo: { label: 'To do', tone: 'text-subtle', icon: <span className="block size-[15px] rounded-full border-[1.5px] border-current" /> },
  attempted: { label: 'Attempted', tone: 'text-warning', icon: <CircleDashed className="size-[17px]" /> },
  solved: {
    label: 'Solved',
    tone: 'text-success',
    icon: (
      <span className="grid size-[17px] place-items-center rounded-full bg-success text-[var(--panel)]">
        <Check className="size-3" strokeWidth={3} />
      </span>
    ),
  },
  revisit: { label: 'Revisit', tone: 'text-info', icon: <RotateCcw className="size-[16px]" /> },
};

const SOLVED_BY: Record<string, string> = {
  you: 'Marked solved by you',
  codeforces: 'Accepted on Codeforces (from your linked profile)',
  'cp-studio': 'Every sample test passed in CP Studio',
};

function Ring({ value, total, size = 112, stroke = 9, children }: { value: number; total: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = total ? value / total : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={stroke} />
        {value > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--success)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(share * c, stroke * 0.6)} ${c}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  );
}

function StatusButton({ problem, progress }: { problem: SheetProblem; progress: Progress }) {
  const meta = STATUS_META[progress.status];
  const next: SheetStatus = progress.status === 'solved' ? 'todo' : 'solved';
  const tip =
    progress.status === 'solved' && progress.solvedBy
      ? `${SOLVED_BY[progress.solvedBy]}. Click to clear.`
      : progress.status === 'todo'
        ? 'Mark as solved'
        : `${meta.label}. Click to mark solved.`;
  return (
    <Tip label={tip}>
      <button
        type="button"
        aria-label={`${problem.name}: ${meta.label}`}
        onClick={() => setSheetStatus(problem, next)}
        className={cn('grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-hover', meta.tone)}
      >
        {meta.icon}
      </button>
    </Tip>
  );
}

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover [&_svg]:size-3.5';

function ProblemRow({ problem, topic, progress, showTopic, onNote }: { problem: SheetProblem; topic: SheetTopic; progress: Progress; showTopic: boolean; onNote: () => void }) {
  const [hint, setHint] = useState(false);
  const color = ratingColor(problem.rating);
  return (
    <div className={cn('group/row relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover/40', progress.status === 'solved' && 'bg-success/[0.035]')}>
      <StatusButton problem={problem} progress={progress} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => openSheetProblem(problem)}
            className="truncate text-left text-[14px] font-medium text-fg decoration-accent/60 underline-offset-[3px] hover:underline"
          >
            {problem.name}
          </button>
          <span className="shrink-0 font-mono text-[11.5px] text-subtle">{problem.id}</span>
          {progress.starred && <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Starred" />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-subtle">
          <span className="font-mono font-semibold sm:hidden" style={{ color }}>
            {problem.rating}
          </span>
          {showTopic && <span className="font-medium text-muted">{topic.name}</span>}
          {showTopic && <span aria-hidden>·</span>}
          {problem.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-line px-1.5 py-px">
              {topicName(tag)}
            </span>
          ))}
          {problem.hint && (
            <button
              type="button"
              onClick={() => setHint((h) => !h)}
              aria-expanded={hint}
              className="inline-flex items-center gap-1 rounded-full border border-warning/30 px-1.5 py-px text-warning/90 transition hover:bg-warning/10"
            >
              <Lightbulb className="size-3" />
              {hint ? 'Hide hint' : 'Hint'}
            </button>
          )}
          {progress.note && (
            <button type="button" onClick={onNote} className="inline-flex items-center gap-1 text-muted hover:text-fg">
              <NotebookPen className="size-3" />
              Note
            </button>
          )}
        </div>
        {hint && problem.hint && <p className="mt-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-2.5 py-1.5 text-[12.5px] text-fg">{problem.hint}</p>}
      </div>

      <span className="hidden w-[58px] shrink-0 text-right sm:block">
        <span className="rounded-md px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular-nums" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          {problem.rating}
        </span>
      </span>
      <span className="hidden w-[66px] shrink-0 items-center gap-1.5 text-[12px] text-muted md:flex">
        <span className="size-1.5 rounded-full" style={{ background: LEVEL_COLOR[problem.level] }} />
        {problem.level}
      </span>
      <Tip label={`${problem.solvedBy.toLocaleString()} people solved it on Codeforces`}>
        <span className="hidden w-[64px] shrink-0 items-center justify-end gap-1 text-[12px] text-subtle tabular-nums lg:flex">
          <Users className="size-3" />
          {problem.solvedBy >= 1000 ? `${(problem.solvedBy / 1000).toFixed(problem.solvedBy >= 10000 ? 0 : 1)}k` : problem.solvedBy}
        </span>
      </Tip>

      <div className="flex shrink-0 items-center gap-1">
        <Tip label="Open it in CP Studio's editor">
          <Button size="sm" variant="secondary" onClick={() => openSheetProblem(problem)} className="h-8 gap-1.5 px-2.5">
            <Code2 />
            <span className="hidden sm:inline">Solve</span>
          </Button>
        </Tip>
        <Tip label="Open on Codeforces">
          <a
            href={problem.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${problem.name} on Codeforces`}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg"
          >
            <ExternalLink className="size-4" />
          </a>
        </Tip>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={`More for ${problem.name}`}
              className="grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-hover hover:text-fg data-[state=open]:bg-hover"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="popover z-50 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
              <DropdownMenu.Label className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">Status</DropdownMenu.Label>
              {(['todo', 'attempted', 'solved', 'revisit'] as SheetStatus[]).map((s) => (
                <DropdownMenu.Item key={s} onSelect={() => setSheetStatus(problem, s)} className={menuItem}>
                  <span className={cn('grid w-4 place-items-center', STATUS_META[s].tone)}>{STATUS_META[s].icon}</span>
                  <span className="flex-1">{STATUS_META[s].label}</span>
                  {progress.status === s && <Check className="text-accent" />}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item onSelect={() => toggleSheetStar(problem)} className={menuItem}>
                <Star className={cn(progress.starred ? 'fill-warning text-warning' : 'text-muted')} />
                {progress.starred ? 'Remove star' : 'Star for later'}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onNote} className={menuItem}>
                <NotebookPen className="text-muted" />
                {progress.note ? 'Edit note' : 'Add a note'}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

function NoteEditor({ problem, note, onClose }: { problem: SheetProblem; note: string; onClose: () => void }) {
  const [text, setText] = useState(note);
  return (
    <div className="border-t border-dashed border-line bg-panel-2/40 px-4 py-3 pl-[60px]">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What was the trick? What to remember next time?"
        rows={2}
        maxLength={500}
        className="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-[13px] outline-none placeholder:text-subtle focus:border-accent/60"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setSheetNote(problem, text.trim());
            onClose();
          }}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

type View = 'roadmap' | 'all';
type StatusFilter = 'all' | 'todo' | 'solved' | 'attempted' | 'revisit' | 'starred';
const RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-7 rounded-md px-2.5 text-[12.5px] font-medium whitespace-nowrap transition', value === o.value ? 'bg-panel-2 text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const select = 'h-8 rounded-lg border border-line bg-panel px-2 text-[12.5px] text-muted outline-none focus:border-accent/60';

export default function SheetPage() {
  const progressMap = useStore((s) => s.sheetProgress);
  const auto = useAutoSolved();
  const [view, setView] = useState<View>('roadmap');
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState<number | 0>(0);
  const [level, setLevel] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [levelFocus, setLevelFocus] = useState<Level | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const progressFor = useMemo(() => {
    const cache = new Map<string, Progress>();
    return (p: SheetProblem) => {
      let hit = cache.get(p.id);
      if (!hit) cache.set(p.id, (hit = progressOf(p, progressMap[sheetKey(p)] as SheetEntry | undefined, auto as AutoSolved)));
      return hit;
    };
  }, [progressMap, auto]);

  const totals = useMemo(() => {
    const count = (s: SheetStatus) => ALL.filter(({ problem }) => progressFor(problem).status === s).length;
    const byLevel = (['Easy', 'Medium', 'Hard'] as const).map((l) => {
      const list = ALL.filter(({ problem }) => problem.level === l);
      return { level: l, total: list.length, solved: list.filter(({ problem }) => progressFor(problem).status === 'solved').length };
    });
    return {
      solved: count('solved'),
      attempted: count('attempted'),
      revisit: count('revisit'),
      starred: ALL.filter(({ problem }) => progressFor(problem).starred).length,
      byLevel,
    };
  }, [progressFor]);

  // The first topic with something left, so the page opens where you are.
  const [topicStep, setTopicStep] = useState(() => {
    const progress = useStore.getState().sheetProgress;
    return SHEET.topics.find((t) => t.problems.some((p) => progress[sheetKey(p)]?.status !== 'solved'))?.step ?? 1;
  });
  const topic = SHEET.topics.find((t) => t.step === topicStep) ?? SHEET.topics[0];
  const next = ALL.find(({ problem }) => progressFor(problem).status !== 'solved');

  const matches = (p: SheetProblem) => {
    const pr = progressFor(p);
    const q = query.trim().toLowerCase();
    return (
      (!q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q))) &&
      (!rating || p.rating === rating) &&
      (level === 'all' || p.level === level) &&
      (status === 'all' || (status === 'starred' ? pr.starred : pr.status === status))
    );
  };
  const filtering = Boolean(query.trim() || rating || level !== 'all' || status !== 'all');
  const rows = view === 'roadmap'
    ? topic.problems.filter(matches).map((p) => ({ problem: p, topic }))
    : ALL.filter(({ problem }) => matches(problem)).sort((a, b) => a.problem.rating - b.problem.rating || a.topic.step - b.topic.step);

  const pick = () => {
    const pool = (view === 'roadmap' ? topic.problems.map((p) => ({ problem: p, topic })) : ALL).filter(
      ({ problem }) => matches(problem) && progressFor(problem).status !== 'solved',
    );
    if (!pool.length) return toast.info('Nothing left to pick here. Try other filters.');
    const choice = pool[Math.floor(Math.random() * pool.length)];
    toast(`Try “${choice.problem.name}”`, {
      description: `${choice.topic.name} · ${choice.problem.rating}`,
      action: { label: 'Solve', onClick: () => openSheetProblem(choice.problem) },
      duration: 8000,
    });
  };
  const clearFilters = () => {
    setQuery('');
    setRating(0);
    setLevel('all');
    setStatus('all');
  };

  return (
    <PageShell title="Practice sheet">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-8 sm:py-10">
        {/* Overview */}
        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6">
            <div
              className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-[0.12] blur-3xl"
              style={{ background: 'radial-gradient(circle, var(--accent), transparent 65%)' }}
            />
            <div className="relative">
              <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Practice sheet</p>
              <h1 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-[-0.02em]">{SHEET.title}</h1>
              <p className="mt-1.5 text-[13.5px] text-muted">
                {SHEET.subtitle} · {SHEET.topics.length} topics, easy to hard
              </p>
            </div>
            <div className="relative mt-6 flex flex-col items-center gap-6 sm:flex-row">
              <ProgressDonut
                levels={totals.byLevel}
                solved={totals.solved}
                total={ALL.length}
                attempting={totals.attempted}
                focus={levelFocus}
                onFocus={setLevelFocus}
              />
              <div className="grid w-full gap-2 sm:flex-1">
                {totals.byLevel.map((l) => (
                  <div
                    key={l.level}
                    tabIndex={0}
                    onMouseEnter={() => setLevelFocus(l.level)}
                    onMouseLeave={() => setLevelFocus(null)}
                    onFocus={() => setLevelFocus(l.level)}
                    onBlur={() => setLevelFocus(null)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl bg-panel-2/70 px-4 py-2.5 ring-1 ring-transparent transition outline-none',
                      levelFocus === l.level && 'ring-line-strong',
                    )}
                  >
                    <span className="w-12 text-[13px] font-semibold" style={{ color: LEVEL_COLOR[l.level] }}>
                      {LEVEL_SHORT[l.level]}
                    </span>
                    <span className="h-1 flex-1 rounded-full bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]">
                      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(l.solved / l.total) * 100}%`, background: LEVEL_COLOR[l.level] }} />
                    </span>
                    <span className="w-16 text-right text-[14px] font-semibold tabular-nums">
                      {l.solved}
                      <span className="text-[12px] font-medium text-muted">/{l.total}</span>
                    </span>
                  </div>
                ))}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-muted">
                  {[
                    { label: 'Attempted', value: totals.attempted, tone: 'var(--warning)' },
                    { label: 'Revisit', value: totals.revisit, tone: 'var(--info)' },
                    { label: 'Starred', value: totals.starred, tone: 'var(--warning)' },
                  ].map((s) => (
                    <span key={s.label} className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ background: s.tone }} />
                      {s.label}
                      <span className="font-semibold text-fg tabular-nums">{s.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Continue */}
          <div className="flex flex-col rounded-2xl border border-line bg-panel p-6">
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-subtle uppercase">{next ? 'Up next' : 'All done'}</p>
            {next ? (
              <>
                <p className="mt-3 text-[12.5px] text-muted">
                  Step {next.topic.step} · {next.topic.name}
                </p>
                <h2 className="mt-1 text-[18px] leading-snug font-semibold tracking-[-0.01em]">{next.problem.name}</h2>
                <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                  <span
                    className="rounded-md px-1.5 py-0.5 font-mono font-semibold"
                    style={{ color: ratingColor(next.problem.rating), background: `color-mix(in srgb, ${ratingColor(next.problem.rating)} 14%, transparent)` }}
                  >
                    {next.problem.rating}
                  </span>
                  <span className="font-mono">{next.problem.id}</span>
                </div>
                <div className="mt-auto flex gap-2 pt-5">
                  <button type="button" onClick={() => openSheetProblem(next.problem)} className="btn-primary inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-medium">
                    Solve it here
                    <ArrowRight className="size-4" />
                  </button>
                  <a
                    href={next.problem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 text-[13px] font-medium transition hover:bg-hover"
                  >
                    Codeforces
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </>
            ) : (
              <p className="mt-3 text-[14px] text-muted">Every problem is solved. Mark some for Revisit and solve them again without help.</p>
            )}
          </div>
        </section>

        {/* Toolbar */}
        <div className="sticky top-0 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <Segmented<View>
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'roadmap', label: 'Roadmap' },
              { value: 'all', label: 'All problems' },
            ]}
          />
          <label className="relative flex min-w-[180px] flex-1 items-center sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search problems or tags"
              aria-label="Search the sheet"
              className="h-8 w-full rounded-lg border border-line bg-panel pr-8 pl-8 text-[13px] outline-none placeholder:text-subtle focus:border-accent/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 text-subtle hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))} aria-label="Rating" className={select}>
            <option value={0}>Any rating</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level" className={select}>
            <option value="all">Any level</option>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status" className={select}>
            <option value="all">Any status</option>
            <option value="todo">To do</option>
            <option value="attempted">Attempted</option>
            <option value="solved">Solved</option>
            <option value="revisit">Revisit</option>
            <option value="starred">Starred</option>
          </select>
          {filtering && (
            <button type="button" onClick={clearFilters} className="text-[12.5px] font-medium text-muted hover:text-fg">
              Clear
            </button>
          )}
          <div className="flex-1" />
          <Tip label="A random unsolved problem from what's shown">
            <Button size="sm" variant="secondary" onClick={pick} className="h-8">
              <Shuffle />
              Pick for me
            </Button>
          </Tip>
        </div>

        <div className={cn('mt-5 grid grid-cols-[minmax(0,1fr)] gap-5', view === 'roadmap' && 'lg:grid-cols-[280px_minmax(0,1fr)]')}>
          {/* Roadmap rail */}
          {view === 'roadmap' && (
            <nav aria-label="Topics" className="min-w-0 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-140px)] lg:self-start lg:overflow-y-auto">
              <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
                {SHEET.topics.map((t) => {
                  const solved = t.problems.filter((p) => progressFor(p).status === 'solved').length;
                  const done = solved === t.problems.length;
                  const active = t.step === topic.step;
                  return (
                    <li key={t.step} className="w-[220px] shrink-0 lg:w-auto lg:shrink">
                      <button
                        type="button"
                        onClick={() => setTopicStep(t.step)}
                        aria-current={active ? 'step' : undefined}
                        className={cn(
                          'relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition',
                          active ? 'bg-panel ring-1 ring-line-strong' : 'hover:bg-hover/60',
                        )}
                      >
                        <Ring value={solved} total={t.problems.length} size={30} stroke={3}>
                          <span className={cn('text-[10px] font-semibold tabular-nums', done ? 'text-success' : active ? 'text-fg' : 'text-muted')}>
                            {done ? <Check className="size-3" strokeWidth={3} /> : t.step}
                          </span>
                        </Ring>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-[13px] font-medium', active ? 'text-fg' : 'text-muted')}>{t.name}</span>
                          <span className="block text-[11px] text-subtle tabular-nums">
                            {solved}/{t.problems.length} · {t.ratingRange}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {/* Problems */}
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-panel">
            {view === 'roadmap' ? (
              <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold tracking-[0.06em] text-accent uppercase">
                    Step {topic.step} of {SHEET.topics.length}
                  </p>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.01em]">{topic.name}</h2>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {topic.problems.length} problems · {topic.ratingRange} ·{' '}
                    {topic.problems.filter((p) => progressFor(p).status === 'solved').length} solved
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="icon-sm" variant="ghost" disabled={topic.step === 1} onClick={() => setTopicStep(topic.step - 1)} aria-label="Previous topic">
                    <ChevronLeft />
                  </Button>
                  <Button size="icon-sm" variant="ghost" disabled={topic.step === SHEET.topics.length} onClick={() => setTopicStep(topic.step + 1)} aria-label="Next topic">
                    <ChevronRight />
                  </Button>
                </div>
              </header>
            ) : (
              <header className="border-b border-line px-5 py-4">
                <h2 className="text-[18px] font-semibold tracking-[-0.01em]">All problems</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">{rows.length} shown, easiest first</p>
              </header>
            )}

            {rows.length ? (
              <div className="divide-y divide-line">
                {rows.map(({ problem, topic: t }) => (
                  <div key={problem.id}>
                    <ProblemRow
                      problem={problem}
                      topic={t}
                      progress={progressFor(problem)}
                      showTopic={view === 'all'}
                      onNote={() => setNoteFor((id) => (id === problem.id ? null : problem.id))}
                    />
                    {noteFor === problem.id && <NoteEditor problem={problem} note={progressFor(problem).note} onClose={() => setNoteFor(null)} />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-14 text-center text-[13.5px] text-muted">
                No problems match.{' '}
                <button type="button" onClick={clearFilters} className="font-medium text-fg underline-offset-4 hover:underline">
                  Clear filters
                </button>
              </div>
            )}
          </section>
        </div>

        {/* How to use / about */}
        <details className="group mt-8 rounded-2xl border border-line bg-panel px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-medium select-none">
            <Info className="size-4 text-muted" />
            How to use this sheet
            <ChevronRight className="ml-auto size-4 text-subtle transition group-open:rotate-90" />
          </summary>
          <div className="mt-4 grid gap-6 text-[13px] leading-relaxed text-muted md:grid-cols-2">
            <ol className="list-decimal space-y-2 pl-4">
              {SHEET.howTo.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <ul className="list-disc space-y-2 pl-4">
              {SHEET.about.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-[12.5px] text-subtle">
            <b className="font-medium text-muted">Solve</b> opens a problem in CP Studio’s editor; <b className="font-medium text-muted">Codeforces ↗</b> opens it on
            Codeforces, where you submit.
          </p>
        </details>
      </div>
    </PageShell>
  );
}
