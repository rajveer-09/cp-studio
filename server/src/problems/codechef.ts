import { image, normalizeMath } from './markdown.js';
import { ImportError, request, withNewline, type ImportedProblem } from './types.js';

/** FLOW001, START86/problems/CODE or a problem URL → { contest, code }. */
export function parseCodeChefRef(ref: string): { contest: string; code: string } {
  const url = /codechef\.com\/(?:([\w]+)\/)?problems\/([\w]+)/i.exec(ref);
  if (url) return { contest: url[1]?.toUpperCase() ?? 'PRACTICE', code: url[2].toUpperCase() };
  if (!/^[A-Za-z0-9_]{2,30}$/.test(ref.trim())) throw new ImportError('Use a CodeChef problem code like FLOW001, or paste the problem URL.');
  return { contest: 'PRACTICE', code: ref.trim().toUpperCase() };
}

interface CodeChefProblem {
  status?: string;
  message?: string;
  problem_name?: string;
  max_timelimit?: string | number;
  problemComponents?: {
    statement?: string;
    inputFormat?: string;
    outputFormat?: string;
    constraints?: string;
    sampleTestCases?: { input: string; output: string; isDeleted?: boolean }[];
  };
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? '';

/** CodeChef statements are Markdown with $…$ math and some inline HTML (images are kept, other tags dropped). */
const tidy = (markdown = '') =>
  normalizeMath(
    markdown
      .replace(/<img\b[^>]*>/gi, (tag) => image(attr(tag, 'src'), 'https://www.codechef.com/', attr(tag, 'alt'), attr(tag, 'width') || attr(tag, 'style')))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[a-z][^>]*>/gi, ''),
  )
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export async function importCodeChef(ref: string): Promise<ImportedProblem> {
  const { contest, code } = parseCodeChefRef(ref);
  const data = (await (await request(`https://www.codechef.com/api/contests/${contest}/problems/${code}`, 'CodeChef')).json()) as CodeChefProblem;
  if (data.status && data.status !== 'success') throw new ImportError(`CodeChef couldn't find ${code}. Check the problem code.`, 404);

  const parts = data.problemComponents ?? {};
  const sections = [
    tidy(parts.statement),
    parts.inputFormat && `### Input\n\n${tidy(parts.inputFormat)}`,
    parts.outputFormat && `### Output\n\n${tidy(parts.outputFormat)}`,
    parts.constraints && `### Constraints\n\n${tidy(parts.constraints)}`,
  ].filter(Boolean);
  const tests = (parts.sampleTestCases ?? [])
    .filter((t) => !t.isDeleted)
    .map((t) => ({ input: withNewline(t.input), expected: withNewline(t.output) }));
  if (!tests.length && !sections.length) throw new ImportError(`CodeChef returned no statement for ${code}.`, 404);

  const seconds = Number(data.max_timelimit);
  return {
    platform: 'codechef',
    id: code,
    title: data.problem_name || code,
    url: `https://www.codechef.com/problems/${code}`,
    statement: sections.join('\n\n'),
    tests,
    timeLimitMs: seconds > 0 ? Math.round(seconds * 1000) : undefined,
  };
}
