import { ArrowRight, ExternalLink, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { api, type JudgeAccount } from '../lib/api';
import { PLATFORM_META, PLATFORM_ORDER, topicName } from '../lib/problems';
import { themeById } from '../lib/themes';
import { useStore } from '../store';
import type { Platform } from '../types';
import { Bars, Columns, Donut, RatingChart } from './charts';
import { PLATFORM_COLORS } from './ProblemsPage';
import { cn } from './ui';

/** Easy / Medium / Hard, checked for color-blind separation and contrast on each theme's surface. */
const DIFFICULTY_COLORS = {
  dark: { easy: '#11a2a2', medium: '#b38400', hard: '#e3509b' },
  light: { easy: '#00a3a3', medium: '#d99400', hard: '#d6336c' },
};

const PROFILE_URL: Record<Platform, (handle: string) => string> = {
  codeforces: (h) => `https://codeforces.com/profile/${h}`,
  atcoder: (h) => `https://atcoder.jp/users/${h}`,
  leetcode: (h) => `https://leetcode.com/u/${h}/`,
  codechef: (h) => `https://www.codechef.com/users/${h}`,
};

function Card({ title, subtitle, action, children, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-line bg-panel', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="px-5 pt-4 pb-5">{children}</div>
    </section>
  );
}

const JudgeName = ({ platform }: { platform: Platform }) => (
  <>
    <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[platform] }} />
    {PLATFORM_META[platform].label}
  </>
);

