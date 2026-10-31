/**
 * Author: Rajveer Sharma
 * Date: 28 Oct 2026
 * @CP Studio
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { keyStatus, MODELS } from './ai/keys.js';
import { auth, migrateAuth, requireUser, socialLogins } from './auth.js';
import { aiEnabled, config, githubEnabled } from './config.js';
import { aiRouter } from './routes/ai.js';
import { debugRouter } from './routes/debug.js';
import { githubRouter } from './routes/github.js';
import { helperRouter } from './routes/helper.js';
import { meRouter, migrateUserData } from './routes/me.js';
import { problemsRouter } from './routes/problems.js';
import { runRouter } from './routes/run.js';
import { initRunner } from './runner/index.js';
import { getToolchains } from './runner/toolchains.js';

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

const limiter = (perMinute: number, what: string) =>
  rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: `Too many ${what} requests. Please wait a minute.` },
  });

// Accounts. Before the JSON parser (Better Auth reads the body itself) and the access key (sign-in pages need it).
if (auth) app.all('/api/auth/*splat', limiter(60, 'sign-in'), toNodeHandler(auth));

app.use(express.json({ limit: '8mb' }));

const sha256 = (value: string) => createHash('sha256').update(value).digest();

const requireAccessKey: RequestHandler = (req, res, next) => {
  if (!config.accessKey) return next();
  const provided = req.get('x-access-key') ?? '';
  if (timingSafeEqual(sha256(provided), sha256(config.accessKey))) return next();
  res.status(401).json({ error: 'Access key required.' });
};

// For uptime monitors (which also keep a sleeping free instance awake): cheap, and needs no access key.
app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
});

app.get('/api/config', async (_req, res) => {
  const { languages, gdb } = await getToolchains();
  const aiKeys = keyStatus();
  res.json({
    aiEnabled,
    aiKeys,
    model: aiKeys.activeModel ?? config.gemini.model,
    accessKeyRequired: Boolean(config.accessKey),
    github: githubEnabled,
    accounts: auth ? { providers: socialLogins } : null,
    toolchains: languages,
    debuggers: { cpp: languages.cpp.available && gdb.available, java: languages.java.available, python: languages.python.available },
    limits: { maxTimeLimitMs: config.limits.maxTimeLimitMs, maxTests: config.limits.maxTests, maxDebugSteps: config.debugger.maxSteps },
  });
});

// The GitHub sign-in runs in a popup, which can't send the access key; it only hands users their own token.
app.use('/api/github', limiter(20, 'GitHub sign-in'), githubRouter);
// The submit helper userscript is installed by opening its URL in Tampermonkey, which can't send it either.
app.use('/api/helper', limiter(30, 'helper'), helperRouter);

app.use('/api', requireAccessKey);
app.post('/api/access-key/check', (_req, res) => res.json({ ok: true }));
app.use('/api/run', limiter(90, 'run'), runRouter);
app.use('/api/debug', limiter(30, 'debug'), debugRouter);
app.use('/api/problems', limiter(30, 'import'), problemsRouter);
// Your synced workspace and problem history (saves are debounced, so this limit is generous).
app.use('/api/me', limiter(240, 'sync'), requireUser('your account'), meRouter);
// The AI needs an account (when accounts are on): it keeps the shared Gemini quota for people who signed up.
app.use('/api/ai', limiter(30, 'AI'), requireUser('the AI assistant'), aiRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// In production the built client is served by this same server.
if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(config.clientDist, 'index.html')) : next()));
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
};
app.use(errorHandler);

await initRunner();
try {
  await migrateAuth();
  await migrateUserData();
} catch (err) {
  console.error(`Accounts: could not prepare the database: ${err instanceof Error ? err.message : err}`);
}
app.listen(config.port, async () => {
  console.log(`CP Studio server listening on http://localhost:${config.port}`);
  console.log(`Accounts: ${auth ? `enabled (email${socialLogins.map((p) => `, ${p}`).join('')})` : 'disabled (set DATABASE_URL)'}`);
  console.log(
    `AI assistant: ${aiEnabled ? `enabled (${MODELS[0]}${MODELS.length > 1 ? `, falls back to ${MODELS.slice(1).join(', ')}` : ''}; ${config.gemini.apiKeys.length} API key${config.gemini.apiKeys.length === 1 ? '' : 's'})` : 'disabled (set GEMINI_API_KEYS)'}`,
  );
  const { languages, gdb } = await getToolchains();
  for (const [name, info] of [...Object.entries(languages), ['gdb', gdb] as const]) {
    console.log(`  ${name.padEnd(7)} ${info.available ? info.version : 'NOT FOUND'}`);
  }
});
