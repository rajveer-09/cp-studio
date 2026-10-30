import { AlertTriangle, ChevronDown, FileCode2, Keyboard, ListChecks, Lock, LockOpen, Play, Save, Settings, Sparkles, Trash2 } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META, LANGUAGES } from '../lib/languages';
import { toggleAssistant, toggleLayoutLock } from '../lib/layout';
import { keyLabel } from '../lib/platform';
import { runTests } from '../lib/runner';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { useStore } from '../store';
import type { Template } from '../types';
import { ThemeMenu } from './ThemePicker';
import { Button, cn, Tip } from './ui';

/** Angle brackets around a text cursor, drawn in the text color so the mark suits every theme. */
function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px] shrink-0" aria-hidden>
      <defs>
        <linearGradient id="logo-caret" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--accent-hover)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
        </linearGradient>
      </defs>
      <path d="M8.25 6.5 3 12l5.25 5.5M15.75 6.5 21 12l-5.25 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="11" y="7.25" width="2" height="9.5" rx="1" fill="url(#logo-caret)" />
    </svg>
  );
}

function LanguageSwitcher() {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const toolchains = useStore((s) => s.serverConfig?.toolchains);

  return (
    <div className="flex items-center rounded-lg border border-line bg-panel p-0.5">
      {LANGUAGES.map((lang, i) => {
        const meta = LANGUAGE_META[lang];
        const missing = toolchains && !toolchains[lang].available;
        return (
          <Tip
            key={lang}
            label={missing ? `${meta.label} is not installed on the server` : toolchains?.[lang].version || meta.label}
            keys={['Alt', String(i + 1)]}
          >
            <button
              type="button"
              onClick={() => setLanguage(lang)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition sm:px-2.5',
                lang === language ? 'bg-panel-2 text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
              )}
            >
              <span className="size-2 rounded-full" style={{ background: meta.color }} />
              {meta.label}
              {missing && <AlertTriangle className="hidden size-3 text-warning sm:block" />}
            </button>
          </Tip>
        );
      })}
    </div>
  );
}

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-hover';
const menuLabel = 'px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase';

function TemplateMenu() {
  const language = useStore((s) => s.language);
  const customTemplates = useStore((s) => s.customTemplates);
  const removeTemplate = useStore((s) => s.removeTemplate);
  const openDialog = useStore((s) => s.openDialog);

  const builtins = BUILTIN_TEMPLATES.filter((t) => t.language === language);
  const custom = customTemplates.filter((t) => t.language === language);

  const load = (template: Template) => {
    editorBridge.setCode(language, template.code);
    editorBridge.focus();
    toast.success(`Loaded “${template.name}”`, { description: `Press ${keyLabel('Mod')}+Z to undo.` });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" className="hidden sm:inline-flex" aria-label="Templates">
          <FileCode2 />
          <span className="hidden lg:inline">Templates</span>
          <ChevronDown className="!size-3.5 opacity-60" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="popover z-50 w-72 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Label className={menuLabel}>{LANGUAGE_META[language].label} templates</DropdownMenu.Label>
          {builtins.map((t) => (
            <DropdownMenu.Item key={t.id} onSelect={() => load(t)} className={cn(menuItem, 'flex-col items-start gap-0')}>
              <span className="text-[13px] font-medium">{t.name}</span>
              <span className="text-xs text-muted">{t.description}</span>
            </DropdownMenu.Item>
          ))}
          {custom.length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
              <DropdownMenu.Label className={menuLabel}>Your templates</DropdownMenu.Label>
              {custom.map((t) => (
                <DropdownMenu.Item key={t.id} onSelect={() => load(t)} className={cn(menuItem, 'group justify-between')}>
                  <span className="truncate text-[13px] font-medium">{t.name}</span>
                  <button
                    type="button"
                    aria-label={`Delete template ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTemplate(t.id);
                    }}
                    className="rounded p-1 text-subtle opacity-0 group-data-[highlighted]:opacity-100 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenu.Item>
              ))}
            </>
          )}
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => openDialog('saveTemplate')} className={cn(menuItem, 'text-[13px] text-muted')}>
            <Save className="size-3.5" />
            Save current code as a template…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Header() {
  const running = useStore((s) => s.running);
  const assistantOpen = useStore((s) => s.assistantOpen);
  const locked = useStore((s) => s.settings.layoutLocked);
  const { openDialog } = useStore.getState();

  return (
    <header className="flex h-13 shrink-0 items-center gap-1.5 overflow-x-auto px-2 sm:gap-3 sm:px-3">
      <div className="hidden items-center gap-2 pr-1 text-fg sm:flex">
        <Logo />
        <span className="hidden text-[15px] font-semibold tracking-[-0.015em] whitespace-nowrap lg:block">
          CP <span className="font-medium text-muted">Studio</span>
        </span>
      </div>
      <LanguageSwitcher />
      <TemplateMenu />

      <div className="flex-1" />

      <Tip label="Run selected test" keys={['Mod', 'Enter']}>
        <Button onClick={() => runTests('current')} loading={running === 'current'} disabled={Boolean(running)}>
          {running !== 'current' && <Play />}
          <span className="hidden md:inline">Run</span>
        </Button>
      </Tip>
      <Tip label="Run all tests" keys={['Mod', 'Shift', 'Enter']}>
        <Button variant="primary" onClick={() => runTests('all')} loading={running === 'all'} disabled={Boolean(running)}>
          {running !== 'all' && <ListChecks />}
          <span className="hidden sm:inline">Run all</span>
        </Button>
      </Tip>

      <div className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

      <ThemeMenu />
      <Tip label={locked ? 'Layout locked: click to unlock' : 'Lock the layout (panels can’t be resized or moved)'} keys={['Alt', 'K']}>
        <Button
          variant={locked ? 'secondary' : 'ghost'}
          size="icon"
          onClick={toggleLayoutLock}
          aria-label={locked ? 'Unlock layout' : 'Lock layout'}
          aria-pressed={locked}
          className={cn(locked && 'text-accent')}
        >
          {locked ? <Lock /> : <LockOpen />}
        </Button>
      </Tip>
      <Tip label="Keyboard shortcuts" keys={['Alt', '/']}>
        <Button variant="ghost" size="icon" onClick={() => openDialog('shortcuts')} aria-label="Keyboard shortcuts" className="hidden lg:inline-flex">
          <Keyboard />
        </Button>
      </Tip>
      <Tip label="Settings">
        <Button variant="ghost" size="icon" onClick={() => openDialog('settings')} aria-label="Settings">
          <Settings />
        </Button>
      </Tip>
      <Tip label={assistantOpen ? 'Hide assistant' : 'Show assistant'} keys={['Alt', 'B']}>
        <Button
          variant={assistantOpen ? 'secondary' : 'ghost'}
          onClick={toggleAssistant}
          className={cn('[&_svg]:text-accent', assistantOpen && 'text-fg')}
          aria-label="Toggle AI assistant"
        >
          <Sparkles />
          <span className="hidden lg:inline">Assistant</span>
        </Button>
      </Tip>
    </header>
  );
}
