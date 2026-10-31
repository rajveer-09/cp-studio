import { Router, type Response } from 'express';
import type { SignedInUser } from '../auth.js';
import { pool } from '../db.js';
import { fetchJudgeProfile, HANDLE_PATTERNS, JudgeUserNotFound, type JudgePlatform } from '../judges.js';

/**
 * A signed-in user's own data: their workspace (tabs, tests, templates, settings), kept as one document and
 * saved as they type, and the problems they have worked on. Mounted behind requireUser.
 */
export const meRouter = Router();

/** Creates the tables (idempotent); runs after the account tables exist. */
export async function migrateUserData(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    create table if not exists workspace (
      user_id text primary key references "user"(id) on delete cascade,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );
    create table if not exists user_problem (
      user_id text not null references "user"(id) on delete cascade,
      platform text not null,
      problem_id text not null,
      title text not null,
      url text not null,
      languages text[] not null default '{}',
      snapshot jsonb,
      first_opened_at timestamptz not null default now(),
      last_opened_at timestamptz not null default now(),
      solved_at timestamptz,
      submitted_at timestamptz,
      primary key (user_id, platform, problem_id)
    );
    create index if not exists user_problem_recent on user_problem (user_id, last_opened_at desc);
    create table if not exists activity (
      id bigserial primary key,
      user_id text not null references "user"(id) on delete cascade,
      kind text not null,
      language text not null,
      platform text,
      problem_id text,
      at timestamptz not null default now()
    );
    create index if not exists activity_user_time on activity (user_id, at);
    create table if not exists judge_account (
      user_id text not null references "user"(id) on delete cascade,
      platform text not null,
      handle text not null,
      stats jsonb not null default '{}'::jsonb,
      cursor bigint not null default 0,
      synced_at timestamptz,
      error text,
      primary key (user_id, platform)
    );
    alter table judge_account add column if not exists details jsonb not null default '{}'::jsonb;
    create table if not exists judge_solve (
      user_id text not null references "user"(id) on delete cascade,
      platform text not null,
      problem_id text not null,
      title text not null,
      url text not null,
      rating int,
      solved_at timestamptz not null,
      primary key (user_id, platform, problem_id)
    );
    create index if not exists judge_solve_time on judge_solve (user_id, solved_at);
    create table if not exists judge_day (
      user_id text not null references "user"(id) on delete cascade,
      platform text not null,
      day date not null,
      submissions int not null,
      primary key (user_id, platform, day)
    );
  `);
}

const PLATFORMS = new Set(['codeforces', 'leetcode', 'codechef', 'atcoder']);
const LANGUAGES = new Set(['cpp', 'java', 'python']);
const EVENTS = new Set(['opened', 'solved', 'submitted']);
const ACTIVITY = new Set(['run', 'solved', 'submit', 'debug']);
const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 1024 * 1024;

const userId = (res: Response) => (res.locals.user as SignedInUser).id;
const text = (value: unknown, max: number) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);

meRouter.use((_req, res, next) => (pool ? next() : res.status(503).json({ error: 'Accounts are not set up on this server.' })));

meRouter.get('/workspace', async (_req, res) => {
  const { rows } = await pool!.query('select data, updated_at from workspace where user_id = $1', [userId(res)]);
  res.set('Cache-Control', 'no-store').json(rows[0] ? { data: rows[0].data, updatedAt: rows[0].updated_at } : null);
});

meRouter.put('/workspace', async (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Missing workspace.' });
  const json = JSON.stringify(data);
  if (json.length > MAX_WORKSPACE_BYTES) return res.status(413).json({ error: 'Your workspace is too large to save (4 MB at most). Close some tabs.' });
  const { rows } = await pool!.query(
    `insert into workspace (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set data = excluded.data, updated_at = now()
     returning updated_at`,
    [userId(res), json],
  );
  res.json({ updatedAt: rows[0].updated_at });
});

meRouter.get('/problems', async (_req, res) => {
  const { rows } = await pool!.query(
    `select p.platform, p.problem_id as "id", p.title, p.url, p.languages,
            p.first_opened_at as "firstOpenedAt", p.last_opened_at as "lastOpenedAt",
            p.solved_at as "solvedAt", p.submitted_at as "submittedAt", j.solved_at as "acceptedAt"
     from user_problem p
     left join judge_solve j on j.user_id = p.user_id and j.platform = p.platform and j.problem_id = p.problem_id
     where p.user_id = $1 order by p.last_opened_at desc limit 2000`,
    [userId(res)],
  );
  res.set('Cache-Control', 'no-store').json({ problems: rows });
});

meRouter.get('/problems/:platform/:id', async (req, res) => {
  const { rows } = await pool!.query('select snapshot from user_problem where user_id = $1 and platform = $2 and problem_id = $3', [
    userId(res),
    req.params.platform,
    req.params.id,
  ]);
  if (!rows[0]?.snapshot) return res.status(404).json({ error: 'That problem is not in your history.' });
  res.json(rows[0].snapshot);
});

meRouter.delete('/problems/:platform/:id', async (req, res) => {
  await pool!.query('delete from user_problem where user_id = $1 and platform = $2 and problem_id = $3', [userId(res), req.params.platform, req.params.id]);
  res.json({ ok: true });
});

/**
 * Records that a problem was opened, solved (all sample tests passed) or submitted, with a snapshot for reopening
 * it later: the statement and tests, and the code per language (merged with what was saved before).
 */
meRouter.post('/problems/events', async (req, res) => {
  const { platform, event, language, snapshot } = req.body ?? {};
  const id = text(req.body?.id, 120);
  const title = text(req.body?.title, 300);
  const url = text(req.body?.url, 600);
  if (!PLATFORMS.has(platform) || !EVENTS.has(event) || !LANGUAGES.has(language) || !id || !title || !url) {
    return res.status(400).json({ error: 'Invalid problem event.' });
  }
  const snapshotJson = snapshot && typeof snapshot === 'object' ? JSON.stringify(snapshot) : null;
  if (snapshotJson && snapshotJson.length > MAX_SNAPSHOT_BYTES) return res.status(413).json({ error: 'Problem snapshot is too large.' });

  await pool!.query(
    `insert into user_problem (user_id, platform, problem_id, title, url, languages, snapshot, solved_at, submitted_at)
     values ($1, $2, $3, $4, $5, array[$6]::text[], $7::jsonb,
             case when $8 = 'solved' then now() end, case when $8 = 'submitted' then now() end)
     on conflict (user_id, platform, problem_id) do update set
       title = excluded.title,
       url = excluded.url,
       languages = array(select distinct unnest(user_problem.languages || excluded.languages)),
       snapshot = case when excluded.snapshot is null then user_problem.snapshot
                       else coalesce(user_problem.snapshot, '{}'::jsonb) || excluded.snapshot
                            || jsonb_build_object('code', coalesce(user_problem.snapshot->'code', '{}'::jsonb) || coalesce(excluded.snapshot->'code', '{}'::jsonb))
                  end,
       last_opened_at = now(),
       solved_at = coalesce(user_problem.solved_at, excluded.solved_at),
       submitted_at = coalesce(excluded.submitted_at, user_problem.submitted_at)`,
    [userId(res), platform, id, title, url, language, snapshotJson, event],
  );
  res.json({ ok: true });
});

/** One thing done in the editor: a run, a solve (all sample tests passed), a submit, a debug session. */
meRouter.post('/activity', async (req, res) => {
  const { kind, language, platform } = req.body ?? {};
  const problemId = req.body?.problemId == null ? null : text(req.body.problemId, 120);
  if (!ACTIVITY.has(kind) || !LANGUAGES.has(language) || (platform != null && !PLATFORMS.has(platform))) {
    return res.status(400).json({ error: 'Invalid activity.' });
  }
  await pool!.query('insert into activity (user_id, kind, language, platform, problem_id) values ($1, $2, $3, $4, $5)', [
    userId(res),
    kind,
    language,
    platform ?? null,
    platform ? problemId : null,
  ]);
  res.json({ ok: true });
});

const validTimeZone = (tz: unknown): string => {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
};

const shiftDay = (day: string, by: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

/** The run of days ending today (or yesterday: today's practice may still come), and the longest run ever. */
export function streaks(days: Set<string>, today: string): { current: number; longest: number } {
  let current = 0;
  for (let day = days.has(today) ? today : shiftDay(today, -1); days.has(day); day = shiftDay(day, -1)) current++;
  let longest = 0;
  for (const day of days) {
    if (days.has(shiftDay(day, -1))) continue; // only count from the start of each run
    let length = 0;
    for (let d = day; days.has(d); d = shiftDay(d, 1)) length++;
    longest = Math.max(longest, length);
  }
  return { current, longest };
}

/**
 * Everything the dashboard shows, with days counted in the user's time zone: a year of daily activity, two
 * streaks (coding: any run; solving: a problem solved), totals per judge and language, and practice sessions
 * (runs with no problem loaded; a new session starts after 30 minutes without a run).
 */
meRouter.get('/dashboard', async (req, res) => {
  const tz = validTimeZone(req.query.tz);
  const id = userId(res);
  const db = pool!;
  const [daily, judges, languages, practice, recent, today, solvedDays] = await Promise.all([
    db.query(
      `select to_char((at at time zone $2)::date, 'YYYY-MM-DD') as day,
              count(*) filter (where kind = 'run')::int as runs,
              count(distinct problem_id) filter (where kind = 'solved')::int as solved
       from activity where user_id = $1 and at > now() - interval '380 days'
       group by 1`,
      [id, tz],
    ),
    db.query(
      `select platform, count(*) filter (where solved_at is not null)::int as solved, count(*)::int as total
       from user_problem where user_id = $1 group by platform`,
      [id],
    ),
    db.query(`select language, count(*)::int as runs from activity where user_id = $1 and kind = 'run' group by language`, [id]),
    db.query(
      `select count(*) filter (where prev is null or at - prev > interval '30 minutes')::int as sessions, count(*)::int as runs
       from (select at, lag(at) over (order by at) as prev from activity where user_id = $1 and kind = 'run' and problem_id is null) r`,
      [id],
    ),
    db.query(
      `select platform, problem_id as id, title, url, solved_at as "solvedAt", submitted_at as "submittedAt", last_opened_at as "lastOpenedAt"
       from user_problem where user_id = $1 order by last_opened_at desc limit 6`,
      [id],
    ),
    db.query(`select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as day`, [tz]),
    // Problems solved before runs were logged still count on the day they were solved.
    db.query(
      `select distinct to_char((solved_at at time zone $2)::date, 'YYYY-MM-DD') as day
       from user_problem where user_id = $1 and solved_at is not null`,
      [id, tz],
    ),
  ]);
  // From linked judge accounts: accepted problems per day (any time, for streaks) and LeetCode's daily submissions.
  const [judgeSolved, judgeSubmissions, accounts] = await Promise.all([
    db.query(
      `select to_char((solved_at at time zone $2)::date, 'YYYY-MM-DD') as day, count(*)::int as solved
       from judge_solve where user_id = $1 group by 1`,
      [id, tz],
    ),
    db.query(
      `select to_char(day, 'YYYY-MM-DD') as day, sum(submissions)::int as submissions
       from judge_day where user_id = $1 and day > current_date - 380 group by 1`,
      [id],
    ),
    accountsOf(id),
  ]);

  type Day = { day: string; runs: number; solved: number; judgeSolved: number; judgeSubmissions: number };
  const days = new Map<string, Day>();
  const dayOf = (day: string) => days.get(day) ?? days.set(day, { day, runs: 0, solved: 0, judgeSolved: 0, judgeSubmissions: 0 }).get(day)!;
  for (const r of daily.rows) Object.assign(dayOf(r.day), { runs: r.runs, solved: r.solved });
  for (const r of judgeSolved.rows) dayOf(r.day).judgeSolved = r.solved;
  for (const r of judgeSubmissions.rows) dayOf(r.day).judgeSubmissions = r.submissions;

  const todayKey: string = today.rows[0].day;
  const solvingDays = new Set<string>([
    ...daily.rows.filter((r) => r.solved > 0).map((r) => r.day),
    ...solvedDays.rows.map((r) => r.day),
    ...judgeSolved.rows.map((r) => r.day),
  ]);
  const codingDays = new Set<string>([
    ...daily.rows.filter((r) => r.runs > 0).map((r) => r.day),
    ...judgeSubmissions.rows.filter((r) => r.submissions > 0).map((r) => r.day),
    ...solvingDays,
  ]);
  const yearAgo = shiftDay(todayKey, -371);

  res.set('Cache-Control', 'no-store').json({
    today: todayKey,
    days: [...days.values()].filter((d) => d.day > yearAgo),
    coding: streaks(codingDays, todayKey),
    solving: streaks(solvingDays, todayKey),
    activeDays: [...codingDays].filter((d) => d > yearAgo).length,
    judges: judges.rows,
    accounts,
    languages: languages.rows,
    practice: practice.rows[0],
    recent: recent.rows,
  });
});

// ---- Linked judge accounts ----

/** Automatic syncs happen at most this often; "Sync now" a little more often. */
const AUTO_SYNC_MS = 6 * 3_600_000;
const MANUAL_SYNC_MS = 2 * 60_000;

const accountsOf = async (id: string) =>
  (
    await pool!.query(
      `select platform, handle, stats, details, synced_at as "syncedAt", error from judge_account where user_id = $1 order by platform`,
      [id],
    )
  ).rows;

/** Reads the judge and stores what's new. Errors are kept on the account (shown to the user), not thrown. */
async function syncAccount(id: string, platform: JudgePlatform, handle: string, cursor: number): Promise<void> {
  try {
    const profile = await fetchJudgeProfile(platform, handle, cursor);
    // One row per problem (LeetCode's recent list repeats a problem accepted twice), at its first acceptance.
    const first = new Map<string, (typeof profile.solves)[number]>();
    for (const s of profile.solves) if (!first.has(s.problemId) || first.get(s.problemId)!.solvedAt > s.solvedAt) first.set(s.problemId, s);
    const solves = [...first.values()];
    if (solves.length) {
      await pool!.query(
        `insert into judge_solve (user_id, platform, problem_id, title, url, rating, solved_at)
         select $1, $2, * from unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::timestamptz[])
         on conflict (user_id, platform, problem_id) do update set
           title = excluded.title, url = excluded.url, rating = coalesce(excluded.rating, judge_solve.rating),
           solved_at = least(judge_solve.solved_at, excluded.solved_at)`,
        [id, platform, solves.map((s) => s.problemId), solves.map((s) => s.title), solves.map((s) => s.url), solves.map((s) => s.rating), solves.map((s) => s.solvedAt)],
      );
    }
    if (profile.days?.length) {
      await pool!.query(
        `insert into judge_day (user_id, platform, day, submissions)
         select $1, $2, * from unnest($3::date[], $4::int[])
         on conflict (user_id, platform, day) do update set submissions = excluded.submissions`,
        [id, platform, profile.days.map((d) => d.day), profile.days.map((d) => d.submissions)],
      );
    }
    await pool!.query(
      `update judge_account set handle = $3, stats = $4, cursor = greatest(cursor, $5), details = $6, synced_at = now(), error = null where user_id = $1 and platform = $2`,
      [id, platform, profile.handle, JSON.stringify(profile.stats), profile.cursor ?? 0, JSON.stringify(profile.details)],
    );
  } catch (err) {
    if (!(err instanceof JudgeUserNotFound)) console.error(`Judge sync (${platform}):`, err instanceof Error ? err.message : err);
    const message = err instanceof JudgeUserNotFound ? `No ${platform} user named “${handle}”.` : 'The judge didn’t answer. It will be tried again later.';
    await pool!.query(`update judge_account set synced_at = now(), error = $3 where user_id = $1 and platform = $2`, [id, platform, message]);
  }
}

meRouter.get('/judges', async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ accounts: await accountsOf(userId(res)) });
});

/** Links (or changes) a username; the profile must exist on the judge. */
meRouter.put('/judges/:platform', async (req, res) => {
  const platform = req.params.platform as JudgePlatform;
  const handle = typeof req.body?.handle === 'string' ? req.body.handle.trim().replace(/^@/, '') : '';
  if (!PLATFORMS.has(platform)) return res.status(400).json({ error: 'Unknown judge.' });
  if (!HANDLE_PATTERNS[platform].test(handle)) return res.status(400).json({ error: 'That doesn’t look like a username on this judge.' });

  let profile;
  try {
    profile = await fetchJudgeProfile(platform, handle, 0);
  } catch (err) {
    if (err instanceof JudgeUserNotFound) return res.status(404).json({ error: `There’s no user “${handle}” on this judge.` });
    return res.status(502).json({ error: 'The judge didn’t answer. Try again in a minute.' });
  }
  const id = userId(res);
  // A different username replaces everything read for the old one.
  const existing = await pool!.query('select handle from judge_account where user_id = $1 and platform = $2', [id, platform]);
  if (existing.rows[0] && existing.rows[0].handle.toLowerCase() !== profile.handle.toLowerCase()) {
    await pool!.query('delete from judge_solve where user_id = $1 and platform = $2', [id, platform]);
    await pool!.query('delete from judge_day where user_id = $1 and platform = $2', [id, platform]);
  }
  await pool!.query(
    `insert into judge_account (user_id, platform, handle, cursor) values ($1, $2, $3, 0)
     on conflict (user_id, platform) do update set handle = excluded.handle, cursor = 0, error = null`,
    [id, platform, profile.handle],
  );
  await syncAccount(id, platform, profile.handle, 0);
  res.json({ accounts: await accountsOf(id) });
});

meRouter.delete('/judges/:platform', async (req, res) => {
  const id = userId(res);
  for (const table of ['judge_account', 'judge_solve', 'judge_day']) {
    await pool!.query(`delete from ${table} where user_id = $1 and platform = $2`, [id, req.params.platform]);
  }
  res.json({ accounts: await accountsOf(id) });
});

/** Brings linked accounts up to date: those not synced for a while, or all of them ("Sync now"). */
meRouter.post('/judges/sync', async (req, res) => {
  const id = userId(res);
  const minAge = req.body?.force ? MANUAL_SYNC_MS : AUTO_SYNC_MS;
  const { rows } = await pool!.query(
    `select platform, handle, cursor from judge_account where user_id = $1 and (synced_at is null or synced_at < now() - make_interval(secs => $2) or details = '{}'::jsonb)`,
    [id, minAge / 1000],
  );
  await Promise.all(rows.map((r) => syncAccount(id, r.platform, r.handle, Number(r.cursor))));
  res.json({ accounts: await accountsOf(id), synced: rows.length });
});
