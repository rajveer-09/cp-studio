import { Router, type Request, type Response } from 'express';
import { aiEnabled } from '../config.js';
import { parseContext } from '../ai/context.js';
import { describeAiError, generateTests, proposeFix, streamChat, type ChatTurn } from '../ai/gemini.js';
import { CHAT_COMMANDS, type ChatCommand } from '../ai/prompts.js';

export const aiRouter = Router();

aiRouter.use((_req, res, next) => {
  if (!aiEnabled) {
    res.status(503).json({ error: 'The AI assistant is not configured. Set GEMINI_API_KEY in server/.env and restart the server.' });
    return;
  }
  next();
});

const AI_TIMEOUT_MS = 120_000;

/**
 * `cancelled` fires when the client disconnects or presses Stop; `signal` also fires on timeout,
 * so a stuck Gemini call can never hang a request forever.
 */
function abortOnDisconnect(res: Response) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return { cancelled: controller.signal, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]) };
}

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20_000) }));
}

aiRouter.post('/chat', async (req: Request, res: Response) => {
  const context = parseContext(req.body?.context);
  if (!context) return res.status(400).json({ error: 'Missing or invalid code context.' });

  const command = CHAT_COMMANDS.includes(req.body?.command) ? (req.body.command as ChatCommand) : undefined;
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.slice(0, 8_000) : '';
  if (!command && !prompt.trim()) return res.status(400).json({ error: 'Message is empty.' });

  const { cancelled, signal } = abortOnDisconnect(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    for await (const delta of streamChat(parseHistory(req.body?.history), prompt, command, context, signal)) {
      send({ delta });
    }
    send({ done: true });
  } catch (err) {
    if (!cancelled.aborted) send({ error: describeAiError(err).message });
  } finally {
    res.end();
  }
});

aiRouter.post('/fix', async (req, res) => {
  const context = parseContext(req.body?.context);
  if (!context) return res.status(400).json({ error: 'Missing or invalid code context.' });
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.slice(0, 2_000) : '';

  const { cancelled, signal } = abortOnDisconnect(res);
  try {
    res.json(await proposeFix(context, instruction, signal));
  } catch (err) {
    const { status, message } = describeAiError(err);
    if (!cancelled.aborted) res.status(status).json({ error: message });
  }
});

aiRouter.post('/tests', async (req, res) => {
  const context = parseContext(req.body?.context);
  if (!context) return res.status(400).json({ error: 'Missing or invalid code context.' });

  const { cancelled, signal } = abortOnDisconnect(res);
  try {
    res.json({ tests: await generateTests(context, signal) });
  } catch (err) {
    const { status, message } = describeAiError(err);
    if (!cancelled.aborted) res.status(status).json({ error: message });
  }
});
