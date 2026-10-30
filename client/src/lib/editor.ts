import { activeFileOf, useStore } from '../store';
import type { Language } from '../types';
import { monaco } from './monaco';
import type { Diagnostic } from './diagnostics';

/** Lets non-React code (runner, assistant, shortcuts) talk to the live Monaco editor. */
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let debugDecorations: monaco.editor.IEditorDecorationsCollection | null = null;

const EXTENSION: Record<Language, string> = { cpp: 'cpp', java: 'java', python: 'py' };

/** Each tab has its own Monaco model (and so its own undo history), keyed by the tab's id. */
export const modelPath = (language: Language, fileId: string) => `${fileId}.${EXTENSION[language]}`;

const modelFor = (language: Language, fileId = activeFileOf(useStore.getState(), language).id) =>
  monaco.editor.getModel(monaco.Uri.parse(modelPath(language, fileId)));

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

// LeetCode starters keep the code that runs the tests in "LeetCode harness" regions, folded when a file opens.
const HARNESS = /LeetCode harness/;
const folded = new WeakSet<monaco.editor.ITextModel>();

function foldHarnessIfNew() {
  const model = editor?.getModel();
  if (!editor || !model || folded.has(model) || !HARNESS.test(model.getValue())) return;
  folded.add(model);
  const ed = editor;
  // Folding ranges are computed just after the model loads; ask twice to be safe (folding is idempotent).
  for (const delay of [80, 400]) setTimeout(() => ed.getModel() === model && ed.getAction('editor.foldAllMarkerRegions')?.run(), delay);
}

export const editorBridge = {
  attach(instance: monaco.editor.IStandaloneCodeEditor) {
    editor = instance;
    debugDecorations = instance.createDecorationsCollection();
    instance.onDidChangeModel(foldHarnessIfNew);
    foldHarnessIfNew();
  },

  /** Folds the harness regions of a tab again (after its code was replaced), now or when it is next shown. */
  foldHarness(language: Language, fileId: string) {
    const model = modelFor(language, fileId);
    if (!model) return;
    folded.delete(model);
    if (editor?.getModel() === model) foldHarnessIfNew();
  },

  focus() {
    editor?.focus();
  },

  runAction(id: string) {
    return editor?.getAction(id)?.run();
  },

  variableAtCursor(): string | null {
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!model || !selection) return null;
    if (!selection.isEmpty()) {
      const text = model.getValueInRange(selection).trim();
      return IDENTIFIER.test(text) ? text : null;
    }
    return model.getWordAtPosition(selection.getPosition())?.word ?? null;
  },

  attachWatchButton(canWatch: (name: string) => boolean, onWatch: (name: string) => void) {
    if (!editor) return;
    const ed = editor;
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'watch-widget';
    let name = '';
    let position: monaco.IPosition | null = null;
    node.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    node.addEventListener('click', () => onWatch(name));

    const widget: monaco.editor.IContentWidget = {
      getId: () => 'cp-studio.watch-widget',
      getDomNode: () => node,
      getPosition: () =>
        position && {
          position,
          preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE, monaco.editor.ContentWidgetPositionPreference.BELOW],
        },
    };
    ed.addContentWidget(widget);
    ed.onDidChangeCursorSelection(({ selection }) => {
      const model = ed.getModel();
      const text = model && !selection.isEmpty() && selection.startLineNumber === selection.endLineNumber ? model.getValueInRange(selection).trim() : '';
      if (IDENTIFIER.test(text) && canWatch(text)) {
        name = text;
        position = selection.getStartPosition();
        // `name` is a plain identifier, so it is safe to put in markup.
        node.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>Debug <code>${text}</code>`;
      } else {
        position = null;
      }
      ed.layoutContentWidget(widget);
    });
  },

  showDebugStep(language: Language, step: { line: number; text: string; error?: boolean } | null) {
    if (!editor || !debugDecorations) return;
    const model = editor.getModel();
    if (!step || !model || model !== modelFor(language) || step.line > model.getLineCount()) {
      debugDecorations.clear();
      return;
    }
    const end = model.getLineMaxColumn(step.line);
    debugDecorations.set([
      {
        range: new monaco.Range(step.line, 1, step.line, 1),
        options: {
          isWholeLine: true,
          className: step.error ? 'debug-line debug-line-error' : 'debug-line',
          linesDecorationsClassName: step.error ? 'debug-arrow debug-arrow-error' : 'debug-arrow',
        },
      },
      ...(step.text
        ? [
            {
              range: new monaco.Range(step.line, end, step.line, end),
              options: { showIfCollapsed: true, after: { content: `   ${step.text}`, inlineClassName: 'debug-inline-values' } },
            },
          ]
        : []),
    ]);
    editor.revealLineInCenterIfOutsideViewport(step.line, monaco.editor.ScrollType.Smooth);
  },

  getCode(language: Language, fileId?: string): string {
    const state = useStore.getState();
    const id = fileId ?? activeFileOf(state, language).id;
    return modelFor(language, id)?.getValue() ?? state.files[language].find((f) => f.id === id)?.code ?? '';
  },

  /** Replaces a tab's code as a single undoable edit, so Ctrl+Z restores the previous version. */
  setCode(language: Language, text: string, fileId?: string) {
    const id = fileId ?? activeFileOf(useStore.getState(), language).id;
    const model = modelFor(language, id);
    if (model) {
      model.pushStackElement();
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
      model.pushStackElement();
    }
    useStore.getState().setCode(language, text, id);
  },

  disposeModel(language: Language, fileId: string) {
    modelFor(language, fileId)?.dispose();
  },

  selection(): { startLine: number; endLine: number; text: string } | null {
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!selection || !model || selection.isEmpty()) return null;
    return { startLine: selection.startLineNumber, endLine: selection.endLineNumber, text: model.getValueInRange(selection) };
  },

  revealLine(line: number, column = 1) {
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column });
    editor.focus();
  },

  setDiagnostics(language: Language, diagnostics: Diagnostic[]) {
    const model = modelFor(language);
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'compiler',
      diagnostics.map((d) => {
        const line = Math.min(Math.max(d.line, 1), model.getLineCount());
        return {
          severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: line,
          startColumn: d.column,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        };
      }),
    );
  },
};
