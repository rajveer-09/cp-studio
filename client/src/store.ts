import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CODE } from './lib/templates';
import type {
  BottomTab,
  ChatMessage,
  CompileInfo,
  DebugSession,
  DialogName,
  Language,
  LastRun,
  ReviewState,
  ServerConfig,
  Settings,
  Template,
  TestCase,
  TestResult,
  Theme,
} from './types';

/** Short random id. (crypto.randomUUID is unavailable on plain-http deployments.) */
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const SAMPLE_TEST: TestCase = { id: 'sample', input: '2\n3\n1 5 2\n4\n7 7 3 9\n', expected: '5\n9\n' };

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
  ioPosition: 'bottom',
};

interface PersistedState {
  language: Language;
  code: Record<Language, string>;
  tests: TestCase[];
  activeTestId: string;
  problem: string;
  theme: Theme;
  settings: Settings;
  customTemplates: Template[];
  chat: ChatMessage[];
  assistantOpen: boolean;
  watches: Record<Language, string[]>;
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
  dialog: DialogName | null;
  review: ReviewState | null;
  cursor: { line: number; column: number };
  selection: { startLine: number; endLine: number } | null;
  aiBusy: boolean;
}

interface Actions {
  setLanguage: (language: Language) => void;
  setCode: (language: Language, code: string) => void;
  addTest: (test?: Partial<Omit<TestCase, 'id'>>, select?: boolean) => string;
  updateTest: (id: string, patch: Partial<Omit<TestCase, 'id'>>) => void;
  removeTest: (id: string) => void;
  duplicateTest: (id: string) => void;
  setActiveTest: (id: string) => void;
  setProblem: (problem: string) => void;
  toggleTheme: () => void;
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

const prefersLight = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      language: 'cpp',
      code: { ...DEFAULT_CODE },
      tests: [SAMPLE_TEST],
      activeTestId: SAMPLE_TEST.id,
      problem: '',
      theme: prefersLight ? 'light' : 'dark',
      settings: DEFAULT_SETTINGS,
      customTemplates: [],
      chat: [],
      assistantOpen: true,
      watches: { cpp: [], java: [], python: [] },

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
      dialog: null,
      review: null,
      cursor: { line: 1, column: 1 },
      selection: null,
      aiBusy: false,

      setLanguage: (language) => set({ language, selection: null }),
      setCode: (language, code) => set((s) => (s.code[language] === code ? s : { code: { ...s.code, [language]: code } })),

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
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
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
        code: s.code,
        tests: s.tests,
        activeTestId: s.activeTestId,
        problem: s.problem,
        theme: s.theme,
        settings: s.settings,
        customTemplates: s.customTemplates,
        // A reply that was still streaming when the page closed can't be resumed.
        chat: s.chat.slice(-80).map((m) =>
          m.status === 'pending' || m.status === 'streaming' ? { ...m, status: 'error', content: m.content || 'Interrupted.' } : m,
        ),
        assistantOpen: s.assistantOpen,
        watches: s.watches,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedState>;
        return {
          ...current,
          ...saved,
          code: { ...current.code, ...saved.code },
          settings: { ...current.settings, ...saved.settings },
          watches: { ...current.watches, ...saved.watches },
          tests: saved.tests?.length ? saved.tests : current.tests,
        };
      },
    },
  ),
);
