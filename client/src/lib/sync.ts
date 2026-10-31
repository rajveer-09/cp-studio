import { useEffect } from 'react';
import { toast } from 'sonner';
import { freshWorkspace, MAX_FILES, SYNCED_KEYS, useStore, type SyncedWorkspace } from '../store';
import { LANGUAGES } from './languages';
import { api } from './api';
import { editorBridge } from './editor';
import { DEFAULT_CODE } from './templates';

/**
 * Keeps a signed-in user's workspace (tabs, tests, templates, settings) in their account. Changes are saved a
 * moment after they stop; coming back to the tab picks up changes made on another device. This device's
 * unsaved edits (e.g. made offline) win over the account's copy the next time it connects.
 */
const META_KEY = 'cp-studio-sync';
const SAVE_DELAY_MS = 1500;

interface SyncMeta {
  userId: string;
  /** Changed here since the last successful save. */
  dirty: boolean;
}

function readMeta(): SyncMeta | null {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta | null) {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // Storage blocked: syncing still works for this page load.
  }
}

const pick = (state: SyncedWorkspace): SyncedWorkspace =>
  Object.fromEntries(SYNCED_KEYS.map((key) => [key, state[key]])) as unknown as SyncedWorkspace;
const sameRefs = (a: SyncedWorkspace, b: SyncedWorkspace) => SYNCED_KEYS.every((key) => a[key] === b[key]);

/** Anything beyond the starting templates worth keeping. */
function hasWork(w: SyncedWorkspace): boolean {
  return (
    Boolean(w.problemMeta) ||
    w.customTemplates.length > 0 ||
    LANGUAGES.some((l) => w.files[l].length > 1 || w.files[l].some((f) => f.code.trim() !== DEFAULT_CODE[l].trim()))
  );
}

let applying = false;

/** Replaces the workspace, updating open editor tabs too (each change can be undone with Ctrl+Z). */
function apply(data: Partial<SyncedWorkspace>) {
  const workspace = { ...freshWorkspace(), ...data } as SyncedWorkspace;
  applying = true;
  try {
    useStore.setState({ ...workspace, results: {}, lastRun: null, compile: null, debug: null });
    for (const language of LANGUAGES) {
      for (const file of workspace.files[language]) {
        if (editorBridge.getCode(language, file.id) !== file.code) editorBridge.setCode(language, file.code, file.id);
      }
    }
  } finally {
    applying = false;
  }
}

/** Adds the tabs this browser had before signing in that the account doesn't have yet. */
function addTabs(from: SyncedWorkspace) {
  let added = 0;
  for (const language of LANGUAGES) {
    for (const file of from.files[language]) {
      const state = useStore.getState();
      if (state.files[language].some((f) => f.code === file.code) || file.code.trim() === DEFAULT_CODE[language].trim()) continue;
      if (state.files[language].length >= MAX_FILES) break;
      const taken = new Set(state.files[language].map((f) => f.name));
      const name = taken.has(file.name) ? file.name.replace(/(\.\w+)$/, ' (this browser)$1') : file.name;
      state.addFile(language, { name, code: file.code });
      added++;
    }
  }
  toast.success(added ? `Added ${added} tab${added === 1 ? '' : 's'} from this browser` : 'Nothing new to add');
}

let flush: (() => Promise<void>) | null = null;

async function start(userId: string): Promise<() => void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | null = null;
  let updatedAt = '';
  let last = pick(useStore.getState());

  const save = async () => {
    clearTimeout(timer);
    const snapshot = pick(useStore.getState());
    try {
      ({ updatedAt } = await api.me.saveWorkspace(snapshot));
      if (sameRefs(snapshot, pick(useStore.getState()))) writeMeta({ userId, dirty: false });
    } catch {
      // Offline or the server is asleep: still marked dirty, so it is saved later.
    }
  };
  const saveNow = () => (saving = save().finally(() => (saving = null)));

  let remote = null;
  try {
    remote = await api.me.workspace();
  } catch {
    return () => {};
  }
  if (stopped) return () => {};

  const meta = readMeta();
  const local = pick(useStore.getState());
  if (!remote) {
    await saveNow();
    if (hasWork(local)) toast.success('Your work is saved to your account', { description: 'Tabs, tests, templates and settings now follow you to any device.' });
  } else if (meta?.userId === userId && meta.dirty) {
    await saveNow(); // edited here while offline: this device's copy is newer
  } else {
    updatedAt = remote.updatedAt;
    const guest = meta?.userId !== userId && hasWork(local) ? local : null;
    if (JSON.stringify(remote.data) !== JSON.stringify(local)) apply(remote.data as Partial<SyncedWorkspace>);
    if (guest) {
      toast('Loaded your account’s work', {
        description: 'This browser had other tabs before you signed in.',
        action: { label: 'Add them', onClick: () => addTabs(guest) },
        duration: 15000,
      });
    }
  }
  writeMeta({ userId, dirty: false });
  last = pick(useStore.getState());

  const unsubscribe = useStore.subscribe((state) => {
    const now = pick(state);
    if (sameRefs(now, last)) return;
    last = now;
    if (applying) return;
    writeMeta({ userId, dirty: true });
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY_MS);
  });

  // Back to this tab: take changes saved from another device, unless this one has unsaved edits.
  const onVisible = async () => {
    if (document.visibilityState !== 'visible' || saving || readMeta()?.dirty) return;
    try {
      const fresh = await api.me.workspace();
      if (stopped || !fresh || fresh.updatedAt === updatedAt || readMeta()?.dirty) return;
      updatedAt = fresh.updatedAt;
      apply(fresh.data as Partial<SyncedWorkspace>);
      last = pick(useStore.getState());
    } catch {
      // Try again next time.
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  const onLeave = () => readMeta()?.dirty && void saveNow();
  window.addEventListener('pagehide', onLeave);

  flush = async () => {
    if (readMeta()?.dirty) await saveNow();
    else if (saving) await saving;
  };
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onLeave);
    flush = null;
  };
}

/** Syncs while someone is signed in. */
export function useWorkspaceSync() {
  const userId = useStore((s) => (s.account.status === 'signedIn' ? s.account.user.id : null));
  useEffect(() => {
    if (!userId) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void start(userId).then((stop) => {
      if (cancelled) stop();
      else cleanup = stop;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [userId]);
}

/** Before signing out: saves pending edits, then clears this browser so the next person starts fresh. */
export async function leaveWorkspace() {
  await flush?.();
  apply(freshWorkspace());
  writeMeta(null);
}
