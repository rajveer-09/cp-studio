/**
 * Reads a user's public profile on each judge, from the judge's own API where there is one: Codeforces (official
 * API), AtCoder (AtCoder Problems, a community API), LeetCode (its public GraphQL profile) and CodeChef (the
 * profile page; it has no API). Only public data, by username: no passwords, nothing written to the judges.
 */
export type JudgePlatform = 'codeforces' | 'atcoder' | 'leetcode' | 'codechef';

export interface JudgeSolve {
  problemId: string;
  title: string;
  url: string;
  rating: number | null;
  /** When the first accepted submission was made. */
  solvedAt: Date;
}

export interface JudgeStats {
  solved: number;
  rating?: number;
  maxRating?: number;
  rank?: string;
  easy?: number;
  medium?: number;
  hard?: number;
}

export interface JudgeProfile {
  /** The handle as the judge spells it. */
  handle: string;
  stats: JudgeStats;
  solves: JudgeSolve[];
  /** LeetCode: submissions per (UTC) day from its calendar. */
  days?: { day: string; submissions: number }[];
  /** AtCoder: where to continue next time (seconds), so later syncs only read new submissions. */
  cursor?: number;
  /** For the Stats page. */
  details: JudgeDetails;
}

export interface JudgeDetails {
  /** One point per rated contest. */
  ratingHistory?: { t: number; rating: number; contest: string }[];
  /** Problems solved per topic (Codeforces tags, LeetCode topics). */
  tags?: { tag: string; solved: number }[];
  /** Codeforces: problems solved per problem rating (800, 900, …). */
  ratingBuckets?: { rating: number; solved: number }[];
  /** LeetCode's contest standing. */
  contest?: { rating: number; globalRanking: number; topPercentage: number; attended: number };
}

const byCount = (counts: Map<string, number>) =>
  [...counts].map(([tag, solved]) => ({ tag, solved })).sort((a, b) => b.solved - a.solved || a.tag.localeCompare(b.tag));

/** A second request for extras (rating history): if it fails, the main profile still counts. */
const optional = <T>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);

export class JudgeUserNotFound extends Error {}

export const HANDLE_PATTERNS: Record<JudgePlatform, RegExp> = {
  codeforces: /^[A-Za-z0-9_.-]{3,24}$/,
  atcoder: /^[A-Za-z0-9_]{3,16}$/,
  leetcode: /^[A-Za-z0-9_.-]{1,40}$/,
  codechef: /^[A-Za-z0-9_.]{1,30}$/,
};

const USER_AGENT = 'Mozilla/5.0 (compatible; CP-Studio; +https://cp-studio.onrender.com)';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) throw new JudgeUserNotFound();
  const body = await res.json().catch(() => null);
  if (!res.ok && !body) throw new Error(`HTTP ${res.status}`);
  return body;
}

async function codeforces(handle: string): Promise<JudgeProfile> {
  type Info = { status: string; comment?: string; result?: { handle: string; rating?: number; maxRating?: number; rank?: string }[] };
  const info = (await fetchJson(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`)) as Info;
  if (info.status !== 'OK' || !info.result?.[0]) {
    if (/not found/i.test(info.comment ?? '')) throw new JudgeUserNotFound();
    throw new Error(info.comment || 'Codeforces did not answer.');
  }
  const user = info.result[0];
  type Submission = { verdict?: string; creationTimeSeconds: number; problem: { contestId?: number; index: string; name: string; rating?: number; tags?: string[] } };
  type Change = { contestName: string; ratingUpdateTimeSeconds: number; newRating: number };
  const [status, history] = await Promise.all([
    fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(user.handle)}`) as Promise<{ status: string; result?: Submission[] }>,
    optional(fetchJson(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(user.handle)}`) as Promise<{ status: string; result?: Change[] }>),
  ]);
  if (status.status !== 'OK') throw new Error('Codeforces did not return the submissions.');

  const solves = new Map<string, JudgeSolve>();
  const tagsOf = new Map<string, string[]>();
  for (const s of status.result ?? []) {
    if (s.verdict !== 'OK' || !s.problem.contestId) continue;
    const id = `${s.problem.contestId}${s.problem.index}`;
    tagsOf.set(id, s.problem.tags ?? []);
    const at = new Date(s.creationTimeSeconds * 1000);
    const known = solves.get(id);
    if (known && known.solvedAt <= at) continue;
    const gym = s.problem.contestId >= 100000;
    solves.set(id, {
      problemId: id,
      title: `${s.problem.index}. ${s.problem.name}`,
      url: `https://codeforces.com/${gym ? 'gym' : 'contest'}/${s.problem.contestId}/problem/${s.problem.index}`,
      rating: s.problem.rating ?? null,
      solvedAt: at,
    });
  }
  const tags = new Map<string, number>();
  for (const list of tagsOf.values()) for (const tag of list) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  const buckets = new Map<number, number>();
  for (const s of solves.values()) if (s.rating) buckets.set(s.rating, (buckets.get(s.rating) ?? 0) + 1);
  return {
    handle: user.handle,
    stats: { solved: solves.size, rating: user.rating, maxRating: user.maxRating, rank: user.rank },
    solves: [...solves.values()],
    details: {
      ratingHistory: history?.status === 'OK' ? (history.result ?? []).map((c) => ({ t: c.ratingUpdateTimeSeconds, rating: c.newRating, contest: c.contestName })) : undefined,
      tags: byCount(tags),
      ratingBuckets: [...buckets].map(([rating, solved]) => ({ rating, solved })).sort((a, b) => a.rating - b.rating),
    },
  };
}

