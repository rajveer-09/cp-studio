import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  GitCompare,
  KeyRound,
  PanelRightClose,
  Plus,
  Sparkles,
  Square,
  TextSelect,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addGeneratedTests, COMMANDS, openFixReview, sendToAssistant, stopAssistant, type AssistantCommand } from '../../lib/assistant';
import { LANGUAGE_META, TONE_BG, VERDICT_META } from '../../lib/languages';
import { testVerdict } from '../../lib/verdict';
import { useStore } from '../../store';
import type { ChatMessage } from '../../types';
import { Button, cn, Tip } from '../ui';
import { Markdown } from './Markdown';

function diffStats(before: string, after: string) {
  const remaining = new Map<string, number>();
  for (const line of before.split('\n')) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split('\n')) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) remaining.set(line, count - 1);
    else added++;
  }
  const removed = [...remaining.values()].reduce((sum, n) => sum + n, 0);
  return { added, removed };
}

function FixCard({ message }: { message: ChatMessage }) {
  const fix = message.fix!;
  const stats = useMemo(() => diffStats(fix.originalCode, fix.fixedCode), [fix.originalCode, fix.fixedCode]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel-2/60">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
          <Wand2 className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">Proposed fix</div>
          <div className="text-xs text-muted">{fix.summary}</div>
        </div>
        <span className="shrink-0 font-mono text-[11px]">
          <span className="text-success">+{stats.added}</span> <span className="text-danger">−{stats.removed}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2">
        {fix.status === 'pending' && (
          <>
            <Button size="sm" variant="primary" onClick={() => openFixReview(message.id)}>
              <GitCompare />
              Review changes
            </Button>
            <span className="text-[11.5px] text-subtle">Nothing changes until you accept.</span>
          </>
        )}
        {fix.status === 'applied' && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" />
            Applied to your code
          </span>
        )}
        {fix.status === 'rejected' && (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <XCircle className="size-3.5" />
              Rejected
            </span>
            <Button size="sm" variant="ghost" onClick={() => openFixReview(message.id)}>
              Review again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function TestsCard({ message }: { message: ChatMessage }) {
  const { items, added } = message.tests!;
  return (
    <div className="mt-3 space-y-2">
      {items.map((test, i) => (
        <div key={i} className="rounded-lg border border-line bg-panel-2/60 p-2.5">
          <div className="mb-1.5 text-xs font-medium">{test.reason || `Test ${i + 1}`}</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Input', test.input],
              ['Expected', test.expectedOutput],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-subtle uppercase">{label}</div>
                <pre className="max-h-28 overflow-auto rounded-md bg-bg/60 px-2 py-1.5 font-mono text-[11.5px]">{value || ' '}</pre>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" variant={added ? 'secondary' : 'primary'} disabled={added} onClick={() => addGeneratedTests(message.id)}>
        {added ? <Check /> : <Plus />}
        {added ? 'Added to your test cases' : `Add ${items.length} test case${items.length > 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    const command = /^\/(\w+)\s*([\s\S]*)$/.exec(message.content);
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent/12 px-3.5 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap">
          {command ? (
            <>
              <span className="mr-1.5 rounded-md bg-accent/20 px-1.5 py-0.5 font-mono text-xs font-semibold text-accent">/{command[1]}</span>
              {command[2]}
            </>
          ) : (
            message.content
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-white">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 text-[13px]">
        {message.status === 'pending' ? (
          <div className="shimmer pt-0.5 font-medium">Thinking…</div>
        ) : message.status === 'error' ? (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-danger">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{message.content}</span>
          </div>
        ) : (
          <Markdown content={message.content} streaming={message.status === 'streaming'} />
        )}
        {message.fix && <FixCard message={message} />}
        {message.tests && <TestsCard message={message} />}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-2 py-6 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-accent/12 text-accent">
        <Sparkles className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold">How can I help?</h3>
      <p className="mt-1 max-w-[290px] text-[13px] text-muted">
        I can see your code, test cases, outputs and errors. Ask anything, or start with a command:
      </p>
      <div className="mt-4 grid w-full max-w-[330px] gap-1.5">
        {COMMANDS.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => sendToAssistant(`/${c.name}`)}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2/50 px-3 py-2 text-left transition hover:border-accent/40 hover:bg-hover"
          >
            <span className="w-[5.5rem] shrink-0 font-mono text-xs font-semibold text-accent">/{c.name}</span>
            <span className="text-xs text-muted">{c.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-muted [&_svg]:size-3', className)}>
      {children}
    </span>
  );
}

function Composer() {
  const [text, setText] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const busy = useStore((s) => s.aiBusy);
  const language = useStore((s) => s.language);
  const selection = useStore((s) => s.selection);
  const activeIndex = useStore((s) => s.tests.findIndex((t) => t.id === s.activeTestId));
  const verdict = useStore((s) => (s.lastRun?.language === s.language ? testVerdict(s, s.activeTestId) : undefined));
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const slash = /^\/(\w*)$/.exec(text);
  const query = slash?.[1].toLowerCase();
  const suggestions = query !== undefined ? COMMANDS.filter((c) => c.name.startsWith(query)) : [];
  const highlighted = suggestions[menuIndex % Math.max(suggestions.length, 1)];

  useEffect(() => setMenuIndex(0), [query]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const submit = (value = text) => {
    if (!value.trim() || busy) return;
    setText('');
    void sendToAssistant(value);
  };

  const complete = (command: AssistantCommand) => {
    setText(`/${command.name} `);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMenuIndex((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        complete(highlighted);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit(`/${highlighted.name}`);
        return;
      }
      if (e.key === 'Escape') {
        setText('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative shrink-0 border-t border-line p-3">
      {suggestions.length > 0 && (
        <div className="popover absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-pop" data-state="open">
          {suggestions.map((c) => (
            <button
              key={c.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setMenuIndex(suggestions.indexOf(c))}
              onClick={() => submit(`/${c.name}`)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left', c === highlighted && 'bg-hover')}
            >
              <span className="w-[5.5rem] shrink-0 font-mono text-xs font-semibold text-accent">/{c.name}</span>
              <span className="truncate text-xs text-muted">{c.description}</span>
            </button>
          ))}
          <div className="px-2.5 pt-1 pb-0.5 text-[10.5px] text-subtle">↵ run · Tab add details · Esc close</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pb-2 text-[11px]">
        <Chip>
          <span className="size-1.5 rounded-full" style={{ background: LANGUAGE_META[language].color }} />
          {LANGUAGE_META[language].label} code
        </Chip>
        {selection && (
          <Chip className="border-accent/30 text-accent">
            <TextSelect />
            Lines {selection.startLine}–{selection.endLine}
          </Chip>
        )}
        {verdict && (
          <Chip>
            <span className={cn('size-1.5 rounded-full', TONE_BG[VERDICT_META[verdict].tone])} />
            Case {activeIndex + 1}: {VERDICT_META[verdict].short}
          </Chip>
        )}
      </div>

      <div className="flex items-end gap-2 rounded-xl border border-line bg-panel-2/60 p-1.5 pl-3 transition focus-within:border-accent/60">
        <textarea
          id="assistant-input"
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about your code, or type / for commands"
          className="max-h-[180px] min-h-6 flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed placeholder:text-subtle"
        />
        {busy ? (
          <Tip label="Stop" side="top">
            <Button size="icon-sm" onClick={stopAssistant} aria-label="Stop">
              <Square className="!size-3 fill-current" />
            </Button>
          </Tip>
        ) : (
          <Button size="icon-sm" variant="primary" disabled={!text.trim()} onClick={() => submit()} aria-label="Send">
            <ArrowUp />
          </Button>
        )}
      </div>
      <p className="mt-1.5 px-0.5 text-[10.5px] text-subtle">AI can make mistakes. Code changes are applied only after you approve them.</p>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-panel-2 text-muted">
        <KeyRound className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold">The AI assistant is off</h3>
      <p className="max-w-[280px] text-[13px] text-muted">
        Add your Gemini API key to <code className="rounded bg-panel-2 px-1 font-mono text-xs">server/.env</code> and restart the server:
      </p>
      <code className="rounded-lg bg-panel-2 px-3 py-1.5 font-mono text-xs">GEMINI_API_KEY=your-key</code>
    </div>
  );
}

export function AssistantPanel() {
  const chat = useStore((s) => s.chat);
  const config = useStore((s) => s.serverConfig);
  const busy = useStore((s) => s.aiBusy);
  const { clearChat, setAssistantOpen } = useStore.getState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastCount = useRef(chat.length);

  // Follow new content while the user is at the bottom; don't yank them back if they scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (chat.length > lastCount.current) stickToBottom.current = true;
    lastCount.current = chat.length;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const onScroll = () => {
    const el = scrollRef.current!;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3">
        <Sparkles className="size-4 text-accent" />
        <span className="text-[13px] font-semibold">AI Assistant</span>
        {config?.aiEnabled && <span className="truncate rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">{config.model}</span>}
        <div className="flex-1" />
        {chat.length > 0 && (
          <Tip label="Clear chat">
            <Button variant="ghost" size="icon-sm" onClick={clearChat} disabled={busy} aria-label="Clear chat">
              <Trash2 />
            </Button>
          </Tip>
        )}
        <Tip label="Hide assistant" keys={['Alt', 'B']}>
          <Button variant="ghost" size="icon-sm" onClick={() => setAssistantOpen(false)} aria-label="Hide assistant">
            <PanelRightClose />
          </Button>
        </Tip>
      </div>

      {config && !config.aiEnabled ? (
        <NotConfigured />
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {chat.length === 0 ? (
              <Welcome />
            ) : (
              <div className="space-y-5">
                {chat.map((message) => (
                  <MessageItem key={message.id} message={message} />
                ))}
              </div>
            )}
          </div>
          <Composer />
        </>
      )}
    </div>
  );
}
