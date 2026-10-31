import { useCallback, useState, type ReactNode } from 'react';
import { cn } from './ui';

/** Width of an element, kept up to date (charts draw in real pixels, so lines stay 2px thick). */
export function useWidth(initial = 600): [number, (el: HTMLElement | null) => void] {
  const [width, setWidth] = useState(initial);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    new ResizeObserver(measure).observe(el);
  }, []);
  return [width, ref];
}

const niceStep = (span: number, ticks: number) => {
  const raw = span / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
};

const Tooltip = ({ x, y, children }: { x: number; y: number; children: ReactNode }) => (
  <div
    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-pop"
    style={{ left: x, top: y - 8 }}
  >
    {children}
  </div>
);

/** Horizontal bars in one color, each labeled, so the reading never depends on telling colors apart. */
export function Bars({ rows, legend }: { rows: { key: string; label: ReactNode; value: number; track?: number; text: string }[]; legend?: ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.track ?? r.value));
  return (
    <div>
      <div className="space-y-3.5">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2 font-medium">{r.label}</span>
              <span className="shrink-0 text-[12.5px] text-muted tabular-nums">{r.text}</span>
            </div>
            <div className="relative h-2 rounded-full bg-panel-2">
              {r.track !== undefined && <div className="absolute inset-y-0 left-0 rounded-full bg-accent/25" style={{ width: `${(r.track / max) * 100}%` }} />}
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
            </div>
          </div>
        ))}
      </div>
      {legend}
    </div>
  );
}

export interface RatingPoint {
  t: number;
  rating: number;
  contest: string;
}

