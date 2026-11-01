import { AlertTriangle, ExternalLink, Link2, MoreHorizontal, Pencil, RefreshCw, Unlink } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, type JudgeAccount } from '../lib/api';
import { PLATFORM_META, PLATFORM_ORDER } from '../lib/problems';
import type { Platform } from '../types';
import { PLATFORM_COLORS, relativeTime } from './ProblemsPage';
import { Button, cn } from './ui';

const PROFILE_URL: Record<Platform, (handle: string) => string> = {
  codeforces: (h) => `https://codeforces.com/profile/${h}`,
  atcoder: (h) => `https://atcoder.jp/users/${h}`,
  leetcode: (h) => `https://leetcode.com/u/${h}/`,
  codechef: (h) => `https://www.codechef.com/users/${h}`,
};

/** What each judge tells us beyond the solved count. */
function details(account: JudgeAccount): string {
  const s = account.stats;
  const parts: string[] = [];
  if (account.platform === 'leetcode' && s.solved !== undefined) parts.push(`Easy ${s.easy ?? 0} · Medium ${s.medium ?? 0} · Hard ${s.hard ?? 0}`);
  if (s.rating) parts.push(`Rating ${s.rating}${s.maxRating && s.maxRating !== s.rating ? ` (max ${s.maxRating})` : ''}`);
  if (s.rank) parts.push(s.rank.replace(/\b\w/g, (c) => c.toUpperCase()));
  return parts.join(' · ');
}

const menuItem = 'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-muted';

function LinkForm({ platform, initial, onDone, onCancel }: { platform: Platform; initial?: string; onDone: (accounts: JudgeAccount[]) => void; onCancel?: () => void }) {
  const [handle, setHandle] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = PLATFORM_META[platform].label;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { accounts } = await api.me.linkJudge(platform, handle.trim());
      onDone(accounts);
      toast.success(`Linked your ${label} account`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link it.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex gap-2">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={`Your ${label} username`}
          aria-label={`${label} username`}
          spellCheck={false}
          autoCapitalize="none"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg/60 px-2.5 text-[13px] outline-none placeholder:text-subtle focus:border-accent/60"
        />
        <Button type="submit" size="sm" variant={initial ? 'primary' : 'secondary'} loading={busy} disabled={!handle.trim()} className="h-8">
          {!busy && <Link2 />}
          {initial ? 'Save' : 'Link'}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-8">
            Cancel
          </Button>
        )}
      </div>
      {busy && <p className="mt-1.5 text-[11.5px] text-subtle">Reading your public profile… a long history can take a few seconds.</p>}
      {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
    </form>
  );
}

function JudgeTile({ platform, account, onChange }: { platform: Platform; account?: JudgeAccount; onChange: (accounts: JudgeAccount[]) => void }) {
  const [editing, setEditing] = useState(false);
  const label = PLATFORM_META[platform].label;

  const unlink = async () => {
    try {
      onChange((await api.me.unlinkJudge(platform)).accounts);
      toast.success(`Unlinked ${label}`);
    } catch {
      toast.error('Could not unlink it. Try again.');
    }
  };

  return (
    <div className={cn('rounded-lg border p-3.5', account ? 'border-line bg-panel-2/40' : 'border-dashed border-line-strong')}>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[platform] }} />
        <span className="text-[13px] font-semibold">{label}</span>
        <div className="flex-1" />
        {account && !editing && (
          <>
            <a href={PROFILE_URL[platform](account.handle)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted hover:text-fg">
              <span className="truncate">@{account.handle}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" aria-label={`${label} account options`} className="grid size-6 place-items-center rounded-md text-subtle hover:bg-hover hover:text-fg">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={4} className="popover z-50 w-48 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
                  <DropdownMenu.Item onSelect={() => setEditing(true)} className={menuItem}>
                    <Pencil />
                    Change username
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={unlink} className={cn(menuItem, 'text-danger [&_svg]:text-danger')}>
                    <Unlink />
                    Unlink
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </>
        )}
      </div>

      {!account || editing ? (
        <LinkForm
          platform={platform}
          initial={editing ? account?.handle : undefined}
          onDone={(accounts) => {
            setEditing(false);
            onChange(accounts);
          }}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-[24px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{account.stats.solved ?? '–'}</span>
            <span className="text-[12.5px] text-muted">solved</span>
          </div>
          {details(account) && <div className="mt-1.5 truncate text-[12px] text-muted">{details(account)}</div>}
          <div className={cn('mt-2 flex items-center gap-1 text-[11.5px]', account.error ? 'text-warning' : 'text-subtle')}>
            {account.error ? (
              <>
                <AlertTriangle className="size-3 shrink-0" />
                <span className="truncate">{account.error}</span>
              </>
            ) : (
              account.syncedAt && `Updated ${relativeTime(account.syncedAt)}`
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Link usernames on each judge; their accepted problems then count on the profile. */
export function JudgeProfiles({ accounts, onChange }: { accounts: JudgeAccount[]; onChange: (accounts: JudgeAccount[]) => void }) {
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.me.syncJudges(true);
      onChange(result.accounts);
      toast.success(result.synced ? 'Your judge profiles are up to date' : 'Already up to date', {
        description: result.synced ? undefined : 'Profiles were read in the last couple of minutes.',
      });
    } catch {
      toast.error('Could not reach the judges. Try again later.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-panel">
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[14px] font-semibold">Judge profiles</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Link your usernames to count what the judges accepted. Only public profile data is read.</p>
        </div>
        {accounts.length > 0 && (
          <Button size="sm" variant="ghost" onClick={sync} disabled={syncing} className="shrink-0">
            <RefreshCw className={cn(syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        )}
      </header>
      <div className="grid gap-3 px-5 pt-4 pb-5 sm:grid-cols-2">
        {PLATFORM_ORDER.map((p) => (
          <JudgeTile key={p} platform={p} account={accounts.find((a) => a.platform === p)} onChange={onChange} />
        ))}
      </div>
    </section>
  );
}
