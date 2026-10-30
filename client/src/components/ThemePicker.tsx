import { Check, Moon, Sun } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { selectTheme, themeById, THEMES, toggleDarkLight, type AppTheme } from '../lib/themes';
import { useStore } from '../store';
import { Button, cn, Kbd, Tip } from './ui';

function ThemeDots({ theme }: { theme: AppTheme }) {
  return (
    <span className="flex h-5 w-9 shrink-0 items-center justify-center gap-0.5 rounded border border-line" style={{ background: theme.ui.panel }}>
      {[theme.syntax.keyword, theme.syntax.string, theme.ui.accent].map((color, i) => (
        <span key={i} className="size-1.5 rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}

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

/** Darkness and contrast on top of the current theme, for comfortable long sessions. Applies to the whole app and the editor. */
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
          Reset to the theme's default
        </button>
      )}
    </div>
  );
}

const GROUPS = [
  { label: 'Dark', dark: true },
  { label: 'Light', dark: false },
];

export function ThemeMenu() {
  const current = themeById(useStore((s) => s.theme));
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover';

  return (
    <DropdownMenu.Root>
      <Tip label="Theme" keys={['Alt', 'T']}>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Theme" className="hidden sm:inline-flex">
            {current.dark ? <Moon /> : <Sun />}
          </Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="popover z-50 max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          <DropdownMenu.Label className="px-2 pt-1.5 pb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">Easy on the eyes</DropdownMenu.Label>
          <div className="px-2 pb-2.5">
            <ThemeAdjustments />
          </div>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          {GROUPS.map((group) => (
            <DropdownMenu.Group key={group.label}>
              <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">{group.label}</DropdownMenu.Label>
              {THEMES.filter((t) => t.dark === group.dark).map((theme) => (
                <DropdownMenu.Item key={theme.id} onSelect={() => selectTheme(theme.id)} className={item}>
                  <ThemeDots theme={theme} />
                  <span className="flex-1">{theme.name}</span>
                  {theme.id === current.id && <Check className="size-3.5 text-accent" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item onSelect={toggleDarkLight} className={cn(item, 'justify-between text-muted')}>
            Switch dark / light
            <Kbd keys={['Alt', 'T']} />
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThemeCard({ theme, selected }: { theme: AppTheme; selected: boolean }) {
  const { ui, syntax } = theme;
  return (
    <button
      type="button"
      onClick={() => selectTheme(theme.id)}
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
        <span className="size-2 rounded-full" style={{ background: ui.accent }} />
        <span className="flex-1 truncate">{theme.name}</span>
        {selected && <Check className="size-3.5" style={{ color: ui.accent }} />}
      </div>
    </button>
  );
}

export function ThemeGrid() {
  const current = useStore((s) => s.theme);
  return (
    <div className="space-y-3 py-2.5">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 text-xs text-muted">{group.label}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.filter((t) => t.dark === group.dark).map((theme) => (
              <ThemeCard key={theme.id} theme={theme} selected={theme.id === themeById(current).id} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
