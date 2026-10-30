import { strToU8, zipSync, type Zippable } from 'fflate';
import { toast } from 'sonner';
import { activeFileOf, useStore } from '../store';
import type { Language } from '../types';
import { editorBridge } from './editor';
import { LANGUAGES } from './languages';

function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Two tabs may share a name; keep both in the zip. */
function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${stem}-${n}${ext}`;
  taken.add(candidate);
  return candidate;
}

function languageFiles(language: Language): Record<string, Uint8Array> {
  const taken = new Set<string>();
  return Object.fromEntries(
    useStore.getState().files[language].map((f) => [uniqueName(f.name, taken), strToU8(editorBridge.getCode(language, f.id))]),
  );
}

export function downloadActiveFile() {
  const s = useStore.getState();
  const file = activeFileOf(s, s.language);
  save(editorBridge.getCode(s.language, file.id), file.name, 'text/plain;charset=utf-8');
  toast.success(`Downloaded ${file.name}`, { duration: 1500 });
}

/** All tabs of one language, or of every language (one folder each). */
export function downloadZip(language?: Language) {
  const files: Zippable = language ? languageFiles(language) : Object.fromEntries(LANGUAGES.map((lang) => [lang, languageFiles(lang)]));
  const name = `cp-studio-${language ?? 'all'}.zip`;
  save(zipSync(files, { level: 6 }), name, 'application/zip');
  toast.success(`Downloaded ${name}`, { duration: 1500 });
}
