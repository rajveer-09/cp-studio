import Editor, { type OnMount } from '@monaco-editor/react';
import { AlignLeft, Loader2, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { isWatchable } from '../lib/completions';
import { debugVariable } from '../lib/debugger';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META } from '../lib/languages';
import { useStore } from '../store';
import { Button, Tip } from './ui';

const clip = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

function useDebugHighlight() {
  const language = useStore((s) => s.language);
  const debug = useStore((s) => s.debug);
  const stepIndex = useStore((s) => s.debugStep);

  useEffect(() => {
    if (debug?.status !== 'done' || debug.language !== language || !debug.steps.length) {
      editorBridge.showDebugStep(language, null);
      return;
    }
    const step = debug.steps[stepIndex];
    const crashedHere = Boolean(debug.error) && stepIndex === debug.steps.length - 1;
    const text = Object.entries(step.values)
      .map(([name, value]) => `${name} = ${clip(value)}`)
      .join('   ');
    editorBridge.showDebugStep(language, { line: crashedHere && debug.errorLine ? debug.errorLine : step.line, text, error: crashedHere });
  }, [debug, stepIndex, language]);
}

export function CodeEditor() {
  const language = useStore((s) => s.language);
  const theme = useStore((s) => s.theme);
  const settings = useStore((s) => s.settings);
  const setCode = useStore((s) => s.setCode);
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
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3 text-[13px]">
        <span className="size-2 rounded-full" style={{ background: meta.color }} />
        <span className="font-medium">{meta.file}</span>
        {language === 'cpp' && (
          <span className="rounded bg-panel-2 px-1.5 py-px text-[11px] font-medium text-muted">{settings.cppStandard.toUpperCase()}</span>
        )}
        <div className="flex-1" />
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
      </div>
      <div className="min-h-0 flex-1">
        {/* One model per language (keyed by `path`), so each keeps its own undo history and cursor. */}
        <Editor
          path={meta.file}
          language={meta.monaco}
          defaultValue={useStore.getState().code[language]}
          keepCurrentModel
          theme={theme === 'dark' ? 'cp-dark' : 'cp-light'}
          onChange={(value) => setCode(language, value ?? '')}
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
