import { toast } from 'sonner';
import { useStore } from '../store';

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
