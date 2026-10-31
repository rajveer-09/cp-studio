import { importAtCoder } from './atcoder.js';
import { importCodeChef } from './codechef.js';
import { codeforcesInfo } from './codeforcesInfo.js';
import { importLeetCode } from './leetcode.js';
import { htmlToMarkdown } from './markdown.js';
import { ImportError, withNewline, type ImportedProblem, type Platform } from './types.js';

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<ImportedProblem> }>();

export function importProblem(platform: Platform, ref: string): Promise<ImportedProblem> {
  if (platform === 'codeforces') {
    // Codeforces blocks automated requests, so its problems come from the user's own browser (see fromCodeforcesPage).
    throw new ImportError('Codeforces problems are imported from your browser with the "Send to CP Studio" bookmark.');
  }
  const key = `${platform}:${ref.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const importer = { atcoder: importAtCoder, codechef: importCodeChef, leetcode: importLeetCode }[platform];
  const value = importer(ref);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}

export interface CodeforcesPage {
  url: string;
  title: string;
  timeLimit: string;
  html: string;
  tests: { input: string; expected: string }[];
}

/** A Codeforces problem read by the bookmark from the page the user has open, plus its topics and rating from the API. */
export async function fromCodeforcesPage(page: CodeforcesPage): Promise<ImportedProblem> {
  const id = /\/(?:contest|problemset\/problem|gym)\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)/.exec(page.url);
  const seconds = /([\d.]+)\s*second/i.exec(page.timeLimit);
  const info = id ? await codeforcesInfo(`${id[1]}${id[2].toUpperCase()}`) : null;
  return {
    platform: 'codeforces',
    id: id ? `${id[1]}${id[2].toUpperCase()}` : '',
    title: page.title.trim() || 'Codeforces problem',
    url: page.url,
    statement: htmlToMarkdown(page.html, page.url),
    tests: page.tests.map((t) => ({ input: withNewline(t.input), expected: withNewline(t.expected) })),
    timeLimitMs: seconds ? Math.round(Number(seconds[1]) * 1000) : undefined,
    tags: info?.tags.length ? info.tags : undefined,
    rating: info?.rating,
  };
}
