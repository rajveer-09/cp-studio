import type { Language, Verdict } from '../types';

export const LANGUAGES: Language[] = ['cpp', 'java', 'python'];

export const LANGUAGE_META: Record<Language, { label: string; monaco: string; file: string; color: string; fences: string[] }> = {
  cpp: { label: 'C++', monaco: 'cpp', file: 'main.cpp', color: '#5b9bd5', fences: ['cpp', 'c++', 'cc', 'cxx', 'c', 'h', 'hpp'] },
  java: { label: 'Java', monaco: 'java', file: 'Main.java', color: '#f0932b', fences: ['java'] },
  python: { label: 'Python', monaco: 'python', file: 'main.py', color: '#e8c33a', fences: ['python', 'py', 'python3'] },
};

export function languageFromFence(tag: string | undefined): Language | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  return LANGUAGES.find((l) => LANGUAGE_META[l].fences.includes(lower)) ?? null;
}

export const VERDICT_META: Record<Verdict, { label: string; short: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'muted' }> = {
  AC: { label: 'Accepted', short: 'AC', tone: 'success' },
  WA: { label: 'Wrong Answer', short: 'WA', tone: 'danger' },
  TLE: { label: 'Time Limit Exceeded', short: 'TLE', tone: 'warning' },
  RE: { label: 'Runtime Error', short: 'RE', tone: 'danger' },
  CE: { label: 'Compilation Error', short: 'CE', tone: 'danger' },
  OLE: { label: 'Output Limit Exceeded', short: 'OLE', tone: 'warning' },
  IE: { label: 'Toolchain Error', short: 'ERR', tone: 'danger' },
  DONE: { label: 'Finished', short: 'OK', tone: 'info' },
};

export const TONE_TEXT = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  muted: 'text-muted',
} as const;

export const TONE_BG = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  muted: 'bg-subtle',
} as const;

export const isFailing = (verdict: Verdict | undefined) => verdict !== undefined && verdict !== 'AC' && verdict !== 'DONE';
