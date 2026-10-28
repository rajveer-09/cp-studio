export type Language = 'cpp' | 'java' | 'python';
export type CppStandard = 'c++14' | 'c++17' | 'c++20' | 'c++23';
export type Theme = 'dark' | 'light';

export interface TestCase {
  id: string;
  input: string;
  expected: string;
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
export type DialogName = 'settings' | 'shortcuts' | 'access' | 'saveTemplate' | 'reset';

/** The program is paused *before* `line` runs; `values` holds each watched variable in scope. */
export interface DebugStep {
  line: number;
  values: Record<string, string>;
}

export interface DebugSession {
  status: 'running' | 'done' | 'error';
  language: Language;
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
  createdAt: number;
}

export interface ReviewState {
  code: string;
  language: Language;
  title: string;
  summary?: string;
  basedOn?: string;
  messageId?: string;
}

export interface ToolchainInfo {
  available: boolean;
  version: string;
}

export interface ServerConfig {
  aiEnabled: boolean;
  model: string;
  accessKeyRequired: boolean;
  toolchains: Record<Language, ToolchainInfo>;
  debuggers: Record<Language, boolean>;
  limits: { maxTimeLimitMs: number; maxTests: number; maxDebugSteps: number };
}
