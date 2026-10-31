import { Check, Keyboard, Loader2 } from 'lucide-react';
import { aiAccess } from '../lib/auth';
import { LANGUAGE_META } from '../lib/languages';
import { useRunSummary } from '../lib/verdict';
import { useStore } from '../store';
import { cn } from './ui';

export function StatusBar() {
  const language = useStore((s) => s.language);
  const cppStandard = useStore((s) => s.settings.cppStandard);
  const cursor = useStore((s) => s.cursor);
  const selection = useStore((s) => s.selection);
  const lastRun = useStore((s) => s.lastRun);
  const summary = useRunSummary();
  const running = useStore((s) => s.running);
  const serverOnline = useStore((s) => s.serverOnline);
  const ai = useStore(aiAccess);
  const meta = LANGUAGE_META[language];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 px-3 text-[11.5px] whitespace-nowrap text-subtle sm:gap-4 sm:px-4">
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
        {meta.label}
        {language === 'cpp' && ` · ${cppStandard.toUpperCase()}`}
      </span>
      <span>
        Ln {cursor.line}, Col {cursor.column}
        <span className="hidden md:inline">{selection && ` · ${selection.endLine - selection.startLine + 1} lines selected`}</span>
      </span>
      <span className="hidden items-center gap-1 sm:flex">
        <Check className="size-3" />
        Autosaved
      </span>

      <div className="flex-1" />

      {running ? (
        <span className="flex items-center gap-1.5 text-accent">
          <Loader2 className="size-3 animate-spin" />
          Running…
        </span>
      ) : (
        lastRun &&
        summary && (
          <span className={cn(lastRun.compileOk && summary.passed === summary.total ? 'text-success' : 'text-danger')}>
            {lastRun.compileOk ? `${summary.passed}/${summary.total} passed · ${lastRun.maxTimeMs} ms` : 'Compilation error'}
          </span>
        )
      )}

      <span className="flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', !serverOnline ? 'bg-danger' : ai === 'ok' ? 'bg-success' : 'bg-subtle')} />
        {!serverOnline ? 'Server offline' : ai === 'ok' ? 'AI ready' : ai === 'signin' ? 'Sign in for AI' : 'AI off'}
      </span>
      <button
        type="button"
        onClick={() => useStore.getState().openDialog('shortcuts')}
        className="hidden items-center gap-1 hover:text-fg md:flex"
      >
        <Keyboard className="size-3" />
        Shortcuts
      </button>
    </footer>
  );
}
