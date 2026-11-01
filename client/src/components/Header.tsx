import { AlertTriangle, BookOpen, Check, ChevronDown, Expand, FileCode2, Keyboard, History, ListChecks, Lock, LockOpen, LogIn, LogOut, PanelTopClose, Play, Save, Settings, Shrink, Sparkles, Trash2, Trophy, UserRound } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'wouter';
import { navigate } from 'wouter/use-browser-location';
import { goToSignIn, signOut } from '../lib/auth';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META, LANGUAGES } from '../lib/languages';
import { toggleAssistant, toggleFullscreen, toggleHeader, toggleLayoutLock, useFullscreen } from '../lib/layout';
import { keyLabel } from '../lib/platform';
import { runTests } from '../lib/runner';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { useStore } from '../store';
import type { AccountUser, Language, Template } from '../types';
import { AppModeSwitch } from './ThemePicker';
import { Timer } from './Timer';
import { Button, cn, Kbd, Tip } from './ui';

/** Angle brackets around a text cursor, drawn in the text color so the mark suits every theme. */
export function Logo() {
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

  const current = LANGUAGE_META[language];
  const currentMissing = toolchains && !toolchains[language].available;

  return (
    <DropdownMenu.Root>
      <Tip label="Language" keys={['Alt', '1 · 2 · 3']}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Language: ${current.label}`}
            className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-panel pr-2 pl-3 text-[13px] font-medium transition outline-none hover:border-line-strong hover:bg-hover focus-visible:border-accent/60 data-[state=open]:border-line-strong data-[state=open]:bg-hover"
          >
            <span className="size-2 rounded-full" style={{ background: current.color }} />
            {current.label}
            {currentMissing && <AlertTriangle className="size-3 text-warning" />}
            <ChevronDown className="size-3.5 text-subtle" />
          </button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="popover z-50 w-80 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.RadioGroup value={language} onValueChange={(v) => setLanguage(v as Language)}>
            {LANGUAGES.map((lang, i) => {
              const meta = LANGUAGE_META[lang];
              const info = toolchains?.[lang];
              const missing = info && !info.available;
              return (
                <DropdownMenu.RadioItem
                  key={lang}
                  value={lang}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-hover"
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      {meta.label}
                      {missing && <AlertTriangle className="size-3 text-warning" />}
                    </span>
                    <span className={cn('block truncate text-[11.5px]', missing ? 'text-warning' : 'text-subtle')}>
                      {missing ? 'Not installed on the server' : info?.version || meta.label}
                    </span>
                  </span>
                  <Kbd keys={['Alt', String(i + 1)]} />
                  <span className="w-3.5 shrink-0">
                    <DropdownMenu.ItemIndicator>
                      <Check className="size-3.5 text-accent" />
                    </DropdownMenu.ItemIndicator>
                  </span>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
    editorBridge.cursorToStart(language);
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

export function Avatar({ user, size = 28 }: { user: AccountUser; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = (user.name || user.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  return user.image && !broken ? (
    <img
      src={user.image}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent/15 font-semibold text-accent"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function AccountMenu() {
  const accounts = useStore((s) => Boolean(s.serverConfig?.accounts));
  const account = useStore((s) => s.account);
  if (!accounts) return null;

  if (account.status !== 'signedIn') {
    if (account.status === 'loading') return <span className="ml-0.5 size-7 shrink-0 animate-pulse rounded-full bg-panel-2" aria-hidden />;
    return (
      <Button variant="secondary" onClick={() => goToSignIn()} className="ml-0.5">
        <LogIn />
        <span className="hidden sm:inline">Sign in</span>
      </Button>
    );
  }
  const { user } = account;
  return (
    <DropdownMenu.Root>
      <Tip label={user.name}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Account"
            className="ml-0.5 shrink-0 rounded-full ring-2 ring-transparent transition outline-none hover:ring-line-strong focus-visible:ring-accent/60 data-[state=open]:ring-accent/50"
          >
            <Avatar user={user} />
          </button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="popover z-50 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <div className="flex items-center gap-3 px-2 pt-1.5 pb-2.5">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>
          <DropdownMenu.Separator className="mb-1.5 h-px bg-line" />
          <div className="px-2 pt-1 pb-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold tracking-wide text-subtle uppercase">
              Appearance
              <Kbd keys={['Alt', 'T']} />
            </div>
            <AppModeSwitch />
          </div>
          <DropdownMenu.Separator className="mb-1.5 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => navigate('/')} className={cn(menuItem, 'text-[13px]')}>
            <ListChecks className="size-3.5 text-muted" />
            Home
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => navigate('/contests')} className={cn(menuItem, 'text-[13px]')}>
            <Trophy className="size-3.5 text-muted" />
            Contests
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => navigate('/resources')} className={cn(menuItem, 'text-[13px]')}>
            <BookOpen className="size-3.5 text-muted" />
            Resources
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => navigate('/history')} className={cn(menuItem, 'text-[13px]')}>
            <History className="size-3.5 text-muted" />
            History
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => navigate('/profile')} className={cn(menuItem, 'text-[13px]')}>
            <UserRound className="size-3.5 text-muted" />
            Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => {
              // Settings live in the editor.
              if (location.pathname !== '/editor') navigate('/editor');
              useStore.getState().openDialog('settings');
            }}
            className={cn(menuItem, 'text-[13px]')}
          >
            <Settings className="size-3.5 text-muted" />
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => void signOut()} className={cn(menuItem, 'text-[13px]')}>
            <LogOut className="size-3.5 text-muted" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FullscreenButton() {
  const fullscreen = useFullscreen();
  return (
    <Tip label={fullscreen ? 'Exit full screen' : 'Full screen'} keys={['Alt', 'Enter']}>
      <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} className="hidden sm:inline-flex">
        {fullscreen ? <Shrink /> : <Expand />}
      </Button>
    </Tip>
  );
}

export function Header() {
  const running = useStore((s) => s.running);
  const assistantOpen = useStore((s) => s.assistantOpen);
  const locked = useStore((s) => s.settings.layoutLocked);
  const { openDialog } = useStore.getState();

  return (
    <header className="flex h-13 shrink-0 items-center gap-1.5 overflow-x-auto px-2 sm:gap-3 sm:px-3">
      <Tip label="Home">
        <Link href="/" className="hidden items-center gap-2 rounded-md pr-1 text-fg sm:flex">
          <Logo />
          <span className="hidden text-[15px] font-semibold tracking-[-0.015em] whitespace-nowrap lg:block">
            CP <span className="font-medium text-muted">Studio</span>
          </span>
        </Link>
      </Tip>
      <LanguageSwitcher />
      <TemplateMenu />
      <Tip label="Practice sheet: 272 Codeforces problems, topic by topic">
        <Button variant="ghost" onClick={() => navigate('/')} className="shrink-0">
          <ListChecks />
          <span className="hidden xl:inline">Sheet</span>
        </Button>
      </Tip>

      <div className="flex-1" />

      <Timer />
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

      <FullscreenButton />

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
      <Tip label="Hide the top bar" keys={['Alt', 'H']}>
        <Button variant="ghost" size="icon" onClick={toggleHeader} aria-label="Hide the top bar" className="hidden md:inline-flex">
          <PanelTopClose />
        </Button>
      </Tip>
      <Tip label="Keyboard shortcuts" keys={['Alt', '/']}>
        <Button variant="ghost" size="icon" onClick={() => openDialog('shortcuts')} aria-label="Keyboard shortcuts" className="hidden lg:inline-flex">
          <Keyboard />
        </Button>
      </Tip>
      <Tip label="Settings and editor theme">
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
      <AccountMenu />
    </header>
  );
}
