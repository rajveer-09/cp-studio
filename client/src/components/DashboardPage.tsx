import { ArrowRight, CheckCircle2, CircleDashed, Code2, Flame, Target } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { api, type Dashboard } from '../lib/api';
import { LANGUAGE_META } from '../lib/languages';
import { PLATFORM_META, PLATFORM_ORDER, reopenProblem } from '../lib/problems';
import { useStore } from '../store';
import { Bars } from './charts';
import { JudgeProfiles } from './JudgeProfiles';
import { PageShell, SignInNeeded } from './PageShell';
import { PLATFORM_COLORS, relativeTime } from './ProblemsPage';
import { cn } from './ui';

const WEEKS = 53;
const MIN_CELL = 11;
const MAX_CELL = 16;
const GAP = 3;
// One hue (the accent), light to dark: none, then four steps of runs per day.
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1];
const levelOf = (runs: number) => (runs === 0 ? 0 : runs <= 2 ? 1 : runs <= 5 ? 2 : runs <= 10 ? 3 : 4);

const shiftDay = (day: string, by: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A day in words: runs here, problems solved here, and what linked judges recorded. */
function dayDetails(entry: Dashboard['days'][number] | undefined): string[] {
  if (!entry) return ['No activity'];
  const lines = [
    entry.runs ? `${plural(entry.runs, 'run')} in CP Studio` : '',
    entry.solved ? `${plural(entry.solved, 'problem')} solved here` : '',
    entry.judgeSolved ? `${plural(entry.judgeSolved, 'problem')} accepted on judges` : '',
    entry.judgeSubmissions ? `${plural(entry.judgeSubmissions, 'submission')} on LeetCode` : '',
  ].filter(Boolean);
  return lines.length ? lines : ['No activity'];
}

function Tile({ icon, label, value, unit, note }: { icon: ReactNode; label: string; value: number; unit?: string; note: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        <span className="grid size-6 place-items-center rounded-md bg-accent/12 text-accent [&_svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}</span>
        {unit && <span className="text-[13px] text-muted">{unit}</span>}
      </div>
      <div className="mt-2 text-[12px] text-subtle">{note}</div>
    </div>
  );
}

function Card({ title, subtitle, action, children, className }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-panel', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="px-5 pt-4 pb-5">{children}</div>
    </section>
  );
}