function RatingCard({ account }: { account: JudgeAccount }) {
  const history = account.details.ratingHistory ?? [];
  const contest = account.details.contest;
  const current = contest?.rating ?? account.stats.rating ?? history.at(-1)?.rating;
  const max = account.stats.maxRating ?? (history.length ? Math.max(...history.map((p) => p.rating)) : undefined);
  const facts = [
    account.stats.rank ? account.stats.rank.replace(/\b\w/g, (c) => c.toUpperCase()) : '',
    contest ? `Top ${contest.topPercentage}% · rank ${contest.globalRanking.toLocaleString()}` : '',
    history.length ? `${history.length} rated contest${history.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  return (
    <Card
      title={<JudgeName platform={account.platform} />}
      action={
        <a href={PROFILE_URL[account.platform](account.handle)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
          @{account.handle}
          <ExternalLink className="size-3" />
        </a>
      }
    >
      {current !== undefined ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{current}</span>
            {max !== undefined && max !== current && (
              <span className="flex items-center gap-1 text-[12.5px] text-muted">
                <Trophy className="size-3.5" />
                max {max}
              </span>
            )}
          </div>
          {facts.length > 0 && <p className="mt-1.5 text-[12.5px] text-muted">{facts.join(' · ')}</p>}
          <div className="mt-4">
            {history.length > 1 ? <RatingChart points={history} /> : <p className="py-10 text-center text-[13px] text-muted">A graph appears after a couple of rated contests.</p>}
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-[13px] text-muted">No rated contests on {PLATFORM_META[account.platform].label} yet.</p>
      )}
    </Card>
  );
}

function Topics({ accounts }: { accounts: JudgeAccount[] }) {
  const withTags = accounts.filter((a) => a.details.tags?.length);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [all, setAll] = useState(false);
  const chosen = withTags.find((a) => a.platform === platform) ?? withTags[0];
  if (!chosen) return null;
  const tags = chosen.details.tags!;
  const shown = all ? tags : tags.slice(0, 12);

  return (
    <Card
      title="Topics"
      subtitle={`Problems solved per topic on ${PLATFORM_META[chosen.platform].label}${chosen.platform === 'codeforces' ? ' (a problem can have several tags)' : ''}`}
      action={
        withTags.length > 1 ? (
          <div role="radiogroup" aria-label="Judge" className="flex shrink-0 rounded-lg border border-line bg-panel p-0.5">
            {withTags.map((a) => (
              <button
                key={a.platform}
                type="button"
                role="radio"
                aria-checked={a === chosen}
                onClick={() => {
                  setPlatform(a.platform);
                  setAll(false);
                }}
                className={cn('h-7 rounded-md px-2.5 text-[12.5px] font-medium transition', a === chosen ? 'bg-panel-2 text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg')}
              >
                {PLATFORM_META[a.platform].label}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-x-10 md:grid-cols-2">
        {[shown.slice(0, Math.ceil(shown.length / 2)), shown.slice(Math.ceil(shown.length / 2))].map((column, i) => (
          <Bars
            key={i}
            rows={column.map((t) => ({
              key: t.tag,
              label: <span className="truncate">{topicName(t.tag)}</span>,
              value: t.solved,
              text: String(t.solved),
            }))}
          />
        ))}
      </div>
      {tags.length > 12 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-5 text-[12.5px] font-medium text-muted hover:text-fg">
          {all ? 'Show the top 12' : `Show all ${tags.length} topics`}
        </button>
      )}
    </Card>
  );
}

function Overview() {
  const dark = useStore((s) => themeById(s.theme).dark);
  const [accounts, setAccounts] = useState<JudgeAccount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => api.me.judges().then((r) => setAccounts(r.accounts), () => setFailed(true)), []);

  useEffect(() => {
    void load().then(async () => {
      try {
        if ((await api.me.syncJudges()).synced) await load();
      } catch {
        // Shown again next time.
      }
    });
  }, [load]);

  const ordered = useMemo(() => PLATFORM_ORDER.map((p) => accounts?.find((a) => a.platform === p)).filter((a): a is JudgeAccount => Boolean(a)), [accounts]);

  if (failed) return <p className="mt-24 text-center text-[14px] text-muted">Couldn’t load your stats. Check your connection and reload.</p>;
  if (!accounts) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:px-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-panel-2" />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
      </div>
    );
  }

  const leetcode = ordered.find((a) => a.platform === 'leetcode');
  const codeforces = ordered.find((a) => a.platform === 'codeforces');
  const colors = DIFFICULTY_COLORS[dark ? 'dark' : 'light'];
  const buckets = codeforces?.details.ratingBuckets ?? [];

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">Stats</h1>
      <p className="mt-1.5 text-[14px] text-muted">Ratings, difficulty and topics from the judge profiles you linked.</p>

      {ordered.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-panel px-6 py-14 text-center">
          <h2 className="text-[16px] font-semibold">Link a judge profile first</h2>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[13.5px] text-muted">
            Add your Codeforces, LeetCode, CodeChef or AtCoder username on your profile, and your ratings and topics show up here.
          </p>
          <Link href="/profile" className="btn-primary mt-5 inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium">
            Go to Judge profiles
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mt-8 mb-3 text-[12px] font-semibold tracking-[0.06em] text-subtle uppercase">Ratings</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {ordered.map((a) => (
              <RatingCard key={a.platform} account={a} />
            ))}
          </div>

          {(leetcode || buckets.length > 0) && (
            <>
              <h2 className="mt-8 mb-3 text-[12px] font-semibold tracking-[0.06em] text-subtle uppercase">Difficulty</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {leetcode && (
                  <Card title={<JudgeName platform="leetcode" />} subtitle="Solved by difficulty">
                    <Donut
                      total={leetcode.stats.solved ?? 0}
                      caption="solved"
                      slices={[
                        { label: 'Easy', value: leetcode.stats.easy ?? 0, color: colors.easy },
                        { label: 'Medium', value: leetcode.stats.medium ?? 0, color: colors.medium },
                        { label: 'Hard', value: leetcode.stats.hard ?? 0, color: colors.hard },
                      ]}
                    />
                  </Card>
                )}
                {buckets.length > 0 && (
                  <Card title={<JudgeName platform="codeforces" />} subtitle="Solved by problem rating">
                    <Columns
                      data={(() => {
                        // Every rating step from the easiest to the hardest solved, gaps as zero.
                        const lo = buckets[0].rating;
                        const hi = buckets.at(-1)!.rating;
                        return Array.from({ length: (hi - lo) / 100 + 1 }, (_, i) => lo + i * 100).map((r) => ({ x: r, value: buckets.find((b) => b.rating === r)?.solved ?? 0 }));
                      })()}
                      label={(x) => String(x)}
                    />
                  </Card>
                )}
              </div>
            </>
          )}

          {ordered.some((a) => a.details.tags?.length) && (
            <>
              <h2 className="mt-8 mb-3 text-[12px] font-semibold tracking-[0.06em] text-subtle uppercase">Topics</h2>
              <Topics accounts={ordered} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The Stats tab of the profile. */
export const StatsTab = Overview;
