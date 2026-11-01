export type Language = 'cpp' | 'java' | 'python';
export type CppStandard = 'c++14' | 'c++17' | 'c++20' | 'c++23';
/** An id from lib/themes.ts. */
export type Theme = string;

export interface TestCase {
  id: string;
  input: string;
  expected: string;
}

/** An editor tab. */
export interface CodeFile {
  id: string;
  name: string;
  code: string;
  /** LeetCode: the driver around the Solution class, hidden from the tab and added back when the code runs. */
  harness?: { before: string; after: string };
}

/** The contest timer: a stopwatch, or a countdown that keeps going into overtime. */
export interface TimerState {
  mode: 'stopwatch' | 'countdown';
  /** Countdown length. */
  durationMs: number;
  /** When it was last started (null while paused). */
  startedAt: number | null;
  /** Time counted before the last start. */
  elapsedMs: number;
  /** The countdown's end has been announced. */
  alerted?: boolean;
}

/** Your progress on a practice-sheet problem. */
export type SheetStatus = 'todo' | 'attempted' | 'solved' | 'revisit';
export interface SheetEntry {
  status: SheetStatus;
  starred?: boolean;
  note?: string;
  /** When the status last changed. */
  at?: number;
}

export type Outcome = 'ok' | 'TLE' | 'RE' | 'CE' | 'OLE' | 'IE';

/**
 * AC/WA are decided live in the browser by comparing against the expected output (so editing the
 * expected output or the checker settings updates the verdict); DONE means no expected output was given.
 */
export type Verdict = Exclude<Outcome, 'ok'> | 'AC' | 'WA' | 'DONE';

export interface TestResult {
  outcome: Outcome;
  stdout: string;
  stderr: string;
  timeMs: number;
  exitCode: number | null;
  message?: string;
}

/** tokens: whitespace-insensitive, like most online judges. lines: line by line, exact spacing. */
export type CompareMode = 'tokens' | 'lines';

export interface CompileInfo {
  ok: boolean;
  output: string;
  timeMs: number;
}

export interface LastRun {
  language: Language;
  fileId: string;
  code: string;
  testIds: string[];
  maxTimeMs: number;
  compileOk: boolean;
}

export interface Settings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  ligatures: boolean;
  autocomplete: boolean;
  indentGuides: boolean;
  formatOnSave: boolean;
  cppStandard: CppStandard;
  timeLimitMs: number;
  compareMode: CompareMode;
  /** Allowed absolute/relative error for decimal numbers; 0 = exact. */
  floatTolerance: number;
  ignoreCase: boolean;
  ioPosition: 'bottom' | 'right';
  /** Text size in the test case input / expected / output columns. */
  ioFontSize: number;
  /** Adjustments on top of the theme, -100 to 100: surfaces darker/lighter, text sharper/softer. */
  uiDarkness: number;
  uiContrast: number;
  /** Panels can't be resized, moved or shown/hidden while locked. */
  layoutLocked: boolean;
  /** Hide the editor page's top bar for more room (Alt+H). */
  headerHidden: boolean;
  /** How an imported statement looks: the editor theme's colors, warm paper, or a deep night palette. */
  statementColors: 'theme' | 'paper' | 'night';
  /** 'enhanced': a LeetCode-style reading layout (same text); 'standard': as imported. */
  statementLayout: 'enhanced' | 'standard';
  /** Start the stopwatch whenever a problem is imported. */
  timerAutoStart: boolean;
  /** LeetCode: 'hidden' shows only the Solution class (like LeetCode); 'shown' keeps the driver in the tab, folded. */
  leetcodeDriver: 'hidden' | 'shown';
  /** Statement text size in px. */
  statementSize: number;
}

export interface Template {
  id: string;
  name: string;
  language: Language;
  code: string;
  description?: string;
  builtin?: boolean;
}

export type BottomTab = 'tests' | 'console' | 'debug' | 'problem';
export type DialogName = 'settings' | 'shortcuts' | 'access' | 'saveTemplate' | 'reset' | 'generateTests' | 'github' | 'submitHelper';

export type Platform = 'codeforces' | 'codechef' | 'leetcode' | 'atcoder';

export interface ImportedProblem {
  platform: Platform;
  id: string;
  title: string;
  url: string;
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
  /** A practice sheet's hint (the key technique), shown behind a spoiler. */
  hint?: string;
  snippets?: Partial<Record<Language, string>>;
  /** LeetCode: the snippet wrapped in a harness (folded in the editor) that runs one test from stdin. */
  programs?: Partial<Record<Language, string>>;
}

export type ProblemMeta = Omit<ImportedProblem, 'statement' | 'tests'> & {
  /** The judge's sample tests, so they can be restored later. */
  samples?: { input: string; expected: string }[];
};

/** The program is paused *before* `line` runs; `values` holds each watched variable in scope. */
export interface DebugStep {
  line: number;
  values: Record<string, string>;
}

export interface DebugSession {
  status: 'running' | 'done' | 'error';
  language: Language;
  fileId: string;
  code: string;
  testIndex: number;
  watches: string[];
  steps: DebugStep[];
  truncated: boolean;
  maxSteps: number;
  stdout: string;
  stderr: string;
  error?: string;
  errorLine?: number;
  compile?: CompileInfo;
  message?: string;
}

export interface FixProposal {
  rootCause: string;
  changes: string[];
  summary: string;
  fixedCode: string;
  originalCode: string;
  fileId?: string;
  language: Language;
  status: 'pending' | 'applied' | 'rejected';
}

export interface GeneratedTest {
  input: string;
  expectedOutput: string;
  reason: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'pending' | 'streaming' | 'done' | 'error';
  fix?: FixProposal;
  tests?: { items: GeneratedTest[]; added: boolean };
  /** Shown before the text, e.g. the result of re-running the tests. */
  icon?: 'check' | 'cross' | 'warning';
  createdAt: number;
}

export interface ReviewState {
  code: string;
  language: Language;
  /** The tab the change belongs to (the active tab when missing). */
  fileId?: string;
  title: string;
  summary?: string;
  basedOn?: string;
  messageId?: string;
  /** Re-run all tests after accepting (on by default). */
  runTestsAfter?: boolean;
}

export interface ToolchainInfo {
  available: boolean;
  version: string;
}

export type SocialProvider = 'google' | 'github';

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export type AccountState = { status: 'loading' | 'signedOut'; user: null } | { status: 'signedIn'; user: AccountUser };

export interface ServerConfig {
  aiEnabled: boolean;
  model: string;
  /** API keys that can still use the main model right now; `activeModel` is null when every key is out of quota. */
  aiKeys?: { total: number; available: number; activeModel: string | null };
  accessKeyRequired: boolean;
  /** "Save to GitHub" is set up on the server (a GitHub OAuth App). */
  github?: boolean;
  /** Accounts are on (the server has a database); `providers` are the sign-in options besides email. */
  accounts?: { providers: SocialProvider[] } | null;
  toolchains: Record<Language, ToolchainInfo>;
  debuggers: Record<Language, boolean>;
  limits: { maxTimeLimitMs: number; maxTests: number; maxDebugSteps: number };
}
