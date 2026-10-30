/**
 * Author: Rajveer Sharma
 * Date: 28 Oct 2026
 * @CP Studio
 */
import './lib/monaco';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerCompletions } from './lib/completions';
import { registerFormatters } from './lib/format';
import { consumeImportHash } from './lib/problems';

registerFormatters();
registerCompletions();

void consumeImportHash().then((handedOff) => {
  if (handedOff) {
    window.close();
    document.body.innerHTML =
      '<p style="display:grid;place-items:center;height:100%;margin:0;font:14px Inter,sans-serif">Sent to your CP Studio tab. You can close this tab.</p>';
    return;
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
