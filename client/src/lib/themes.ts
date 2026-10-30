import { useStore } from '../store';
import { monaco } from './monaco';

interface UiColors {
  bg: string;
  panel: string;
  panel2: string;
  hover: string;
  border: string;
  borderStrong: string;
  fg: string;
  muted: string;
  subtle: string;
  accent: string;
  accentHover: string;
  accentFg: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
}

interface EditorColors {
  lineHighlight: string;
  selection: string;
  cursor: string;
  lineNumber: string;
  lineNumberActive: string;
}

interface SyntaxColors {
  comment: string;
  keyword: string;
  directive: string;
  string: string;
  number: string;
  type: string;
  identifier: string;
  delimiter: string;
  operator: string;
}

export interface AppTheme {
  id: string;
  name: string;
  dark: boolean;
  ui: UiColors;
  editor: EditorColors;
  syntax: SyntaxColors;
}

export const THEMES: AppTheme[] = [
  {
    // The default: neutral graphite with an orange accent and warm, Monokai-style code colors.
    id: 'dark',
    name: 'Ember',
    dark: true,
    ui: {
      bg: '#0f0f10', panel: '#18181a', panel2: '#1f1f22', hover: '#26262a', border: '#2a2a2e', borderStrong: '#3a3a40',
      fg: '#ececee', muted: '#a3a3ab', subtle: '#6e6e78', accent: '#ffa116', accentHover: '#ffb240', accentFg: '#1c1305',
      success: '#2cbb5d', danger: '#ef4743', warning: '#ffc01e', info: '#4aa8ff',
    },
    editor: { lineHighlight: '#202023', selection: '#ffa1162e', cursor: '#ffa116', lineNumber: '#4b4b52', lineNumberActive: '#d4d4d8' },
    syntax: {
      comment: '#757379', keyword: '#ff6188', directive: '#fc9867', string: '#ffd866', number: '#ab9df2', type: '#78dce8',
      identifier: '#ececee', delimiter: '#a1a1a8', operator: '#ff6188',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    ui: {
      bg: '#08090d', panel: '#10131a', panel2: '#151923', hover: '#1b202a', border: '#212733', borderStrong: '#2f3644',
      fg: '#e7e9ef', muted: '#9aa2b4', subtle: '#697185', accent: '#7c5cff', accentHover: '#8b6dff', accentFg: '#ffffff',
      success: '#3dd68c', danger: '#ff6369', warning: '#f5a524', info: '#4cb2ff',
    },
    editor: { lineHighlight: '#161a23', selection: '#8b6dff45', cursor: '#a78bfa', lineNumber: '#454c5d', lineNumberActive: '#c6cad6' },
    syntax: {
      comment: '#6b7394', keyword: '#c792ea', directive: '#89ddff', string: '#c3e88d', number: '#f78c6c', type: '#ffcb6b',
      identifier: '#e7e9ef', delimiter: '#89ddff', operator: '#89ddff',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    dark: true,
    ui: {
      bg: '#1e2227', panel: '#282c34', panel2: '#2c313a', hover: '#323842', border: '#3a404b', borderStrong: '#4b5263',
      fg: '#d7dae0', muted: '#9da5b4', subtle: '#5c6370', accent: '#61afef', accentHover: '#74baf2', accentFg: '#10141a',
      success: '#98c379', danger: '#e06c75', warning: '#e5c07b', info: '#56b6c2',
    },
    editor: { lineHighlight: '#2c313c', selection: '#3e4451', cursor: '#528bff', lineNumber: '#495162', lineNumberActive: '#abb2bf' },
    syntax: {
      comment: '#5c6370', keyword: '#c678dd', directive: '#c678dd', string: '#98c379', number: '#d19a66', type: '#e5c07b',
      identifier: '#abb2bf', delimiter: '#abb2bf', operator: '#56b6c2',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    ui: {
      bg: '#21222c', panel: '#282a36', panel2: '#2e303e', hover: '#383a4a', border: '#3b3e51', borderStrong: '#44475a',
      fg: '#f8f8f2', muted: '#a9abbd', subtle: '#6272a4', accent: '#bd93f9', accentHover: '#caa6fa', accentFg: '#21222c',
      success: '#50fa7b', danger: '#ff5555', warning: '#ffb86c', info: '#8be9fd',
    },
    editor: { lineHighlight: '#343746', selection: '#44475a', cursor: '#f8f8f2', lineNumber: '#6272a4', lineNumberActive: '#f8f8f2' },
    syntax: {
      comment: '#6272a4', keyword: '#ff79c6', directive: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', type: '#8be9fd',
      identifier: '#f8f8f2', delimiter: '#f8f8f2', operator: '#ff79c6',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dark: true,
    ui: {
      bg: '#16161e', panel: '#1a1b26', panel2: '#1f2335', hover: '#24283b', border: '#292e42', borderStrong: '#3b4261',
      fg: '#c0caf5', muted: '#a9b1d6', subtle: '#565f89', accent: '#7aa2f7', accentHover: '#89b4fa', accentFg: '#16161e',
      success: '#9ece6a', danger: '#f7768e', warning: '#e0af68', info: '#7dcfff',
    },
    editor: { lineHighlight: '#1e202e', selection: '#283457', cursor: '#c0caf5', lineNumber: '#3b4261', lineNumberActive: '#737aa2' },
    syntax: {
      comment: '#565f89', keyword: '#bb9af7', directive: '#7dcfff', string: '#9ece6a', number: '#ff9e64', type: '#2ac3de',
      identifier: '#c0caf5', delimiter: '#89ddff', operator: '#89ddff',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: true,
    ui: {
      bg: '#242933', panel: '#2e3440', panel2: '#353b49', hover: '#3b4252', border: '#3b4252', borderStrong: '#4c566a',
      fg: '#eceff4', muted: '#a3abbb', subtle: '#616e88', accent: '#88c0d0', accentHover: '#8fbcbb', accentFg: '#2e3440',
      success: '#a3be8c', danger: '#bf616a', warning: '#ebcb8b', info: '#81a1c1',
    },
    editor: { lineHighlight: '#3b4252', selection: '#434c5ecc', cursor: '#d8dee9', lineNumber: '#4c566a', lineNumberActive: '#d8dee9' },
    syntax: {
      comment: '#616e88', keyword: '#81a1c1', directive: '#5e81ac', string: '#a3be8c', number: '#b48ead', type: '#8fbcbb',
      identifier: '#d8dee9', delimiter: '#eceff4', operator: '#81a1c1',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    dark: true,
    ui: {
      bg: '#1e1f1c', panel: '#272822', panel2: '#2d2e27', hover: '#3e3d32', border: '#3b3a32', borderStrong: '#49483e',
      fg: '#f8f8f2', muted: '#c2c2b0', subtle: '#75715e', accent: '#fd971f', accentHover: '#fdac54', accentFg: '#1e1f1c',
      success: '#a6e22e', danger: '#f92672', warning: '#e6db74', info: '#66d9ef',
    },
    editor: { lineHighlight: '#3e3d32', selection: '#49483e', cursor: '#f8f8f0', lineNumber: '#90908a', lineNumberActive: '#c2c2bf' },
    syntax: {
      comment: '#75715e', keyword: '#f92672', directive: '#f92672', string: '#e6db74', number: '#ae81ff', type: '#66d9ef',
      identifier: '#f8f8f2', delimiter: '#f8f8f2', operator: '#f92672',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    dark: true,
    ui: {
      bg: '#1d2021', panel: '#282828', panel2: '#32302f', hover: '#3c3836', border: '#3c3836', borderStrong: '#504945',
      fg: '#ebdbb2', muted: '#bdae93', subtle: '#928374', accent: '#fe8019', accentHover: '#fe9a4a', accentFg: '#1d2021',
      success: '#b8bb26', danger: '#fb4934', warning: '#fabd2f', info: '#83a598',
    },
    editor: { lineHighlight: '#32302f', selection: '#504945', cursor: '#ebdbb2', lineNumber: '#665c54', lineNumberActive: '#bdae93' },
    syntax: {
      comment: '#928374', keyword: '#fb4934', directive: '#8ec07c', string: '#b8bb26', number: '#d3869b', type: '#fabd2f',
      identifier: '#ebdbb2', delimiter: '#ebdbb2', operator: '#8ec07c',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    dark: true,
    ui: {
      bg: '#11111b', panel: '#1e1e2e', panel2: '#252536', hover: '#313244', border: '#313244', borderStrong: '#45475a',
      fg: '#cdd6f4', muted: '#a6adc8', subtle: '#6c7086', accent: '#cba6f7', accentHover: '#d4b6f8', accentFg: '#1e1e2e',
      success: '#a6e3a1', danger: '#f38ba8', warning: '#fab387', info: '#89dceb',
    },
    editor: { lineHighlight: '#2a2b3c', selection: '#45475a', cursor: '#f5e0dc', lineNumber: '#45475a', lineNumberActive: '#b4befe' },
    syntax: {
      comment: '#6c7086', keyword: '#cba6f7', directive: '#f5c2e7', string: '#a6e3a1', number: '#fab387', type: '#f9e2af',
      identifier: '#cdd6f4', delimiter: '#9399b2', operator: '#89dceb',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    dark: true,
    ui: {
      bg: '#010409', panel: '#0d1117', panel2: '#161b22', hover: '#1c2128', border: '#21262d', borderStrong: '#30363d',
      fg: '#e6edf3', muted: '#9198a1', subtle: '#6e7681', accent: '#2f81f7', accentHover: '#4493f8', accentFg: '#ffffff',
      success: '#3fb950', danger: '#f85149', warning: '#d29922', info: '#58a6ff',
    },
    editor: { lineHighlight: '#161b22', selection: '#264f78', cursor: '#e6edf3', lineNumber: '#6e7681', lineNumberActive: '#e6edf3' },
    syntax: {
      comment: '#8b949e', keyword: '#ff7b72', directive: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', type: '#ffa657',
      identifier: '#e6edf3', delimiter: '#e6edf3', operator: '#ff7b72',
    },
  },
  {
    id: 'light',
    name: 'Daylight',
    dark: false,
    ui: {
      bg: '#eceef3', panel: '#ffffff', panel2: '#f6f7f9', hover: '#eef0f4', border: '#e0e3ea', borderStrong: '#cdd2dc',
      fg: '#151922', muted: '#5b6375', subtle: '#8a91a3', accent: '#e8780a', accentHover: '#d46a00', accentFg: '#1c1305',
      success: '#15a356', danger: '#e5484d', warning: '#ca8a04', info: '#0b84d8',
    },
    editor: { lineHighlight: '#f5f6fa', selection: '#e8780a26', cursor: '#e8780a', lineNumber: '#b3b8c4', lineNumberActive: '#3b4252' },
    syntax: {
      comment: '#8a919e', keyword: '#7c3aed', directive: '#0369a1', string: '#16803c', number: '#c2410c', type: '#b45309',
      identifier: '#1f2430', delimiter: '#4b5563', operator: '#0369a1',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    dark: false,
    ui: {
      bg: '#eaeef2', panel: '#ffffff', panel2: '#f6f8fa', hover: '#eef1f4', border: '#d0d7de', borderStrong: '#afb8c1',
      fg: '#1f2328', muted: '#59636e', subtle: '#818b98', accent: '#0969da', accentHover: '#0860c7', accentFg: '#ffffff',
      success: '#1a7f37', danger: '#cf222e', warning: '#9a6700', info: '#0969da',
    },
    editor: { lineHighlight: '#f6f8fa', selection: '#0969da26', cursor: '#0969da', lineNumber: '#8c959f', lineNumberActive: '#1f2328' },
    syntax: {
      comment: '#6e7781', keyword: '#cf222e', directive: '#cf222e', string: '#0a3069', number: '#0550ae', type: '#953800',
      identifier: '#1f2328', delimiter: '#1f2328', operator: '#cf222e',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    dark: false,
    ui: {
      bg: '#eee8d5', panel: '#fdf6e3', panel2: '#f5efdc', hover: '#eee8d5', border: '#ded6bf', borderStrong: '#cbc3ab',
      fg: '#073642', muted: '#586e75', subtle: '#93a1a1', accent: '#268bd2', accentHover: '#1f78b8', accentFg: '#ffffff',
      success: '#859900', danger: '#dc322f', warning: '#b58900', info: '#2aa198',
    },
    editor: { lineHighlight: '#eee8d5', selection: '#268bd233', cursor: '#586e75', lineNumber: '#93a1a1', lineNumberActive: '#586e75' },
    syntax: {
      comment: '#93a1a1', keyword: '#859900', directive: '#cb4b16', string: '#2aa198', number: '#d33682', type: '#b58900',
      identifier: '#586e75', delimiter: '#657b83', operator: '#859900',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    dark: false,
    ui: {
      bg: '#dce0e8', panel: '#eff1f5', panel2: '#e6e9ef', hover: '#e2e5ec', border: '#ccd0da', borderStrong: '#bcc0cc',
      fg: '#4c4f69', muted: '#6c6f85', subtle: '#9ca0b0', accent: '#8839ef', accentHover: '#7a2fde', accentFg: '#ffffff',
      success: '#40a02b', danger: '#d20f39', warning: '#df8e1d', info: '#04a5e5',
    },
    editor: { lineHighlight: '#e6e9ef', selection: '#8839ef26', cursor: '#dc8a78', lineNumber: '#9ca0b0', lineNumberActive: '#4c4f69' },
    syntax: {
      comment: '#9ca0b0', keyword: '#8839ef', directive: '#ea76cb', string: '#40a02b', number: '#fe640b', type: '#df8e1d',
      identifier: '#4c4f69', delimiter: '#7c7f93', operator: '#04a5e5',
    },
  },
];

export const DEFAULT_DARK = 'dark';
export const DEFAULT_LIGHT = 'light';

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const monacoThemeName = (id: string) => `cp-${themeById(id).id}`;

const withAlpha = (hex: string, alpha: string) => (hex.length === 7 ? hex + alpha : hex);
const bare = (hex: string) => hex.slice(1, 7);

function defineMonacoTheme(t: AppTheme) {
  const { ui, editor, syntax } = t;
  monaco.editor.defineTheme(`cp-${t.id}`, {
    base: t.dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: bare(syntax.comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: bare(syntax.keyword) },
      { token: 'keyword.directive', foreground: bare(syntax.directive) },
      { token: 'string', foreground: bare(syntax.string) },
      { token: 'string.escape', foreground: bare(syntax.operator) },
      { token: 'number', foreground: bare(syntax.number) },
      { token: 'type', foreground: bare(syntax.type) },
      { token: 'type.identifier', foreground: bare(syntax.type) },
      { token: 'annotation', foreground: bare(syntax.type) },
      { token: 'identifier', foreground: bare(syntax.identifier) },
      { token: 'delimiter', foreground: bare(syntax.delimiter) },
      { token: 'operator', foreground: bare(syntax.operator) },
    ],
    colors: {
      'editor.background': ui.panel,
      'editor.foreground': ui.fg,
      'editorGutter.background': ui.panel,
      'minimap.background': ui.panel,
      'editorLineNumber.foreground': editor.lineNumber,
      'editorLineNumber.activeForeground': editor.lineNumberActive,
      'editor.lineHighlightBackground': editor.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': editor.selection,
      'editor.inactiveSelectionBackground': withAlpha(editor.selection, '80'),
      'editor.wordHighlightBackground': withAlpha(ui.accent, '20'),
      'editorCursor.foreground': editor.cursor,
      'editorIndentGuide.background1': ui.border,
      'editorIndentGuide.activeBackground1': ui.borderStrong,
      'editorBracketMatch.background': withAlpha(ui.accent, '25'),
      'editorBracketMatch.border': withAlpha(ui.accent, '70'),
      'editorBracketHighlight.foreground1': syntax.type,
      'editorBracketHighlight.foreground2': syntax.keyword,
      'editorBracketHighlight.foreground3': syntax.operator,
      'editorWidget.background': ui.panel2,
      'editorWidget.border': ui.borderStrong,
      'editorSuggestWidget.background': ui.panel2,
      'editorSuggestWidget.border': ui.borderStrong,
      'editorSuggestWidget.selectedBackground': ui.hover,
      'editorHoverWidget.background': ui.panel2,
      'editorHoverWidget.border': ui.borderStrong,
      'scrollbarSlider.background': t.dark ? '#ffffff14' : '#00000014',
      'scrollbarSlider.hoverBackground': t.dark ? '#ffffff24' : '#00000024',
      'scrollbarSlider.activeBackground': t.dark ? '#ffffff30' : '#00000030',
      'diffEditor.insertedTextBackground': withAlpha(ui.success, '30'),
      'diffEditor.removedTextBackground': withAlpha(ui.danger, '30'),
      'diffEditor.insertedLineBackground': withAlpha(ui.success, '14'),
      'diffEditor.removedLineBackground': withAlpha(ui.danger, '14'),
    },
  });
}

THEMES.forEach(defineMonacoTheme);

const CSS_VARS: Record<keyof UiColors, string> = {
  bg: '--bg', panel: '--panel', panel2: '--panel-2', hover: '--hover', border: '--border', borderStrong: '--border-strong',
  fg: '--fg', muted: '--muted', subtle: '--subtle', accent: '--accent', accentHover: '--accent-hover', accentFg: '--accent-fg',
  success: '--success', danger: '--danger', warning: '--warning', info: '--info',
};

export function selectTheme(id: string) {
  const theme = themeById(id);
  useStore.setState((s) => ({ theme: theme.id, themePair: { ...s.themePair, [theme.dark ? 'dark' : 'light']: theme.id } }));
}

/** Switches between the last dark and the last light theme used. */
export function toggleDarkLight() {
  const { theme, themePair } = useStore.getState();
  selectTheme(themeById(theme).dark ? themePair.light : themePair.dark);
}

/** User adjustments on top of any theme, each from -100 to 100 (0 = as designed). */
export interface ThemeAdjust {
  darkness: number;
  contrast: number;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Mixes two #rrggbb colors (t = 0 → a, 1 → b), keeping any alpha suffix of a. */
function mix(a: string, b: string, t: number): string {
  if (!t || !/^#[\da-f]{6}/i.test(a)) return a;
  const [from, to] = [rgb(a), rgb(b)];
  const hex = from.map((v, i) => Math.round(v + (to[i] - v) * t).toString(16).padStart(2, '0')).join('');
  return `#${hex}${a.slice(7)}`;
}

/**
 * Darkness moves the surfaces toward black or white; contrast moves the text (and borders) away from or
 * toward the background. Both are scaled so the extremes stay comfortable and readable.
 */
function adjustTheme(t: AppTheme, { darkness, contrast }: ThemeAdjust): AppTheme {
  if (!darkness && !contrast) return t;
  const d = darkness / 100;
  const c = contrast / 100;
  const darker = t.dark ? 0.6 : 0.16; // how far "darker" can go
  const lighter = t.dark ? 0.14 : 0.6;
  const surface = (hex: string, weight = 1) => (d > 0 ? mix(hex, '#000000', d * darker * weight) : mix(hex, '#ffffff', -d * lighter * weight));

  const ui = { ...t.ui };
  for (const key of ['bg', 'panel', 'panel2', 'hover'] as const) ui[key] = surface(t.ui[key]);
  ui.border = surface(t.ui.border, 0.6);
  ui.borderStrong = surface(t.ui.borderStrong, 0.6);

  const extreme = t.dark ? '#ffffff' : '#000000';
  const text = (hex: string, up: number, down: number) => (c > 0 ? mix(hex, extreme, c * up) : mix(hex, ui.panel, -c * down));
  ui.fg = text(t.ui.fg, 0.6, 0.3);
  ui.muted = text(t.ui.muted, 0.45, 0.25);
  ui.subtle = text(t.ui.subtle, 0.35, 0.2);
  ui.border = c > 0 ? mix(ui.border, ui.fg, c * 0.12) : mix(ui.border, ui.panel, -c * 0.35);
  ui.borderStrong = c > 0 ? mix(ui.borderStrong, ui.fg, c * 0.15) : mix(ui.borderStrong, ui.panel, -c * 0.3);

  const editor = {
    ...t.editor,
    lineHighlight: surface(t.editor.lineHighlight),
    lineNumber: text(t.editor.lineNumber, 0.3, 0.2),
    lineNumberActive: text(t.editor.lineNumberActive, 0.4, 0.2),
  };
  // Lower contrast also calms the code colors a little.
  const syntax = c < 0 ? (Object.fromEntries(Object.entries(t.syntax).map(([k, v]) => [k, mix(v, ui.panel, -c * 0.18)])) as unknown as SyntaxColors) : t.syntax;
  return { ...t, ui, editor, syntax };
}

/** Applies a theme (with the user's adjustments) to the page and the editor, and caches it for the next first paint. */
export function applyTheme(id: string, adjust: ThemeAdjust = { darkness: 0, contrast: 0 }) {
  const theme = adjustTheme(themeById(id), adjust);
  defineMonacoTheme(theme);
  const vars: Record<string, string> = Object.fromEntries(
    (Object.keys(CSS_VARS) as (keyof UiColors)[]).map((key) => [CSS_VARS[key], theme.ui[key]]),
  );
  vars['--shadow'] = theme.dark ? '0 16px 50px rgb(0 0 0 / 0.55)' : '0 12px 40px rgb(15 20 30 / 0.14)';

  const root = document.documentElement;
  root.classList.toggle('dark', theme.dark);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  monaco.editor.setTheme(`cp-${theme.id}`);
  try {
    localStorage.setItem('cp-studio-theme', JSON.stringify({ dark: theme.dark, vars }));
  } catch {
    // The theme still applies; only the next load's first paint falls back to the default.
  }
}
