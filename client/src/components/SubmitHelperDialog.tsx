import { Check, Download, ExternalLink, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { SUBMIT_HELPER_URL, submitHelperVersion } from '../lib/problems';
import { useStore } from '../store';
import { Button, Modal } from './ui';

const close = () => useStore.getState().openDialog(null);

function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-semibold text-muted tabular-nums">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-medium">{title}</div>
        {children}
      </div>
    </li>
  );
}

const link = 'inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2';

/** How to install the userscript that fills code in on Codeforces, AtCoder, CodeChef and LeetCode. */
export function SubmitHelperDialog() {
  const open = useStore((s) => s.dialog === 'submitHelper');
  const version = open ? submitHelperVersion() : null;

  return (
    <Modal open={open} onClose={close} title="Auto-fill on the judge" description="Your code lands in the judge's editor with the language picked.">
      <div className="space-y-4 text-[13px] leading-relaxed">
        {version ? (
          <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-success">
            <Check className="size-4 shrink-0" />
            The helper is installed (version {version}). Submit now fills your code in.
          </p>
        ) : (
          <p className="text-muted">
            Websites can't type into each other's pages, so this takes a small browser helper (a userscript). Install it once; after that{' '}
            <b className="text-fg">Submit</b> on a Codeforces, AtCoder, CodeChef or LeetCode problem opens the judge with your code already in its editor.
          </p>
        )}

        <ol className="space-y-4">
          <Step
            n={1}
            title={
              <>
                Add{' '}
                <a href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer" className={link}>
                  Tampermonkey
                  <ExternalLink className="size-3" />
                </a>{' '}
                to your browser
              </>
            }
          >
            <p className="text-xs text-muted">
              Chrome: Extensions, Tampermonkey, Details, turn on <b className="text-fg">Allow user scripts</b>. Edge: turn on{' '}
              <b className="text-fg">Developer mode</b> in edge://extensions. Firefox needs nothing more (Violentmonkey works too).
            </p>
          </Step>
          <Step n={2} title="Install the CP Studio helper">
            <a href={SUBMIT_HELPER_URL} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium">
              <Download className="size-4" />
              Install helper
            </a>
            <p className="text-xs text-muted">Tampermonkey shows the script: click Install.</p>
          </Step>
          <Step n={3} title="Reload CP Studio">
            <Button size="sm" onClick={() => location.reload()}>
              <RefreshCw />
              Reload
            </Button>
          </Step>
        </ol>

        <p className="border-t border-line pt-3 text-xs text-subtle">
          The helper runs only on those four sites and on CP Studio. It fills in the editor and picks the language; you still press Submit yourself.
          Without it, Submit copies your code for Ctrl+V.
        </p>
      </div>
    </Modal>
  );
}
