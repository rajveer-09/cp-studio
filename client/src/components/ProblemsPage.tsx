import { BadgeCheck, CheckCircle2, CircleDashed, ExternalLink, FolderOpen, MoreHorizontal, Search, Send, Trash2, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { api, type HistoryProblem } from '../lib/api';
import { LANGUAGE_META } from '../lib/languages';
import { PLATFORM_COLORS, PLATFORM_META, PLATFORM_ORDER, reopenProblem } from '../lib/problems';
import { useStore } from '../store';
import type { Platform } from '../types';
import { PageShell, SignInNeeded } from './PageShell';
import { Button, cn, Tip } from './ui';

export { PLATFORM_COLORS };

/** Solved here (every sample passed) or accepted by the judge (linked account). */
const isSolved = (p: HistoryProblem) => Boolean(p.solvedAt || p.acceptedAt);

type StatusFilter = 'all' | 'solved' | 'attempted' | 'submitted';
type Sort = 'recent' | 'first' | 'title';

const DAY = 86_400_000;

/** "just now", "3 h ago", "Yesterday", "Mon", "12 Oct", "12 Oct 2025". */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso);
  const ms = now - then.getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (then.getTime() >= startOfToday) return `${Math.floor(ms / 3_600_000)} h ago`;
  if (then.getTime() >= startOfToday - DAY) return 'Yesterday';
  if (then.getTime() >= startOfToday - 6 * DAY) return then.toLocaleDateString(undefined, { weekday: 'short' });
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {tone && <span className="size-1.5 rounded-full" style={{ background: tone }} />}
        {label}
      </div>
      <div className="mt-1 text-[24px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 items-center rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2.5 text-[12.5px] font-medium whitespace-nowrap transition',
            value === o.value ? 'bg-panel-2 text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusIcon({ problem }: { problem: HistoryProblem }) {
  if (problem.acceptedAt) {
    return (
      <Tip label={`Accepted on ${PLATFORM_META[problem.platform].label} (${new Date(problem.acceptedAt).toLocaleDateString()})`}>
        <BadgeCheck className="size-[18px] text-success" aria-label="Accepted" />
      </Tip>
    );
  }
  return problem.solvedAt ? (
    <Tip label={`Solved: all sample tests passed (${new Date(problem.solvedAt).toLocaleDateString()})`}>
      <CheckCircle2 className="size-[18px] text-success" aria-label="Solved" />
    </Tip>
  ) : (
    <Tip label="Attempted">
      <CircleDashed className="size-[18px] text-warning" aria-label="Attempted" />
    </Tip>
  );
}

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-muted';

