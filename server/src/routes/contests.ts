import { Router } from 'express';

/**
 * Upcoming (and running) contests on Codeforces, CodeChef, LeetCode and AtCoder. Each judge is read on its own and
 * cached, so one judge being down only hides its contests (its last good list is kept for a while).
 */
export const contestsRouter = Router();

type ContestPlatform = 'codeforces' | 'codechef' | 'leetcode' | 'atcoder';

export interface Contest {
  platform: ContestPlatform;
  id: string;
  name: string;
  url: string;
  /** Start, in ms since the epoch. */
  start: number;
  durationSeconds: number;
  /** A short label for the kind of round: "Div. 2", "ABC", "Weekly", "Starters"... */
  kind?: string;
  /** AtCoder: who it's rated for, e.g. "- 1999". */
  rated?: string;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; CP-Studio; +https://cp-studio.onrender.com)';
const FRESH_MS = 30 * 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000;
const HORIZON_MS = 35 * 24 * 60 * 60 * 1000;

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

function codeforcesKind(name: string): string | undefined {
  if (/educational/i.test(name)) return 'Educational';
  const div = /Div\.\s*(\d)(?:\s*\+\s*(\d))?/i.exec(name);
  if (div) return div[2] ? `Div. ${div[1]} + ${div[2]}` : `Div. ${div[1]}`;
  if (/global round/i.test(name)) return 'Global';
  if (/kotlin heroes/i.test(name)) return 'Kotlin';
  return undefined;
}

async function codeforces(): Promise<Contest[]> {
  type Item = { id: number; name: string; phase: string; durationSeconds: number; startTimeSeconds?: number };
  const body = (await (await get('https://codeforces.com/api/contest.list?gym=false')).json()) as { status: string; result?: Item[] };
  if (body.status !== 'OK' || !body.result) throw new Error('Codeforces did not answer.');
  return body.result
    .filter((c) => (c.phase === 'BEFORE' || c.phase === 'CODING') && c.startTimeSeconds)
    .map((c) => ({
      platform: 'codeforces',
      id: String(c.id),
      name: c.name,
      url: `https://codeforces.com/contests/${c.id}`,
      start: c.startTimeSeconds! * 1000,
      durationSeconds: c.durationSeconds,
      kind: codeforcesKind(c.name),
    }));
}

async function codechef(): Promise<Contest[]> {
  type Item = { contest_code: string; contest_name: string; contest_start_date_iso: string; contest_duration: string };
  const res = await get('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all', { headers: { Accept: 'application/json' } });
  const body = (await res.json()) as { status: string; present_contests?: Item[]; future_contests?: Item[] };
  if (body.status !== 'success') throw new Error('CodeChef did not answer.');
  return [...(body.present_contests ?? []), ...(body.future_contests ?? [])].map((c) => ({
    platform: 'codechef',
    id: c.contest_code,
    name: c.contest_name,
    url: `https://www.codechef.com/${c.contest_code}`,
    start: Date.parse(c.contest_start_date_iso),
    durationSeconds: Number(c.contest_duration) * 60,
    kind: /starters/i.test(c.contest_name) ? 'Starters' : undefined,
  }));
}

async function leetcode(): Promise<Contest[]> {
  type Item = { title: string; titleSlug: string; startTime: number; duration: number };
  const res = await get('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
    body: JSON.stringify({ query: '{ upcomingContests { title titleSlug startTime duration } }' }),
  });
  const body = (await res.json()) as { data?: { upcomingContests?: Item[] } };
  if (!body.data?.upcomingContests) throw new Error('LeetCode did not answer.');
  return body.data.upcomingContests.map((c) => ({
    platform: 'leetcode',
    id: c.titleSlug,
    name: c.title,
    url: `https://leetcode.com/contest/${c.titleSlug}/`,
    start: c.startTime * 1000,
    durationSeconds: c.duration,
    kind: /biweekly/i.test(c.title) ? 'Biweekly' : /weekly/i.test(c.title) ? 'Weekly' : undefined,
  }));
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

/** AtCoder has no API: the running and upcoming tables on its contests page are read instead. */
async function atcoder(): Promise<Contest[]> {
  const html = await (await get('https://atcoder.jp/contests/?lang=en')).text();
  const contests: Contest[] = [];
  for (const table of ['contest-table-action', 'contest-table-upcoming']) {
    const at = html.indexOf(`id="${table}"`);
    if (at < 0) continue;
    const body = html.slice(at, html.indexOf('</table>', at));
    for (const row of body.split(/<tr>/).slice(1)) {
      const time = /<time[^>]*>([^<]+)<\/time>/.exec(row);
      const link = /<a href="\/contests\/([\w-]+)">([\s\S]*?)<\/a>/.exec(row);
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
      const duration = cells.map((c) => /^(\d+):(\d{2})$/.exec(c)).find(Boolean);
      if (!time || !link || !duration) continue;
      // "2026-11-07 21:00:00+0900"
      const start = Date.parse(time[1].replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
      if (Number.isNaN(start)) continue;
      const id = link[1];
      contests.push({
        platform: 'atcoder',
        id,
        name: decode(link[2]),
        url: `https://atcoder.jp/contests/${id}`,
        start,
        durationSeconds: (Number(duration[1]) * 60 + Number(duration[2])) * 60,
        kind: /^(abc|arc|agc|ahc)\d/i.exec(id)?.[1].toUpperCase(),
        rated: cells[cells.length - 1] && cells[cells.length - 1] !== '-' ? cells[cells.length - 1] : undefined,
      });
    }
  }
  return contests;
}

const SOURCES: Record<ContestPlatform, () => Promise<Contest[]>> = { codeforces, codechef, leetcode, atcoder };
const cache = new Map<ContestPlatform, { at: number; contests: Contest[] }>();
const inFlight = new Map<ContestPlatform, Promise<void>>();

async function refresh(platform: ContestPlatform): Promise<void> {
  const running = inFlight.get(platform);
  if (running) return running;
  const job = SOURCES[platform]()
    .then((contests) => void cache.set(platform, { at: Date.now(), contests }))
    .catch((err) => console.warn(`Contests from ${platform} failed: ${err instanceof Error ? err.message : err}`))
    .finally(() => inFlight.delete(platform));
  inFlight.set(platform, job);
  return job;
}

contestsRouter.get('/', async (_req, res) => {
  const platforms = Object.keys(SOURCES) as ContestPlatform[];
  await Promise.all(platforms.filter((p) => Date.now() - (cache.get(p)?.at ?? 0) > FRESH_MS).map(refresh));

  const now = Date.now();
  const sources = {} as Record<ContestPlatform, 'ok' | 'error'>;
  const contests: Contest[] = [];
  for (const p of platforms) {
    const hit = cache.get(p);
    const usable = hit && now - hit.at < STALE_MS;
    sources[p] = usable ? 'ok' : 'error';
    if (usable) contests.push(...hit.contests.filter((c) => c.start + c.durationSeconds * 1000 > now && c.start < now + HORIZON_MS));
  }
  contests.sort((a, b) => a.start - b.start);
  res.set('Cache-Control', 'public, max-age=300').json({ contests, sources, now });
});
