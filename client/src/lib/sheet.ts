import { useEffect, useState } from 'react';
import { navigate } from 'wouter/use-browser-location';
import { uid, useStore } from '../store';
import type { ProblemMeta, SheetEntry, SheetStatus } from '../types';
import { api } from './api';
import { openProblemTabs, recordProblem, submitHelperVersion } from './problems';

/** A practice sheet: topics in roadmap order, each with problems from easy to hard. */
export interface SheetProblem {
  /** Codeforces problem code, e.g. "1669D". */
  id: string;
  name: string;
  rating: number;
  level: 'Easy' | 'Medium' | 'Hard';
  hint?: string;
  tags: string[];
  contest: string;
  /** YYYY-MM-DD. */
  date: string;
  /** How many people solved it on Codeforces. */
  solvedBy: number;
  url: string;
}

export interface SheetTopic {
  step: number;
  name: string;
  ratingRange: string;
  problems: SheetProblem[];
}

export interface Sheet {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  howTo: string[];
  about: string[];
  topics: SheetTopic[];
}

export const sheetKey = (p: SheetProblem) => `cf:${p.id}`;

/** Where a "solved" came from: you marked it, Codeforces accepted it, or every sample passed here. */
export type SolvedBy = 'you' | 'codeforces' | 'cp-studio';

export interface Progress {
  status: SheetStatus;
  starred: boolean;
  note: string;
  solvedBy?: SolvedBy;
}

export interface AutoSolved {
  accepted: Set<string>;
  solvedHere: Set<string>;
}

/** Your status if you set one; otherwise solved when Codeforces accepted it or its samples passed here. */
export function progressOf(p: SheetProblem, entry: SheetEntry | undefined, auto: AutoSolved): Progress {
  const base = { starred: Boolean(entry?.starred), note: entry?.note ?? '' };
  if (entry && entry.status !== 'todo') return { ...base, status: entry.status, solvedBy: entry.status === 'solved' ? 'you' : undefined };
  if (auto.accepted.has(p.id)) return { ...base, status: 'solved', solvedBy: 'codeforces' };
  if (auto.solvedHere.has(p.id)) return { ...base, status: 'solved', solvedBy: 'cp-studio' };
  return { ...base, status: 'todo' };
}

function update(p: SheetProblem, patch: Partial<SheetEntry>) {
  useStore.setState((s) => {
    const key = sheetKey(p);
    const current = s.sheetProgress[key] ?? { status: 'todo' as SheetStatus };
    return { sheetProgress: { ...s.sheetProgress, [key]: { ...current, ...patch } } };
  });
}

export const setSheetStatus = (p: SheetProblem, status: SheetStatus) => update(p, { status, at: Date.now() });
export const toggleSheetStar = (p: SheetProblem) => update(p, { starred: !useStore.getState().sheetProgress[sheetKey(p)]?.starred });
export const setSheetNote = (p: SheetProblem, note: string) => update(p, { note: note.slice(0, 500) });

/** Problems solved outside the sheet's own checkboxes (signed-in users only). */
export function useAutoSolved(): AutoSolved {
  const signedIn = useStore((s) => s.account.status === 'signedIn' && Boolean(s.serverConfig?.accounts));
  const [auto, setAuto] = useState<AutoSolved>({ accepted: new Set(), solvedHere: new Set() });
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    api.me.solved().then(
      (r) => !cancelled && setAuto({ accepted: new Set(r.accepted), solvedHere: new Set(r.solvedHere) }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return auto;
}

/** The CP Studio helper (1.1 and later) brings a Codeforces statement in when the sheet opens the problem. */
export const helperImports = () => Number(submitHelperVersion() ?? 0) >= 1.1;

/**
 * "Solve": opens the problem in the editor (its own tab, title, rating, topics and the sheet's hint). Codeforces
 * doesn't allow automatic downloads, so the statement arrives from the user's browser: the CP Studio helper fetches
 * it right away when installed; otherwise the Problem tab explains the one-click bookmark.
 */
export function openSheetProblem(p: SheetProblem) {
  const state = useStore.getState();
  const alreadyHere = state.problemMeta?.platform === 'codeforces' && state.problemMeta.id === p.id && state.problem.trim();
  // Opened first, while the click still counts as a user action (popup blockers allow that).
  if (!alreadyHere && helperImports()) window.open(`${p.url}#cp-studio-import`, '_blank');

  const index = p.id.replace(/^\d+/, '');
  const meta: ProblemMeta = { platform: 'codeforces', id: p.id, title: `${index}. ${p.name}`, url: p.url, tags: p.tags, rating: p.rating, hint: p.hint, samples: [] };
  if (!alreadyHere) {
    const testId = uid();
    useStore.setState({
      problem: '',
      problemMeta: meta,
      tests: [{ id: testId, input: '', expected: '' }],
      activeTestId: testId,
      results: {},
      lastRun: null,
      compile: null,
    });
  }
  openProblemTabs(meta);
  recordProblem('opened');
  useStore.setState({ bottomTab: 'problem' });
  navigate('/editor');
}
