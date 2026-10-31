import { toast } from 'sonner';
import { activeFileOf, MAX_FILES, uid, useStore, type AppState } from '../store';
import type { ImportedProblem, Language, Platform, ProblemMeta } from '../types';
import { api, type ActivityEvent, type ProblemEvent, type ProblemSnapshot } from './api';
import { joinHarness, splitHarness, type Harness } from './harness';
import { requireAi } from './auth';
import { editorBridge } from './editor';
import { LANGUAGE_META, LANGUAGES } from './languages';
import { copyText } from './platform';
import { DEFAULT_CODE } from './templates';

export const PLATFORM_META: Record<Platform, { label: string; placeholder: string }> = {
  codeforces: { label: 'Codeforces', placeholder: 'Problem, e.g. 1915A, or paste its URL' },
  codechef: { label: 'CodeChef', placeholder: 'Problem code, e.g. FLOW001, or paste its URL' },
  leetcode: { label: 'LeetCode', placeholder: 'Number or name, e.g. 1 or two-sum, or paste its URL' },
  atcoder: { label: 'AtCoder', placeholder: 'Task, e.g. abc300_a, or paste its URL' },
};

/** Codeforces tags are lowercase ("dp", "dfs and similar"); LeetCode topics come titled already. */
const ACRONYMS: Record<string, string> = { dp: 'DP', dfs: 'DFS', dsu: 'DSU', fft: 'FFT', '2-sat': '2-SAT', '*special': 'Special' };
export function topicName(tag: string): string {
  if (ACRONYMS[tag]) return ACRONYMS[tag];
  const name = tag
    .split(' ')
    .map((word) => ACRONYMS[word] ?? word)
    .join(' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Each judge's dot color in lists and charts. */
export const PLATFORM_COLORS: Record<Platform, string> = {
  codeforces: '#3b82f6',
  leetcode: '#ffa116',
  codechef: '#b07c5b',
  atcoder: '#8b8b96',
};

export const PLATFORM_ORDER: Platform[] = ['codeforces', 'codechef', 'leetcode', 'atcoder'];

export function detectPlatform(text: string): Platform | null {
  if (/codeforces\.com/i.test(text)) return 'codeforces';
  if (/codechef\.com/i.test(text)) return 'codechef';
  if (/leetcode\.com/i.test(text)) return 'leetcode';
  if (/atcoder\.jp/i.test(text)) return 'atcoder';
  return null;
}

export function codeforcesUrl(ref: string): string | null {
  const text = ref.trim();
  if (/codeforces\.com\/(contest|problemset|gym)\//i.test(text)) return text.startsWith('http') ? text : `https://${text}`;
  const id = /^(\d+)\s*[/_\s-]?\s*([A-Za-z]\d?)$/.exec(text);
  return id ? `https://codeforces.com/problemset/problem/${id[1]}/${id[2].toUpperCase()}` : null;
}

const TIME_LIMITS = [1000, 2000, 3000, 5000, 10_000];
const DECIMAL = /(^|\s)[+-]?\d+\.\d+(\s|$)/;

/** Loads an imported problem: statement, sample tests and its time limit. One click on Undo restores everything. */
export function applyImported(problem: ImportedProblem, { reopened = false }: { reopened?: boolean } = {}) {
  const state = useStore.getState();
  const before: Partial<AppState> = {
    tests: state.tests,
    activeTestId: state.activeTestId,
    problem: state.problem,
    problemMeta: state.problemMeta,
    results: state.results,
    lastRun: state.lastRun,
    compile: state.compile,
    settings: state.settings,
  };

  const { statement, tests: samples, ...meta } = problem;
  const tests = samples.length ? samples.map((t) => ({ id: uid(), input: t.input, expected: t.expected })) : state.tests;
  const settings = { ...state.settings };
  const notes = [`${samples.length} sample test${samples.length === 1 ? '' : 's'}`];

  if (problem.timeLimitMs) {
    const max = state.serverConfig?.limits.maxTimeLimitMs ?? 10_000;
    settings.timeLimitMs = Math.min(max, TIME_LIMITS.find((ms) => ms >= problem.timeLimitMs!) ?? max);
    if (settings.timeLimitMs !== state.settings.timeLimitMs) notes.push(`time limit ${settings.timeLimitMs / 1000}s`);
  }
  // Decimal answers are judged with a tolerance on every platform.
  if (!settings.floatTolerance && samples.some((t) => DECIMAL.test(t.expected))) {
    settings.floatTolerance = 1e-6;
    notes.push('decimal tolerance 1e-6');
  }

  useStore.setState({
    problem: statement,
    problemMeta: { ...meta, samples },
    tests,
    activeTestId: tests[0].id,
    results: {},
    lastRun: null,
    compile: null,
    settings,
  });
  const opened = openProblemTabs(problem);
  recordProblem('opened');
  if (!reopened && useStore.getState().settings.timerAutoStart) {
    useStore.setState({ timer: { mode: 'stopwatch', durationMs: 0, startedAt: Date.now(), elapsedMs: 0 } });
  }
  if (opened) notes.unshift(`tab ${problemTabName(problem, state.language)}`);
  toast.success(`${reopened ? 'Reopened' : 'Imported'} “${problem.title}”`, {
    description: notes.join(' · '),
    action: { label: 'Undo', onClick: () => useStore.setState(before) },
  });
  if (problem.functionBased && !reopened) {
    const runnable = Boolean(problem.programs && Object.keys(problem.programs).length);
    if (opened && runnable) {
      toast.info('Write your solution in the Solution class', {
        description:
          useStore.getState().settings.leetcodeDriver === 'shown'
            ? 'The code that reads each test and prints the answer is folded above and below it.'
            : 'Like on LeetCode, only the class is shown: the code that reads each test and prints the answer is added when it runs.',
        duration: 7000,
      });
    } else {
      toast.info('This LeetCode problem needs a custom main()', {
        description: 'Click "Starter + main()" in the Problem tab and the AI will write one that runs these tests.',
        duration: 8000,
      });
    }
  }
}

/**
 * Adds the loaded problem to a signed-in user's history: opened (with the statement and tests, to reopen it later),
 * solved (all sample tests passed) or submitted, the last two with the code that did it. Best effort, in the background.
 */
export function recordActivity(kind: ActivityEvent['kind']) {
  const state = useStore.getState();
  if (state.account.status !== 'signedIn' || !state.serverConfig?.accounts) return;
  const meta = state.problemMeta;
  api.me
    .activity({ kind, language: state.language, ...(meta?.id ? { platform: meta.platform, problemId: meta.id } : {}) })
    .catch(() => {});
}

export function recordProblem(event: ProblemEvent['event']) {
  if (event === 'solved') recordActivity('solved');
  if (event === 'submitted') recordActivity('submit');
  const state = useStore.getState();
  const meta = state.problemMeta;
  if (state.account.status !== 'signedIn' || !state.serverConfig?.accounts || !meta?.id) return;
  const { language } = state;
  const tests = state.tests.map(({ input, expected }) => ({ input, expected }));
  const tab = state.files[language].find((f) => f.name === problemTabName(meta, language));
  const snapshot: ProblemSnapshot =
    event === 'opened'
      ? { meta, statement: state.problem, tests }
      : { tests, code: { [language]: editorBridge.getCode(language, tab?.id) } };
  api.me
    .problemEvent({ platform: meta.platform, id: meta.id, title: meta.title, url: meta.url, event, language, snapshot })
    .catch(() => {});
}

const EXTENSION: Record<Language, string> = { cpp: 'cpp', java: 'java', python: 'py' };

/** "two-sum.cpp" for LeetCode, otherwise the problem ID: "1904A.cpp", "abc300_b.py", "FLOW001.java". */
export function problemTabName(meta: Pick<ProblemMeta, 'platform' | 'id' | 'url' | 'title'>, language: Language): string {
  const stem =
    (meta.platform === 'leetcode' ? /problems\/([\w-]+)/.exec(meta.url)?.[1] : meta.id) ||
    meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'problem';
  return `${stem.replace(/[^\w-]+/g, '-').slice(0, 36)}.${EXTENSION[language]}`;
}

/**
 * Opens a tab named after the problem in every language: the LeetCode starter (method plus a folded
 * harness that runs the tests) or the Multi-test template. Importing again switches to the existing
 * tab and keeps its code; `overwrite` (Reset starter) puts the starter back as one undoable edit.
 * Returns how many tabs were opened or reused.
 */
export function openProblemTabs(
  meta: Pick<ProblemMeta, 'platform' | 'id' | 'url' | 'title' | 'programs' | 'snippets'>,
  { only, overwrite = false }: { only?: Language; overwrite?: boolean } = {},
): number {
  let opened = 0;
  for (const language of only ? [only] : LANGUAGES) {
    const code = meta.platform === 'leetcode' ? (meta.programs?.[language] ?? meta.snippets?.[language]) : DEFAULT_CODE[language];
    if (!code) continue;
    const state = useStore.getState();
    const name = problemTabName(meta, language);
    // LeetCode-style: only the Solution class in the tab, the driver kept aside (unless the user chose to see it).
    const split = state.settings.leetcodeDriver !== 'shown' ? splitHarness(code) : null;
    const existing = state.files[language].find((f) => f.name === name);
    if (existing) {
      state.selectFile(language, existing.id);
      if (overwrite) {
        useStore.setState((s) => ({
          files: { ...s.files, [language]: s.files[language].map((f) => (f.id === existing.id ? { ...f, harness: split?.harness } : f)) },
        }));
        editorBridge.setCode(language, split?.body ?? code, existing.id);
        if (!split) editorBridge.foldHarness(language, existing.id);
      }
    } else if (state.files[language].length < MAX_FILES) {
      state.addFile(language, split ? { name, code: split.body, harness: split.harness } : { name, code });
    } else {
      toast.error(`You have ${MAX_FILES} ${LANGUAGE_META[language].label} tabs open. Close one to open a tab for this problem.`);
      continue;
    }
    opened++;
  }
  return opened;
}

/** Saved code as this tab needs it: without the driver if the tab hides it, with it if the tab shows it. */
function fitToTab(code: string, tab: { harness?: Harness; code: string }): string {
  const split = splitHarness(code);
  if (tab.harness) return split ? split.body : code;
  const current = splitHarness(tab.code);
  return !split && current ? joinHarness(code, current.harness) : code;
}

/** Opens a problem from the history with the tests and the code saved for it, in each language that has some. */
export async function reopenProblem(platform: Platform, id: string): Promise<void> {
  const snapshot = await api.me.problem(platform, id);
  if (!snapshot.meta) throw new Error('This problem has nothing saved to reopen.');
  const { samples, ...meta } = snapshot.meta;
  const saved = Object.entries(snapshot.code ?? {}).filter(([, code]) => code?.trim()) as [Language, string][];
  const state = useStore.getState();
  if (saved.length && !saved.some(([language]) => language === state.language)) state.setLanguage(saved[0][0]);

  applyImported({ ...meta, statement: snapshot.statement ?? '', tests: snapshot.tests?.length ? snapshot.tests : (samples ?? []) }, { reopened: true });
  for (const [language, code] of saved) {
    const tab = useStore.getState().files[language].find((f) => f.name === problemTabName(meta, language));
    if (tab) editorBridge.setCode(language, fitToTab(code, tab), tab.id);
  }
  // The judge's own samples, for "Use as test cases", even when the saved tests include your own.
  useStore.setState((s) => ({ bottomTab: 'problem', problemMeta: s.problemMeta && samples ? { ...s.problemMeta, samples } : s.problemMeta }));
}

export async function importProblem(platform: Platform, ref: string): Promise<boolean> {
  try {
    applyImported(await api.importProblem({ platform, ref }));
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Import failed.');
    return false;
  }
}

async function importCodeforcesPage(page: unknown) {
  try {
    applyImported(await api.problemFromPage(page));
    useStore.setState({ bottomTab: 'problem' });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Import failed.');
  }
}

/**
 * The "Send to CP Studio" bookmark. Codeforces blocks automated requests, so this runs on the problem page
 * the user has open, reads the statement and samples, and opens CP Studio with them.
 */
export function bookmarkletHref(): string {
  const app = `${location.origin}${location.pathname}`;
  const code = `(()=>{const s=document.querySelector('.problem-statement');if(!s||!/codeforces/.test(location.host)){alert('Open a Codeforces problem page, then click this bookmark.');return}const read=p=>{const c=p.cloneNode(true);c.querySelectorAll('br').forEach(b=>b.replaceWith('\\n'));const l=c.querySelectorAll('.test-example-line');return(l.length?[...l].map(x=>x.textContent).join('\\n'):c.textContent).replace(/\\r/g,'')};const ins=[...s.querySelectorAll('.sample-test .input pre')].map(read);const outs=[...s.querySelectorAll('.sample-test .output pre')].map(read);const c=s.cloneNode(true);c.querySelectorAll('script[type^="math/tex"]').forEach(m=>m.replaceWith('$$$'+m.textContent+'$$$'));c.querySelectorAll('.MathJax,.MathJax_Preview,.MathJax_Display,.MJX_Assistive_MathML,.header,.sample-tests').forEach(e=>e.remove());const h=s.querySelector('.header');const t=x=>(h&&h.querySelector(x)||{}).textContent||'';const d={url:location.href,title:t('.title')||document.title,timeLimit:t('.time-limit'),html:c.innerHTML,tests:ins.map((x,i)=>({input:x,expected:outs[i]||''}))};window.open(${JSON.stringify(app)}+'#import='+encodeURIComponent(JSON.stringify(d)),'cp-studio')})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

const CHANNEL = 'cp-studio';
let pendingPage: unknown = null;

/**
 * Called before the app starts. A tab opened by the bookmark hands the problem to an already-open
 * CP Studio tab and resolves true, so it never starts (a second running copy would overwrite the
 * saved state). With no other tab, the problem is imported here once the app is up.
 */
export function consumeImportHash(): Promise<boolean> {
  const match = /^#import=(.+)$/.exec(location.hash);
  if (!match) return Promise.resolve(false);
  history.replaceState(null, '', location.pathname + location.search);

  let page: unknown;
  try {
    page = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    setTimeout(() => toast.error('Could not read the problem sent from Codeforces.'), 500);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL);
    const timer = setTimeout(() => {
      channel.close();
      pendingPage = page;
      resolve(false);
    }, 500);
    channel.onmessage = (e) => {
      if (e.data?.type !== 'import-received') return;
      clearTimeout(timer);
      channel.close();
      resolve(true);
    };
    channel.postMessage({ type: 'import', page });
  });
}

export function listenForImports(): () => void {
  if (pendingPage) {
    void importCodeforcesPage(pendingPage);
    pendingPage = null;
  }
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e) => {
    if (e.data?.type !== 'import') return;
    channel.postMessage({ type: 'import-received' });
    void importCodeforcesPage(e.data.page);
  };
  return () => channel.close();
}

/**
 * The judge's page for submitting this problem. Codeforces and AtCoder have a submit form that preselects
 * the problem; on CodeChef and LeetCode the editor and Submit button are on the problem page itself.
 */
export function submitUrl(meta: Pick<ProblemMeta, 'platform' | 'url'>): string {
  if (meta.platform === 'codeforces') {
    const contest = /codeforces\.com\/(contest|gym)\/(\d+)\/problem\/(\w+)/i.exec(meta.url);
    if (contest) return `https://codeforces.com/${contest[1]}/${contest[2]}/submit/${contest[3]}`;
    const problemset = /problemset\/problem\/(\d+)\/(\w+)/i.exec(meta.url);
    if (problemset) return `https://codeforces.com/contest/${problemset[1]}/submit/${problemset[2]}`;
  }
  if (meta.platform === 'atcoder') {
    const task = /atcoder\.jp\/contests\/([\w-]+)\/tasks\/([\w-]+)/i.exec(meta.url);
    if (task) return `https://atcoder.jp/contests/${task[1]}/submit?taskScreenName=${task[2]}`;
  }
  return meta.url;
}

/** The code as the judge wants it: LeetCode takes only the Solution class, without the folded harness. */
export function codeForSubmission(code: string): string {
  const kept: string[] = [];
  let inHarness = false;
  for (const line of code.split('\n')) {
    if (!inHarness && /\bregion\b.*LeetCode harness/.test(line)) inHarness = true;
    else if (inHarness && /^\s*(?:#pragma\s+endregion|\/\/\s*#endregion|#endregion)\b/.test(line)) inHarness = false;
    else if (!inHarness) kept.push(line);
  }
  return `${kept.join('\n').trim()}\n`;
}

/** The userscript that fills code in on the judges' sites (served with this site's address in it). */
export const SUBMIT_HELPER_URL = '/api/helper/cp-studio.user.js';

/** The helper marks CP Studio's page when it is installed: its version, or null. */
export const submitHelperVersion = () => document.documentElement.getAttribute('data-cp-studio-helper');

/**
 * Opens the judge's submit page and copies the active tab's code. With the helper installed, the code also
 * travels in the link's #fragment (never sent to a server) and the helper puts it in the judge's editor.
 */
export async function openSubmission(meta: Pick<ProblemMeta, 'platform' | 'url'>) {
  const { language } = useStore.getState();
  const code = codeForSubmission(editorBridge.getCode(language));
  const site = PLATFORM_META[meta.platform].label;
  const label = LANGUAGE_META[language].label;
  const helper = Boolean(submitHelperVersion());
  const url = submitUrl(meta).replace(/#.*$/, '');
  recordProblem('submitted');
  // Opened first, while the click still counts as a user action (popup blockers allow that).
  window.open(helper ? `${url}#cp-studio=${encodeURIComponent(JSON.stringify({ language, code }))}` : url, '_blank', 'noopener');
  let copied = true;
  try {
    await copyText(code);
  } catch {
    copied = false;
  }
  if (helper) {
    toast.success(`Sending your ${label} code to ${site}`, {
      description: `The helper puts it in the editor and picks the language.${copied ? ' It is on your clipboard too.' : ''}`,
    });
  } else {
    const autoFill = { label: 'Auto-fill', onClick: () => useStore.getState().openDialog('submitHelper') };
    if (copied) {
      toast.success(`Your ${label} code is copied`, {
        description: `Paste it on ${site} (Ctrl+V)${meta.platform === 'codeforces' || meta.platform === 'atcoder' ? ' and pick the language there' : ''}.`,
        action: autoFill,
      });
    } else toast.info(`Opened ${site}`, { description: 'Copy your code from the editor (Ctrl+A, Ctrl+C) and paste it there.', action: autoFill });
  }
}

/** LeetCode: asks the AI for the starter code plus a main() that runs one example from stdin. */
export async function requestLeetCodeDriver(): Promise<void> {
  if (!requireAi()) return;
  const state = useStore.getState();
  const { language, problemMeta, tests } = state;
  const fileId = activeFileOf(state, language).id;
  const snippet = problemMeta?.snippets?.[language];
  if (!snippet) {
    toast.error(`LeetCode has no ${LANGUAGE_META[language].label} starter code for this problem.`);
    return;
  }
  try {
    const { code } = await api.driver({ language, snippet, examples: tests.slice(0, 3).map(({ input, expected }) => ({ input, expected })) });
    useStore.setState({
      review: {
        code,
        language,
        fileId,
        title: 'LeetCode starter with main()',
        summary: "Adds a main() that reads one example from stdin and prints the answer in LeetCode's format. Write your solution inside the method.",
        runTestsAfter: false,
      },
    });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not create the starter code.');
  }
}

/** The problem as the AI sees it: title and source first, plus how LeetCode problems run here. */
export function problemForAi(state: AppState): string {
  const meta = state.problemMeta;
  if (!meta) return state.problem;
  const hiddenDriver = Boolean(activeFileOf(state, state.language).harness);
  const note = !meta.functionBased
    ? ''
    : hiddenDriver
      ? '\n\nNote: this is a LeetCode problem. Like on LeetCode, the code is only the Solution class: CP Studio adds the code that reads a test case and prints the answer when it runs. Write and change only the Solution class, with no main().'
      : '\n\nNote: this is a LeetCode problem. In this editor the program reads one test case from stdin (each argument on its own line, in LeetCode format) and prints the result in LeetCode format. Code inside the "LeetCode harness" regions does that: keep it unchanged and only change the Solution class.';
  return `${meta.title} (${PLATFORM_META[meta.platform].label}: ${meta.url})\n\n${state.problem}${note}`;
}
