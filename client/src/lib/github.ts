import { useSyncExternalStore } from 'react';

/**
 * "Save to GitHub". Each user signs in with their own GitHub account (OAuth, run by the server); the token
 * stays in this browser and is used to call GitHub's API directly. Nothing is stored on the server.
 */

export interface GithubAccount {
  token: string;
  login: string;
  avatarUrl: string;
}

const ACCOUNT_KEY = 'cp-studio-github';
/** Written by the sign-in callback page (same site), read once here. */
const RESULT_KEY = 'cp-studio-github-result';
const REPO_KEY = 'cp-studio-github-repo';
const CHANGE_EVENT = 'cp-studio-github-change';

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode): the account then lasts only for this page.
  }
}

let account: GithubAccount | null = read<GithubAccount>(ACCOUNT_KEY);

function setAccount(next: GithubAccount | null) {
  account = next;
  write(ACCOUNT_KEY, next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useGithubAccount(): GithubAccount | null {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(CHANGE_EVENT, onChange);
      return () => window.removeEventListener(CHANGE_EVENT, onChange);
    },
    () => account,
  );
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function github<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    throw new GithubError("Couldn't reach GitHub. Check your connection and try again.");
  }
  if (res.status === 401) {
    setAccount(null);
    throw new GithubError('Your GitHub sign-in has expired or was revoked. Connect again.', 401);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new GithubError(body.message ?? `GitHub error ${res.status}`, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

async function completeSignIn(token: string): Promise<GithubAccount> {
  const user = await github<{ login: string; avatar_url: string }>('/user', token);
  const next = { token, login: user.login, avatarUrl: user.avatar_url };
  setAccount(next);
  return next;
}

function takeResult(): { token?: string; error?: string } | null {
  const result = read<{ token?: string; error?: string }>(RESULT_KEY);
  write(RESULT_KEY, null);
  return result;
}

/** Opens GitHub's sign-in in a popup; resolves with the account once the user approves. */
export function connectGithub(): Promise<GithubAccount> {
  write(RESULT_KEY, null);
  const popup = window.open('/api/github/login', 'cp-studio-github', 'width=640,height=760');
  if (!popup) {
    // Popups blocked: sign in on this page instead; the app picks up the result when it loads again.
    location.href = '/api/github/login';
    return new Promise(() => {});
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      const result = takeResult();
      if (!result?.token) return reject(new GithubError(result?.error ?? 'GitHub sign-in was cancelled.'));
      completeSignIn(result.token).then(resolve, reject);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.type === 'cp-studio-github') void finish();
    };
    // If the popup is closed without finishing, stop waiting.
    const timer = setInterval(() => popup.closed && void finish(), 600);
    window.addEventListener('message', onMessage);
  });
}

/** After a full-page sign-in (popups blocked), finishes it when the app loads. */
export async function resumeGithubSignIn(): Promise<GithubAccount | null> {
  const result = takeResult();
  return result?.token ? completeSignIn(result.token) : null;
}

export function disconnectGithub() {
  setAccount(null);
}

export function lastRepo(): { name: string; private: boolean } {
  return read<{ name: string; private: boolean }>(REPO_KEY) ?? { name: 'cp-solutions', private: false };
}

/** Base64 of UTF-8 text, in chunks so large files don't overflow the call stack. */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export interface SaveRequest {
  repo: string;
  isPrivate: boolean;
  path: string;
  content: string;
  message: string;
}

/** Commits one file to the user's repository, creating the repository first if it doesn't exist. */
export async function saveToGithub(request: SaveRequest): Promise<{ url: string; repoCreated: boolean; updated: boolean }> {
  if (!account) throw new GithubError('Connect your GitHub account first.');
  const { token, login } = account;
  const repo = request.repo.trim();
  const path = request.path.trim().replace(/^\/+/, '');
  if (!/^[\w.-]+$/.test(repo)) throw new GithubError('Repository names may only use letters, numbers, ".", "-" and "_".');
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new GithubError('Choose a file path such as codeforces/1904A.cpp.');

  let repoCreated = false;
  try {
    await github(`/repos/${login}/${repo}`, token);
  } catch (err) {
    if (!(err instanceof GithubError) || err.status !== 404) throw err;
    await github('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({ name: repo, private: request.isPrivate, auto_init: true, description: 'Competitive programming solutions, saved from CP Studio' }),
    });
    repoCreated = true;
  }
  write(REPO_KEY, { name: repo, private: request.isPrivate });

  const filePath = path.split('/').map(encodeURIComponent).join('/');
  let sha: string | undefined;
  try {
    sha = (await github<{ sha: string }>(`/repos/${login}/${repo}/contents/${filePath}`, token)).sha;
  } catch (err) {
    if (!(err instanceof GithubError) || err.status !== 404) throw err;
  }
  const saved = await github<{ content: { html_url: string } }>(`/repos/${login}/${repo}/contents/${filePath}`, token, {
    method: 'PUT',
    body: JSON.stringify({ message: request.message.trim() || `Add ${path}`, content: base64(request.content), ...(sha ? { sha } : {}) }),
  });
  return { url: saved.content.html_url, repoCreated, updated: Boolean(sha) };
}