const shortDate = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** A rating over time: one line, the peak labeled, a crosshair and tooltip on hover. */
export function RatingChart({ points, height = 190 }: { points: RatingPoint[]; height?: number }) {
  const [width, ref] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { left: 38, right: 12, top: 18, bottom: 22 };
  const w = Math.max(120, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;

  const ratings = points.map((p) => p.rating);
  const step = niceStep(Math.max(100, Math.max(...ratings) - Math.min(...ratings)), 4);
  const lo = Math.floor((Math.min(...ratings) - step / 4) / step) * step;
  const hi = Math.ceil((Math.max(...ratings) + step / 4) / step) * step;
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const x = (t: number) => pad.left + (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w);
  const y = (r: number) => pad.top + h - ((r - lo) / (hi - lo)) * h;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const years = [...new Set(points.map((p) => new Date(p.t * 1000).getFullYear()))];
  const yearTicks = years
    .map((year) => ({ year, t: Date.UTC(year, 0, 1) / 1000 }))
    .filter((y) => y.t >= t0 && y.t <= t1)
    .filter((_, i, all) => all.length <= 8 || i % Math.ceil(all.length / 8) === 0);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.rating).toFixed(1)}`).join('');
  const area = `${line}L${x(t1).toFixed(1)},${pad.top + h}L${x(t0).toFixed(1)},${pad.top + h}Z`;
  const peak = points.reduce((best, p) => (p.rating > best.rating ? p : best), points[0]);
  const active = hover === null ? null : points[hover];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + pad.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    setHover(best);
  };

  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label={`Rating from ${points[0].rating} to ${points.at(-1)!.rating}, peak ${peak.rating}`}>
        <defs>
          <linearGradient id="rating-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((r) => (
          <g key={r}>
            <line x1={pad.left} x2={pad.left + w} y1={y(r)} y2={y(r)} stroke="var(--border)" strokeDasharray={r === lo ? undefined : '2 4'} />
            <text x={pad.left - 8} y={y(r)} dy="0.32em" textAnchor="end" className="fill-subtle text-[10.5px] tabular-nums">
              {r}
            </text>
          </g>
        ))}
        {yearTicks.map(({ year, t }) => (
          <text key={year} x={x(t)} y={height - 6} textAnchor="middle" className="fill-subtle text-[10.5px]">
            {year}
          </text>
        ))}
        <path d={area} fill="url(#rating-fill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* The peak, labeled. */}
        <circle cx={x(peak.t)} cy={y(peak.rating)} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
        <text x={x(peak.t)} y={y(peak.rating) - 9} textAnchor={x(peak.t) > pad.left + w - 40 ? 'end' : 'middle'} className="fill-muted text-[10.5px] font-medium tabular-nums">
          max {peak.rating}
        </text>
        {active && (
          <>
            <line x1={x(active.t)} x2={x(active.t)} y1={pad.top} y2={pad.top + h} stroke="var(--border-strong)" />
            <circle cx={x(active.t)} cy={y(active.rating)} r={4.5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
          </>
        )}
        <rect x={pad.left} y={pad.top} width={w} height={h} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {active && (
        <Tooltip x={x(active.t)} y={y(active.rating)}>
          <div className="max-w-[260px] truncate font-medium">{active.contest}</div>
          <div className="text-muted">
            {shortDate(active.t)} · <span className="font-semibold text-fg tabular-nums">{active.rating}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Part of a whole in a few parts (here: Easy / Medium / Hard): a ring with gaps, every slice labeled. */
export function Donut({ slices, total, caption }: { slices: Slice[]; total: number; caption: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const size = 148;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const sum = slices.reduce((n, s) => n + s.value, 0) || 1;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  const active = hover === null ? null : slices[hover];

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={slices.map((s) => `${s.label} ${s.value}`).join(', ')}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={stroke} />
          {slices.map((s, i) => {
            const length = (s.value / sum) * circumference;
            const dash = Math.max(0, length - gap);
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? stroke + 3 : stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                className="transition-[stroke-width]"
              />
            );
            offset += length;
            return s.value > 0 ? el : null;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <div className="text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{active ? active.value : total}</div>
          <div className="mt-1 text-[11.5px] text-muted">{active ? active.label : caption}</div>
        </div>
      </div>
      <ul className="min-w-[160px] flex-1 space-y-2.5">
        {slices.map((s, i) => (
          <li
            key={s.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className={cn('flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] transition', hover === i && 'bg-hover')}
          >
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="flex-1 font-medium">{s.label}</span>
            <span className="tabular-nums">{s.value}</span>
            <span className="w-10 text-right text-[12px] text-subtle tabular-nums">{Math.round((s.value / sum) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Counts per bucket along an ordered axis (Codeforces problem ratings): one hue, a tooltip per column. */
export function Columns({ data, height = 170, label }: { data: { x: number; value: number }[]; height?: number; label: (x: number) => string }) {
  const [width, ref] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { left: 30, right: 4, top: 10, bottom: 22 };
  const w = Math.max(100, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max, 3);
  const top = Math.ceil(max / step) * step;
  const slot = w / data.length;
  const bar = Math.max(2, slot - 2);
  const every = Math.ceil(data.length / Math.max(1, Math.floor(w / 46)));
  const active = hover === null ? null : data[hover];

  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label="Problems solved per rating">
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + w} y1={pad.top + h - (v / top) * h} y2={pad.top + h - (v / top) * h} stroke="var(--border)" strokeDasharray={v ? '2 4' : undefined} />
            <text x={pad.left - 6} y={pad.top + h - (v / top) * h} dy="0.32em" textAnchor="end" className="fill-subtle text-[10.5px] tabular-nums">
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const barH = (d.value / top) * h;
          const x0 = pad.left + i * slot + (slot - bar) / 2;
          const radius = Math.min(4, bar / 2, barH);
          return (
            <g key={d.x} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* Hit area taller than the bar. */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={h} fill="transparent" />
              {d.value > 0 && (
                <path
                  d={`M${x0},${pad.top + h}V${pad.top + h - barH + radius}q0,-${radius} ${radius},-${radius}h${bar - 2 * radius}q${radius},0 ${radius},${radius}V${pad.top + h}Z`}
                  fill="var(--accent)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {i % every === 0 && (
                <text x={pad.left + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-subtle text-[10.5px] tabular-nums">
                  {label(d.x)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {active && (
        <Tooltip x={pad.left + hover! * slot + slot / 2} y={pad.top + h - (active.value / top) * h}>
          <span className="font-medium">Rating {label(active.x)}</span>
          <span className="text-muted"> · {active.value} solved</span>
        </Tooltip>
      )}
    </div>
  );
}
