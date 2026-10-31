import { ChevronDown } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import { lazy, Suspense, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast, Toaster } from 'sonner';
import { Route, Switch } from 'wouter';
import { AssistantPanel } from './components/assistant/AssistantPanel';
import { BottomPanel } from './components/BottomPanel';
import { CodeEditor } from './components/CodeEditor';
import { AccessKeyDialog, ResetDialog, SaveTemplateDialog, SettingsDialog, ShortcutsDialog } from './components/Dialogs';
import { FixReviewDialog } from './components/FixReviewDialog';
import { GenerateTestsDialog } from './components/GenerateTestsDialog';
import { GithubDialog } from './components/GithubDialog';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { SubmitHelperDialog } from './components/SubmitHelperDialog';
import { Tip } from './components/ui';
import { useMediaQuery, useServerConfig, useShortcuts, useThemeSync } from './hooks';
import { useAccountSync } from './lib/auth';
import { applyDriverVisibility } from './lib/harness';
import { toggleHeader, useFullscreen } from './lib/layout';
import { resumeGithubSignIn } from './lib/github';
import { useWorkspaceSync } from './lib/sync';
import { listenForImports } from './lib/problems';
import { themeById } from './lib/themes';
import { useStore } from './store';

const CARD = 'overflow-hidden rounded-xl border border-line-strong bg-panel';
// The editor and the test panel wear the editor theme (see ideThemeCss); the assistant keeps the app's.
const IDE_CARD = `${CARD} ide-theme text-fg`;

// Sign-in pages are only downloaded when visited.
const AuthPage = lazy(() => import('./components/AuthPage'));
const ProblemsPage = lazy(() => import('./components/ProblemsPage'));
const DashboardPage = lazy(() => import('./components/DashboardPage'));
const StatsPage = lazy(() => import('./components/StatsPage'));

function Workspace() {
  const assistantOpen = useStore((s) => s.assistantOpen);
  const narrow = useMediaQuery('(max-width: 900px)');
  const ioRight = useStore((s) => s.settings.ioPosition === 'right') && !narrow;
  const locked = useStore((s) => s.settings.layoutLocked);
  const epoch = useStore((s) => s.layoutEpoch);
  const focus = useStore((s) => s.editorFocus);

  return (
    <>
    {/* Editor focus: the editor card is lifted over everything (kept mounted, so nothing reloads). */}
    {focus && <div className="fixed inset-0 z-30 bg-bg" />}
    <PanelGroup key={epoch} direction={narrow ? 'vertical' : 'horizontal'} autoSaveId={narrow ? 'cp-main-narrow' : 'cp-main'}>
      <Panel id="workspace" order={1} minSize={30} defaultSize={70}>
        <PanelGroup direction={ioRight ? 'horizontal' : 'vertical'} autoSaveId="cp-editor-split">
          <Panel id="editor" order={1} minSize={20} defaultSize={ioRight ? 58 : 60} className={focus ? `${IDE_CARD} !fixed inset-2 z-40` : IDE_CARD}>
            <CodeEditor />
          </Panel>
          <PanelResizeHandle disabled={locked} className="resize-handle" />
          <Panel id="bottom" order={2} minSize={15} defaultSize={ioRight ? 42 : 40} className={IDE_CARD}>
            <BottomPanel />
          </Panel>
        </PanelGroup>
      </Panel>
      {assistantOpen && (
        <>
          <PanelResizeHandle disabled={locked} className="resize-handle" />
          <Panel id="assistant" order={2} minSize={20} defaultSize={30} className={CARD}>
            <AssistantPanel />
          </Panel>
        </>
      )}
    </PanelGroup>
    </>
  );
}

function Editor() {
  useShortcuts();
  useEffect(listenForImports, []);
  useEffect(() => {
    // A GitHub sign-in done in this window (popups blocked) finishes here.
    resumeGithubSignIn().then(
      (account) => account && toast.success(`Connected to GitHub as @${account.login}`),
      (err) => toast.error(err instanceof Error ? err.message : 'GitHub sign-in failed.'),
    );
  }, []);
  const headerHidden = useStore((s) => s.settings.headerHidden);
  useFullscreen();
  // LeetCode tabs from before the driver could be hidden: show only their Solution class too.
  useEffect(() => {
    if (useStore.getState().settings.leetcodeDriver !== 'shown') applyDriverVisibility(true);
  }, []);

  return (
    <>
      <div className="flex h-full flex-col">
        {headerHidden ? (
          // A small tab at the top edge brings the bar back.
          <div className="relative h-2.5 shrink-0">
            <Tip label="Show the top bar" keys={['Alt', 'H']}>
              <button
                type="button"
                onClick={toggleHeader}
                aria-label="Show the top bar"
                className="absolute top-0 left-1/2 flex h-3.5 w-14 -translate-x-1/2 items-center justify-center rounded-b-md border border-t-0 border-line bg-panel-2 text-subtle opacity-70 transition hover:h-5 hover:text-fg hover:opacity-100 z-20"
              >
                <ChevronDown className="size-3" />
              </button>
            </Tip>
          </div>
        ) : (
          <Header />
        )}
        <main className="min-h-0 flex-1 px-2">
          <Workspace />
        </main>
        <StatusBar />
      </div>
      <FixReviewDialog />
      <SettingsDialog />
      <ShortcutsDialog />
      <AccessKeyDialog />
      <SaveTemplateDialog />
      <ResetDialog />
      <GenerateTestsDialog />
      <GithubDialog />
      <SubmitHelperDialog />
    </>
  );
}

export default function App() {
  useThemeSync();
  useServerConfig();
  useAccountSync();
  useWorkspaceSync();
  const theme = useStore((s) => s.theme);

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <Switch>
        <Route path="/login">
          <Suspense fallback={null}>
            <AuthPage mode="signin" />
          </Suspense>
        </Route>
        <Route path="/signup">
          <Suspense fallback={null}>
            <AuthPage mode="signup" />
          </Suspense>
        </Route>
        <Route path="/dashboard">
          <Suspense fallback={null}>
            <DashboardPage />
          </Suspense>
        </Route>
        <Route path="/stats">
          <Suspense fallback={null}>
            <StatsPage />
          </Suspense>
        </Route>
        <Route path="/problems">
          <Suspense fallback={null}>
            <ProblemsPage />
          </Suspense>
        </Route>
        <Route>
          <Editor />
        </Route>
      </Switch>
      <Toaster theme={themeById(theme).dark ? 'dark' : 'light'} position="top-center" offset={60} richColors />
    </Tooltip.Provider>
  );
}
