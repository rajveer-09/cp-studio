import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CODE, upgradeUntouchedTemplate } from './lib/templates';
import type {
  AccountState,
  BottomTab,
  ChatMessage,
  CodeFile,
  CompileInfo,
  DebugSession,
  DialogName,
  Language,
  LastRun,
  ProblemMeta,
  ReviewState,
  ServerConfig,
  Settings,
  SheetEntry,
  Template,
  TestCase,
  TestResult,
  Theme,
  TimerState,
} from './types';

/** Short random id. (crypto.randomUUID is unavailable on plain-http deployments.) */
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const SAMPLE_TEST: TestCase = { id: 'sample', input: '', expected: '' };

export const MAX_FILES = 12;

const FIRST_FILE: Record<Language, string> = { cpp: 'main.cpp', java: 'Main.java', python: 'main.py' };

const defaultFiles = (code: Record<Language, string> = DEFAULT_CODE): Record<Language, CodeFile[]> => ({
  cpp: [{ id: 'cpp-main', name: FIRST_FILE.cpp, code: code.cpp }],
  java: [{ id: 'java-main', name: FIRST_FILE.java, code: code.java }],
  python: [{ id: 'python-main', name: FIRST_FILE.python, code: code.python }],
});

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: false,
  minimap: false,
  ligatures: true,
  autocomplete: true,
  indentGuides: true,
  formatOnSave: false,
  cppStandard: 'c++17',
  timeLimitMs: 2000,
  compareMode: 'tokens',
  floatTolerance: 0,
  ignoreCase: false,
  // The test panel starts beside the editor (narrow screens stack it below anyway).
  ioPosition: 'right',
  ioFontSize: 13,
  uiDarkness: 0,
  uiContrast: 0,
  layoutLocked: false,
  headerHidden: false,
  statementColors: 'theme',
  statementLayout: 'enhanced',
  leetcodeDriver: 'hidden',
  timerAutoStart: false,
  statementSize: 14,
};

interface PersistedState {
  language: Language;
  /** Editor tabs, per language. */
  files: Record<Language, CodeFile[]>;
  activeFile: Record<Language, string>;
  tests: TestCase[];
  activeTestId: string;
  problem: string;
  /** Set when the problem was imported from a judge. */
  problemMeta: ProblemMeta | null;
  /** The app's theme: 'github-dark' or 'github-light'. */
  theme: Theme;
  /** The editor's theme for each app mode (any theme), so Alt+T switches both. */
  editorThemes: { dark: Theme; light: Theme };
  settings: Settings;
  customTemplates: Template[];
  chat: ChatMessage[];
  assistantOpen: boolean;
  watches: Record<Language, string[]>;
  timer: TimerState | null;
  /** Practice-sheet progress, keyed like "cf:1669D". */
  sheetProgress: Record<string, SheetEntry>;
}

interface SessionState {
  debug: DebugSession | null;
  debugStep: number;
  results: Record<string, TestResult>;
  compile: CompileInfo | null;
  lastRun: LastRun | null;
  running: 'current' | 'all' | null;
  runningIds: string[];
  bottomTab: BottomTab;
  serverConfig: ServerConfig | null;
  serverOnline: boolean;
  /** Bumped by "Reset layout" to remount the resizable panels at their default sizes. */
  layoutEpoch: number;
  /** Only the editor, filling the screen. */
  editorFocus: boolean;
  /** Who is signed in (kept in sync with the session; never saved to localStorage). */
  account: AccountState;
  dialog: DialogName | null;
  review: ReviewState | null;
  cursor: { line: number; column: number };
  selection: { startLine: number; endLine: number } | null;
  aiBusy: boolean;
}

