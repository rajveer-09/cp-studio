import { toast } from 'sonner';
import type { Language } from '../types';
import { LANGUAGE_META, LANGUAGES } from './languages';
import { monaco } from './monaco';

// The formatters are WebAssembly builds of clang-format (C++/Java) and Ruff (Python). They run in the
// browser and are only downloaded the first time someone formats code.
let clang: Promise<typeof import('@wasm-fmt/clang-format/vite')> | null = null;
let ruff: Promise<typeof import('@wasm-fmt/ruff_fmt/vite')> | null = null;

const loadClang = () =>
  (clang ??= import('@wasm-fmt/clang-format/vite').then(async (module) => {
    await module.default();
    return module;
  }));

const loadRuff = () =>
  (ruff ??= import('@wasm-fmt/ruff_fmt/vite').then(async (module) => {
    await module.default();
    return module;
  }));

export async function formatCode(language: Language, code: string, tabSize: number): Promise<string> {
  if (language === 'python') {
    const { format } = await loadRuff();
    return format(code, 'main.py', { indent_width: tabSize, line_width: 100 });
  }
  const { format } = await loadClang();
  const style = `{BasedOnStyle: Google, IndentWidth: ${tabSize}, ColumnLimit: 100, SortIncludes: Never, AllowShortFunctionsOnASingleLine: Empty, AccessModifierOffset: -${tabSize}}`;
  return format(code, language === 'java' ? 'Main.java' : 'main.cpp', style);
}

export function registerFormatters() {
  for (const language of LANGUAGES) {
    monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_META[language].monaco, {
      async provideDocumentFormattingEdits(model, options) {
        try {
          const formatted = await formatCode(language, model.getValue(), options.tabSize);
          return formatted === model.getValue() ? [] : [{ range: model.getFullModelRange(), text: formatted }];
        } catch (err) {
          // Ruff refuses to format code with syntax errors and says where the error is.
          toast.error('Could not format the code', { description: err instanceof Error ? err.message : String(err) });
          return [];
        }
      },
    });
  }
}
