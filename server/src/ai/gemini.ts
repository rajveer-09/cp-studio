/**
 * Author: Rajveer Sharma
 * Date: 29 Oct 2026
 * @CP Studio
 */
import { ApiError, ThinkingLevel, type Content, type GenerateContentResponseUsageMetadata, type Schema } from '@google/genai';
import { config } from '../config.js';
import type { Language } from '../runner/languages.js';
import { formatContext, type CodeContext, type ContextScope } from './context.js';
import { AllKeysRestingError, GeminiBusyError, withKey } from './keys.js';
import {
  COMMAND_INSTRUCTIONS,
  DRIVER_PROMPT,
  DRIVER_SCHEMA,
  FIX_PROMPT,
  FIX_SCHEMA,
  SYSTEM_PROMPT,
  TESTS_SCHEMA,
  testsPrompt,
  type ChatCommand,
  type TestOptions,
} from './prompts.js';

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

const MAX_HISTORY = 8;
const MAX_TURN_CHARS = 2_000;

function logUsage(task: string, model: string, keyNumber: number, usage: GenerateContentResponseUsageMetadata | undefined) {
  if (!usage) return;
  const cached = usage.cachedContentTokenCount ? ` cached=${usage.cachedContentTokenCount}` : '';
  console.log(
    `[ai] ${task} ${model} key#${keyNumber} in=${usage.promptTokenCount ?? 0}${cached} out=${usage.candidatesTokenCount ?? 0} thinking=${usage.thoughtsTokenCount ?? 0}`,
  );
}

/** The workspace context is attached to the latest message only, so it's always current. */
function withContext(ctx: CodeContext, request: string, scope: ContextScope = 'full'): string {
  return `${formatContext(ctx, scope)}\n\n---\n\n${request}`;
}

/** Earlier turns only need their gist: long code blocks are dropped (the current code is always attached). */
function compactTurn(text: string): string {
  const withoutCode = text.replace(/```[\w+-]*\n([\s\S]*?)```/g, (block, body: string) =>
    body.split('\n').length > 12 ? '[code block omitted]' : block,
  );
  return withoutCode.length > MAX_TURN_CHARS ? `${withoutCode.slice(0, MAX_TURN_CHARS)} …` : withoutCode;
}

// Explaining or analysing complexity doesn't need test inputs and outputs.
const COMMAND_SCOPE: Partial<Record<ChatCommand, ContextScope>> = { explain: 'code', complexity: 'code', optimize: 'code' };

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
    ...turns.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: compactTurn(turn.content) }] })),
    { role: 'user', parts: [{ text: withContext(ctx, request, command ? COMMAND_SCOPE[command] : undefined) }] },
  ];

  // The first chunk is awaited inside withKey, so a stream that fails before any text is retried elsewhere.
  const { stream, first, model, keyNumber } = await withKey(async (client, model, keyNumber) => {
    const stream = await client.models.generateContentStream({
      model,
      contents,
      // Chat should start streaming quickly, so it thinks less than fixes and test generation.
      config: { systemInstruction: SYSTEM_PROMPT, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: signal },
    });
    return { stream, first: await stream.next(), model, keyNumber };
  });
  let usage: GenerateContentResponseUsageMetadata | undefined;
  if (!first.done) {
    usage = first.value.usageMetadata;
    if (first.value.text) yield first.value.text;
  }
  for await (const chunk of stream) {
    usage = chunk.usageMetadata ?? usage;
    if (chunk.text) yield chunk.text;
  }
  logUsage(`chat${command ? `/${command}` : ''}`, model, keyNumber, usage);
}

async function generateJson<T>(task: string, prompt: string, schema: Schema, signal: AbortSignal): Promise<T> {
  // A malformed reply is rare and usually fine on a second try.
  for (let attempt = 1; ; attempt++) {
    const response = await withKey(async (client, model, keyNumber) => {
      const result = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          abortSignal: signal,
        },
      });
      logUsage(task, model, keyNumber, result.usageMetadata);
      return result;
    });
    try {
      return JSON.parse(response.text ?? '') as T;
    } catch {
      if (attempt >= 2) throw new Error('The AI returned an unexpected response. Please try again.');
      console.warn(`[ai] ${task}: malformed JSON, retrying`);
    }
  }
}

/** Models occasionally wrap code in markdown fences even inside JSON; strip them. */
function stripFences(code: string): string {
  const match = /^\s*```[\w+-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(code);
  return match ? match[1] : code;
}

export async function proposeFix(ctx: CodeContext, instruction: string, signal: AbortSignal): Promise<FixProposal> {
  const request = instruction ? `${FIX_PROMPT}\n\nAdditional instruction from the user: ${instruction}` : FIX_PROMPT;
  const raw = await generateJson<Partial<FixProposal>>('fix', withContext(ctx, request), FIX_SCHEMA, signal);
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

export async function generateTests(ctx: CodeContext, options: TestOptions, signal: AbortSignal): Promise<GeneratedTest[]> {
  const raw = await generateJson<{ tests?: Partial<GeneratedTest>[] }>('tests', withContext(ctx, testsPrompt(options)), TESTS_SCHEMA, signal);
  return (raw.tests ?? [])
    .filter((t) => typeof t.input === 'string' && t.input.trim())
    .slice(0, options.count)
    .map((t) => ({
      input: String(t.input),
      expectedOutput: options.withExpected ? String(t.expectedOutput ?? '') : '',
      reason: String(t.reason ?? ''),
    }));
}

const LANGUAGE_NAMES: Record<Language, string> = { cpp: 'C++ (C++17, g++)', java: 'Java (public class Main)', python: 'Python 3' };

/** Wraps a LeetCode method in a runnable program that reads one example from stdin. */
export async function generateDriver(
  language: Language,
  snippet: string,
  examples: { input: string; expected: string }[],
  signal: AbortSignal,
): Promise<string> {
  const shown = examples
    .slice(0, 3)
    .map((e, i) => `Example ${i + 1} stdin:\n${e.input.trim()}\nExpected stdout: ${e.expected.trim() || '(unknown)'}`)
    .join('\n\n');
  const prompt = `${DRIVER_PROMPT}\n\nLanguage: ${LANGUAGE_NAMES[language]}\n\nStarter code:\n\`\`\`\n${snippet}\n\`\`\`\n\n${shown}`;
  const raw = await generateJson<{ code?: string }>('driver', prompt, DRIVER_SCHEMA, signal);
  if (typeof raw.code !== 'string' || !raw.code.trim()) throw new Error('The AI did not return any code. Please try again.');
  return stripFences(raw.code);
}

export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof GeminiBusyError) {
    return { status: 503, message: 'Gemini is overloaded right now, on every model this app can use. Please try again in a minute.' };
  }
  if (err instanceof AllKeysRestingError) {
    const minutes = Math.max(1, Math.round((err.availableAt - Date.now()) / 60_000));
    const wait = minutes >= 90 ? `about ${Math.round(minutes / 60)} hours` : `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    return {
      status: 429,
      message: `Every Gemini API key has used up its quota on every configured model. The first one is available again in ${wait}.`,
    };
  }
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return { status: 502, message: `Model "${config.gemini.model}" is not available. Set GEMINI_MODEL in server/.env.` };
    }
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
