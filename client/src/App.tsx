import { Tooltip } from 'radix-ui';
import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toaster } from 'sonner';
import { AssistantPanel } from './components/assistant/AssistantPanel';
import { BottomPanel } from './components/BottomPanel';
import { CodeEditor } from './components/CodeEditor';
import { AccessKeyDialog, ResetDialog, SaveTemplateDialog, SettingsDialog, ShortcutsDialog } from './components/Dialogs';
import { FixReviewDialog } from './components/FixReviewDialog';
import { GenerateTestsDialog } from './components/GenerateTestsDialog';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { useMediaQuery, useServerConfig, useShortcuts, useThemeSync } from './hooks';
import { listenForImports } from './lib/problems';
import { themeById } from './lib/themes';
import { useStore } from './store';

const CARD = 'overflow-hidden rounded-xl border border-line-strong bg-panel';

function Workspace() {
  const assistantOpen = useStore((s) => s.assistantOpen);
  const narrow = useMediaQuery('(max-width: 900px)');
  const ioRight = useStore((s) => s.settings.ioPosition === 'right') && !narrow;
  const locked = useStore((s) => s.settings.layoutLocked);

  return (
    <PanelGroup direction={narrow ? 'vertical' : 'horizontal'} autoSaveId={narrow ? 'cp-main-narrow' : 'cp-main'}>
      <Panel id="workspace" order={1} minSize={30} defaultSize={70}>
        <PanelGroup direction={ioRight ? 'horizontal' : 'vertical'} autoSaveId="cp-editor-split">
          <Panel id="editor" order={1} minSize={20} defaultSize={ioRight ? 58 : 60} className={CARD}>
            <CodeEditor />
          </Panel>
          <PanelResizeHandle disabled={locked} className="resize-handle" />
          <Panel id="bottom" order={2} minSize={15} defaultSize={ioRight ? 42 : 40} className={CARD}>
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
  );
}

export default function App() {
  useThemeSync();
  useShortcuts();
  useServerConfig();
  useEffect(listenForImports, []);
  const theme = useStore((s) => s.theme);

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <div className="flex h-full flex-col">
        <Header />
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
      <Toaster theme={themeById(theme).dark ? 'dark' : 'light'} position="top-center" offset={60} richColors />
    </Tooltip.Provider>
  );
}
