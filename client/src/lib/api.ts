import type { CompileInfo, DebugStep, GeneratedTest, ImportedProblem, Language, Platform, ProblemMeta, ServerConfig } from '../types';

const ACCESS_KEY_STORAGE = 'cp-studio-access-key';

export function getAccessKey(): string {
  try {
    return localStorage.getItem(ACCESS_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setAccessKey(key: string) {
  try {
    localStorage.setItem(ACCESS_KEY_STORAGE, key);
  } catch {
    // Storage blocked: the key lasts for this page load only.
  }
  memoryKey = key;
}

let memoryKey = getAccessKey();
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: () => void) => (onUnauthorized = handler);
let onSignInRequired: ((message: string) => void) | null = null;
export const setSignInRequiredHandler = (handler: (message: string) => void) => (onSignInRequired = handler);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const headers = () => ({ 'Content-Type': 'application/json', 'x-access-key': memoryKey });

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let signIn = false;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    signIn = body?.signIn === true;
  } catch {
    // not JSON
  }
  // A 401 means either "sign in to your account" or "enter the site's access key".
  if (res.status === 401) {
    if (signIn) onSignInRequired?.(message);
    else onUnauthorized?.();
  }
  return new ApiError(message, res.status);
}

async function send(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError('Cannot reach the server. Is it running?', 0);
  }
  if (!res.ok) throw await toError(res);
  return res;
}

const post = async <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => (await send(path, body, signal)).json();

/** Any method, for the account endpoints (/api/me). */
async function request<T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the server. Is it running?', 0);
  }
  if (!res.ok) throw await toError(res);
  return res.json();
}

