import { spawn, type ChildProcess } from 'node:child_process';
import { childEnv, killTree } from '../runner/process.js';

export type MiValue = string | MiTuple | MiValue[];
export interface MiTuple {
  [key: string]: MiValue;
}

export interface MiResult {
  cls: string; // done | running | error | exit
  data: MiTuple;
}

export function parseMi(text: string): MiTuple {
  let i = 0;

  const ident = () => {
    const start = i;
    while (i < text.length && /[\w-]/.test(text[i])) i++;
    return text.slice(start, i);
  };

  const cstring = (): string => {
    i++; // opening quote
    const bytes: number[] = [];
    while (i < text.length && text[i] !== '"') {
      const c = text[i++];
      if (c !== '\\') {
        bytes.push(...Buffer.from(c, 'utf8'));
        continue;
      }
      const e = text[i++];
      if (/[0-7]/.test(e)) {
        let oct = e;
        while (oct.length < 3 && /[0-7]/.test(text[i])) oct += text[i++];
        bytes.push(parseInt(oct, 8));
      } else {
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' };
        bytes.push(...Buffer.from(map[e] ?? e, 'utf8'));
      }
    }
    i++; // closing quote
    return Buffer.from(bytes).toString('utf8');
  };

  const value = (): MiValue => {
    const c = text[i];
    if (c === '"') return cstring();
    if (c === '{') {
      i++;
      const tuple = results('}');
      i++;
      return tuple;
    }
    if (c === '[') {
      i++;
      const items: MiValue[] = [];
      while (i < text.length && text[i] !== ']') {
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '"' || text[i] === '{' || text[i] === '[') items.push(value());
        else {
          const key = ident();
          i++; // '='
          items.push({ [key]: value() });
        }
      }
      i++;
      return items;
    }
    throw new Error(`Unexpected MI character "${c}"`);
  };

  const results = (end?: string): MiTuple => {
    const out: MiTuple = {};
    while (i < text.length && text[i] !== end) {
      if (text[i] === ',') {
        i++;
        continue;
      }
      const key = ident();
      if (text[i] !== '=') break;
      i++;
      out[key] = value();
    }
    return out;
  };

  try {
    return results();
  } catch {
    return {};
  }
}

export class MiSession {
  private readonly proc: ChildProcess;
  private buffer = '';
  private token = 0;
  private readonly pending = new Map<number, (result: MiResult) => void>();
  private readonly stopWaiters: ((stop: MiTuple | null) => void)[] = [];
  private readonly stopQueue: MiTuple[] = [];
  private closed = false;
  spawnError: string | null = null;

  constructor(cmd: string, args: string[], cwd: string) {
    this.proc = spawn(cmd, args, { cwd, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout!.setEncoding('utf8');
    this.proc.stdout!.on('data', (chunk: string) => {
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, '');
        this.buffer = this.buffer.slice(newline + 1);
        this.handle(line);
      }
    });
    this.proc.stderr!.resume();
    this.proc.stdin!.on('error', () => {});
    this.proc.on('error', (err: NodeJS.ErrnoException) => {
      this.spawnError = err.code === 'ENOENT' ? `Command not found: ${cmd}` : err.message;
      this.close();
    });
    this.proc.on('exit', () => this.close());
  }

  private handle(line: string) {
    const result = /^(\d+)\^(\w+),?(.*)$/.exec(line);
    if (result) {
      const resolve = this.pending.get(Number(result[1]));
      if (resolve) {
        this.pending.delete(Number(result[1]));
        resolve({ cls: result[2], data: parseMi(result[3]) });
      }
      return;
    }
    const stopped = /^\*stopped,?(.*)$/.exec(line);
    if (stopped) {
      const data = parseMi(stopped[1]);
      const waiter = this.stopWaiters.shift();
      if (waiter) waiter(data);
      else this.stopQueue.push(data);
    }
  }

  private close() {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.pending.values()) resolve({ cls: 'error', data: { msg: 'gdb exited' } });
    this.pending.clear();
    for (const waiter of this.stopWaiters.splice(0)) waiter(null);
  }

  command(command: string): Promise<MiResult> {
    if (this.closed) return Promise.resolve({ cls: 'error', data: { msg: this.spawnError ?? 'gdb exited' } });
    const token = ++this.token;
    return new Promise((resolve) => {
      this.pending.set(token, resolve);
      this.proc.stdin!.write(`${token}${command}\n`);
    });
  }

  private nextStop(): Promise<MiTuple | null> {
    const queued = this.stopQueue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.stopWaiters.push(resolve));
  }

  async exec(command: string): Promise<MiTuple | null> {
    const result = await this.command(command);
    if (result.cls === 'error') return null;
    return this.nextStop();
  }

  kill() {
    this.close();
    killTree(this.proc);
  }
}
