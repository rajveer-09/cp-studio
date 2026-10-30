import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Bundle Monaco with the app instead of loading it from a CDN.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

// Monaco measures glyph widths on creation; re-measure once the web font has loaded.
document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

export { monaco };
