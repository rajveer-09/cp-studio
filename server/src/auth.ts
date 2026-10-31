import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import { config, githubEnabled } from './config.js';
import { pool } from './db.js';

/**
 * Accounts: email + password, plus Google and GitHub when their OAuth apps are configured. Better Auth keeps
 * users and sessions in Postgres and signs people in with an httpOnly cookie. Routes live under /api/auth.
 */
const socialProviders = {
  ...(config.auth.google.clientId && config.auth.google.clientSecret
    ? { google: { clientId: config.auth.google.clientId, clientSecret: config.auth.google.clientSecret, prompt: 'select_account' as const } }
    : {}),
  ...(githubEnabled ? { github: { clientId: config.github.clientId, clientSecret: config.github.clientSecret } } : {}),
};

/** Sign-in methods besides email, for the client's buttons. */
export const socialLogins = Object.keys(socialProviders) as ('google' | 'github')[];

// In production the secret must be set: without it anyone could forge a session cookie.
const secretMissing = process.env.NODE_ENV === 'production' && !config.auth.secret;
if (pool && secretMissing) console.error('Accounts are off: set BETTER_AUTH_SECRET.');

export const auth =
  pool && !secretMissing
    ? betterAuth({
        appName: 'CP Studio',
        database: pool,
        secret: config.auth.secret || undefined,
        // Otherwise worked out per request (X-Forwarded-Proto and Host), which suits Render and the dev proxy.
        baseURL: config.publicUrl || undefined,
        basePath: '/api/auth',
        emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
        socialProviders,
        // An email account can't be verified yet (no mail is sent), so a Google or GitHub sign-in with the same
        // address is refused rather than joined to it: whoever registered the address first can't take it over.
        account: { accountLinking: { enabled: false } },
        session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 5 * 60 } },
        rateLimit: { enabled: true, window: 60, max: 30 },
        telemetry: { enabled: false },
      })
    : null;

/** Creates or updates the account tables. Safe to run on every start. */
export async function migrateAuth(): Promise<void> {
  if (!auth) return;
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
  if (toBeCreated.length || toBeAdded.length) {
    await runMigrations();
    console.log(`Accounts: created ${toBeCreated.map((t: { table: string }) => t.table).join(', ') || 'new columns'}`);
  }
}

export type SignedInUser = { id: string; name: string; email: string };

/** Lets the request through only for a signed-in user (stored in res.locals.user). Open when accounts are off. */
export const requireUser =
  (what: string): RequestHandler =>
  async (req, res, next) => {
    if (!auth) return next();
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) return res.status(401).json({ error: `Sign in to use ${what}.`, signIn: true });
      res.locals.user = { id: session.user.id, name: session.user.name, email: session.user.email } satisfies SignedInUser;
      next();
    } catch (err) {
      next(err);
    }
  };
