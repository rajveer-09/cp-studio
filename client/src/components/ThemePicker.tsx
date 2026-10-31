import { Check, Moon, Sun } from 'lucide-react';
import { APP_THEMES, editorThemeOf, selectEditorTheme, selectTheme, themeById, THEMES, type AppTheme } from '../lib/themes';
import { useStore } from '../store';
import { cn } from './ui';

function Slider({ label, left, right, value, onChange }: { label: string; left: string; right: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-subtle tabular-nums">{value > 0 ? `+${value}` : value}</span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        title="Double-click to reset"
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        className="theme-slider w-full"
      />
      <div className="flex justify-between text-[10.5px] text-subtle">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

/** Darkness and contrast for the editor, on top of its theme, for comfortable long sessions. The app keeps its colors. */
export function ThemeAdjustments() {
  const darkness = useStore((s) => s.settings.uiDarkness);
  const contrast = useStore((s) => s.settings.uiContrast);
  const update = useStore.getState().updateSettings;
  return (
    <div className="space-y-3">
      <Slider label="Darkness" left="Lighter" right="Darker" value={darkness} onChange={(uiDarkness) => update({ uiDarkness })} />
      <Slider label="Contrast" left="Softer" right="Sharper" value={contrast} onChange={(uiContrast) => update({ uiContrast })} />
      {(darkness !== 0 || contrast !== 0) && (
        <button type="button" onClick={() => update({ uiDarkness: 0, uiContrast: 0 })} className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline">
          Reset the editor's colors
        </button>
      )}
    </div>
  );
}

const MODES = [
  { id: APP_THEMES[0], label: 'Dark', icon: Moon },
  { id: APP_THEMES[1], label: 'Light', icon: Sun },
];

/** The app's two looks, as a pair of buttons. */
export function AppModeSwitch({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const current = useStore((s) => s.theme);
  return (
    <div role="radiogroup" aria-label="App theme" className="grid grid-cols-2 gap-1.5">
      {MODES.map(({ id, label, icon: Icon }) => {
        const theme = themeById(id);
        const selected = current === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => selectTheme(id)}
            className={cn(
              'overflow-hidden rounded-lg border text-left transition',
              selected ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong',
            )}
          >
            {size === 'lg' && (
              // A tiny picture of the app in this theme: header, editor card, side panel.
              <div className="flex h-16 flex-col gap-1 p-1.5" style={{ background: theme.ui.bg }}>
                <div className="h-2 rounded-sm" style={{ background: theme.ui.panel }} />
                <div className="flex flex-1 gap-1">
                  <div className="flex-[3] rounded-sm border" style={{ background: theme.ui.panel, borderColor: theme.ui.border }} />
                  <div className="flex-1 rounded-sm border" style={{ background: theme.ui.panel, borderColor: theme.ui.border }}>
                    <div className="m-1 h-1.5 rounded-sm" style={{ background: theme.ui.accent }} />
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-medium">
              <Icon className="size-3.5 text-muted" />
              <span className="flex-1">{label}</span>
              {selected && <Check className="size-3.5 text-accent" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ThemeCard({ theme, selected }: { theme: AppTheme; selected: boolean }) {
  const { ui, syntax } = theme;
  return (
    <button
      type="button"
      onClick={() => selectEditorTheme(theme.id)}
      className={cn(
        'overflow-hidden rounded-lg border text-left transition',
        selected ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="px-2.5 py-2 font-mono text-[10.5px] leading-4" style={{ background: ui.panel, color: syntax.identifier }}>
        <div>
          <span style={{ color: syntax.keyword }}>int</span> main<span style={{ color: syntax.delimiter }}>() {'{'}</span>
        </div>
        <div className="pl-3">
          <span style={{ color: syntax.type }}>string</span> s <span style={{ color: syntax.operator }}>=</span>{' '}
          <span style={{ color: syntax.string }}>"ok"</span>;
        </div>
        <div className="pl-3">
          <span style={{ color: syntax.keyword }}>return</span> <span style={{ color: syntax.number }}>0</span>;{' '}
          <span style={{ color: syntax.comment }}>// done</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium" style={{ background: ui.panel2, color: ui.fg }}>
        <span className="flex-1 truncate">{theme.name}</span>
        {selected && <Check className="size-3.5" style={{ color: ui.accent }} />}
      </div>
    </button>
  );
}

/** Settings: the app's look, then the editor's theme for the current mode. */
export function ThemeGrid() {
  const dark = useStore((s) => themeById(s.theme).dark);
  const editor = useStore(editorThemeOf);
  // Signed in, the app's Dark / Light lives in the profile menu; visitors without one get it here.
  const signedIn = useStore((s) => s.account.status === 'signedIn');
  return (
    <div className="space-y-4 py-2.5">
      {!signedIn && (
        <div>
          <div className="mb-1.5 text-xs text-muted">App</div>
          <div className="max-w-[320px]">
            <AppModeSwitch size="lg" />
          </div>
        </div>
      )}
      <div>
        <div className="mb-1.5 text-xs text-muted">Editor and test panel theme, used in {dark ? 'dark' : 'light'} mode (each mode remembers its own)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {[...THEMES].sort((a, b) => Number(b.dark === dark) - Number(a.dark === dark)).map((theme) => (
            <ThemeCard key={theme.id} theme={theme} selected={theme.id === editor} />
          ))}
        </div>
      </div>
    </div>
  );
}
