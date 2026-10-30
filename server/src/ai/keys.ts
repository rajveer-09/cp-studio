import { ApiError, GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

interface PooledKey {
  number: number;
  client: GoogleGenAI;
  /** Per model: not used again before this time (ms since epoch). Gemini counts quota per project and model. */
  restingUntil: Map<string, number>;
}

/** The main model first, then the fallbacks. */
export const MODELS = [...new Set([config.gemini.model, ...config.gemini.fallbackModels])];

const pool: PooledKey[] = config.gemini.apiKeys.map((apiKey, i) => ({
  number: i + 1,
  client: new GoogleGenAI({
    apiKey,
    // Gemini occasionally returns a transient 503; retry quickly instead of failing the request.
    httpOptions: { retryOptions: { attempts: 3, initialDelay: 1, maxDelay: 4, httpStatusCodes: [500, 502, 503, 504] } },
  }),
  restingUntil: new Map(),
}));
let cursor = 0;

export class AllKeysRestingError extends Error {
  constructor(readonly availableAt: number) {
    super('All Gemini API keys have reached their quota.');
  }
}

const isResting = (key: PooledKey, model: string, now = Date.now()) => (key.restingUntil.get(model) ?? 0) > now;

/** How many keys can still use each model, and which model the next request will use. */
export function keyStatus() {
  const now = Date.now();
  const available = (model: string) => pool.filter((k) => !isResting(k, model, now)).length;
  return {
    total: pool.length,
    available: available(MODELS[0]),
    activeModel: MODELS.find((m) => !isBusy(m, now) && available(m) > 0) ?? null,
  };
}

/** Free-tier daily quotas reset at midnight Pacific time. */
function msUntilPacificMidnight(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date())
    .reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {});
  const elapsed = ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second) * 1000;
  return 24 * 3600 * 1000 - elapsed + 60_000;
}

/** How long a key should rest after this error, or null when the error isn't about the key. */
function restFor(err: unknown): { ms: number; reason: string; allModels: boolean } | null {
  if (!(err instanceof ApiError)) return null;
  const message = err.message;
  if (err.status === 429) {
    const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(message);
    const retryMs = delay ? Math.ceil(Number(delay[1]) * 1000) : 60_000;
    if (/PerDay|per day|daily/i.test(message)) {
      return { ms: Math.max(retryMs, msUntilPacificMidnight()), reason: 'daily quota used up', allModels: false };
    }
    return { ms: retryMs, reason: 'rate limit', allModels: false };
  }
  if (err.status === 401 || err.status === 403 || (err.status === 400 && /api[_ ]key/i.test(message))) {
    return { ms: 60 * 60_000, reason: 'key rejected', allModels: true };
  }
  return null;
}

/** Overloaded models (5xx after the SDK's own retries) cool down for a minute; requests use the next model. */
const BUSY_COOLDOWN_MS = 60_000;
const busyUntil = new Map<string, number>();
const isBusy = (model: string, now = Date.now()) => (busyUntil.get(model) ?? 0) > now;

export class GeminiBusyError extends Error {
  constructor() {
    super('Gemini is busy right now.');
  }
}

/** An overloaded model or a dropped connection: worth trying another model, not resting the key. */
function isTransient(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500 || err.status === 408;
  if (!(err instanceof Error) || err.name === 'AbortError' || err.name === 'TimeoutError') return false;
  const cause = (err as { cause?: { code?: string } }).cause?.code ?? '';
  return /fetch failed|network|socket|terminated|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(`${err.message} ${cause}`);
}

/** Picks keys in turn (spreading the per-minute limits) and skips resting ones. */
function nextKey(model: string, tried: Set<PooledKey>): PooledKey | undefined {
  const now = Date.now();
  for (let i = 0; i < pool.length; i++) {
    const key = pool[(cursor + i) % pool.length];
    if (!isResting(key, model, now) && !tried.has(key)) {
      cursor = (cursor + i + 1) % pool.length;
      return key;
    }
  }
  return undefined;
}

/**
 * Runs a Gemini call with a healthy key. When a key hits its quota (or is rejected) it rests until
 * its quota refills and the call moves on to the next key; once every key is out of quota on a
 * model, or the model is overloaded, the next model in MODELS is used.
 */
export async function withKey<T>(task: (client: GoogleGenAI, model: string, keyNumber: number) => Promise<T>): Promise<T> {
  let busy = false;
  for (const model of MODELS) {
    if (isBusy(model)) {
      busy = true;
      continue;
    }
    const tried = new Set<PooledKey>();
    for (let key = nextKey(model, tried); key; key = nextKey(model, tried)) {
      tried.add(key);
      try {
        return await task(key.client, model, key.number);
      } catch (err) {
        if (isTransient(err)) {
          busy = true;
          busyUntil.set(model, Date.now() + BUSY_COOLDOWN_MS);
          console.warn(`[ai] ${model} unavailable (${err instanceof Error ? err.message.slice(0, 80) : 'error'}); using the next model for a minute`);
          break;
        }
        const rest = restFor(err);
        if (!rest) throw err;
        const until = Date.now() + rest.ms;
        for (const m of rest.allModels ? MODELS : [model]) key.restingUntil.set(m, until);
        console.warn(`[ai] key #${key.number} resting on ${rest.allModels ? 'all models' : model} for ${Math.max(1, Math.round(rest.ms / 60_000))} min (${rest.reason})`);
      }
    }
  }
  if (busy) throw new GeminiBusyError();
  throw new AllKeysRestingError(Math.min(...pool.flatMap((k) => MODELS.map((m) => k.restingUntil.get(m) ?? 0))));
}
