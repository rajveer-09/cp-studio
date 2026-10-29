/**
 * Author: Rajveer Sharma
 * Date: 29 Oct 2026
 * @CP Studio
 */
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Schema } from '@google/genai';
import { config } from '../config.js';
import { formatContext, type CodeContext } from './context.js';
import { COMMAND_INSTRUCTIONS, FIX_PROMPT, FIX_SCHEMA, SYSTEM_PROMPT, TESTS_PROMPT, TESTS_SCHEMA, type ChatCommand } from './prompts.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface FixProposal {
  rootCause: string;
  changes: string[];
  summary: string;
  fixedCode: string;
}

export interface GeneratedTest {
  input: string;
  expectedOutput: string;
  reason: string;
}

const MAX_HISTORY = 12;

let client: GoogleGenAI | null = null;
const gemini = () =>
  (client ??= new GoogleGenAI({
    apiKey: config.gemini.apiKey,
    // Gemini occasionally returns a transient 503; retry quickly instead of failing the request.
    httpOptions: { retryOptions: { attempts: 3, initialDelay: 1, maxDelay: 4, httpStatusCodes: [500, 502, 503, 504] } },
  }));

/** The workspace context is attached to the latest message only, so it's always current. */
function withContext(ctx: CodeContext, request: string): string {
  return `${formatContext(ctx)}\n\n---\n\n${request}`;
}

export async function* streamChat(
  history: ChatTurn[],
  prompt: string,
  command: ChatCommand | undefined,
  ctx: CodeContext,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const turns = history.slice(-MAX_HISTORY);
  while (turns[0]?.role === 'assistant') turns.shift(); // a conversation must start with the user

  const request = [command && `Task: ${COMMAND_INSTRUCTIONS[command]}`, prompt && `User message: ${prompt}`]
    .filter(Boolean)
    .join('\n\n');

  const contents: Content[] = [
    ...turns.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] })),
    { role: 'user', parts: [{ text: withContext(ctx, request) }] },
  ];

  const stream = await gemini().models.generateContentStream({
    model: config.gemini.model,
    contents,
    // Chat should start streaming quickly; fixes and test generation keep the default (deeper) thinking.
    config: { systemInstruction: SYSTEM_PROMPT, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: signal },
  });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

async function generateJson<T>(prompt: string, schema: Schema, signal: AbortSignal): Promise<T> {
  const response = await gemini().models.generateContent({
    model: config.gemini.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: schema,
      abortSignal: signal,
    },
  });
  try {
    return JSON.parse(response.text ?? '') as T;
  } catch {
    throw new Error('The AI returned an unexpected response. Please try again.');
  }
}

/** Models occasionally wrap code in markdown fences even inside JSON; strip them. */
function stripFences(code: string): string {
  const match = /^\s*```[\w+-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(code);
  return match ? match[1] : code;
}

export async function proposeFix(ctx: CodeContext, instruction: string, signal: AbortSignal): Promise<FixProposal> {
  const request = instruction ? `${FIX_PROMPT}\n\nAdditional instruction from the user: ${instruction}` : FIX_PROMPT;
  const raw = await generateJson<Partial<FixProposal>>(withContext(ctx, request), FIX_SCHEMA, signal);
  if (typeof raw.fixedCode !== 'string' || !raw.fixedCode.trim()) {
    throw new Error('The AI did not return any code. Please try again.');
  }
  return {
    rootCause: String(raw.rootCause ?? ''),
    changes: Array.isArray(raw.changes) ? raw.changes.map(String) : [],
    summary: String(raw.summary ?? ''),
    fixedCode: stripFences(raw.fixedCode),
  };
}

export async function generateTests(ctx: CodeContext, signal: AbortSignal): Promise<GeneratedTest[]> {
  const raw = await generateJson<{ tests?: Partial<GeneratedTest>[] }>(withContext(ctx, TESTS_PROMPT), TESTS_SCHEMA, signal);
  return (raw.tests ?? [])
    .filter((t) => typeof t.input === 'string')
    .slice(0, 6)
    .map((t) => ({ input: String(t.input), expectedOutput: String(t.expectedOutput ?? ''), reason: String(t.reason ?? '') }));
}

export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) {
      return { status: 502, message: 'Gemini rejected the API key. Check GEMINI_API_KEY in server/.env.' };
    }
    if (err.status === 404) {
      return { status: 502, message: `Model "${config.gemini.model}" is not available. Set GEMINI_MODEL in server/.env.` };
    }
    if (err.status === 429) return { status: 429, message: 'Gemini rate limit or quota reached. Wait a moment and try again.' };
    if (err.status >= 500) return { status: 502, message: 'Gemini is temporarily unavailable. Please try again.' };
    return { status: 502, message: `Gemini error: ${err.message}` };
  }
  if (err instanceof Error && err.name === 'TimeoutError') {
    return { status: 504, message: 'Gemini took too long to respond (it may be overloaded). Try again, or switch GEMINI_MODEL.' };
  }
  if (err instanceof Error && err.name === 'AbortError') return { status: 499, message: 'Request cancelled.' };
  if (err instanceof Error && err.message) return { status: 500, message: err.message };
  return { status: 500, message: 'The AI request failed.' };
}
