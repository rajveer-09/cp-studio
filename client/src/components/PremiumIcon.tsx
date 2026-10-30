import { cn } from './ui';

export type IconName = 'check' | 'cross' | 'warning' | 'info' | 'idea' | 'sparkle' | 'clock' | 'arrow' | 'question';

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'accent';

const TONE: Record<IconName, Tone> = {
  check: 'success',
  cross: 'danger',
  warning: 'warning',
  info: 'info',
  idea: 'warning',
  sparkle: 'accent',
  clock: 'info',
  arrow: 'accent',
  question: 'info',
};

/** Glyphs on a 20×20 grid, drawn as strokes (except the filled sparkle). */
const GLYPHS: Record<IconName, string[]> = {
  check: ['M6.2 10.4l2.5 2.5 5.1-5.6'],
  cross: ['M7.4 7.4l5.2 5.2', 'M12.6 7.4l-5.2 5.2'],
  warning: ['M10 6.2v4.5', 'M10 13.7h.01'],
  info: ['M10 9.3v4.4', 'M10 6.4h.01'],
  idea: ['M10 5.4a3.3 3.3 0 0 0-2 5.95c.3.22.45.55.45.9v.6h3.1v-.6c0-.35.15-.68.45-.9A3.3 3.3 0 0 0 10 5.4z', 'M8.7 14.5h2.6'],
  sparkle: ['M10 5.2l1.25 3.55L14.8 10l-3.55 1.25L10 14.8l-1.25-3.55L5.2 10l3.55-1.25z'],
  clock: ['M10 5.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z', 'M10 7.7V10l1.6 1.1'],
  arrow: ['M6.3 10h7.2', 'M10.6 7.1 13.5 10l-2.9 2.9'],
  question: ['M8.1 8.3a1.95 1.95 0 1 1 2.7 1.8c-.52.22-.8.6-.8 1.1v.35', 'M10 13.8h.01'],
};

/**
 * A small status icon: a glassy disc in the tone's color with a soft glow, whose glyph draws itself
 * in when it first appears. Colors follow the active theme.
 */
export function PremiumIcon({ name, tone, className, label }: { name: IconName; tone?: Tone; className?: string; label?: string }) {
  const filled = name === 'sparkle';
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn('premium-icon', `tone-${tone ?? TONE[name]}`, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g className="premium-icon-disc">
        <circle cx="10" cy="10" r="8.6" className="premium-icon-fill" />
        <ellipse cx="10" cy="6.3" rx="5.2" ry="2.7" className="premium-icon-shine" />
        <circle cx="10" cy="10" r="8.6" className="premium-icon-ring" />
      </g>
      {GLYPHS[name].map((d) => (
        <path key={d} d={d} pathLength={1} className={filled ? 'premium-icon-solid' : 'premium-icon-glyph'} />
      ))}
    </svg>
  );
}

/** Emoji the AI (or anyone) might write, mapped to the closest icon. Anything else is dropped. */
const EMOJI_ICONS: [RegExp, IconName][] = [
  [/^[✅✔☑✓🟢👍]/u, 'check'],
  [/^[❌✖✗✘⛔🚫🔴👎]/u, 'cross'],
  [/^[⚠❗‼🚨🟡🐛🐞]/u, 'warning'],
  [/^[ℹ📌📝🔍🔎📊📈📉🧠]/u, 'info'],
  [/^💡/u, 'idea'],
  [/^[✨🚀🎯🔥⭐🌟🎉💪🏆⚡]/u, 'sparkle'],
  [/^[⏱⏰⌛⏳🕒]/u, 'clock'],
  [/^[👉➡]/u, 'arrow'],
  [/^[❓❔🤔]/u, 'question'],
];

export const EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|[✓✗✘])(?:️|‍\p{Extended_Pictographic})*️?/gu;

export function iconForEmoji(emoji: string): IconName | null {
  return EMOJI_ICONS.find(([pattern]) => pattern.test(emoji))?.[1] ?? null;
}