export interface RemoteWorkspace {
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface HistoryProblem {
  platform: Platform;
  id: string;
  title: string;
  url: string;
  languages: Language[];
  firstOpenedAt: string;
  lastOpenedAt: string;
  solvedAt: string | null;
  submittedAt: string | null;
  /** Accepted on the judge (from a linked account). */
  acceptedAt: string | null;
}

/** What is saved to reopen a problem: the statement and samples, the tests, and the code per language. */
export interface ProblemSnapshot {
  meta?: ProblemMeta;
  statement?: string;
  tests?: { input: string; expected: string }[];
  code?: Partial<Record<Language, string>>;
}

export interface ActivityEvent {
  kind: 'run' | 'solved' | 'submit' | 'debug';
  language: Language;
  platform?: Platform;
  problemId?: string;
}

export interface JudgeAccount {
  platform: Platform;
  handle: string;
  stats: { solved?: number; rating?: number; maxRating?: number; rank?: string; easy?: number; medium?: number; hard?: number };
  syncedAt: string | null;
  error: string | null;
  details: {
    ratingHistory?: { t: number; rating: number; contest: string }[];
    tags?: { tag: string; solved: number }[];
    ratingBuckets?: { rating: number; solved: number }[];
    contest?: { rating: number; globalRanking: number; topPercentage: number; attended: number };
  };
}

export interface Streak {
  current: number;
  longest: number;
}

export interface Dashboard {
  /** YYYY-MM-DD in the user's time zone. */
  today: string;
  days: { day: string; runs: number; solved: number; judgeSolved: number; judgeSubmissions: number }[];
  coding: Streak;
  solving: Streak;
  activeDays: number;
  judges: { platform: Platform; solved: number; total: number }[];
  /** Linked judge usernames and what was read from them. */
  accounts: JudgeAccount[];
  languages: { language: Language; runs: number }[];
  practice: { sessions: number; runs: number };
  recent: { platform: Platform; id: string; title: string; url: string; solvedAt: string | null; submittedAt: string | null; lastOpenedAt: string }[];
}

export interface ProblemEvent {
  platform: Platform;
  id: string;
  title: string;
  url: string;
  event: 'opened' | 'solved' | 'submitted';
  language: Language;
  snapshot: ProblemSnapshot;
}

export interface RunResponse {
  compile: CompileInfo;
  results: {
    id: string;
    status: 'ok' | 'runtime_error' | 'time_limit' | 'output_limit' | 'internal_error';
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timeMs: number;
    message?: string;
  }[];
}

export interface AiContext {
  language: Language;
  cppStandard: string;
  code: string;
  problem: string;
  selection: { startLine: number; endLine: number; text: string } | null;
  compile: { ok: boolean; output: string } | null;
  resultsStale: boolean;
  tests: {
    index: number;
    active: boolean;
    input: string;
    expected: string;
    output?: string;
    stderr?: string;
    verdict?: string;
    timeMs?: number;
  }[];
}

export interface DebugResponse {
  compile: CompileInfo;
  maxSteps: number;
  steps: DebugStep[];
  truncated: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  errorLine?: number;
  exitCode: number | null;
}

export interface FixResponse {
  rootCause: string;
  changes: string[];
  summary: string;
  fixedCode: string;
}

export const api = {
  me: {
    workspace: () => request<RemoteWorkspace | null>('GET', '/me/workspace'),
    saveWorkspace: (data: unknown) => request<{ updatedAt: string }>('PUT', '/me/workspace', { data }),
    problems: () => request<{ problems: HistoryProblem[] }>('GET', '/me/problems'),
    problem: (platform: Platform, id: string) => request<ProblemSnapshot>('GET', `/me/problems/${platform}/${encodeURIComponent(id)}`),
    removeProblem: (platform: Platform, id: string) => request<{ ok: true }>('DELETE', `/me/problems/${platform}/${encodeURIComponent(id)}`),
    problemEvent: (event: ProblemEvent) => request<{ ok: true }>('POST', '/me/problems/events', event),
    activity: (event: ActivityEvent) => request<{ ok: true }>('POST', '/me/activity', event),
    judges: () => request<{ accounts: JudgeAccount[] }>('GET', '/me/judges'),
    linkJudge: (platform: Platform, handle: string) => request<{ accounts: JudgeAccount[] }>('PUT', '/me/judges/' + platform, { handle }),
    unlinkJudge: (platform: Platform) => request<{ accounts: JudgeAccount[] }>('DELETE', '/me/judges/' + platform),
    syncJudges: (force = false) => request<{ accounts: JudgeAccount[]; synced: number }>('POST', '/me/judges/sync', { force }),
    dashboard: (timeZone: string) => request<Dashboard>('GET', `/me/dashboard?tz=${encodeURIComponent(timeZone)}`),
  },

  async config(): Promise<ServerConfig> {
    const res = await fetch('/api/config');
    if (!res.ok) throw await toError(res);
    return res.json();
  },

  async checkAccessKey(key: string): Promise<boolean> {
    const res = await fetch('/api/access-key/check', { method: 'POST', headers: { 'x-access-key': key } });
    return res.ok;
  },

  run: (body: { language: Language; code: string; cppStandard: string; timeLimitMs: number; tests: { id: string; input: string }[] }) =>
    post<RunResponse>('/run', body),

  debug: (body: { language: Language; code: string; cppStandard: string; input: string; watches: string[] }) =>
    post<DebugResponse>('/debug', body),

  fix: (body: { context: AiContext; instruction: string }, signal: AbortSignal) => post<FixResponse>('/ai/fix', body, signal),

  tests: (
    body: { context: AiContext; count?: number; focus?: 'edge' | 'random' | 'mixed'; withExpected?: boolean },
    signal: AbortSignal,
  ) => post<{ tests: GeneratedTest[] }>('/ai/tests', body, signal),

  driver: (body: { language: Language; snippet: string; examples: { input: string; expected: string }[] }) =>
    post<{ code: string }>('/ai/driver', body),

  importProblem: (body: { platform: Platform; ref: string }) => post<ImportedProblem>('/problems/import', body),

  problemFromPage: (page: unknown) => post<ImportedProblem>('/problems/from-page', page),

  /** Streams a chat reply (Server-Sent Events over a POST request). */
  async chat(
    body: { history: { role: string; content: string }[]; prompt: string; command?: string; context: AiContext },
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ) {
    const res = await send('/ai/chat', body, signal);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!event.startsWith('data: ')) continue;
        const data = JSON.parse(event.slice(6));
        if (data.delta) onDelta(data.delta);
        if (data.error) throw new ApiError(data.error, 502);
      }
    }
  },
};
