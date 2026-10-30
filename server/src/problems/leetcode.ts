import type { Language } from '../runner/languages.js';
import { leetCodePrograms } from './leetcodeHarness.js';
import { groupExamples, htmlToMarkdown, htmlToText } from './markdown.js';
import { ImportError, request, withNewline, type ImportedProblem } from './types.js';

const ENDPOINT = 'https://leetcode.com/graphql';

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await request(ENDPOINT, 'LeetCode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/problemset/' },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!json.data) throw new ImportError(`LeetCode error: ${json.errors?.[0]?.message ?? 'no data'}`, 502);
  return json.data;
}

/** "1", "two-sum" or a problem URL → title slug. */
async function slugFor(ref: string): Promise<string> {
  const url = /leetcode\.com\/problems\/([\w-]+)/i.exec(ref);
  if (url) return url[1].toLowerCase();
  const text = ref.trim();
  if (/^\d+$/.test(text)) {
    const data = await graphql<{ questionList: { data: { questionFrontendId: string; titleSlug: string }[] } }>(
      `query search($filters: QuestionListFilterInput) {
        questionList(categorySlug: "", limit: 20, skip: 0, filters: $filters) { data { questionFrontendId titleSlug } }
      }`,
      { filters: { searchKeywords: text } },
    );
    const match = data.questionList.data.find((q) => q.questionFrontendId === text);
    if (!match) throw new ImportError(`LeetCode has no problem number ${text}.`, 404);
    return match.titleSlug;
  }
  if (/^[a-z0-9-]+$/i.test(text)) return text.toLowerCase();
  throw new ImportError('Use a LeetCode problem number like 1, a slug like two-sum, or paste the problem URL.');
}

interface Question {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  isPaidOnly: boolean;
  content: string | null;
  exampleTestcaseList: string[];
  metaData: string | null;
  codeSnippets: { langSlug: string; code: string }[] | null;
}

/** LeetCode prints answers without spaces ([0,1]); statements sometimes add them ([0, 1]). Strings keep theirs. */
const compact = (text: string) => text.replace(/("(?:[^"\\]|\\.)*")|\s+/g, (_, quoted: string | undefined) => quoted ?? '');

const SNIPPET_LANGUAGES: Record<string, Language> = { cpp: 'cpp', java: 'java', python3: 'python' };

export async function importLeetCode(ref: string): Promise<ImportedProblem> {
  const slug = await slugFor(ref);
  const { question } = await graphql<{ question: Question | null }>(
    `query problem($slug: String!) {
      question(titleSlug: $slug) {
        questionFrontendId title titleSlug isPaidOnly content exampleTestcaseList metaData codeSnippets { langSlug code }
      }
    }`,
    { slug },
  );
  if (!question) throw new ImportError(`LeetCode has no problem called "${slug}".`, 404);
  if (!question.content) throw new ImportError(`"${question.title}" is a LeetCode Premium problem, so its statement isn't public.`, 403);

  // Expected outputs only appear in the statement text ("Output: [0,1]").
  const outputs = [...htmlToText(question.content).matchAll(/Output:\s*([^\n]+)/g)].map((m) => compact(m[1].trim()));
  const tests = question.exampleTestcaseList.map((input, i) => ({ input: withNewline(input), expected: outputs[i] ? withNewline(outputs[i]) : '' }));
  const snippets: Partial<Record<Language, string>> = {};
  for (const snippet of question.codeSnippets ?? []) {
    const language = SNIPPET_LANGUAGES[snippet.langSlug];
    if (language) snippets[language] = snippet.code;
  }

  const url = `https://leetcode.com/problems/${question.titleSlug}/`;
  return {
    platform: 'leetcode',
    id: question.questionFrontendId,
    title: `${question.questionFrontendId}. ${question.title}`,
    url,
    statement: groupExamples(htmlToMarkdown(question.content, url)),
    tests,
    functionBased: true,
    snippets,
    programs: leetCodePrograms(question.metaData, snippets),
  };
}
