import { Minus, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, getAccessKey, setAccessKey } from '../lib/api';
import { editorBridge } from '../lib/editor';
import { LANGUAGE_META } from '../lib/languages';
import { changeIoFontSize, changeLayout, IO_FONT, toggleLayoutLock } from '../lib/layout';
import { keyLabel } from '../lib/platform';
import { SHORTCUTS } from '../lib/shortcuts';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { uid, useStore } from '../store';
import type { CompareMode, CppStandard } from '../types';
import { ThemeAdjustments, ThemeGrid } from './ThemePicker';
import { Button, Kbd, Modal, Segmented, Switch } from './ui';

const close = () => useStore.getState().openDialog(null);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-subtle uppercase">{title}</h3>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsDialog() {
  const open = useStore((s) => s.dialog === 'settings');
  const settings = useStore((s) => s.settings);
  const maxTimeLimit = useStore((s) => s.serverConfig?.limits.maxTimeLimitMs ?? 10_000);
  const accessKeyRequired = useStore((s) => s.serverConfig?.accessKeyRequired);
  const { updateSettings, openDialog } = useStore.getState();

  const resetEverything = () => {
    if (!confirm('Reset all code, test cases, templates and chat saved in this browser? This cannot be undone.')) return;
    localStorage.removeItem('cp-studio');
    location.reload();
  };

  return (
    <Modal open={open} onClose={close} title="Settings" width="lg">
      <Section title="Theme">
        <ThemeGrid />
        <div className="py-3">
          <div className="mb-2.5 text-xs text-muted">Darkness and contrast (whole app and editor)</div>
          <ThemeAdjustments />
        </div>
      </Section>

      <Section title="Layout">
        <Row label="Lock layout" hint="Panels can't be resized, moved or hidden by accident. Shortcut: Alt+K">
          <Switch label="Lock layout" checked={settings.layoutLocked} onChange={toggleLayoutLock} />
        </Row>
        <Row label="Test case text size" hint="Input, expected and output columns. Also Ctrl + mouse wheel over them">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" onClick={() => changeIoFontSize(-1)} disabled={settings.ioFontSize <= IO_FONT.min} aria-label="Smaller test case text">
              <Minus />
            </Button>
            <span className="w-8 text-center font-mono text-[13px]">{settings.ioFontSize}</span>
            <Button size="icon-sm" onClick={() => changeIoFontSize(1)} disabled={settings.ioFontSize >= IO_FONT.max} aria-label="Larger test case text">
              <Plus />
            </Button>
          </div>
        </Row>
        <Row label="Test cases panel" hint="Shortcut: Alt+L">
          <Segmented
            value={settings.ioPosition}
            onChange={(ioPosition) => changeLayout(() => updateSettings({ ioPosition }))}
            options={[
              { value: 'bottom', label: 'Bottom' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Editor">
        <Row label="Font size">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" onClick={() => updateSettings({ fontSize: Math.max(11, settings.fontSize - 1) })} aria-label="Smaller">
              <Minus />
            </Button>
            <span className="w-8 text-center font-mono text-[13px]">{settings.fontSize}</span>
            <Button size="icon-sm" onClick={() => updateSettings({ fontSize: Math.min(24, settings.fontSize + 1) })} aria-label="Larger">
              <Plus />
            </Button>
          </div>
        </Row>
        <Row label="Tab size">
          <Segmented
            value={settings.tabSize}
            onChange={(tabSize) => updateSettings({ tabSize })}
            options={[2, 4, 8].map((n) => ({ value: n, label: n }))}
          />
        </Row>
        <Row label="Word wrap">
          <Switch label="Word wrap" checked={settings.wordWrap} onChange={(wordWrap) => updateSettings({ wordWrap })} />
        </Row>
        <Row label="Minimap">
          <Switch label="Minimap" checked={settings.minimap} onChange={(minimap) => updateSettings({ minimap })} />
        </Row>
        <Row label="Font ligatures" hint="Render != and -> as single glyphs">
          <Switch label="Font ligatures" checked={settings.ligatures} onChange={(ligatures) => updateSettings({ ligatures })} />
        </Row>
        <Row label="Autocomplete" hint="Suggestions and CP snippets (fori, bfs, dsu…) while typing">
          <Switch label="Autocomplete" checked={settings.autocomplete} onChange={(autocomplete) => updateSettings({ autocomplete })} />
        </Row>
        <Row label="Indentation guides" hint="Faint vertical lines at each indent level">
          <Switch label="Indentation guides" checked={settings.indentGuides} onChange={(indentGuides) => updateSettings({ indentGuides })} />
        </Row>
        <Row label="Format on save" hint={`Format the code when you press ${keyLabel('Mod')}+S`}>
          <Switch label="Format on save" checked={settings.formatOnSave} onChange={(formatOnSave) => updateSettings({ formatOnSave })} />
        </Row>
      </Section>

      <Section title="Running code">
        <Row label="C++ standard">
          <Segmented<CppStandard>
            value={settings.cppStandard}
            onChange={(cppStandard) => updateSettings({ cppStandard })}
            options={(['c++14', 'c++17', 'c++20', 'c++23'] as const).map((v) => ({ value: v, label: v.slice(3) }))}
          />
        </Row>
        <Row label="Time limit" hint="Per test case">
          <Segmented
            value={settings.timeLimitMs}
            onChange={(timeLimitMs) => updateSettings({ timeLimitMs })}
            options={[1000, 2000, 3000, 5000, 10_000].filter((ms) => ms <= maxTimeLimit).map((ms) => ({ value: ms, label: `${ms / 1000}s` }))}
          />
        </Row>
      </Section>

      <Section title="Checking output">
        <Row
          label="Compare"
          hint={
            settings.compareMode === 'tokens'
              ? 'Word by word, like Codeforces: extra spaces and line breaks are ignored'
              : 'Line by line: spacing must match exactly (trailing spaces are ignored)'
          }
        >
          <Segmented<CompareMode>
            value={settings.compareMode}
            onChange={(compareMode) => updateSettings({ compareMode })}
            options={[
              { value: 'tokens', label: 'Tokens' },
              { value: 'lines', label: 'Exact lines' },
            ]}
          />
        </Row>
        <Row label="Decimal tolerance" hint="Accept small errors in decimal answers (absolute or relative)">
          <Segmented
            value={settings.floatTolerance}
            onChange={(floatTolerance) => updateSettings({ floatTolerance })}
            options={[
              { value: 0, label: 'Off' },
              { value: 1e-6, label: '1e-6' },
              { value: 1e-9, label: '1e-9' },
            ]}
          />
        </Row>
        <Row label="Ignore letter case" hint='Treat "YES", "Yes" and "yes" as the same'>
          <Switch label="Ignore letter case" checked={settings.ignoreCase} onChange={(ignoreCase) => updateSettings({ ignoreCase })} />
        </Row>
      </Section>

      {accessKeyRequired && (
        <Section title="Access">
          <Row label="Access key" hint="Stored in this browser only">
            <Button size="sm" onClick={() => openDialog('access')}>
              Change key
            </Button>
          </Row>
        </Section>
      )}

      <Section title="Data">
        <Row label="Reset everything" hint="Clears code, tests, templates and chat saved in this browser">
          <Button size="sm" variant="danger" onClick={resetEverything}>
            Reset
          </Button>
        </Row>
      </Section>
    </Modal>
  );
}

export function ShortcutsDialog() {
  const open = useStore((s) => s.dialog === 'shortcuts');
  return (
    <Modal open={open} onClose={close} title="Keyboard shortcuts" width="2xl">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {SHORTCUTS.map((group) => (
          <section key={group.group}>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">{group.group}</h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 py-1 text-[13px]">
                  <span className="text-muted">{item.label}</span>
                  <Kbd keys={item.keys} className="shrink-0" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

const inputClass = 'h-9 w-full rounded-lg border border-line bg-panel-2 px-3 text-[13px] transition focus:border-accent/60';

export function AccessKeyDialog() {
  const open = useStore((s) => s.dialog === 'access');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const hasKey = Boolean(getAccessKey());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    try {
      if (await api.checkAccessKey(key)) {
        setAccessKey(key);
        setKey('');
        close();
        toast.success('Unlocked');
      } else {
        setError('That key is not correct.');
      }
    } catch {
      setError('Cannot reach the server.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={hasKey}
      title="Enter the access key"
      description="This editor is private. Ask its owner for the access key."
    >
      <form onSubmit={submit} className="space-y-3">
        <input type="password" autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="Access key" className={inputClass} />
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" variant="primary" loading={checking} disabled={!key} className="w-full justify-center">
          Unlock
        </Button>
      </form>
    </Modal>
  );
}

export function ResetDialog() {
  const open = useStore((s) => s.dialog === 'reset');
  const language = useStore((s) => s.language);
  const customTemplates = useStore((s) => s.customTemplates);
  const templates = [...BUILTIN_TEMPLATES, ...customTemplates].filter((t) => t.language === language);
  const [templateId, setTemplateId] = useState('');
  const [clearTests, setClearTests] = useState(false);

  useEffect(() => {
    if (open) {
      setTemplateId(`${language}-multi`);
      setClearTests(false);
    }
  }, [open, language]);

  const reset = () => {
    const template = templates.find((t) => t.id === templateId) ?? templates[0];
    editorBridge.setCode(language, template.code);
    if (clearTests) {
      const id = uid();
      useStore.setState({ tests: [{ id, input: '', expected: '' }], activeTestId: id, results: {}, lastRun: null, compile: null });
    }
    close();
    editorBridge.focus();
    toast.success(`${LANGUAGE_META[language].label} code reset`, { description: `Press ${keyLabel('Mod')}+Z in the editor to get your code back.` });
  };

  return (
    <Modal open={open} onClose={close} title="Reset code" description={`Replace your ${LANGUAGE_META[language].label} code with a fresh template.`}>
      <div className="space-y-1.5" role="radiogroup" aria-label="Template">
        {templates.map((t) => (
          <label
            key={t.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
              templateId === t.id ? 'border-accent/50 bg-accent/8' : 'border-line hover:bg-hover'
            }`}
          >
            <input type="radio" name="template" className="mt-1 accent-[var(--accent)]" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} />
            <span>
              <span className="block text-[13px] font-medium">{t.name}</span>
              <span className="block text-xs text-muted">{t.description ?? 'Your template'}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13px]">
        <Switch label="Also clear test cases" checked={clearTests} onChange={setClearTests} />
        Also clear test cases
      </label>
      <div className="mt-5 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-subtle">Undo with {keyLabel('Mod')}+Z</span>
        <Button onClick={close}>Cancel</Button>
        <Button variant="danger" onClick={reset}>
          Reset code
        </Button>
      </div>
    </Modal>
  );
}

export function SaveTemplateDialog() {
  const open = useStore((s) => s.dialog === 'saveTemplate');
  const language = useStore((s) => s.language);
  const [name, setName] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    useStore.getState().addTemplate({ name: name.trim(), language, code: editorBridge.getCode(language) });
    toast.success(`Saved template “${name.trim()}”`);
    setName('');
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Save as template" description={`Saves your current ${LANGUAGE_META[language].label} code so you can start from it later.`}>
      <form onSubmit={submit} className="space-y-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name, e.g. Segment tree" className={inputClass} />
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save template
          </Button>
        </div>
      </form>
    </Modal>
  );
}
