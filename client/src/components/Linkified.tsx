import type { ReactNode } from 'react';
import { LOCATION_PATTERN } from '../lib/diagnostics';
import { editorBridge } from '../lib/editor';

export function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LOCATION_PATTERN)) {
    const line = Number(match[1] ?? match[3] ?? match[4]);
    const column = Number(match[2] ?? 1);
    parts.push(text.slice(last, match.index));
    parts.push(
      <button
        key={match.index}
        type="button"
        onClick={() => editorBridge.revealLine(line, column)}
        className="underline decoration-dotted underline-offset-2 hover:text-accent"
        title={`Go to line ${line}`}
      >
        {match[0]}
      </button>,
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
