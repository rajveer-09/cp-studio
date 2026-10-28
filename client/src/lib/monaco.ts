import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Bundle Monaco with the app instead of loading it from a CDN.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

monaco.editor.defineTheme('cp-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7394', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'keyword.directive', foreground: '89ddff' },
    { token: 'string', foreground: 'c3e88d' },
    { token: 'string.escape', foreground: '89ddff' },
    { token: 'number', foreground: 'f78c6c' },
    { token: 'type', foreground: 'ffcb6b' },
    { token: 'type.identifier', foreground: 'ffcb6b' },
    { token: 'annotation', foreground: 'ffcb6b' },
    { token: 'identifier', foreground: 'e7e9ef' },
    { token: 'delimiter', foreground: '89ddff' },
    { token: 'operator', foreground: '89ddff' },
  ],
  colors: {
    'editor.background': '#10131a',
    'editor.foreground': '#e7e9ef',
    'editorGutter.background': '#10131a',
    'minimap.background': '#10131a',
    'editorLineNumber.foreground': '#454c5d',
    'editorLineNumber.activeForeground': '#c6cad6',
    'editor.lineHighlightBackground': '#161a23',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#8b6dff45',
    'editor.inactiveSelectionBackground': '#8b6dff22',
    'editor.wordHighlightBackground': '#8b6dff20',
    'editorCursor.foreground': '#a78bfa',
    'editorIndentGuide.background1': '#1e232e',
    'editorIndentGuide.activeBackground1': '#363d4d',
    'editorBracketMatch.background': '#8b6dff25',
    'editorBracketMatch.border': '#8b6dff70',
    'editorWidget.background': '#151923',
    'editorWidget.border': '#2a3140',
    'editorSuggestWidget.background': '#151923',
    'editorSuggestWidget.border': '#2a3140',
    'editorSuggestWidget.selectedBackground': '#232a38',
    'editorHoverWidget.background': '#151923',
    'editorHoverWidget.border': '#2a3140',
    'scrollbarSlider.background': '#ffffff12',
    'scrollbarSlider.hoverBackground': '#ffffff22',
    'scrollbarSlider.activeBackground': '#ffffff30',
    'diffEditor.insertedTextBackground': '#3dd68c26',
    'diffEditor.removedTextBackground': '#ff636926',
    'diffEditor.insertedLineBackground': '#3dd68c12',
    'diffEditor.removedLineBackground': '#ff636912',
  },
});

monaco.editor.defineTheme('cp-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8a919e', fontStyle: 'italic' },
    { token: 'keyword', foreground: '7c3aed' },
    { token: 'keyword.directive', foreground: '0369a1' },
    { token: 'string', foreground: '16803c' },
    { token: 'string.escape', foreground: '0369a1' },
    { token: 'number', foreground: 'c2410c' },
    { token: 'type', foreground: 'b45309' },
    { token: 'type.identifier', foreground: 'b45309' },
    { token: 'annotation', foreground: 'b45309' },
    { token: 'identifier', foreground: '1f2430' },
    { token: 'delimiter', foreground: '4b5563' },
    { token: 'operator', foreground: '0369a1' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editorGutter.background': '#ffffff',
    'minimap.background': '#ffffff',
    'editorLineNumber.foreground': '#b3b8c4',
    'editorLineNumber.activeForeground': '#3b4252',
    'editor.lineHighlightBackground': '#f5f6fa',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#6d4aff2e',
    'editor.inactiveSelectionBackground': '#6d4aff18',
    'editorCursor.foreground': '#6d4aff',
    'editorIndentGuide.background1': '#eceef2',
    'editorIndentGuide.activeBackground1': '#d0d4dc',
    'editorBracketMatch.background': '#6d4aff18',
    'editorBracketMatch.border': '#6d4aff60',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#e0e3ea',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.border': '#e0e3ea',
    'editorSuggestWidget.selectedBackground': '#efeaff',
    'diffEditor.insertedTextBackground': '#15a35626',
    'diffEditor.removedTextBackground': '#e5484d26',
    'diffEditor.insertedLineBackground': '#15a35610',
    'diffEditor.removedLineBackground': '#e5484d10',
  },
});

// Monaco measures glyph widths on creation; re-measure once the web font has loaded.
document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

export { monaco };
