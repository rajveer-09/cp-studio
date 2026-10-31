import { Router } from 'express';
import { siteOrigin } from '../config.js';

/**
 * The "CP Studio helper" userscript (Tampermonkey / Violentmonkey). Browsers don't let one site write into
 * another's page, so this runs on the judges' sites: when "Submit on …" opens a submit page, it puts the code
 * into the judge's editor and picks the language. The code travels in the link's #fragment, which is never
 * sent to any server, and is only accepted when CP Studio opened the page. It never presses Submit.
 */
export const helperRouter = Router();

/** Bump to make installed copies update themselves. */
const VERSION = '1.0';

// Plain JavaScript that runs in the judge's page, kept free of backticks and template placeholders.
const SCRIPT = String.raw`(() => {
  'use strict';
  const APP_ORIGIN = __APP_ORIGIN__;
  const VERSION = __VERSION__;
  const KEY = 'cp-studio-submission';
  const MAX_AGE_MS = 15 * 60 * 1000;

  // In CP Studio itself: tells the app the helper is installed, so Submit sends the code along.
  if (location.origin === APP_ORIGIN) {
    const mark = () => document.documentElement.setAttribute('data-cp-studio-helper', VERSION);
    // At document-start the <html> element may not exist yet; it does before the app's scripts run.
    if (document.documentElement) mark();
    else {
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        observer.disconnect();
        mark();
      }).observe(document, { childList: true });
    }
    return;
  }

  const LANGUAGES = {
    cpp: { label: 'C++', leetcode: 'cpp', leetcodeLabel: 'C++', family: /\+\+/, prefer: [/\+\+ ?23\b/, /\+\+ ?20\b/, /\+\+ ?17\b/, /\+\+/] },
    java: { label: 'Java', leetcode: 'java', leetcodeLabel: 'Java', family: /^\s*Java\b/i, prefer: [/Java ?21\b/i, /Java ?17\b/i, /^\s*Java\b/i] },
    python: {
      label: 'Python',
      leetcode: 'python3',
      leetcodeLabel: 'Python3',
      family: /Python|PyPy/i,
      prefer: [/PyPy ?3.*64/i, /PyPy ?3/i, /PyPy/i, /Python ?3/i, /CPython/i, /Python/i],
    },
  };
  // Variants nobody means by default (Codeforces' "Clang++20 Diagnostics", AtCoder's Cython, ...).
  const UNUSUAL = /clang|diagnostics|visual|cython|codon|numba|mypy|nuitka/i;
  // The form fields the judge submits when its editor sits on top of a textarea (Codeforces, AtCoder).
  const SOURCE_FIELDS = '#sourceCodeTextarea, textarea[name="source"], textarea[name="sourceCode"], #plain-textarea';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const shown = (el) => Boolean(el) && el.offsetParent !== null;
  const same = (a, b) => a.replace(/\r\n?/g, '\n').trimEnd() === b.replace(/\r\n?/g, '\n').trimEnd();

  async function waitFor(find, ms) {
    const end = Date.now() + ms;
    for (;;) {
      let found = null;
      try {
        found = find();
      } catch (e) {}
      if (found || Date.now() > end) return found || null;
      await sleep(200);
    }
  }

  /** Takes the code from the link CP Studio opened (#cp-studio=...) and keeps it in this tab until it is used. */
  function readPending() {
    const match = /(?:^#|&)cp-studio=([^&]*)/.exec(location.hash);
    let refused = null;
    if (match) {
      // Out of the address bar and history before the site's own scripts start.
      history.replaceState(history.state, '', location.pathname + location.search);
      let from = '';
      try {
        from = new URL(document.referrer).origin;
      } catch (e) {}
      if (from !== APP_ORIGIN) refused = from || 'a page that hid its address';
      else {
        try {
          const data = JSON.parse(decodeURIComponent(match[1]));
          if (typeof data.code === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, data.language)) {
            sessionStorage.setItem(KEY, JSON.stringify({ code: data.code, language: data.language, at: Date.now() }));
          }
        } catch (e) {}
      }
    }
    try {
      const pending = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (pending && Date.now() - pending.at < MAX_AGE_MS) return { pending, refused };
      sessionStorage.removeItem(KEY);
    } catch (e) {}
    return { pending: null, refused };
  }

  function choose(items, lang) {
    for (const pattern of lang.prefer) {
      const hit = items.find((item) => pattern.test(item.text) && !UNUSUAL.test(item.text));
      if (hit) return hit;
    }
    return items.find((item) => lang.family.test(item.text)) || null;
  }

  // Codeforces and AtCoder: a <select> of compilers (AtCoder dresses it up with select2).
  async function pickInSelect(lang) {
    const select = await waitFor(
      () =>
        Array.from(document.querySelectorAll('select')).find(
          (s) => shown(s) && Array.from(s.options).some((o) => /\+\+/.test(o.text)) && Array.from(s.options).some((o) => /Python|PyPy/i.test(o.text)),
        ),
      10000,
    );
    if (!select) return null;
    const current = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    // Keeps the compiler the user chose last time when it is already this language.
    if (current && current.value && lang.family.test(current.text)) return current.text.trim();
    const options = Array.from(select.options).filter((o) => o.value && !o.disabled);
    const choice = choose(options.map((o) => ({ text: o.text, option: o })), lang);
    if (!choice) return null;
    select.value = choice.option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return choice.text.trim();
  }

  // LeetCode: a popover; data-e2e-lang on its button says which language is active.
  async function pickOnLeetCode(lang) {
    const selector = '[data-e2e-locator="lang-selector-button"]';
    const active = () => {
      const button = document.querySelector(selector);
      return button && button.getAttribute('data-e2e-lang');
    };
    const button = await waitFor(() => document.querySelector(selector), 15000);
    if (!button) return null;
    if (active() === lang.leetcode) return lang.leetcodeLabel;
    button.click();
    const option = await waitFor(
      () =>
        Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper] div, [role="dialog"] div')).find(
          (d) => d.childElementCount === 0 && d.textContent.trim() === lang.leetcodeLabel && shown(d),
        ),
      4000,
    );
    if (!option) {
      button.click();
      return null;
    }
    option.click();
    return (await waitFor(() => active() === lang.leetcode, 5000)) ? lang.leetcodeLabel : null;
  }

  // CodeChef: a Material UI select next to the editor, which opens on mousedown.
  async function pickOnCodeChef(lang) {
    const box = await waitFor(() => {
      const editor = document.querySelector('.ace_editor');
      for (let el = editor && editor.parentElement; el; el = el.parentElement) {
        const found = Array.from(el.querySelectorAll('[role="combobox"]')).find(shown);
        if (found) return found;
      }
      return null;
    }, 15000);
    if (!box) return null;
    const current = box.textContent.trim();
    if (lang.family.test(current)) return current;
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const options = await waitFor(() => {
      const list = Array.from(document.querySelectorAll('li[role="option"]')).filter(shown);
      return list.length ? list : null;
    }, 4000);
    if (!options) return null;
    const choice = choose(options.map((li) => ({ text: li.textContent.trim(), option: li })), lang);
    if (!choice) return null;
    choice.option.click();
    return choice.text;
  }

  const SITES = [
    { name: 'Codeforces', host: /(^|\.)codeforces\.com$/, page: /\/submit/, pickLanguage: pickInSelect },
    { name: 'AtCoder', host: /(^|\.)atcoder\.jp$/, page: /\/submit/, pickLanguage: pickInSelect },
    { name: 'CodeChef', host: /(^|\.)codechef\.com$/, page: /\/problems\/\w/, pickLanguage: pickOnCodeChef },
    { name: 'LeetCode', host: /(^|\.)leetcode\.com$/, page: /^\/problems\/[\w-]+/, pickLanguage: pickOnLeetCode },
  ];

  function setTextarea(textarea, code) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, code);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // The judge's code editor: Monaco (LeetCode), Ace (Codeforces, AtCoder, CodeChef) or a plain textarea.
  function findEditor() {
    const monaco = window.monaco && window.monaco.editor;
    if (monaco && monaco.getEditors) {
      const editors = monaco
        .getEditors()
        .filter((e) => e.getModel() && shown(e.getDomNode()) && e.getModel().getLanguageId() !== 'plaintext')
        .sort((a, b) => b.getDomNode().offsetHeight - a.getDomNode().offsetHeight);
      const editor = editors[0];
      if (editor) {
        return {
          get: () => editor.getValue(),
          set: (code) => {
            // As an edit, so Ctrl+Z brings back what was there.
            editor.pushUndoStop();
            editor.executeEdits('cp-studio', [{ range: editor.getModel().getFullModelRange(), text: code }]);
            editor.pushUndoStop();
            editor.setPosition({ lineNumber: 1, column: 1 });
            editor.revealLine(1);
          },
        };
      }
    }
    const aceElement =
      window.ace &&
      Array.from(document.querySelectorAll('.ace_editor'))
        .filter(shown)
        .sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
    if (aceElement) {
      const editor = (aceElement.env && aceElement.env.editor) || window.ace.edit(aceElement);
      return { get: () => editor.getValue(), set: (code) => editor.setValue(code, -1) };
    }
    const textarea = Array.from(document.querySelectorAll(SOURCE_FIELDS)).find(shown);
    return textarea ? { get: () => textarea.value, set: (code) => setTextarea(textarea, code) } : null;
  }

  function fill(editor, code) {
    editor.set(code);
    for (const field of document.querySelectorAll(SOURCE_FIELDS)) if (!same(field.value, code)) setTextarea(field, code);
  }

  /** Waits until the editor holds what the site loads into it (a template, saved code) and stops changing. */
  async function settledEditor() {
    const end = Date.now() + 20000;
    let last = null;
    let since = Date.now();
    while (Date.now() < end) {
      const editor = findEditor();
      const value = editor ? editor.get() : null;
      if (value !== last) {
        last = value;
        since = Date.now();
      } else if (editor && Date.now() - since >= 800) return editor;
      await sleep(200);
    }
    return findEditor();
  }

  /** Puts the code back if the site loads something over it in the next few seconds, until the user acts. */
  async function keep(code) {
    let touched = false;
    const touch = () => {
      touched = true;
    };
    document.addEventListener('keydown', touch, true);
    document.addEventListener('mousedown', touch, true);
    let refills = 0;
    for (let i = 0; i < 20 && !touched && refills < 3; i++) {
      await sleep(250);
      const editor = findEditor();
      if (editor && !touched && !same(editor.get(), code)) {
        fill(editor, code);
        refills++;
      }
    }
    document.removeEventListener('keydown', touch, true);
    document.removeEventListener('mousedown', touch, true);
  }

  function note(title, detail, options) {
    const old = document.getElementById('cp-studio-helper');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'cp-studio-helper';
    box.setAttribute('role', 'status');
    box.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;gap:10px;align-items:flex-start;width:min(360px,calc(100vw - 40px));' +
      'box-sizing:border-box;padding:12px 10px 12px 14px;border-radius:12px;background:#1d1a17;color:#f4efe9;border:1px solid #3d3731;' +
      'box-shadow:0 14px 36px rgba(0,0,0,.35);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left';
    const mark = document.createElement('span');
    mark.style.cssText = 'flex:none;width:8px;height:8px;margin-top:6px;border-radius:2px;background:' + (options.error ? '#e5534b' : '#ff9a1f');
    const text = document.createElement('div');
    text.style.cssText = 'flex:1;min-width:0';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:600';
    heading.textContent = title;
    const body = document.createElement('div');
    body.style.cssText = 'margin-top:2px;color:#bdb3a8';
    body.textContent = detail;
    const label = document.createElement('div');
    label.style.cssText = 'margin-top:6px;font-size:11px;letter-spacing:.02em;color:#8d837a';
    label.textContent = 'CP Studio helper';
    text.append(heading, body);
    if (options.retry) {
      const again = document.createElement('button');
      again.type = 'button';
      again.textContent = 'Fill again';
      again.style.cssText =
        'margin-top:8px;padding:4px 10px;border-radius:7px;border:1px solid #4a423b;background:#2a2622;color:#f4efe9;font:inherit;font-size:12px;cursor:pointer';
      again.addEventListener('click', options.retry);
      text.append(again);
    }
    text.append(label);
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.style.cssText = 'flex:none;border:0;background:none;color:#8d837a;font:18px/1 system-ui;cursor:pointer;padding:0 4px';
    close.addEventListener('click', () => box.remove());
    box.append(mark, text, close);
    document.body.append(box);
    if (!options.sticky) setTimeout(() => box.remove(), 10000);
  }

  async function run(site, pending, refused) {
    if (refused) {
      note('Code from another site was ignored', 'The CP Studio helper only fills in code sent by CP Studio, and this link came from ' + refused + '.', { error: true, sticky: true });
      return;
    }
    try {
      sessionStorage.removeItem(KEY);
    } catch (e) {}
    const lang = LANGUAGES[pending.language];
    let picked = null;
    try {
      picked = await site.pickLanguage(lang);
    } catch (e) {}
    const editor = await settledEditor();
    if (!editor) {
      note("Couldn't find the code editor", 'Your ' + lang.label + ' code is on the clipboard: click in the editor and paste it (Ctrl+V).', { error: true, sticky: true });
      return;
    }
    fill(editor, pending.code);
    const retry = () => {
      const current = findEditor();
      if (current) fill(current, pending.code);
    };
    if (picked) note('Your ' + lang.label + ' code is filled in', 'Language: ' + picked + '. Check it, then press Submit.', { retry });
    else note('Your ' + lang.label + ' code is filled in', 'Pick ' + lang.label + ' in the ' + site.name + ' language menu, then click Fill again.', { retry, sticky: true });
    keep(pending.code);
  }

  const { pending, refused } = readPending();
  const site = SITES.find((s) => s.host.test(location.hostname) && s.page.test(location.pathname));
  // Not on the submit page (e.g. the sign-in page first): the code waits in this tab until it is.
  if (!site || (!pending && !refused)) return;
  const start = () => run(site, pending, refused);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
`;

function userscript(origin: string): string {
  const header = [
    '// ==UserScript==',
    '// @name         CP Studio helper',
    '// @namespace    cp-studio',
    `// @version      ${VERSION}`,
    `// @description  "Submit on ..." in CP Studio opens the judge with your code in its editor and the language picked.`,
    '// @author       Rajveer Sharma',
    '// @match        https://codeforces.com/*',
    '// @match        https://*.codeforces.com/*',
    '// @match        https://atcoder.jp/*',
    '// @match        https://www.codechef.com/*',
    '// @match        https://leetcode.com/*',
    `// @include      ${origin}/*`,
    `// @downloadURL  ${origin}/api/helper/cp-studio.user.js`,
    `// @updateURL    ${origin}/api/helper/cp-studio.user.js`,
    '// @run-at       document-start',
    '// @grant        none',
    '// @noframes',
    '// ==/UserScript==',
  ].join('\n');
  return `${header}\n\n${SCRIPT.replace('__APP_ORIGIN__', JSON.stringify(origin)).replace('__VERSION__', JSON.stringify(VERSION))}`;
}

helperRouter.get('/cp-studio.user.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(userscript(siteOrigin(req)));
});
