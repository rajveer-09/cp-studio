import type { Language } from '../runner/languages.js';

export const PLATFORMS = ['codeforces', 'codechef', 'leetcode', 'atcoder'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface ImportedProblem {
  platform: Platform;
  id: string;
  title: string;
  url: string;
  /** Markdown, math converted to plain text. */
  statement: string;
  tests: { input: string; expected: string }[];
  timeLimitMs?: number;
  /** LeetCode: the solution is a method, not a program reading stdin. */
  functionBased?: boolean;
  /** LeetCode's difficulty and topics, when the judge publishes them. */
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
  /** Codeforces difficulty rating (800, 900, …), once Codeforces publishes it. */
  rating?: number;
  snippets?: Partial<Record<Language, string>>;
  /** LeetCode: the snippet wrapped in a harness that runs one test from stdin (missing for design problems). */
  programs?: Partial<Record<Language, string>>;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const USER_AGENT = 'Mozilla/5.0 (compatible; CP-Studio/1.0; +https://github.com/rajveer-09/cp-studio)';

export async function request(url: string, site: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json', ...init.headers },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ImportError(`Couldn't reach ${site}. Try again in a moment.`, 502);
  }
  if (res.status === 404) throw new ImportError(`That problem doesn't exist on ${site}. Check the problem ID.`, 404);
  if (!res.ok) throw new ImportError(`${site} refused the request (HTTP ${res.status}). Try again later.`, 502);
  return res;
}

export const withNewline = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