/** AtCoder Problems asks for at most one request a second; each returns up to 500 submissions. */
async function atcoder(handle: string, fromSecond: number): Promise<JudgeProfile> {
  const base = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user';
  const rank = (await fetchJson(`${base}/ac_rank?user=${encodeURIComponent(handle)}`)) as { count?: number } | null;
  if (!rank || typeof rank.count !== 'number') throw new JudgeUserNotFound();
  type Submission = { epoch_second: number; problem_id: string; contest_id: string; result: string; point: number };
  const solves = new Map<string, JudgeSolve>();
  let cursor = fromSecond;
  for (let page = 0; page < 12; page++) {
    await sleep(1100);
    const batch = (await fetchJson(`${base}/submissions?user=${encodeURIComponent(handle)}&from_second=${cursor}`)) as Submission[];
    for (const s of batch) {
      if (s.result !== 'AC') continue;
      const at = new Date(s.epoch_second * 1000);
      const known = solves.get(s.problem_id);
      if (known && known.solvedAt <= at) continue;
      solves.set(s.problem_id, {
        problemId: s.problem_id,
        title: s.problem_id,
        url: `https://atcoder.jp/contests/${s.contest_id}/tasks/${s.problem_id}`,
        rating: null,
        solvedAt: at,
      });
    }
    if (batch.length) cursor = Math.max(cursor, ...batch.map((s) => s.epoch_second + 1));
    if (batch.length < 500) break;
  }
  // Rating history comes from AtCoder itself (public JSON).
  type Contest = { IsRated: boolean; NewRating: number; EndTime: string; ContestName: string };
  const history = (await optional(fetchJson(`https://atcoder.jp/users/${encodeURIComponent(handle)}/history/json`))) as Contest[] | null;
  const rated = (history ?? []).filter((c) => c.IsRated);
  const ratings = rated.map((c) => c.NewRating);
  return {
    handle,
    stats: { solved: rank.count, ...(ratings.length ? { rating: ratings.at(-1), maxRating: Math.max(...ratings) } : {}) },
    solves: [...solves.values()],
    cursor,
    details: history ? { ratingHistory: rated.map((c) => ({ t: Math.floor(Date.parse(c.EndTime) / 1000), rating: c.NewRating, contest: c.ContestName })) } : {},
  };
}

/** LeetCode's calendar is keyed by timestamps; several can fall on the same day. */
function perDay(calendar: Record<string, number>): { day: string; submissions: number }[] {
  const days = new Map<string, number>();
  for (const [seconds, count] of Object.entries(calendar)) {
    const day = new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + Number(count));
  }
  return [...days].map(([day, submissions]) => ({ day, submissions }));
}

