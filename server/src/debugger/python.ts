import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { cleanPaths, MISSING_TOOLCHAIN, type Workspace } from '../runner/index.js';
import { runProcess } from '../runner/process.js';
import type { TraceOutcome } from './types.js';

/** Runs the user's script under sys.settrace, recording watched variables before each line runs. */
const TRACER = String.raw`
import json, os, reprlib, runpy, sys, threading, time, traceback

target = os.path.abspath(sys.argv[1])
watches = [w for w in sys.argv[2].split(",") if w]
max_steps = int(sys.argv[3])
deadline = time.monotonic() + float(sys.argv[4]) / 1000
out_path = sys.argv[5]
steps = []

# Bounded repr: a 10^5-element list must not be fully printed on every line.
short = reprlib.Repr()
short.maxlist = short.maxtuple = short.maxset = short.maxfrozenset = short.maxdeque = short.maxarray = 50
short.maxdict = 30
short.maxstring = short.maxother = 200
short.maxlevel = 4


def save(truncated, error=None, error_line=None):
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"steps": steps, "truncated": truncated, "error": error, "errorLine": error_line}, f)


def fmt(value):
    try:
        return short.repr(value)
    except Exception as exc:
        return "<unprintable %s>" % type(exc).__name__


def tracer(frame, event, arg):
    if frame.f_code.co_filename != target:
        return None
    if event == "line":
        if len(steps) >= max_steps or time.monotonic() > deadline:
            # Limit reached: save what we have and end the program right here.
            sys.settrace(None)
            save(True)
            sys.stdout.flush()
            os._exit(0)
        local_vars, global_vars = frame.f_locals, frame.f_globals
        values = {}
        for name in watches:
            if name in local_vars:
                values[name] = fmt(local_vars[name])
            elif name in global_vars:
                values[name] = fmt(global_vars[name])
        steps.append({"line": frame.f_lineno, "values": values})
    return tracer


sys.argv = [target]
sys.path.insert(0, os.path.dirname(target))
error = error_line = None
threading.settrace(tracer)
sys.settrace(tracer)
try:
    runpy.run_path(target, run_name="__main__")
except SystemExit:
    pass
except BaseException as exc:
    sys.settrace(None)
    user_frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == target]
    error_line = user_frames[-1].lineno if user_frames else None
    error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
    traceback.print_exc()
finally:
    sys.settrace(None)
save(False, error, error_line)
`;

export async function tracePython(ws: Workspace, input: string, watches: string[]): Promise<TraceOutcome> {
  const { maxSteps, timeLimitMs } = config.debugger;
  await fs.writeFile(path.join(ws.dir, 'cp_tracer.py'), TRACER);
  await fs.rm(path.join(ws.dir, 'trace.json'), { force: true });

  const result = await runProcess(
    config.toolchain.python,
    ['cp_tracer.py', 'main.py', watches.join(','), String(maxSteps), String(timeLimitMs), 'trace.json'],
    { cwd: ws.dir, input, timeoutMs: timeLimitMs + 5000 },
  );
  if (result.spawnError) throw new Error(MISSING_TOOLCHAIN.python);

  const trace = JSON.parse(await fs.readFile(path.join(ws.dir, 'trace.json'), 'utf8').catch(() => '{}'));
  return {
    steps: trace.steps ?? [],
    truncated: Boolean(trace.truncated) || result.timedOut,
    stdout: result.stdout,
    stderr: cleanPaths(result.stderr, ws.dir).replace(/^Traceback[\s\S]*?(?=  File "main\.py")/m, 'Traceback (most recent call last):\n'),
    error: trace.error ?? (result.timedOut ? 'Stopped: the debugger time limit was reached.' : undefined),
    errorLine: trace.errorLine ?? undefined,
    exitCode: result.exitCode,
  };
}
