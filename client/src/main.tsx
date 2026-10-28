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

registerFormatters();
registerCompletions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
