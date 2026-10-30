import { htmlToMarkdown, parseHtml } from './markdown.js';
import { ImportError, request, withNewline, type ImportedProblem } from './types.js';

/** abc300_a, abc300a, "ABC300 A", abc300/a or a task URL → { contest, task }. */
export function parseAtCoderRef(ref: string): { contest: string; task: string } {
  const url = /atcoder\.jp\/contests\/([\w-]+)\/tasks\/([\w-]+)/i.exec(ref);
  if (url) return { contest: url[1].toLowerCase(), task: url[2].toLowerCase() };
  const id = /^([a-z]+\d+)[\s_/-]*([a-z]\d?|\d)$/i.exec(ref.trim());
  if (!id) throw new ImportError('Use an AtCoder task like abc300_a, or paste the task URL.');
  const contest = id[1].toLowerCase();
  return { contest, task: `${contest}_${id[2].toLowerCase()}` };
}

export async function importAtCoder(ref: string): Promise<ImportedProblem> {
  const { contest, task } = parseAtCoderRef(ref);
  const url = `https://atcoder.jp/contests/${contest}/tasks/${task}?lang=en`;
  const root = parseHtml(await (await request(url, 'AtCoder')).text());

  const title = root.querySelector('span.h2')?.childNodes[0]?.text.trim() || task;
  const limit = /Time Limit:\s*([\d.]+)\s*sec/i.exec(root.text);
  const statementRoot = root.querySelector('#task-statement span.lang-en') ?? root.querySelector('#task-statement');
  if (!statementRoot) throw new ImportError(`AtCoder didn't return a statement for ${task}. The contest may not be public yet.`, 404);

  const inputs = new Map<number, string>();
  const outputs = new Map<number, string>();
  const parts: string[] = [];
  for (const section of statementRoot.querySelectorAll('section')) {
    const heading = section.querySelector('h3')?.text.trim() ?? '';
    const sample = /^Sample (Input|Output) (\d+)/i.exec(heading);
    if (sample) {
      const text = withNewline(section.querySelector('pre')?.text ?? '');
      (sample[1].toLowerCase() === 'input' ? inputs : outputs).set(Number(sample[2]), text);
      continue;
    }
    section.querySelector('h3')?.remove();
    const body = htmlToMarkdown(section, url);
    // The title is already shown above the statement, so "Problem Statement" adds nothing.
    parts.push(/^problem statement$/i.test(heading) ? body : `### ${heading}\n\n${body}`);
  }

  return {
    platform: 'atcoder',
    id: task,
    title,
    url: `https://atcoder.jp/contests/${contest}/tasks/${task}`,
    statement: parts.join('\n\n'),
    tests: [...inputs.keys()].sort((a, b) => a - b).map((n) => ({ input: inputs.get(n)!, expected: outputs.get(n) ?? '' })),
    timeLimitMs: limit ? Math.round(Number(limit[1]) * 1000) : undefined,
  };
}
