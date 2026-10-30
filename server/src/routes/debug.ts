import { Router } from 'express';
import { config } from '../config.js';
import { trace } from '../debugger/index.js';
import { isCppStandard, isLanguage } from '../runner/languages.js';

export const debugRouter = Router();

const MAX_WATCHES = 8;

debugRouter.post('/', async (req, res) => {
  const { language, code, input, watches, cppStandard } = req.body ?? {};
  const { limits } = config;

  if (!isLanguage(language)) return res.status(400).json({ error: 'Unsupported language.' });
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Code is empty.' });
  if (Buffer.byteLength(code) > limits.maxCodeBytes) return res.status(413).json({ error: 'Code is too large (max 200 KB).' });
  if (typeof input !== 'string' || Buffer.byteLength(input) > limits.maxInputBytes) return res.status(400).json({ error: 'Invalid input.' });
  if (!Array.isArray(watches) || watches.length === 0 || watches.length > MAX_WATCHES) {
    return res.status(400).json({ error: `Watch between 1 and ${MAX_WATCHES} variables.` });
  }
  // Watches are passed to gdb/the tracers, so only plain identifiers are accepted.
  if (!watches.every((w) => typeof w === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(w))) {
    return res.status(400).json({ error: 'Watches must be variable names.' });
  }

  try {
    res.json(
      await trace({
        language,
        code,
        input,
        watches: [...new Set<string>(watches)],
        cppStandard: isCppStandard(cppStandard) ? cppStandard : 'c++17',
      }),
    );
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : 'The debugger failed.' });
  }
});