async function leetcode(handle: string): Promise<JudgeProfile> {
  const query = `query($u: String!) {
    matchedUser(username: $u) {
      username
      submitStatsGlobal { acSubmissionNum { difficulty count } }
      userCalendar { submissionCalendar }
      tagProblemCounts { advanced { tagName problemsSolved } intermediate { tagName problemsSolved } fundamental { tagName problemsSolved } }
    }
    recentAcSubmissionList(username: $u, limit: 20) { title titleSlug timestamp }
    userContestRanking(username: $u) { rating globalRanking topPercentage attendedContestsCount }
    userContestRankingHistory(username: $u) { attended rating contest { title startTime } }
  }`;
  type TagCount = { tagName: string; problemsSolved: number };
  type Answer = {
    data?: {
      matchedUser: {
        username: string;
        submitStatsGlobal: { acSubmissionNum: { difficulty: string; count: number }[] };
        userCalendar?: { submissionCalendar: string };
        tagProblemCounts?: Record<'advanced' | 'intermediate' | 'fundamental', TagCount[]>;
      } | null;
      recentAcSubmissionList?: { title: string; titleSlug: string; timestamp: string }[] | null;
      userContestRanking?: { rating: number; globalRanking: number; topPercentage: number; attendedContestsCount: number } | null;
      userContestRankingHistory?: { attended: boolean; rating: number; contest: { title: string; startTime: number } }[] | null;
    };
  };
  const answer = (await fetchJson('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
    body: JSON.stringify({ query, variables: { u: handle } }),
  })) as Answer;
  const user = answer.data?.matchedUser;
  if (!user) throw new JudgeUserNotFound();
  const count = (difficulty: string) => user.submitStatsGlobal.acSubmissionNum.find((n) => n.difficulty === difficulty)?.count ?? 0;
  let calendar: Record<string, number> = {};
  try {
    calendar = JSON.parse(user.userCalendar?.submissionCalendar || '{}');
  } catch {
    // keep it empty
  }
  return {
    handle: user.username,
    stats: { solved: count('All'), easy: count('Easy'), medium: count('Medium'), hard: count('Hard') },
    solves: (answer.data?.recentAcSubmissionList ?? []).map((s) => ({
      problemId: s.titleSlug,
      title: s.title,
      url: `https://leetcode.com/problems/${s.titleSlug}/`,
      rating: null,
      solvedAt: new Date(Number(s.timestamp) * 1000),
    })),
    days: perDay(calendar),
    details: {
      tags: byCount(
        new Map(
          Object.values(user.tagProblemCounts ?? {})
            .flat()
            .filter((t) => t.problemsSolved > 0)
            .map((t) => [t.tagName, t.problemsSolved]),
        ),
      ),
      ratingHistory: (answer.data?.userContestRankingHistory ?? [])
        .filter((h) => h.attended)
        .map((h) => ({ t: h.contest.startTime, rating: Math.round(h.rating), contest: h.contest.title })),
      contest: answer.data?.userContestRanking
        ? {
            rating: Math.round(answer.data.userContestRanking.rating),
            globalRanking: answer.data.userContestRanking.globalRanking,
            topPercentage: answer.data.userContestRanking.topPercentage,
            attended: answer.data.userContestRanking.attendedContestsCount,
          }
        : undefined,
    },
  };
}

async function codechef(handle: string): Promise<JudgeProfile> {
  const res = await fetch(`https://www.codechef.com/users/${encodeURIComponent(handle)}`, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) throw new JudgeUserNotFound();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const solved = /Total Problems Solved:\s*(\d+)/.exec(html);
  if (!solved) throw new JudgeUserNotFound();
  const rating = /class="rating-number">\s*(\d+)/.exec(html);
  const stars = /class="rating"[^>]*>\s*(\d)\s*(?:&#9733;|★)/.exec(html);
  // The rating graph's data sits in the page as `var all_rating = [...];`.
  type Contest = { rating: string; name: string; end_date: string };
  let history: Contest[] = [];
  try {
    history = JSON.parse(/all_rating\s*=\s*(\[[\s\S]*?\]);/.exec(html)?.[1] ?? '[]');
  } catch {
    // no graph
  }
  const ratingHistory = history
    .map((c) => ({ t: Math.floor(Date.parse(c.end_date.replace(' ', 'T') + 'Z') / 1000), rating: Number(c.rating), contest: c.name }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.rating));
  return {
    handle,
    stats: {
      solved: Number(solved[1]),
      rating: rating ? Number(rating[1]) : ratingHistory.at(-1)?.rating,
      maxRating: ratingHistory.length ? Math.max(...ratingHistory.map((p) => p.rating)) : undefined,
      rank: stars ? `${stars[1]}★` : undefined,
    },
    solves: [],
    details: { ratingHistory },
  };
}

export function fetchJudgeProfile(platform: JudgePlatform, handle: string, cursor = 0): Promise<JudgeProfile> {
  if (platform === 'codeforces') return codeforces(handle);
  if (platform === 'atcoder') return atcoder(handle, cursor);
  if (platform === 'leetcode') return leetcode(handle);
  return codechef(handle);
}