function RowMenu({ problem, onOpen, onRemove }: { problem: HistoryProblem; onOpen: () => void; onRemove: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${problem.title}`}
          onClick={(e) => e.stopPropagation()}
          className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} onClick={(e) => e.stopPropagation()} className="popover z-50 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Item onSelect={onOpen} className={menuItem}>
            <FolderOpen />
            Open in the editor
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => window.open(problem.url, '_blank', 'noopener')} className={menuItem}>
            <ExternalLink />
            Open on {PLATFORM_META[problem.platform].label}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={onRemove} className={cn(menuItem, 'text-danger [&_svg]:text-danger')}>
            <Trash2 />
            Remove from history
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function EmptyHistory() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-line bg-panel-2 text-accent">
        <FolderOpen className="size-5" />
      </div>
      <h2 className="mt-4 text-[16px] font-semibold">No problems yet</h2>
      <p className="mt-1.5 max-w-[340px] text-[13.5px] leading-relaxed text-muted">
        Import a problem from Codeforces, LeetCode, CodeChef or AtCoder in the editor’s Problem tab, and it shows up here.
      </p>
      <Button
        variant="primary"
        className="mt-5"
        onClick={() => {
          useStore.setState({ bottomTab: 'problem' });
          navigate('/');
        }}
      >
        Import a problem
      </Button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-[58px] items-center gap-4 px-4">
          <span className="size-[18px] animate-pulse rounded-full bg-panel-2" />
          <span className="h-3.5 animate-pulse rounded bg-panel-2" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
        </div>
      ))}
    </div>
  );
}

function History() {
  const [, navigate] = useLocation();
  const [problems, setProblems] = useState<HistoryProblem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    api.me.problems().then(
      (r) => setProblems(r.problems),
      () => setFailed(true),
    );
  }, []);

  const counts = useMemo(() => {
    const list = problems ?? [];
    return {
      total: list.length,
      solved: list.filter(isSolved).length,
      attempted: list.filter((p) => !isSolved(p)).length,
      submitted: list.filter((p) => p.submittedAt).length,
    };
  }, [problems]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (problems ?? []).filter(
      (p) =>
        (platform === 'all' || p.platform === platform) &&
        (status === 'all' || (status === 'solved' ? isSolved(p) : status === 'submitted' ? p.submittedAt : !isSolved(p))) &&
        (!q || p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)),
    );
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    if (sort === 'first') return [...list].sort((a, b) => b.firstOpenedAt.localeCompare(a.firstOpenedAt));
    return list;
  }, [problems, query, platform, status, sort]);

  const open = async (p: HistoryProblem) => {
    const key = `${p.platform}/${p.id}`;
    setOpening(key);
    try {
      await reopenProblem(p.platform, p.id);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open this problem.');
      setOpening(null);
    }
  };

  const remove = async (p: HistoryProblem) => {
    setProblems((list) => list?.filter((x) => x !== p) ?? null);
    try {
      await api.me.removeProblem(p.platform, p.id);
      toast.success(`Removed “${p.title}” from your history`);
    } catch {
      setProblems((list) => (list ? [p, ...list] : list));
      toast.error('Could not remove it. Try again.');
    }
  };

  const platforms = PLATFORM_ORDER.filter((p) => problems?.some((x) => x.platform === p));
  const filtered = query || platform !== 'all' || status !== 'all';

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">Problems</h1>
          <p className="mt-1.5 text-[14px] text-muted">Everything you’ve worked on in CP Studio, with the code you wrote for it.</p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Problems" value={problems ? counts.total : '–'} />
        <Stat label="Solved" value={problems ? counts.solved : '–'} tone="var(--success)" />
        <Stat label="Attempted" value={problems ? counts.attempted : '–'} tone="var(--warning)" />
        <Stat label="Submitted" value={problems ? counts.submitted : '–'} tone="var(--info)" />
      </div>

      <div className="mt-7 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-[300px]">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or ID"
              aria-label="Search problems"
              className="h-8 w-full rounded-lg border border-line bg-bg/60 pr-8 pl-8 text-[13px] outline-none placeholder:text-subtle focus:border-accent/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 text-subtle hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'solved', label: 'Solved' },
              { value: 'attempted', label: 'Attempted' },
              { value: 'submitted', label: 'Submitted' },
            ]}
          />
          {platforms.length > 1 && (
            <Segmented
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={[{ value: 'all' as const, label: 'All judges' }, ...platforms.map((p) => ({ value: p, label: PLATFORM_META[p].label }))]}
            />
          )}
          <div className="flex-1" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort"
            className="h-8 rounded-lg border border-line bg-panel px-2 text-[12.5px] text-muted outline-none focus:border-accent/60"
          >
            <option value="recent">Recently opened</option>
            <option value="first">First opened</option>
            <option value="title">Title</option>
          </select>
        </div>

        {failed ? (
          <p className="px-4 py-12 text-center text-[13.5px] text-muted">Couldn’t load your problems. Check your connection and reload.</p>
        ) : !problems ? (
          <SkeletonRows />
        ) : problems.length === 0 ? (
          <EmptyHistory />
        ) : shown.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13.5px] text-muted">
            No problems match.{' '}
            {filtered && (
              <button
                type="button"
                className="font-medium text-fg underline-offset-4 hover:underline"
                onClick={() => {
                  setQuery('');
                  setPlatform('all');
                  setStatus('all');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] font-medium tracking-wide text-subtle uppercase">
                <th className="w-12 py-2.5 pl-4 font-medium" aria-label="Status" />
                <th className="py-2.5 pr-4 font-medium">Problem</th>
                <th className="hidden py-2.5 pr-4 font-medium sm:table-cell">Judge</th>
                <th className="hidden py-2.5 pr-4 font-medium md:table-cell">Languages</th>
                <th className="py-2.5 pr-4 text-right font-medium whitespace-nowrap">Last opened</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((p) => {
                const key = `${p.platform}/${p.id}`;
                return (
                  <tr
                    key={key}
                    onClick={() => open(p)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && open(p)}
                    className={cn('group cursor-pointer transition-colors outline-none hover:bg-hover/60 focus-visible:bg-hover', opening === key && 'opacity-60')}
                  >
                    <td className="py-3 pl-4 align-middle">
                      <StatusIcon problem={p} />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium group-hover:text-fg">{p.title}</span>
                        {p.acceptedAt ? (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-success/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-success">Accepted</span>
                        ) : p.submittedAt && (
                          <Tip label={`Submitted ${new Date(p.submittedAt).toLocaleString()}`}>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-info">
                              <Send className="size-2.5" />
                              Submitted
                            </span>
                          </Tip>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11.5px] text-subtle">{p.id}</div>
                    </td>
                    <td className="hidden py-3 pr-4 whitespace-nowrap sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] }} />
                        {PLATFORM_META[p.platform].label}
                      </span>
                    </td>
                    <td className="hidden py-3 pr-4 md:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {p.languages.map((l) => (
                          <span key={l} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-muted">
                            <span className="size-1.5 rounded-full" style={{ background: LANGUAGE_META[l].color }} />
                            {LANGUAGE_META[l].label}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap text-muted tabular-nums">
                      <Tip label={new Date(p.lastOpenedAt).toLocaleString()}>
                        <span>{relativeTime(p.lastOpenedAt)}</span>
                      </Tip>
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <RowMenu problem={p} onOpen={() => open(p)} onRemove={() => remove(p)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {problems && problems.length > 0 && (
        <p className="mt-3 text-[12px] text-subtle">
          Solved means every sample test passed in CP Studio. Accepted comes from the judge, for accounts linked on the dashboard. Submitted means you opened the judge’s submit page from here.
        </p>
      )}
    </div>
  );
}

export default function ProblemsPage() {
  const status = useStore((s) => s.account.status);
  return (
    <PageShell title="Problems">
      {status === 'signedIn' ? <History /> : status === 'signedOut' ? <SignInNeeded what="your problems" /> : null}
    </PageShell>
  );
}