/** A year of daily activity, GitHub style: one column per week, Sunday at the top. */
function Heatmap({ data }: { data: Dashboard }) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  // Squares grow to fill the card on wide screens; below the minimum the grid scrolls instead.
  const [CELL, setCell] = useState(MIN_CELL);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const fit = () => setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((el.clientWidth - 34) / WEEKS) - GAP)));
    fit();
    new ResizeObserver(fit).observe(el);
  }, []);
  const byDay = useMemo(() => new Map(data.days.map((d) => [d.day, d])), [data.days]);
  const weeks = useMemo(() => {
    const todayDow = new Date(`${data.today}T00:00:00Z`).getUTCDay();
    const start = shiftDay(data.today, -(todayDow + (WEEKS - 1) * 7));
    return Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => shiftDay(start, w * 7 + d)));
  }, [data.today]);
  // A month's name over the first week that starts in it (not the partial first column, which would crowd).
  const months = weeks.map((week, i) =>
    i > 0 && week[0].slice(5, 7) !== weeks[i - 1][0].slice(5, 7)
      ? new Date(`${week[0]}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
      : '',
  );
  const width = WEEKS * (CELL + GAP);
  const hovered = hover && byDay.get(hover.day);

  return (
    <div className="relative" ref={measure}>
      <div
        className="overflow-x-auto pb-1"
        ref={(el) => {
          // Small screens: start at the most recent weeks.
          if (el && !el.dataset.scrolled) {
            el.scrollLeft = el.scrollWidth;
            el.dataset.scrolled = '1';
          }
        }}
      >
        <div className="flex gap-2" style={{ minWidth: width + 30 }}>
          <div className="grid shrink-0 pt-[18px] text-[10.5px] text-subtle" style={{ gridTemplateRows: `repeat(7, ${CELL + GAP}px)` }}>
            {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((label, i) => (
              <span key={i} style={{ lineHeight: `${CELL}px` }}>
                {label}
              </span>
            ))}
          </div>
          <div>
            <div className="relative mb-1.5 h-3 text-[10.5px] text-subtle">
              {months.map((m, i) =>
                m ? (
                  <span key={i} className="absolute top-0" style={{ left: i * (CELL + GAP) }}>
                    {m}
                  </span>
                ) : null,
              )}
            </div>
            <div className="flex" style={{ gap: GAP }} onMouseLeave={() => setHover(null)} role="grid" aria-label="Daily activity over the last year">
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }} role="row">
                  {week.map((day) => {
                    if (day > data.today) return <span key={day} style={{ width: CELL, height: CELL }} />;
                    const entry = byDay.get(day);
                    const level = levelOf(entry ? entry.runs + entry.judgeSubmissions + entry.judgeSolved : 0);
                    const label = `${longDate(day)}: ${dayDetails(entry).join(', ')}`;
                    return (
                      <span
                        key={day}
                        role="gridcell"
                        aria-label={label}
                        onMouseEnter={(e) => {
                          const cell = e.currentTarget.getBoundingClientRect();
                          const box = e.currentTarget.closest('.relative')!.getBoundingClientRect();
                          setHover({ day, x: cell.left - box.left + CELL / 2, y: cell.top - box.top });
                        }}
                        className={cn('relative rounded-[3px]', level === 0 && 'bg-panel-2 ring-1 ring-line/70 ring-inset', day === data.today && 'outline outline-1 outline-offset-1 outline-fg/40')}
                        style={{ width: CELL, height: CELL, ...(level ? { background: `color-mix(in srgb, var(--accent) ${LEVEL_OPACITY[level] * 100}%, var(--panel))` } : {}) }}
                      >
                        {entry?.solved || entry?.judgeSolved ? <span className="absolute inset-[3.5px] rounded-full bg-panel/90" /> : null}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-pop"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <div className="font-medium">{longDate(hover.day)}</div>
          {dayDetails(hovered ?? undefined).map((line) => (
            <div key={line} className="text-muted">
              {line}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block size-[11px] rounded-[3px]" style={{ background: 'var(--accent)' }}>
            <span className="absolute inset-[3.5px] rounded-full bg-panel/90" />
          </span>
          A problem solved or accepted that day
        </span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL_OPACITY.map((o, i) => (
            <span
              key={i}
              className={cn('inline-block size-[11px] rounded-[3px]', i === 0 && 'bg-panel-2 ring-1 ring-line/70 ring-inset')}
              style={i ? { background: `color-mix(in srgb, var(--accent) ${o * 100}%, var(--panel))` } : undefined}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

function Overview() {
  const name = useStore((s) => (s.account.status === 'signedIn' ? s.account.user.name.split(/\s+/)[0] : ''));
  const [, navigate] = useLocation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => api.me.dashboard(Intl.DateTimeFormat().resolvedOptions().timeZone).then(setData, () => setFailed(true)), []);

  useEffect(() => {
    void load().then(async () => {
      // Linked judge profiles not read for a while are refreshed in the background.
      try {
        if ((await api.me.syncJudges()).synced) await load();
      } catch {
        // Shown again next time.
      }
    });
  }, [load]);

  if (failed) return <p className="mt-24 text-center text-[14px] text-muted">Couldn’t load your dashboard. Check your connection and reload.</p>;
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:px-8">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-panel-2" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[126px] animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
        <div className="mt-4 h-56 animate-pulse rounded-xl bg-panel" />
      </div>
    );
  }

  const solvedHere = data.judges.reduce((n, j) => n + j.solved, 0);
  const opened = data.judges.reduce((n, j) => n + j.total, 0);
  // With linked judges: per judge, whichever is larger, what the judge accepted or what passed here.
  const solved = PLATFORM_ORDER.reduce((n, p) => {
    const here = data.judges.find((j) => j.platform === p)?.solved ?? 0;
    const there = data.accounts.find((a) => a.platform === p)?.stats.solved ?? 0;
    return n + Math.max(here, there);
  }, 0);
  const linked = data.accounts.length > 0;
  const judges = [...data.judges].sort((a, b) => b.solved - a.solved || b.total - a.total);
  const languages = [...data.languages].sort((a, b) => b.runs - a.runs);
  const nothingYet = data.activeDays === 0 && opened === 0;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">
            {data.coding.current > 0
              ? `You’ve coded ${plural(data.coding.current, 'day')} in a row. Keep it going.`
              : nothingYet
                ? 'Run some code or import a problem, and your progress shows up here.'
                : 'Run some code today to start a new streak.'}
          </p>
        </div>
        <Link href="/" className="btn-primary inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium">
          Continue coding
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Flame />} label="Coding streak" value={data.coding.current} unit={data.coding.current === 1 ? 'day' : 'days'} note={`Longest: ${plural(data.coding.longest, 'day')}`} />
        <Tile icon={<Target />} label="Solving streak" value={data.solving.current} unit={data.solving.current === 1 ? 'day' : 'days'} note={`Longest: ${plural(data.solving.longest, 'day')}`} />
        <Tile
          icon={<CheckCircle2 />}
          label="Problems solved"
          value={solved}
          note={linked ? `On your judges · ${solvedHere} in CP Studio` : opened ? `of ${opened} opened` : 'All sample tests passing'}
        />
        <Tile icon={<Code2 />} label="Practice sessions" value={data.practice.sessions} note="Coding with no problem loaded" />
      </div>

      <Card className="mt-4" title="Activity" subtitle={`${plural(data.activeDays, 'active day')} in the last year`}>
        <Heatmap data={data} />
      </Card>

      <div className="mt-4">
        <JudgeProfiles accounts={data.accounts} onChange={() => void load()} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By judge" subtitle="Problems solved out of those opened">
          {judges.length ? (
            <Bars
              rows={judges.map((j) => ({
                key: j.platform,
                label: (
                  <>
                    <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[j.platform] }} />
                    {PLATFORM_META[j.platform].label}
                  </>
                ),
                value: j.solved,
                track: j.total,
                text: `${j.solved} solved · ${j.total} opened`,
              }))}
              legend={
                <div className="mt-4 flex gap-4 text-[11.5px] text-subtle">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-3 rounded-full bg-accent" />
                    Solved
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-3 rounded-full bg-accent/25" />
                    Opened
                  </span>
                </div>
              }
            />
          ) : (
            <p className="py-6 text-center text-[13px] text-muted">Import a problem to see it here.</p>
          )}
        </Card>
        <Card title="Languages" subtitle="Runs per language">
          {languages.length ? (
            <Bars
              rows={languages.map((l) => ({
                key: l.language,
                label: (
                  <>
                    <span className="size-2 rounded-full" style={{ background: LANGUAGE_META[l.language].color }} />
                    {LANGUAGE_META[l.language].label}
                  </>
                ),
                value: l.runs,
                text: plural(l.runs, 'run'),
              }))}
            />
          ) : (
            <p className="py-6 text-center text-[13px] text-muted">Run some code to see this.</p>
          )}
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Recent problems"
        action={
          data.recent.length ? (
            <Link href="/problems" className="flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-fg">
              View all
              <ArrowRight className="size-3.5" />
            </Link>
          ) : undefined
        }
      >
        {data.recent.length ? (
          <ul className="-mx-2 divide-y divide-line">
            {data.recent.map((p) => (
              <li key={`${p.platform}/${p.id}`}>
                <button
                  type="button"
                  onClick={() => reopenProblem(p.platform, p.id).then(() => navigate('/'))}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-hover/60"
                >
                  {p.solvedAt ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Solved" /> : <CircleDashed className="size-4 shrink-0 text-warning" aria-label="Attempted" />}
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{p.title}</span>
                  <span className="hidden items-center gap-1.5 text-[12.5px] text-muted sm:flex">
                    <span className="size-1.5 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] }} />
                    {PLATFORM_META[p.platform].label}
                  </span>
                  <span className="w-20 text-right text-[12.5px] text-subtle tabular-nums">{relativeTime(p.lastOpenedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[13px] text-muted">Problems you open will be listed here.</p>
        )}
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const status = useStore((s) => s.account.status);
  return <PageShell title="Dashboard">{status === 'signedIn' ? <Overview /> : status === 'signedOut' ? <SignInNeeded what="your dashboard" /> : null}</PageShell>;
}