interface Actions {
  setLanguage: (language: Language) => void;
  /** Updates a file's code (the language's active tab when no id is given). */
  setCode: (language: Language, code: string, fileId?: string) => void;
  addFile: (language: Language, file: { name: string; code: string; harness?: CodeFile['harness'] }) => string;
  renameFile: (language: Language, id: string, name: string) => void;
  closeFile: (language: Language, id: string) => void;
  selectFile: (language: Language, id: string) => void;
  addTest: (test?: Partial<Omit<TestCase, 'id'>>, select?: boolean) => string;
  updateTest: (id: string, patch: Partial<Omit<TestCase, 'id'>>) => void;
  removeTest: (id: string) => void;
  duplicateTest: (id: string) => void;
  setActiveTest: (id: string) => void;
  setProblem: (problem: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addTemplate: (template: Omit<Template, 'id'>) => void;
  removeTemplate: (id: string) => void;
  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => string;
  updateMessage: (id: string, patch: Partial<ChatMessage> | ((message: ChatMessage) => Partial<ChatMessage>)) => void;
  clearChat: () => void;
  setAssistantOpen: (open: boolean) => void;
  setBottomTab: (tab: BottomTab) => void;
  openDialog: (dialog: DialogName | null) => void;
}

export type AppState = PersistedState & SessionState & Actions;

/** The parts of the workspace that follow a signed-in user between devices. Theme and chat stay per device. */
export const SYNCED_KEYS = ['language', 'files', 'activeFile', 'tests', 'activeTestId', 'problem', 'problemMeta', 'settings', 'customTemplates', 'watches', 'sheetProgress'] as const;
export type SyncedWorkspace = Pick<PersistedState, (typeof SYNCED_KEYS)[number]>;

/** A new visitor's workspace (used after signing out, so the next person doesn't see your code). */
export const freshWorkspace = (): SyncedWorkspace => ({
  language: 'cpp',
  files: defaultFiles(),
  activeFile: { cpp: 'cpp-main', java: 'java-main', python: 'python-main' },
  tests: [SAMPLE_TEST],
  activeTestId: SAMPLE_TEST.id,
  problem: '',
  problemMeta: null,
  settings: DEFAULT_SETTINGS,
  customTemplates: [],
  watches: { cpp: [], java: [], python: [] },
  sheetProgress: {},
});

export const activeFileOf = (s: Pick<AppState, 'files' | 'activeFile'>, language: Language): CodeFile =>
  s.files[language].find((f) => f.id === s.activeFile[language]) ?? s.files[language][0];

/**
 * Before the app and editor themes were separate, one theme colored both. The app becomes GitHub dark or light;
 * a theme the user had picked (not the old defaults, Ember and Daylight) stays on as the editor theme.
 */
function upgradeThemes(saved: Partial<PersistedState> & { themePair?: unknown }, editorThemes: PersistedState['editorThemes']) {
  if (saved.editorThemes) return { editorThemes: { ...editorThemes, ...saved.editorThemes } };
  if (!saved.theme) return {};
  const dark = !['light', 'github-light', 'solarized-light', 'catppuccin-latte'].includes(saved.theme);
  const picked = saved.theme !== 'dark' && saved.theme !== 'light';
  return {
    theme: dark ? 'github-dark' : 'github-light',
    editorThemes: { ...editorThemes, ...(picked ? { [dark ? 'dark' : 'light']: saved.theme } : {}) },
  };
}

const prefersLight = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      language: 'cpp',
      files: defaultFiles(),
      activeFile: { cpp: 'cpp-main', java: 'java-main', python: 'python-main' },
      tests: [SAMPLE_TEST],
      activeTestId: SAMPLE_TEST.id,
      problem: '',
      problemMeta: null,
      theme: prefersLight ? 'github-light' : 'github-dark',
      editorThemes: { dark: 'github-dark', light: 'github-light' },
      settings: DEFAULT_SETTINGS,
      customTemplates: [],
      chat: [],
      // Closed until asked for (Assistant button or Alt+B), so the editor has the room.
      assistantOpen: false,
      watches: { cpp: [], java: [], python: [] },
      timer: null,
      sheetProgress: {},

      debug: null,
      debugStep: 0,
      results: {},
      compile: null,
      lastRun: null,
      running: null,
      runningIds: [],
      bottomTab: 'tests',
      serverConfig: null,
      serverOnline: true,
      account: { status: 'loading', user: null },
      layoutEpoch: 0,
      editorFocus: false,
      dialog: null,
      review: null,
      cursor: { line: 1, column: 1 },
      selection: null,
      aiBusy: false,

