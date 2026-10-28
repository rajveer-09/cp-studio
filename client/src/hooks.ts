import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { api, getAccessKey, setUnauthorizedHandler } from './lib/api';
import { focusAssistant } from './lib/assistant';
import { startDebugging, stepBy } from './lib/debugger';
import { editorBridge } from './lib/editor';
import { monaco } from './lib/monaco';
import { isMac } from './lib/platform';
import { runTests } from './lib/runner';
import { useStore } from './store';
import type { Language } from './types';

export const ACCEPT_REVIEW_EVENT = 'cp:accept-review';

/**
 * Global shortcuts, registered in the capture phase so they work everywhere,
 * including inside Monaco (which would otherwise swallow keys like Ctrl+Enter).
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (s.review) {
        if (e.altKey && e.code === 'KeyY') {
          take();
          window.dispatchEvent(new Event(ACCEPT_REVIEW_EVENT));
        }
        return;
      }

      if (mod && e.key === 'Enter') {
        take();
        void runTests(e.shiftKey ? 'all' : 'current');
      } else if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyS') {
        take();
        if (s.settings.formatOnSave) void editorBridge.runAction('editor.action.formatDocument');
        toast.success('Saved', { description: 'Your code is also saved automatically.', duration: 1500 });
      } else if (mod && e.shiftKey && e.code === 'KeyA') {
        take();
        focusAssistant();
      } else if (e.key === 'F8' && !mod && !e.altKey) {
        take();
        void startDebugging();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const switchTo = (language: Language) => () => s.setLanguage(language);
        const debugging = s.debug?.status === 'done';
        const actions: Record<string, (() => void) | undefined> = {
          Digit1: switchTo('cpp'),
          Digit2: switchTo('java'),
          Digit3: switchTo('python'),
          KeyT: s.toggleTheme,
          KeyN: () => s.addTest(),
          KeyB: () => s.setAssistantOpen(!s.assistantOpen),
          KeyL: () => s.updateSettings({ ioPosition: s.settings.ioPosition === 'bottom' ? 'right' : 'bottom' }),
          Period: debugging ? () => stepBy(1) : undefined,
          Comma: debugging ? () => stepBy(-1) : undefined,
          Slash: () => s.openDialog(s.dialog === 'shortcuts' ? null : 'shortcuts'),
        };
        const action = actions[e.code];
        if (action) {
          take();
          action();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

export function useThemeSync() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    monaco.editor.setTheme(theme === 'dark' ? 'cp-dark' : 'cp-light');
  }, [theme]);
}

export function useServerConfig() {
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setUnauthorizedHandler(() => useStore.getState().openDialog('access'));

    const load = async () => {
      try {
        const config = await api.config();
        if (cancelled) return;
        useStore.setState({ serverConfig: config, serverOnline: true });
        if (config.accessKeyRequired && !getAccessKey()) useStore.getState().openDialog('access');
      } catch {
        if (cancelled) return;
        useStore.setState({ serverOnline: false });
        retry = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, []);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
  );
}
