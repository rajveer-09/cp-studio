import { Pause, Play, RotateCcw, Timer as TimerIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useStore } from '../store';
import type { TimerState } from '../types';
import { Button, cn, Switch, Tip } from './ui';

const MINUTE = 60_000;
const PRESETS = [15, 30, 45, 60, 90, 120];

export const timerElapsed = (t: TimerState, now = Date.now()) => t.elapsedMs + (t.startedAt ? now - t.startedAt : 0);

/** 5:07, 1:05:07; a minus sign for countdown overtime. */
function clock(ms: number): string {
  const sign = ms < 0 ? '−' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${sign}${h}:${String(m).padStart(2, '0')}:${s}` : `${sign}${m}:${s}`;
}

const set = (timer: TimerState | null) => useStore.setState({ timer });

export function startStopwatch() {
  set({ mode: 'stopwatch', durationMs: 0, startedAt: Date.now(), elapsedMs: 0 });
}

function startCountdown(minutes: number) {
  set({ mode: 'countdown', durationMs: minutes * MINUTE, startedAt: Date.now(), elapsedMs: 0 });
}

function pauseOrResume() {
  const t = useStore.getState().timer;
  if (!t) return;
  set(t.startedAt ? { ...t, elapsedMs: timerElapsed(t), startedAt: null } : { ...t, startedAt: Date.now() });
}

/** Three short beeps when a countdown runs out (quietly ignored where audio is blocked). */
function beep() {
  try {
    const audio = new AudioContext();
    [0, 0.25, 0.5].forEach((at) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.18);
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + at);
      tone.stop(audio.currentTime + at + 0.2);
    });
    setTimeout(() => void audio.close(), 1200);
  } catch {
    // No audio: the toast still says it.
  }
}

/** Re-renders every half second while the timer runs, and announces the end of a countdown once. */
function useTicking(timer: TimerState | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!timer?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timer?.startedAt]);
  useEffect(() => {
    if (!timer || timer.mode !== 'countdown' || timer.alerted || timer.durationMs - timerElapsed(timer, now) > 0) return;
    set({ ...timer, alerted: true });
    beep();
    toast.warning('Time’s up', { description: 'The timer keeps counting overtime. Reset it from the timer menu.', duration: 10000 });
  }, [timer, now]);
  return now;
}

const menuLabel = 'px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase';

/** A contest timer in the header: a stopwatch, or a countdown with presets. Kept across reloads. */
export function Timer() {
  const timer = useStore((s) => s.timer);
  const autoStart = useStore((s) => s.settings.timerAutoStart);
  const now = useTicking(timer);
  const [custom, setCustom] = useState('');

  const elapsed = timer ? timerElapsed(timer, now) : 0;
  const shown = timer?.mode === 'countdown' ? timer.durationMs - elapsed : elapsed;
  const tone = !timer
    ? ''
    : timer.mode === 'countdown' && shown <= 0
      ? 'text-danger'
      : timer.mode === 'countdown' && shown <= 5 * MINUTE
        ? 'text-warning'
        : timer.startedAt
          ? 'text-fg'
          : 'text-muted';

  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    const minutes = Number(custom);
    if (minutes > 0 && minutes <= 24 * 60) {
      startCountdown(minutes);
      setCustom('');
    }
  };

  return (
    <DropdownMenu.Root>
      <Tip label={timer ? (timer.startedAt ? 'Timer (running)' : 'Timer (paused)') : 'Timer'}>
        <DropdownMenu.Trigger asChild>
          <Button variant={timer ? 'secondary' : 'ghost'} size={timer ? 'md' : 'icon'} aria-label="Timer" className={cn(timer && 'gap-1.5 px-2.5 font-mono tabular-nums', tone)}>
            <TimerIcon className={cn(Boolean(timer?.startedAt) && 'animate-[pulse_2s_ease-in-out_infinite]')} />
            {timer && <span className="text-[13px]">{clock(shown)}</span>}
          </Button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="popover z-50 w-72 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
          {timer && (
            <>
              <div className="flex items-center gap-2 px-2 pt-1.5 pb-2.5">
                <div className="min-w-0 flex-1">
                  <div className={cn('font-mono text-[26px] leading-none font-semibold tabular-nums', tone)}>{clock(shown)}</div>
                  <div className="mt-1 text-[11.5px] text-subtle">
                    {timer.mode === 'stopwatch' ? 'Stopwatch' : `Countdown of ${clock(timer.durationMs)}`}
                    {timer.startedAt ? '' : ' · paused'}
                  </div>
                </div>
                <Button size="icon" onClick={pauseOrResume} aria-label={timer.startedAt ? 'Pause' : 'Resume'}>
                  {timer.startedAt ? <Pause /> : <Play />}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => set(null)} aria-label="Reset timer">
                  <RotateCcw />
                </Button>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Item onSelect={startStopwatch} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover">
            <Play className="size-3.5 text-muted" />
            {timer?.mode === 'stopwatch' ? 'Restart the stopwatch' : 'Start a stopwatch'}
          </DropdownMenu.Item>
          <DropdownMenu.Label className={menuLabel}>Countdown</DropdownMenu.Label>
          <div className="grid grid-cols-3 gap-1 px-2 pb-2">
            {PRESETS.map((m) => (
              <DropdownMenu.Item
                key={m}
                onSelect={() => startCountdown(m)}
                className="cursor-pointer rounded-md border border-line py-1 text-center text-[12.5px] tabular-nums outline-none data-[highlighted]:border-accent/50 data-[highlighted]:bg-hover"
              >
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </DropdownMenu.Item>
            ))}
          </div>
          <form onSubmit={submitCustom} className="flex gap-1.5 px-2 pb-2" onKeyDown={(e) => e.stopPropagation()}>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
              placeholder="Minutes"
              aria-label="Countdown minutes"
              inputMode="numeric"
              className="h-7 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2 text-[12.5px] outline-none focus:border-accent/60"
            />
            <Button type="submit" size="sm" disabled={!custom}>
              Start
            </Button>
          </form>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <label className="flex cursor-pointer items-center justify-between gap-3 px-2 py-1.5 text-[12.5px]">
            Start the stopwatch when I import a problem
            <Switch label="Start the stopwatch on import" checked={autoStart} onChange={(timerAutoStart) => useStore.getState().updateSettings({ timerAutoStart })} />
          </label>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