      setLanguage: (language) => set({ language, selection: null }),
      setCode: (language, code, fileId) =>
        set((s) => {
          const id = fileId ?? s.activeFile[language];
          const file = s.files[language].find((f) => f.id === id);
          if (!file || file.code === code) return s;
          return { files: { ...s.files, [language]: s.files[language].map((f) => (f.id === id ? { ...f, code } : f)) } };
        }),
      addFile: (language, file) => {
        const id = uid();
        set((s) => ({
          files: { ...s.files, [language]: [...s.files[language], { id, ...file }] },
          activeFile: { ...s.activeFile, [language]: id },
        }));
        return id;
      },
      renameFile: (language, id, name) =>
        set((s) => ({ files: { ...s.files, [language]: s.files[language].map((f) => (f.id === id ? { ...f, name } : f)) } })),
      closeFile: (language, id) =>
        set((s) => {
          const list = s.files[language];
          if (list.length <= 1) return s;
          const index = list.findIndex((f) => f.id === id);
          const files = list.filter((f) => f.id !== id);
          const activeId = s.activeFile[language] === id ? files[Math.min(index, files.length - 1)].id : s.activeFile[language];
          return { files: { ...s.files, [language]: files }, activeFile: { ...s.activeFile, [language]: activeId } };
        }),
      selectFile: (language, id) => set((s) => ({ activeFile: { ...s.activeFile, [language]: id }, selection: null })),

      addTest: (test, select = true) => {
        const id = uid();
        set((s) => ({
          tests: [...s.tests, { id, input: test?.input ?? '', expected: test?.expected ?? '' }],
          activeTestId: select ? id : s.activeTestId,
          bottomTab: select ? 'tests' : s.bottomTab,
        }));
        return id;
      },
      updateTest: (id, patch) => set((s) => ({ tests: s.tests.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTest: (id) =>
        set((s) => {
          if (s.tests.length <= 1) return { tests: [{ ...s.tests[0], input: '', expected: '' }], results: {} };
          const index = s.tests.findIndex((t) => t.id === id);
          const tests = s.tests.filter((t) => t.id !== id);
          const { [id]: _removed, ...results } = s.results;
          const activeTestId = s.activeTestId === id ? tests[Math.min(index, tests.length - 1)].id : s.activeTestId;
          return { tests, results, activeTestId };
        }),
      duplicateTest: (id) => {
        const source = get().tests.find((t) => t.id === id);
        if (source) get().addTest({ input: source.input, expected: source.expected });
      },
      setActiveTest: (activeTestId) => set({ activeTestId, bottomTab: 'tests' }),
      setProblem: (problem) => set({ problem }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addTemplate: (template) => set((s) => ({ customTemplates: [...s.customTemplates, { ...template, id: uid() }] })),
      removeTemplate: (id) => set((s) => ({ customTemplates: s.customTemplates.filter((t) => t.id !== id) })),

      addMessage: (message) => {
        const id = uid();
        set((s) => ({ chat: [...s.chat, { ...message, id, createdAt: Date.now() }] }));
        return id;
      },
      updateMessage: (id, patch) =>
        set((s) => ({
          chat: s.chat.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)),
        })),
      clearChat: () => set({ chat: [] }),
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
      setBottomTab: (bottomTab) => set({ bottomTab }),
      openDialog: (dialog) => set({ dialog }),
    }),
    {
      name: 'cp-studio',
      version: 1,
      partialize: (s): PersistedState => ({
        language: s.language,
        files: s.files,
        activeFile: s.activeFile,
        tests: s.tests,
        activeTestId: s.activeTestId,
        problem: s.problem,
        problemMeta: s.problemMeta,
        theme: s.theme,
        editorThemes: s.editorThemes,
        settings: s.settings,
        customTemplates: s.customTemplates,
        // A reply that was still streaming when the page closed can't be resumed.
        chat: s.chat.slice(-80).map((m) =>
          m.status === 'pending' || m.status === 'streaming' ? { ...m, status: 'error', content: m.content || 'Interrupted.' } : m,
        ),
        assistantOpen: s.assistantOpen,
        watches: s.watches,
        timer: s.timer,
        sheetProgress: s.sheetProgress,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedState> & { code?: Record<Language, string> };
        // Before tabs existed, each language had a single `code` string.
        const loaded = saved.files ?? (saved.code ? defaultFiles({ ...DEFAULT_CODE, ...saved.code }) : current.files);
        const files = Object.fromEntries(
          Object.entries(loaded).map(([language, list]) => [
            language,
            list.map((f) => ({ ...f, code: upgradeUntouchedTemplate(language as Language, f.code) })),
          ]),
        ) as Record<Language, CodeFile[]>;
        const { code: _legacy, ...rest } = saved;
        return {
          ...current,
          ...rest,
          files: { ...current.files, ...files },
          activeFile: { ...current.activeFile, ...saved.activeFile },
          settings: { ...current.settings, ...saved.settings },
          ...upgradeThemes(saved, current.editorThemes),
          watches: { ...current.watches, ...saved.watches },
          tests: saved.tests?.length ? saved.tests : current.tests,
        };
      },
    },
  ),
);
