/**
 * Author: Rajveer Sharma
 * Date: 30 Oct 2026
 * @CP Studio
 */
import { config } from '../config.js';
import { getWorkspace, type CompileResult } from '../runner/index.js';
import type { CppStandard, Language } from '../runner/languages.js';
import { processSlots } from '../runner/process.js';
import { traceCpp } from './cpp.js';
import { traceJava } from './java.js';
import { tracePython } from './python.js';
import { harnessRanges, type TraceOutcome } from './types.js';

export interface TraceRequest {
  language: Language;
  code: string;
  cppStandard: CppStandard;
  input: string;
  watches: string[];
}

export type TraceResponse = TraceOutcome & { compile: CompileResult; maxSteps: number };

export async function trace(request: TraceRequest): Promise<TraceResponse> {
  const ws = await getWorkspace(request.language, request.code, request.cppStandard, 'debug');
  const maxSteps = config.debugger.maxSteps;
  if (!ws.compile.ok) {
    return { compile: ws.compile, maxSteps, steps: [], truncated: false, stdout: '', stderr: '', exitCode: null };
  }

  const hidden = harnessRanges(request.code);
  const outcome = await processSlots.use(() => {
    switch (request.language) {
      case 'cpp':
        return traceCpp(ws, request.code, request.input, request.watches, hidden);
      case 'java':
        return traceJava(ws, request.input, request.watches, hidden);
      case 'python':
        return tracePython(ws, request.input, request.watches, hidden);
    }
  });
  return { compile: ws.compile, maxSteps, ...outcome };
}
