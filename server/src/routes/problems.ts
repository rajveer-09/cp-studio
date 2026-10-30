import { Router, type Response } from 'express';
import { fromCodeforcesPage, importProblem } from '../problems/index.js';
import { ImportError, PLATFORMS, type Platform } from '../problems/types.js';

export const problemsRouter = Router();

function fail(res: Response, err: unknown) {
  if (err instanceof ImportError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Importing the problem failed.' });
}

problemsRouter.post('/import', async (req, res) => {
  const { platform, ref } = req.body ?? {};
  if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform.' });
  if (typeof ref !== 'string' || !ref.trim() || ref.length > 300) return res.status(400).json({ error: 'Enter a problem number or URL.' });
  try {
    res.json(await importProblem(platform as Platform, ref));
  } catch (err) {
    fail(res, err);
  }
});

problemsRouter.post('/from-page', (req, res) => {
  const { url, title, timeLimit, html, tests } = req.body ?? {};
  const validTests =
    Array.isArray(tests) && tests.length <= 30 && tests.every((t) => typeof t?.input === 'string' && typeof t?.expected === 'string');
  if (typeof url !== 'string' || !/^https:\/\/([\w-]+\.)?codeforces\.com\//.test(url) || typeof html !== 'string' || !validTests) {
    return res.status(400).json({ error: 'That page data is not from a Codeforces problem.' });
  }
  try {
    res.json(fromCodeforcesPage({ url, title: String(title ?? ''), timeLimit: String(timeLimit ?? ''), html: html.slice(0, 500_000), tests }));
  } catch (err) {
    fail(res, err);
  }
});
