export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function keyLabel(key: string): string {
  switch (key) {
    case 'Mod':
      return isMac ? '⌘' : 'Ctrl';
    case 'Alt':
      return isMac ? '⌥' : 'Alt';
    case 'Shift':
      return isMac ? '⇧' : 'Shift';
    case 'Enter':
      return '↵';
    default:
      return key;
  }
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  // Fallback for plain-http deployments, where the Clipboard API is unavailable.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}
