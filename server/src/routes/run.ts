import { Router } from 'express';
import { config } from '../config.js';
import { execute } from '../runner/index.js';
import { isCppStandard, isLanguage } from '../runner/languages.js';

export const runRouter = Router();

runRouter.post('/', async (req, res) => {
  const { language, code, tests, cppStandard, timeLimitMs } = req.body ?? {};
  const { limits } = config;

  if (!isLanguage(language)) return res.status(400).json({ error: 'Unsupported language.' });
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Code is empty.' });
  if (Buffer.byteLength(code) > limits.maxCodeBytes) return res.status(413).json({ error: 'Code is too large (max 200 KB).' });
  if (!Array.isArray(tests) || tests.length === 0) return res.status(400).json({ error: 'At least one test case is required.' });
  if (tests.length > limits.maxTests) return res.status(400).json({ error: `At most ${limits.maxTests} test cases per run.` });

  const parsedTests: { id: string; input: string }[] = [];
  for (const test of tests) {
    if (typeof test?.id !== 'string' || typeof test?.input !== 'string') {
      return res.status(400).json({ error: 'Each test case needs an id and an input.' });
    }
    if (Buffer.byteLength(test.input) > limits.maxInputBytes) return res.status(413).json({ error: 'A test input is too large (max 2 MB).' });
    parsedTests.push({ id: test.id, input: test.input });
  }

  const requestedLimit = Number(timeLimitMs) || limits.defaultTimeLimitMs;
  const result = await execute({
    language,
    code,
    tests: parsedTests,
    cppStandard: isCppStandard(cppStandard) ? cppStandard : 'c++17',
    timeLimitMs: Math.min(limits.maxTimeLimitMs, Math.max(limits.minTimeLimitMs, requestedLimit)),
  });
  res.json(result);
});
