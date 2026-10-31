import { ExternalLink, Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { editorBridge } from '../lib/editor';
import { connectGithub, disconnectGithub, lastRepo, saveToGithub, useGithubAccount } from '../lib/github';
import { LANGUAGE_META } from '../lib/languages';
import { codeForSubmission, PLATFORM_META, problemTabName } from '../lib/problems';
import { activeFileOf, useStore } from '../store';
import { Button, Modal, Switch } from './ui';

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const close = () => useStore.getState().openDialog(null);

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const input = 'h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-[13px] placeholder:text-subtle focus:border-accent/60';

/** Where a solution goes by default: codeforces/1904A.cpp, leetcode/two-sum.py, or practice/<tab name>. */
function defaults() {
  const s = useStore.getState();
  const file = activeFileOf(s, s.language);
  const meta = s.problemMeta;
  return meta
    ? { path: `${meta.platform}/${problemTabName(meta, s.language)}`, message: `Solve ${meta.title} (${PLATFORM_META[meta.platform].label}, ${LANGUAGE_META[s.language].label})` }
    : { path: `practice/${file.name}`, message: `Add ${file.name}` };
}

function ConnectView() {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      const account = await connectGithub();
      toast.success(`Connected as @${account.login}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GitHub sign-in failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4 text-[13px]">
      <p className="text-muted">
        Sign in with <b className="text-fg">your own GitHub account</b> to save solutions to a repository of yours. Each commit is made by you, in your
        account.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>GitHub asks you to approve access to your repositories. CP Studio only writes the files you save.</li>
        <li>The sign-in stays in this browser; nothing is stored on the server. Disconnect any time.</li>
      </ul>
      <Button variant="primary" onClick={connect} loading={busy} className="w-full justify-center">
        {!busy && <GithubMark className="size-4" />}
        Connect GitHub
      </Button>
    </div>
  );
}

function SaveView() {
  const account = useGithubAccount()!;
  const language = useStore((s) => s.language);
  const [repo, setRepo] = useState(lastRepo().name);
  const [isPrivate, setPrivate] = useState(lastRepo().private);
  const [{ path, message }, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const content = codeForSubmission(editorBridge.getCode(language));
      const result = await saveToGithub({ repo, isPrivate, path, content, message });
      toast.success(result.updated ? 'Updated on GitHub' : 'Saved to GitHub', {
        description: `${result.repoCreated ? `Created ${account.login}/${repo}. ` : ''}${path}`,
        action: { label: 'Open', onClick: () => window.open(result.url, '_blank', 'noopener') },
      });
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save to GitHub.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel-2/50 px-3 py-2">
        <img src={account.avatarUrl} alt="" className="size-7 rounded-full" />
        <a href={`https://github.com/${account.login}`} target="_blank" rel="noreferrer" className="text-[13px] font-medium hover:underline">
          @{account.login}
        </a>
        <div className="flex-1" />
        <button type="button" onClick={disconnectGithub} className="text-xs text-muted hover:text-fg hover:underline">
          Disconnect
        </button>
      </div>

      <Field
        label="Repository"
        hint={
          <a href={`https://github.com/${account.login}/${repo}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
            github.com/{account.login}/{repo || '…'} <ExternalLink className="size-3" />
          </a>
        }
      >
        <input value={repo} onChange={(e) => setRepo(e.target.value)} spellCheck={false} className={input} placeholder="cp-solutions" />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12.5px]">
          <Lock className="size-3.5 text-muted" />
          Private, if the repository has to be created
        </span>
        <Switch label="Private repository" checked={isPrivate} onChange={setPrivate} />
      </div>
      <Field label="File" hint="Saving again to the same path updates the file.">
        <input value={path} onChange={(e) => setForm({ path: e.target.value, message })} spellCheck={false} className={input} />
      </Field>
      <Field label="Commit message">
        <input value={message} onChange={(e) => setForm({ path, message: e.target.value })} className={`${input} font-sans`} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!repo.trim() || !path.trim()}>
          {!saving && <GithubMark className="size-4" />}
          Save to GitHub
        </Button>
      </div>
    </form>
  );
}

export function GithubDialog() {
  const open = useStore((s) => s.dialog === 'github');
  const account = useGithubAccount();
  // Fresh defaults each time it opens (the active tab or problem may have changed).
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (open) setKey((k) => k + 1);
  }, [open]);
  return (
    <Modal open={open} onClose={close} title="Save to GitHub" description={account ? 'Commit the current tab to your repository.' : undefined}>
      {account ? <SaveView key={key} /> : <ConnectView />}
    </Modal>
  );
}
