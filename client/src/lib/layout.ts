import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_SETTINGS, useStore } from '../store';

/** Runs a layout change (resize, move, show/hide a panel) unless the layout is locked. */
export function changeLayout(change: () => void) {
  if (useStore.getState().settings.layoutLocked) {
    toast('The layout is locked', { id: 'layout-locked', description: 'Unlock it with Alt+K or the lock button in the header.' });
    return;
  }
  change();
}

export function toggleLayoutLock() {
  const { settings, updateSettings } = useStore.getState();
  const layoutLocked = !settings.layoutLocked;
  updateSettings({ layoutLocked });
  toast.success(layoutLocked ? 'Layout locked' : 'Layout unlocked', {
    id: 'layout-locked',
    description: layoutLocked ? 'Panels stay where they are until you unlock (Alt+K).' : 'Panels can be resized and moved again.',
    duration: 2000,
  });
}

export function toggleHeader() {
  const { settings, updateSettings } = useStore.getState();
  const headerHidden = !settings.headerHidden;
  updateSettings({ headerHidden });
  if (headerHidden) toast('Top bar hidden', { id: 'header', description: 'Alt+H or the tab at the top brings it back. Ctrl+Enter still runs your code.', duration: 3000 });
}

export const IO_FONT = { min: 10, max: 22 };

export function changeIoFontSize(delta: number) {
  const { settings, updateSettings } = useStore.getState();
  const ioFontSize = Math.min(IO_FONT.max, Math.max(IO_FONT.min, settings.ioFontSize + delta));
  if (ioFontSize !== settings.ioFontSize) updateSettings({ ioFontSize });
}

export const toggleAssistant = () => changeLayout(() => useStore.getState().setAssistantOpen(!useStore.getState().assistantOpen));

export const toggleTestPanelPosition = () =>
  changeLayout(() => {
    const { settings, updateSettings } = useStore.getState();
    updateSettings({ ioPosition: settings.ioPosition === 'bottom' ? 'right' : 'bottom' });
  });

/**
 * Puts the workspace back the way it started: panel sizes (saved by the resizable panels), the test panel at the
 * bottom with its default text size, the top bar and assistant shown, nothing locked or maximized.
 */
export function resetLayout() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('react-resizable-panels:')) localStorage.removeItem(key);
  } catch {
    // Storage blocked: the panels still remount at their default sizes for now.
  }
  const { updateSettings } = useStore.getState();
  updateSettings({ ioPosition: 'bottom', ioFontSize: DEFAULT_SETTINGS.ioFontSize, headerHidden: false, layoutLocked: false });
  // A new epoch remounts the panel groups, so they take their default sizes.
  useStore.setState((s) => ({ assistantOpen: true, editorFocus: false, layoutEpoch: s.layoutEpoch + 1 }));
  toast.success('Layout reset', { id: 'layout-reset', description: 'Panels, the test panel and the top bar are back to their defaults.' });
}

const inFullscreen = () => Boolean(document.fullscreenElement);

/** Browser full screen for the whole app (Alt+Enter). */
export function toggleFullscreen() {
  if (inFullscreen()) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => toast.error('Full screen is not available here.'));
}

/** Only the editor, filling the screen (Alt+Z). Leaving full screen (Esc) brings the rest back. */
export function toggleEditorFocus() {
  const focus = !useStore.getState().editorFocus;
  useStore.setState({ editorFocus: focus });
  if (focus && !inFullscreen()) void document.documentElement.requestFullscreen().catch(() => {});
  if (!focus && inFullscreen()) void document.exitFullscreen();
}

/** Whether the page is in full screen; also ends editor focus when the user leaves full screen with Esc. */
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(inFullscreen);
  useEffect(() => {
    const onChange = () => {
      setFullscreen(inFullscreen());
      if (!inFullscreen() && useStore.getState().editorFocus) useStore.setState({ editorFocus: false });
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return fullscreen;
}
