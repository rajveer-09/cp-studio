import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { config, githubEnabled, siteOrigin } from '../config.js';

/**
 * "Sign in with GitHub" for saving solutions to the user's own repositories. The server only runs the OAuth
 * handshake (the client secret must stay here); the resulting token is handed to the user's browser and
 * kept there. These routes run before the access-key check: a popup can't send that header.
 */
export const githubRouter = Router();

const STATE_TTL_MS = 10 * 60_000;
const pendingStates = new Map<string, number>();

const callbackUrl = (req: Request) => `${siteOrigin(req)}/api/github/callback`;

/** A tiny page that stores the result in this site's storage, tells the opener, and closes. */
function resultPage(result: { token?: string; error?: string }): string {
  const data = JSON.stringify(result).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>GitHub</title>
<body style="font:14px system-ui;padding:24px;color:#555">${result.error ? 'GitHub sign-in failed. You can close this window.' : 'Connected. You can close this window.'}
<script>
  const result = ${data};
  try { localStorage.setItem('cp-studio-github-result', JSON.stringify(result)); } catch (e) {}
  if (window.opener) { window.opener.postMessage({ type: 'cp-studio-github' }, location.origin); window.close(); }
  else location.replace('/editor');
</script></body>`;
}

githubRouter.get('/login', (req, res) => {
  if (!githubEnabled) return res.status(503).send('GitHub sign-in is not configured on this server.');
  const now = Date.now();
  for (const [state, at] of pendingStates) if (now - at > STATE_TTL_MS) pendingStates.delete(state);
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, now);

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.github.clientId);
  url.searchParams.set('redirect_uri', callbackUrl(req));
  // "repo" lets a user save to a private repository too; it is granted by the user, for their own account.
  url.searchParams.set('scope', 'repo');
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');
  res.redirect(url.toString());
});

githubRouter.get('/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { code, state, error_description } = req.query as Record<string, string | undefined>;
  if (!githubEnabled) return res.status(503).send(resultPage({ error: 'not configured' }));
  if (!state || !pendingStates.delete(state)) return res.status(400).send(resultPage({ error: 'The sign-in link expired. Try again.' }));
  if (!code) return res.status(400).send(resultPage({ error: error_description || 'GitHub sign-in was cancelled.' }));

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: config.github.clientId, client_secret: config.github.clientSecret, code, redirect_uri: callbackUrl(req) }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await response.json()) as { access_token?: string; error_description?: string };
    if (!data.access_token) return res.status(400).send(resultPage({ error: data.error_description || 'GitHub did not return a token.' }));
    res.send(resultPage({ token: data.access_token }));
  } catch {
    res.status(502).send(resultPage({ error: "Couldn't reach GitHub. Try again." }));
  }
});
