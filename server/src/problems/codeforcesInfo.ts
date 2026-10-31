/**
 * Topics and difficulty rating for Codeforces problems, from the official API's problem list (problemset.problems,
 * about 2 MB). The statement itself comes from the user's browser (the bookmark); this only adds what the API
 * publishes. Kept for 12 hours; a contest missing from the list (just finished) triggers an earlier refresh.
 */
type Info = { rating?: number; tags: string[] };

const KEEP_MS = 12 * 3_600_000;
const RETRY_MS = 10 * 60_000;

let problems: Map<string, Info> | null = null;
let fetchedAt = 0;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  const res = await fetch('https://codeforces.com/api/problemset.problems', { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json()) as {
    status: string;
    result?: { problems: { contestId?: number; index: string; rating?: number; tags: string[] }[] };
  };
  if (body.status !== 'OK' || !body.result) throw new Error('Codeforces API did not answer.');
  problems = new Map(body.result.problems.filter((p) => p.contestId).map((p) => [`${p.contestId}${p.index}`, { rating: p.rating, tags: p.tags }]));
  fetchedAt = Date.now();
}

/** Topics and rating for a problem like "2272B", or null (unknown, or the API is unreachable). Never throws. */
export async function codeforcesInfo(id: string): Promise<Info | null> {
  const age = Date.now() - fetchedAt;
  const stale = !problems || age > KEEP_MS || (!problems.has(id) && age > RETRY_MS);
  if (stale) {
    loading ??= load().finally(() => (loading = null));
    try {
      await loading;
    } catch {
      // Keep whatever we had; the import still works without topics.
    }
  }
  return problems?.get(id) ?? null;
}
