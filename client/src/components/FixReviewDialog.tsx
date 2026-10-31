import { DiffEditor } from '@monaco-editor/react';
import { AlertTriangle, Check, GitCompare, Loader2 } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPT_REVIEW_EVENT } from '../hooks';
import { acceptReview, rejectReview } from '../lib/assistant';
import { normalizeLines } from '../lib/compare';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META } from '../lib/languages';
import { editorThemeOf, monacoThemeName } from '../lib/themes';
import type { monaco } from '../lib/monaco';
import { useStore } from '../store';
import { Button, Kbd, Segmented } from './ui';

export function FixReviewDialog() {
  const review = useStore((s) => s.review);
  const editorTheme = useStore(editorThemeOf);
  const fontSize = useStore((s) => s.settings.fontSize);
  const [layout, setLayout] = useState<'split' | 'inline'>('split');
  const diffRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<monaco.editor.IDiffEditorModel | null>(null);

  // The diff editor keeps its models on unmount (see keepCurrent*Model below); dispose them only
  // once the editor itself is gone, otherwise Monaco throws "TextModel got disposed before…".
  useEffect(() => {
    if (review) return;
    const models = modelsRef.current;
    modelsRef.current = null;
    diffRef.current = null;
    if (models) {
      setTimeout(() => {
        models.original.dispose();
        models.modified.dispose();
      }, 500);
    }
  }, [review]);

  const current = useMemo(() => (review ? editorBridge.getCode(review.language, review.fileId) : ''), [review]);
  const changedSince =
    review?.basedOn !== undefined && normalizeLines(review.basedOn).join('\n') !== normalizeLines(current).join('\n');

  const accept = useCallback(() => {
    if (!review) return;
    // The proposed side is editable, so take whatever the user left there.
    void acceptReview(diffRef.current?.getModifiedEditor().getValue() ?? review.code);
  }, [review]);

  useEffect(() => {
    window.addEventListener(ACCEPT_REVIEW_EVENT, accept);
    return () => window.removeEventListener(ACCEPT_REVIEW_EVENT, accept);
  }, [accept]);

  return (
    <Dialog.Root open={Boolean(review)} onOpenChange={(open) => !open && rejectReview()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="dialog-content fixed top-1/2 left-1/2 z-50 flex h-[min(88vh,920px)] w-[min(calc(100vw-24px),1400px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-pop"
        >
          {review && (
            <>
              <div className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-3.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                  <GitCompare className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-[15px] font-semibold">{review.title}</Dialog.Title>
                  {review.summary && <p className="mt-0.5 text-[13px] text-muted">{review.summary}</p>}
                </div>
                <Segmented
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { value: 'split', label: 'Side by side' },
                    { value: 'inline', label: 'Inline' },
                  ]}
                />
              </div>

              {changedSince && (
                <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-5 py-2 text-[12.5px] text-warning">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Your code changed after this fix was generated. Accepting replaces the whole file, so review the diff carefully.
                </div>
              )}

              {layout === 'split' && (
                <div className="grid grid-cols-2 border-b border-line text-[11px] font-semibold tracking-wider text-subtle uppercase">
                  <div className="px-4 py-1.5">Your code</div>
                  <div className="px-4 py-1.5">Proposed · editable</div>
                </div>
              )}

              <div className="min-h-0 flex-1">
                <DiffEditor
                  original={current}
                  modified={review.code}
                  language={LANGUAGE_META[review.language].monaco}
                  theme={monacoThemeName(editorTheme)}
                  keepCurrentOriginalModel
                  keepCurrentModifiedModel
                  onMount={(editor) => {
                    diffRef.current = editor;
                    modelsRef.current = editor.getModel();
                  }}
                  loading={<Loader2 className="size-5 animate-spin text-subtle" />}
                  options={{
                    renderSideBySide: layout === 'split',
                    useInlineViewWhenSpaceIsLimited: true,
                    originalEditable: false,
                    readOnly: false,
                    fontSize,
                    fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
                    lineHeight: 1.6,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderOverviewRuler: false,
                    automaticLayout: true,
                    padding: { top: 8 },
                  }}
                />
              </div>

              <div className="flex items-center gap-3 border-t border-line px-5 py-3">
                <span className="hidden text-xs text-subtle md:block">
                  You can edit the proposed code before accepting. Accepting is one undo step (<Kbd keys={['Mod', 'Z']} />)
                  {review.runTestsAfter === false ? '.' : ' and re-runs your tests.'}
                </span>
                <div className="flex-1" />
                <Button onClick={rejectReview}>
                  Reject
                  <Kbd keys={['Esc']} />
                </Button>
                <Button variant="primary" onClick={accept}>
                  <Check />
                  {review.runTestsAfter === false ? 'Accept' : 'Accept & run tests'}
                  <Kbd keys={['Alt', 'Y']} inverted />
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
