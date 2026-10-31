import { createAuthClient } from 'better-auth/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { navigate } from 'wouter/use-browser-location';
import { useStore, type AppState } from '../store';
import type { AccountUser, SocialProvider } from '../types';
import { leaveWorkspace } from './sync';

/** Accounts live on this same site under /api/auth (Better Auth); the session is an httpOnly cookie. */
export const authClient = createAuthClient({ basePath: '/api/auth' });

/** Mirrors the session into the store, so code outside React (the AI, menus) can see who is signed in. */
export function useAccountSync() {
  const { data, isPending } = authClient.useSession();
  useEffect(() => {
    if (isPending) return;
    const user = data?.user;
    useStore.setState({
      account: user
        ? { status: 'signedIn', user: { id: user.id, name: user.name, email: user.email, image: user.image } satisfies AccountUser }
        : { status: 'signedOut', user: null },
    });
  }, [data, isPending]);
}

/** The sign-in page, coming back to `next` afterwards. */
export function goToSignIn(next = location.pathname + location.search) {
  navigate(next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login');
}

/** Where to go after signing in: only a path on this site. */
export function afterSignIn(): string {
  const next = new URLSearchParams(location.search).get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Whether the AI can be used: 'ok', 'off' (no API keys on the server) or 'signin' (accounts are on, signed out). */
export function aiAccess(s: Pick<AppState, 'serverConfig' | 'account'>): 'ok' | 'off' | 'signin' {
  if (!s.serverConfig?.aiEnabled) return 'off';
  if (s.serverConfig.accounts && s.account.status === 'signedOut') return 'signin';
  return 'ok';
}

/** Asks the user to sign in, with a button to the sign-in page. */
export function promptSignIn(message = 'Sign in to use the AI assistant.') {
  toast(message, {
    id: 'sign-in',
    description: 'It’s free, and keeps the AI available for everyone.',
    action: { label: 'Sign in', onClick: () => goToSignIn() },
  });
}

/** True when the AI can be used now; otherwise explains why (and offers sign-in) and returns false. */
export function requireAi(): boolean {
  const access = aiAccess(useStore.getState());
  if (access === 'off') toast.error('The AI assistant is not configured on the server.');
  if (access === 'signin') promptSignIn();
  return access === 'ok';
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email and password don’t match.',
  USER_ALREADY_EXISTS: 'An account with this email already exists. Sign in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with this email already exists. Sign in instead.',
  PASSWORD_TOO_SHORT: 'Use at least 8 characters for your password.',
  PASSWORD_TOO_LONG: 'That password is too long (128 characters at most).',
  INVALID_EMAIL: 'Enter a valid email address.',
  // Redirect errors from Google / GitHub sign-in (?error=...).
  account_not_linked: 'This email already has a CP Studio account. Sign in with your email and password.',
  access_denied: 'Sign-in was cancelled.',
  state_mismatch: 'The sign-in link expired. Try again.',
};

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return 'Something went wrong. Try again.';
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return (error.code && MESSAGES[error.code]) || error.message || 'Something went wrong. Try again.';
}

export const redirectErrorMessage = (code: string) => MESSAGES[code] ?? 'Sign-in didn’t finish. Try again.';

export async function signInWith(provider: SocialProvider): Promise<string | null> {
  const { error } = await authClient.signIn.social({
    provider,
    callbackURL: afterSignIn(),
    errorCallbackURL: '/login',
  });
  return error ? authErrorMessage(error) : null;
}

export async function signOut() {
  // Your work is in your account; this browser goes back to a fresh workspace for whoever uses it next.
  await leaveWorkspace();
  await authClient.signOut();
  toast.success('Signed out');
}
