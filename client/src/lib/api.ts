import type { CompileInfo, DebugStep, GeneratedTest, ImportedProblem, Language, Platform, ServerConfig } from '../types';

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
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    // not JSON
  }
  if (res.status === 401) onUnauthorized?.();
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
  async config(): Promise<ServerConfig> {
    const res = await fetch('/api/config');
    if (!res.ok) throw await toError(res);
    return res.json();
  },

  async checkAccessKey(key: string): Promise<boolean> {
    const res = await fetch('/api/auth/check', { method: 'POST', headers: { 'x-access-key': key } });
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
