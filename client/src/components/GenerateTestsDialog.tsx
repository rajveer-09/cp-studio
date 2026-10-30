import { AlertTriangle, Check, Plus, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { buildContext } from '../lib/assistant';
import { keyLabel } from '../lib/platform';
import { runTests } from '../lib/runner';
import { useStore } from '../store';
import type { GeneratedTest } from '../types';
import { Button, cn, Modal, Segmented, Switch } from './ui';

type Focus = 'edge' | 'random' | 'mixed';

const close = () => useStore.getState().openDialog(null);

export function GenerateTestsDialog() {
  const open = useStore((s) => s.dialog === 'generateTests');
  const hasProblem = useStore((s) => s.problem.trim().length > 0);
  const [focus, setFocus] = useState<Focus>('edge');
  const [count, setCount] = useState(5);
  const [withExpected, setWithExpected] = useState(true);
  const [runAfter, setRunAfter] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setStatus('idle');
      setTests([]);
    } else {
      controller.current?.abort();
    }
  }, [open]);

  const generate = async () => {
    controller.current = new AbortController();
    setStatus('loading');
    try {
      const result = await api.tests({ context: buildContext(), count, focus, withExpected }, controller.current.signal);
      setTests(result.tests);
      setSelected(new Set(result.tests.map((_, i) => i)));
      setStatus('done');
      if (!result.tests.length) toast.info('The AI did not come up with any tests. Try again or change the options.');
    } catch (err) {
      if (!controller.current.signal.aborted) toast.error(err instanceof Error ? err.message : 'Could not generate tests.');
      setStatus('idle');
    }
  };

  const add = () => {
    const { addTest, setActiveTest } = useStore.getState();
    const chosen = tests.filter((_, i) => selected.has(i));
    const ids = chosen.map((t) => addTest({ input: t.input, expected: t.expectedOutput }, false));
    if (!ids.length) return;
    setActiveTest(ids[0]);
    close();
    toast.success(`Added ${ids.length} test case${ids.length > 1 ? 's' : ''}`);
    if (runAfter) void runTests('all');
  };

  const toggle = (i: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Modal
      open={open}
      onClose={close}
      width="2xl"
      title="Generate test cases"
      description="The AI reads your code's input format and writes new tests for it."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted">Kind</span>
            <Segmented<Focus>
              value={focus}
              onChange={setFocus}
              options={[
                { value: 'edge', label: 'Edge cases' },
                { value: 'random', label: 'Random' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted">How many</span>
            <Segmented value={count} onChange={setCount} options={[3, 5, 8].map((n) => ({ value: n, label: n }))} />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch label="Fill expected outputs" checked={withExpected} onChange={setWithExpected} />
            <span className="text-muted">Fill expected outputs</span>
          </label>
        </div>

        {withExpected && !hasProblem && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[12.5px] text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Add the problem statement (Problem tab) so expected outputs come from the real task, not from guessing what your code should do.
          </div>
        )}
        {!withExpected && (
          <p className="text-[12.5px] text-muted">Without expected outputs, the tests still catch crashes, time limits and wrong formats when you run them.</p>
        )}

        <Button variant="primary" onClick={generate} loading={status === 'loading'}>
          {status !== 'loading' && <Sparkles />}
          {status === 'done' ? 'Generate again' : 'Generate'}
        </Button>

        {status === 'done' && tests.length > 0 && (
          <>
            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {tests.map((test, i) => (
                <label
                  key={i}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border p-2.5 transition',
                    selected.has(i) ? 'border-accent/40 bg-accent/5' : 'border-line opacity-60',
                  )}
                >
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1 accent-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 text-xs font-medium">{test.reason || `Test ${i + 1}`}</div>
                    <div className={cn('grid gap-2', withExpected && 'grid-cols-2')}>
                      <pre className="max-h-32 overflow-auto rounded-md bg-bg/60 px-2 py-1.5 font-mono text-[11.5px]">{test.input}</pre>
                      {withExpected && (
                        <pre className="max-h-32 overflow-auto rounded-md bg-bg/60 px-2 py-1.5 font-mono text-[11.5px]">{test.expectedOutput || ' '}</pre>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {withExpected && <p className="text-[11.5px] text-subtle">Expected outputs are worked out by the AI. Double-check them before trusting a verdict.</p>}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
              <label className="mr-auto flex items-center gap-2 text-[13px] text-muted">
                <Switch label="Run all tests after adding" checked={runAfter} onChange={setRunAfter} />
                Run all tests after adding
              </label>
              <Button onClick={close}>Cancel</Button>
              <Button variant="primary" onClick={add} disabled={!selected.size}>
                {selected.size ? <Plus /> : <Check />}
                Add {selected.size} test{selected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
        <p className="text-[11.5px] text-subtle">Tip: press {keyLabel('Alt')}+G to open this anywhere.</p>
      </div>
    </Modal>
  );
}
