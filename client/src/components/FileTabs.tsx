import { ArrowRightToLine, Copy, FileCode2, Pencil, Plus, X, XSquare } from 'lucide-react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META } from '../lib/languages';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { MAX_FILES, useStore } from '../store';
import type { Language } from '../types';
import { cn, Tip } from './ui';

function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

function nextName(language: Language, taken: string[]): string {
  const [stem, ext] = splitName(LANGUAGE_META[language].file);
  for (let n = 2; ; n++) {
    const name = `${stem}${n}${ext}`;
    if (!taken.includes(name)) return name;
  }
}

function withExtension(language: Language, name: string): string {
  const ext = splitName(LANGUAGE_META[language].file)[1];
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      defaultValue={initial}
      onFocus={(e) => e.currentTarget.setSelectionRange(0, splitName(initial)[0].length)}
      onBlur={(e) => onDone(cancelled.current ? null : e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      spellCheck={false}
      className="w-32 rounded border border-accent/60 bg-panel-2 px-1 py-px font-medium"
    />
  );
}

const menuItem =
  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-muted';

function NewTabMenu({ language, taken }: { language: Language; taken: string[] }) {
  const customTemplates = useStore((s) => s.customTemplates);
  const templates = [...BUILTIN_TEMPLATES, ...customTemplates].filter((t) => t.language === language);

  const create = (code: string) => {
    if (taken.length >= MAX_FILES) {
      toast.error(`You can have up to ${MAX_FILES} ${LANGUAGE_META[language].label} tabs`);
      return;
    }
    const id = useStore.getState().addFile(language, { name: nextName(language, taken), code });
    editorBridge.cursorToStart(language, id);
  };

  return (
    <DropdownMenu.Root>
      <Tip label="New tab">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="New tab"
            className="flex w-9 shrink-0 items-center justify-center text-subtle transition hover:bg-hover hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className="popover z-50 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            New {LANGUAGE_META[language].label} tab from
          </DropdownMenu.Label>
          {templates.map((t) => (
            <DropdownMenu.Item key={t.id} onSelect={() => create(t.code)} className={menuItem}>
              <FileCode2 />
              <span className="font-medium">{t.name}</span>
              {t.description && <span className="truncate text-xs text-subtle">{t.description}</span>}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item onSelect={() => create(editorBridge.getCode(language))} className={menuItem}>
            <Copy />
            Duplicate current tab
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FileTabs() {
  const language = useStore((s) => s.language);
  // Subscribe to ids and names only, so typing in the editor doesn't re-render the tab bar.
  const tabsKey = useStore((s) => s.files[s.language].map((f) => `${f.id}\u0000${f.name}`).join('\u0001'));
  const activeId = useStore((s) => s.activeFile[s.language]);
  const tabs = tabsKey.split('\u0001').map((entry) => {
    const [id, name] = entry.split('\u0000');
    return { id, name };
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  const color = LANGUAGE_META[language].color;

  const rename = (id: string, value: string | null) => {
    setRenaming(null);
    const name = value?.trim().slice(0, 40);
    if (name) useStore.getState().renameFile(language, id, withExtension(language, name));
  };

  const close = (id: string) => {
    const state = useStore.getState();
    const list = state.files[language];
    const index = list.findIndex((f) => f.id === id);
    if (index < 0 || list.length <= 1) return;
    const file = { ...list[index], code: editorBridge.getCode(language, id) };
    state.closeFile(language, id);
    setTimeout(() => editorBridge.disposeModel(language, id));
    toast(`Closed ${file.name}`, {
      action: {
        label: 'Undo',
        onClick: () =>
          useStore.setState((s) => {
            const files = [...s.files[language]];
            files.splice(Math.min(index, files.length), 0, file);
            return { files: { ...s.files, [language]: files }, activeFile: { ...s.activeFile, [language]: file.id } };
          }),
      },
    });
  };

  /** Closes several tabs at once (one stays open), with a single Undo that puts them all back. */
  const closeMany = (ids: string[], keep: string) => {
    const state = useStore.getState();
    const before = state.files[language].map((f) => ({ ...f, code: editorBridge.getCode(language, f.id) }));
    const activeBefore = state.activeFile[language];
    const closing = new Set(ids.filter((id) => id !== keep));
    if (!closing.size) return;
    useStore.setState((s) => ({
      files: { ...s.files, [language]: s.files[language].filter((f) => !closing.has(f.id)) },
      activeFile: { ...s.activeFile, [language]: closing.has(s.activeFile[language]) ? keep : s.activeFile[language] },
    }));
    setTimeout(() => closing.forEach((id) => editorBridge.disposeModel(language, id)));
    toast(`Closed ${closing.size} tab${closing.size === 1 ? '' : 's'}`, {
      action: {
        label: 'Undo',
        onClick: () => useStore.setState((s) => ({ files: { ...s.files, [language]: before }, activeFile: { ...s.activeFile, [language]: activeBefore } })),
      },
    });
  };

  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <div className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          const toTheRight = tabs.slice(index + 1).map((t) => t.id);
          return (
            <ContextMenu.Root key={tab.id}>
              <ContextMenu.Trigger asChild>
                <div
                  className={cn(
                    'group relative flex shrink-0 items-center gap-1.5 border-r border-line pr-1.5 pl-3 text-[13px] transition-colors',
                    active ? 'bg-panel text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg',
                  )}
                >
                  {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                  <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                  {renaming === tab.id ? (
                    <RenameInput initial={tab.name} onDone={(name) => rename(tab.id, name)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => useStore.getState().selectFile(language, tab.id)}
                      onDoubleClick={() => setRenaming(tab.id)}
                      title="Double-click to rename"
                      className="max-w-40 truncate py-2 font-medium"
                    >
                      {tab.name}
                    </button>
                  )}
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Close ${tab.name}`}
                      onClick={() => close(tab.id)}
                      className={cn('rounded p-0.5 text-subtle hover:bg-hover hover:text-fg', active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70')}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="popover z-50 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
                  <ContextMenu.Item onSelect={() => setRenaming(tab.id)} className={menuItem}>
                    <Pencil />
                    Rename
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="my-1 h-px bg-line" />
                  <ContextMenu.Item disabled={tabs.length <= 1} onSelect={() => close(tab.id)} className={cn(menuItem, 'data-[disabled]:opacity-40')}>
                    <X />
                    Close
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    disabled={tabs.length <= 1}
                    onSelect={() =>
                      closeMany(
                        tabs.map((t) => t.id),
                        tab.id,
                      )
                    }
                    className={cn(menuItem, 'data-[disabled]:opacity-40')}
                  >
                    <XSquare />
                    Close other tabs
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    disabled={!toTheRight.length}
                    onSelect={() => closeMany(toTheRight, tab.id)}
                    className={cn(menuItem, 'data-[disabled]:opacity-40')}
                  >
                    <ArrowRightToLine />
                    Close tabs to the right
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          );
        })}
      </div>
      <NewTabMenu language={language} taken={tabs.map((t) => t.name)} />
    </div>
  );
}
