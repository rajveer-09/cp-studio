import Editor, { type OnMount } from '@monaco-editor/react';
import { AlignLeft, Download, FileArchive, FileDown, Loader2, RotateCcw } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect } from 'react';
import { isWatchable } from '../lib/completions';
import { debugVariable } from '../lib/debugger';
import { downloadActiveFile, downloadZip } from '../lib/download';
import { editorBridge, modelPath } from '../lib/editor';
import { LANGUAGE_META } from '../lib/languages';
import { monacoThemeName } from '../lib/themes';
import { activeFileOf, useStore } from '../store';
import { FileTabs } from './FileTabs';
import { GithubMark } from './GithubDialog';
import { Button, Tip } from './ui';

const clip = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

function useDebugHighlight() {
  const language = useStore((s) => s.language);
  const fileId = useStore((s) => s.activeFile[s.language]);
  const debug = useStore((s) => s.debug);
  const stepIndex = useStore((s) => s.debugStep);

  useEffect(() => {
    if (debug?.status !== 'done' || debug.language !== language || debug.fileId !== fileId || !debug.steps.length) {
      editorBridge.showDebugStep(language, null);
      return;
    }
    const step = debug.steps[stepIndex];
    const crashedHere = Boolean(debug.error) && stepIndex === debug.steps.length - 1;
    const text = Object.entries(step.values)
      .map(([name, value]) => `${name} = ${clip(value)}`)
      .join('   ');
    editorBridge.showDebugStep(language, { line: crashedHere && debug.errorLine ? debug.errorLine : step.line, text, error: crashedHere });
  }, [debug, stepIndex, language, fileId]);
}

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-muted';

function DownloadMenu() {
  const language = useStore((s) => s.language);
  const tabCount = useStore((s) => s.files[s.language].length);
  const name = useStore((s) => activeFileOf(s, s.language).name);
  const label = LANGUAGE_META[language].label;

  return (
    <DropdownMenu.Root>
      <Tip label="Download code">
        <DropdownMenu.Trigger asChild>
          <Button size="sm" variant="ghost" aria-label="Download code">
            <Download />
          </Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="popover z-50 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Item onSelect={downloadActiveFile} className={menuItem}>
            <FileDown />
            <span className="truncate">
              Download <span className="font-mono text-[12px]">{name}</span>
            </span>
          </DropdownMenu.Item>
          {tabCount > 1 && (
            <DropdownMenu.Item onSelect={() => downloadZip(language)} className={menuItem}>
              <FileArchive />
              All {tabCount} {label} tabs (.zip)
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={() => downloadZip()} className={menuItem}>
            <FileArchive />
            All tabs, every language (.zip)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function GithubButton() {
  const enabled = useStore((s) => s.serverConfig?.github);
  if (!enabled) return null;
  return (
    <Tip label="Save this tab to your GitHub repository">
      <Button size="sm" variant="ghost" onClick={() => useStore.getState().openDialog('github')} aria-label="Save to GitHub">
        <GithubMark className="size-3.5" />
      </Button>
    </Tip>
  );
}

export function CodeEditor() {
  const language = useStore((s) => s.language);
  const theme = useStore((s) => s.theme);
  const settings = useStore((s) => s.settings);
  const setCode = useStore((s) => s.setCode);
  useStore((s) => s.activeFile[s.language]); // re-render when the active tab changes
  const file = activeFileOf(useStore.getState(), language);
  const meta = LANGUAGE_META[language];
  useDebugHighlight();

  const handleMount: OnMount = (editor, monaco) => {
    editorBridge.attach(editor);
    editor.onDidChangeCursorPosition((e) => useStore.setState({ cursor: { line: e.position.lineNumber, column: e.position.column } }));
    editor.onDidChangeCursorSelection(({ selection }) =>
      useStore.setState({ selection: selection.isEmpty() ? null : { startLine: selection.startLineNumber, endLine: selection.endLineNumber } }),
    );
    editorBridge.attachWatchButton((name) => isWatchable(useStore.getState().language, name), debugVariable);
    editor.addAction({
      id: 'cp-studio.debug-variable',
      label: 'Debug: Watch This Variable',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyW],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 0,
      run: () => debugVariable(editorBridge.variableAtCursor()),
    });
    editor.focus();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel-2/40">
        <FileTabs />
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5 pl-2">
        <Tip label="Format code" keys={['Shift', 'Alt', 'F']}>
          <Button size="sm" variant="ghost" onClick={() => editorBridge.runAction('editor.action.formatDocument')}>
            <AlignLeft />
            <span className="hidden md:inline">Format</span>
          </Button>
        </Tip>
        <Tip label="Reset code to a template">
          <Button size="sm" variant="ghost" onClick={() => useStore.getState().openDialog('reset')}>
            <RotateCcw />
            <span className="hidden md:inline">Reset</span>
          </Button>
        </Tip>
        <DownloadMenu />
        <GithubButton />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {/* One model per tab (keyed by `path`), so each keeps its own undo history and cursor. */}
        <Editor
          path={modelPath(language, file.id)}
          language={meta.monaco}
          defaultValue={file.code}
          keepCurrentModel
          theme={monacoThemeName(theme)}
          onChange={(value) => setCode(language, value ?? '', file.id)}
          onMount={handleMount}
          loading={<Loader2 className="size-5 animate-spin text-subtle" />}
          options={{
            fontSize: settings.fontSize,
            fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
            fontLigatures: settings.ligatures,
            tabSize: settings.tabSize,
            insertSpaces: true,
            wordWrap: settings.wordWrap ? 'on' : 'off',
            minimap: { enabled: settings.minimap },
            lineHeight: 1.6,
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderLineHighlight: 'all',
            bracketPairColorization: { enabled: true },
            // No bracket-pair guide lines (they draw from the enclosing declaration down to the cursor).
            guides: {
              bracketPairs: false,
              bracketPairsHorizontal: false,
              highlightActiveBracketPair: false,
              indentation: settings.indentGuides,
              highlightActiveIndentation: false,
            },
            quickSuggestions: settings.autocomplete ? { other: true, comments: false, strings: false } : false,
            suggestOnTriggerCharacters: settings.autocomplete,
            wordBasedSuggestions: 'off', // our provider already offers the file's identifiers
            tabCompletion: 'on',
            snippetSuggestions: 'inline',
            suggest: { showWords: false },
            stickyScroll: { enabled: false },
            automaticLayout: true,
            fixedOverflowWidgets: true,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
            overviewRulerBorder: false,
          }}
        />
      </div>
    </div>
  );
}
