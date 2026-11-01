import { AlertTriangle, ArrowUpRight, CalendarPlus, Clock, Download, Radio, RefreshCw, Timer } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Contest, type ContestList } from '../lib/api';
import { PLATFORM_COLORS, PLATFORM_META } from '../lib/problems';
import type { Platform } from '../types';
import { PageShell } from './PageShell';
import { Button, cn, Tip } from './ui';

const PLATFORMS: Platform[] = ['codeforces', 'codechef', 'leetcode', 'atcoder'];
const FILTER_KEY = 'cp-studio-contest-platforms';
const end = (c: Contest) => c.start + c.durationSeconds * 1000;
const LONG_SECONDS = 24 * 60 * 60;

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 48 * 60) return `${Math.round(minutes / 1440)} days`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "in 2d 4h", "in 35m", "in 40s". */
function until(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function dayLabel(ms: number, now: number): { title: string; date: string } {
  const day = new Date(ms);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - start.getTime()) / 86400000);
  const date = day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const weekday = day.toLocaleDateString(undefined, { weekday: 'long' });
  // Within a week the weekday is clear on its own; further out the date leads.
  if (diff === 0 || diff === 1) return { title: diff ? 'Tomorrow' : 'Today', date: `${weekday}, ${date}` };
  return diff < 7 ? { title: weekday, date } : { title: date, date: weekday };
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function googleCalendarUrl(c: Contest): string {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: c.name, dates: `${stamp(c.start)}/${stamp(end(c))}`, details: c.url, location: c.url });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function downloadIcs(c: Contest) {
  const escape = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CP Studio//Contests//EN',
    'BEGIN:VEVENT',
    `UID:${c.platform}-${c.id}@cp-studio`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(c.start)}`,
    `DTEND:${stamp(end(c))}`,
    `SUMMARY:${escape(c.name)}`,
    `DESCRIPTION:${escape(c.url)}`,
    `URL:${c.url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(c.name)} starts in 15 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = `${c.id}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-muted';

function CalendarMenu({ contest, children }: { contest: Contest; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="popover z-50 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Item asChild className={menuItem}>
            <a href={googleCalendarUrl(contest)} target="_blank" rel="noreferrer">
              <CalendarPlus />
              Google Calendar
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => downloadIcs(contest)} className={menuItem}>
            <Download />
            Download .ics (with a reminder)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function PlatformTag({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted">
      <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[platform] }} />
      {PLATFORM_META[platform].label}
    </span>
  );
}

/** The next contest (or one running now), with a live countdown. */
function NextUp({ contest }: { contest: Contest }) {
  const now = useNow(1000);
  const live = contest.start <= now;
  const left = Math.max(0, (live ? end(contest) : contest.start) - now);
  const parts = [
    { value: Math.floor(left / 86400000), label: 'days' },
    { value: Math.floor((left % 86400000) / 3600000), label: 'hours' },
    { value: Math.floor((left % 3600000) / 60000), label: 'min' },
    { value: Math.floor((left % 60000) / 1000), label: 'sec' },
  ];
  const color = PLATFORM_COLORS[contest.platform];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-6">
      <div className="pointer-events-none absolute -top-28 -left-20 size-80 rounded-full opacity-[0.14] blur-3xl" style={{ background: `radial-gradient(circle, ${color}, transparent 65%)` }} />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 max-w-[520px]">
          <p className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.08em] uppercase">
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-danger">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-danger" />
                </span>
                Live now
              </span>
            ) : (
              <span className="text-accent">Next up</span>
            )}
          </p>
          <h2 className="mt-2 text-[22px] leading-snug font-semibold tracking-[-0.015em]">{contest.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <PlatformTag platform={contest.platform} />
            <span>
              {new Date(contest.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {timeOf(contest.start)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {duration(contest.durationSeconds)}
            </span>
            {contest.kind && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11.5px] font-medium text-fg">{contest.kind}</span>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={contest.url} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium">
              {live ? 'Enter contest' : 'Open contest'}
              <ArrowUpRight className="size-4" />
            </a>
            {!live && (
              <CalendarMenu contest={contest}>
                <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 text-[13px] font-medium transition hover:bg-hover">
                  <CalendarPlus className="size-4" />
                  Add to calendar
                </button>
              </CalendarMenu>
            )}
          </div>
        </div>
        <div aria-label={`${live ? 'Ends' : 'Starts'} in ${until(left)}`} className="flex gap-2 sm:gap-3">
          {parts.map((p) => (
            <div key={p.label} className="w-[64px] rounded-xl border border-line bg-panel-2/60 py-3 text-center sm:w-[76px]">
              <div className="font-mono text-[26px] leading-none font-semibold tabular-nums sm:text-[30px]">{String(p.value).padStart(2, '0')}</div>
              <div className="mt-1.5 text-[11px] text-subtle">{p.label}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="relative mt-4 text-[12px] text-subtle">{live ? 'Ends' : 'Starts'} in {until(left)}</p>
    </section>
  );
}

function ContestRow({ contest, now }: { contest: Contest; now: number }) {
  const live = contest.start <= now;
  return (
    <li className="group relative flex items-center gap-4 py-3 pr-2 pl-4">
      <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full" style={{ background: PLATFORM_COLORS[contest.platform] }} aria-hidden />
      <div className="w-[76px] shrink-0">
        <div className="text-[14px] font-semibold tabular-nums">{timeOf(contest.start)}</div>
        <div className={cn('text-[11.5px] tabular-nums', live ? 'font-medium text-danger' : 'text-subtle')}>{live ? 'Live' : `in ${until(contest.start - now)}`}</div>
      </div>
      <div className="min-w-0 flex-1">
        <a href={contest.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[14px] font-medium text-fg hover:underline hover:underline-offset-[3px] sm:line-clamp-1">
          {contest.name}
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <PlatformTag platform={contest.platform} />
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" />
            {duration(contest.durationSeconds)}
          </span>
          {contest.kind && <span className="rounded-full border border-line px-1.5 py-px text-[11.5px]">{contest.kind}</span>}
          {contest.rated && <span className="text-subtle">Rated {contest.rated.replace(/\s+/g, ' ')}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!live && (
          <CalendarMenu contest={contest}>
            <button type="button" aria-label={`Add ${contest.name} to calendar`} className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg data-[state=open]:bg-hover">
              <CalendarPlus className="size-4" />
            </button>
          </CalendarMenu>
        )}
        <Tip label={`Open on ${PLATFORM_META[contest.platform].label}`}>
          <a
            href={contest.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${contest.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-fg"
          >
            <ArrowUpRight className="size-4" />
          </a>
        </Tip>
      </div>
    </li>
  );
}

function readFilter(): Platform[] {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null');
    if (Array.isArray(saved)) return PLATFORMS.filter((p) => saved.includes(p));
  } catch {
    // Not available here: show every judge.
  }
  return PLATFORMS;
}

/** Upcoming contests on Codeforces, CodeChef, LeetCode and AtCoder, by day in your time zone. */
export default function ContestsPage() {
  const [data, setData] = useState<ContestList | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState<Platform[]>(readFilter);
  const now = useNow(30_000);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .contests()
      .then(
        (r) => {
          setData(r);
          setFailed(false);
        },
        () => setFailed(true),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = (p: Platform) => {
    const next = shown.includes(p) ? shown.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || shown.includes(x));
    setShown(next);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Kept for this visit only.
    }
  };

  const contests = useMemo(() => (data?.contests ?? []).filter((c) => end(c) > now && shown.includes(c.platform)), [data, now, shown]);
  const running = contests.filter((c) => c.start <= now);
  // The countdown is for a round you'd sit down for: one running now, or the next to start. Week-long
  // contests (marathons, practice rounds) stay in the list instead.
  const featured = running.find((c) => c.durationSeconds <= LONG_SECONDS) ?? contests.find((c) => c.start > now && c.durationSeconds <= LONG_SECONDS) ?? contests[0];
  const days = useMemo(() => {
    const groups: { key: string; first: number; items: Contest[] }[] = [];
    for (const c of contests) {
      if (c.start <= now) continue;
      const key = new Date(c.start).toDateString();
      const group = groups.at(-1);
      if (group?.key === key) group.items.push(c);
      else groups.push({ key, first: c.start, items: [c] });
    }
    return groups;
  }, [contests, now]);
  const down = data ? PLATFORMS.filter((p) => data.sources[p] === 'error') : [];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <PageShell title="Contests">
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Contests</p>
            <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-[-0.02em]">Upcoming contests</h1>
            <p className="mt-1.5 text-[14px] text-muted">Codeforces, CodeChef, LeetCode and AtCoder, in your time zone ({timeZone}).</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} disabled={loading}>
            {!loading && <RefreshCw />}
            Refresh
          </Button>
        </header>

        {failed && !data ? (
          <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">Couldn’t load contests</p>
            <p className="mt-1 text-[13px] text-muted">Check your connection and try again.</p>
            <Button className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <div className="mt-8 space-y-4" aria-busy>
            <div className="h-44 animate-pulse rounded-2xl bg-panel" />
            <div className="h-80 animate-pulse rounded-2xl bg-panel" />
          </div>
        ) : (
          <>
            {down.length > 0 && (
              <p className="mt-6 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/[0.07] px-3.5 py-2.5 text-[12.5px] text-fg">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                Couldn’t reach {down.map((p) => PLATFORM_META[p].label).join(' and ')} right now, so {down.length === 1 ? 'its' : 'their'} contests are missing.
              </p>
            )}

            <div className="mt-6">{featured ? <NextUp contest={featured} /> : null}</div>

            <div role="group" aria-label="Judges" className="mt-6 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = shown.includes(p);
                const count = data.contests.filter((c) => c.platform === p && end(c) > now).length;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p)}
                    className={cn(
                      'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium transition',
                      on ? 'border-line-strong bg-panel text-fg' : 'border-dashed border-line text-subtle hover:text-muted',
                    )}
                  >
                    <span className={cn('size-2 rounded-full transition', !on && 'opacity-40')} style={{ background: PLATFORM_COLORS[p] }} />
                    {PLATFORM_META[p].label}
                    <span className="text-subtle tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>

            {contests.length ? (
              <div className="mt-6 space-y-6">
                {running.length > 0 && (
                  <section className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                    <div className="md:pt-3">
                      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
                        <span className="size-2 rounded-full bg-danger" />
                        Running now
                      </h2>
                      <p className="text-[12.5px] text-muted">{running.length === 1 ? '1 contest' : `${running.length} contests`}</p>
                    </div>
                    <ul className="divide-y divide-line rounded-2xl border border-line bg-panel">
                      {running.map((c) => (
                        <ContestRow key={`${c.platform}:${c.id}`} contest={c} now={now} />
                      ))}
                    </ul>
                  </section>
                )}
                {days.map((d) => {
                  const label = dayLabel(d.first, now);
                  return (
                    <section key={d.key} className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                      <div className="md:pt-3">
                        <h2 className="text-[15px] font-semibold">{label.title}</h2>
                        <p className="text-[12.5px] text-muted">{label.date}</p>
                      </div>
                      <ul className="divide-y divide-line rounded-2xl border border-line bg-panel">
                        {d.items.map((c) => (
                          <ContestRow key={`${c.platform}:${c.id}`} contest={c} now={now} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="mt-12 flex flex-col items-center gap-2 text-center text-[13.5px] text-muted">
                <Radio className="size-5 text-subtle" />
                {shown.length ? 'No contests in the next few weeks on the judges you picked.' : 'Pick a judge above to see its contests.'}
              </p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
