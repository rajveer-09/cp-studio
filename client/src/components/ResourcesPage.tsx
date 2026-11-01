import { ArrowUpRight, BookMarked, Dumbbell, GraduationCap, MonitorPlay, Search, Sparkles, Wrench, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CATEGORIES, RESOURCES, type Resource, type ResourceCategory, type ResourceLevel } from '../data/resources';
import { PageShell } from './PageShell';
import { cn } from './ui';

const CATEGORY_LOOK: Record<ResourceCategory, { icon: ReactNode; tone: string }> = {
  learn: { icon: <GraduationCap />, tone: 'var(--accent)' },
  practice: { icon: <Dumbbell />, tone: 'var(--success)' },
  videos: { icon: <MonitorPlay />, tone: 'var(--danger, #e5534b)' },
  reference: { icon: <BookMarked />, tone: 'var(--info)' },
  tools: { icon: <Wrench />, tone: 'var(--warning)' },
};

const LEVELS: ResourceLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'All levels'];

const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

function CategoryBadge({ category, size = 'md' }: { category: ResourceCategory; size?: 'md' | 'lg' }) {
  const look = CATEGORY_LOOK[category];
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-xl', size === 'lg' ? 'size-11 [&_svg]:size-5' : 'size-9 [&_svg]:size-[18px]')}
      style={{ color: look.tone, background: `color-mix(in srgb, ${look.tone} 13%, transparent)` }}
      aria-hidden
    >
      {look.icon}
    </span>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col rounded-2xl border border-line bg-panel p-4 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop focus-visible:border-accent/60 focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <CategoryBadge category={resource.category} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-fg">{resource.name}</h3>
          <p className="truncate text-[12px] text-subtle">{host(resource.url)}</p>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </div>
      <p className="mt-3 line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted">{resource.description}</p>
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="rounded-full bg-panel-2 px-2 py-0.5 font-medium text-fg">{resource.level}</span>
        {resource.note && <span className="rounded-full border border-warning/40 px-2 py-0.5 text-warning">{resource.note}</span>}
        {resource.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-subtle">
            {tag}
          </span>
        ))}
      </div>
    </a>
  );
}

function FeaturedCard({ resource }: { resource: Resource }) {
  const tone = CATEGORY_LOOK[resource.category].tone;
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel p-5 transition hover:border-line-strong hover:shadow-pop focus-visible:border-accent/60 focus-visible:outline-none"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full opacity-[0.16] blur-2xl transition-opacity group-hover:opacity-25"
        style={{ background: `radial-gradient(circle, ${tone}, transparent 70%)` }}
      />
      <div className="relative flex items-center gap-3">
        <CategoryBadge category={resource.category} size="lg" />
        <div className="min-w-0">
          <h3 className="text-[16px] leading-snug font-semibold tracking-[-0.01em]">{resource.name}</h3>
          <p className="text-[12px] text-subtle">
            {CATEGORIES.find((c) => c.id === resource.category)?.label} · {resource.level}
          </p>
        </div>
      </div>
      <p className="relative mt-3 flex-1 text-[13px] leading-relaxed text-muted">{resource.description}</p>
      <span className="relative mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-fg">
        Visit {host(resource.url)}
        <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </a>
  );
}

/** Well-known places to learn and practice competitive programming, by category. */
export default function ResourcesPage() {
  const [category, setCategory] = useState<ResourceCategory | 'all'>('all');
  const [level, setLevel] = useState<ResourceLevel | 'any'>('any');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES.filter(
      (r) =>
        (category === 'all' || r.category === category) &&
        (level === 'any' || r.level === level || r.level === 'All levels') &&
        (!q || [r.name, r.description, host(r.url), ...r.tags].some((t) => t.toLowerCase().includes(q))),
    );
  }, [category, level, query]);
  const filtering = category !== 'all' || level !== 'any' || Boolean(query.trim());
  const featured = RESOURCES.filter((r) => r.featured);
  const sections = CATEGORIES.map((c) => ({ ...c, items: shown.filter((r) => r.category === c.id) })).filter((s) => s.items.length);

  return (
    <PageShell title="Resources">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-8 sm:py-10">
        <header className="max-w-[640px]">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Resources</p>
          <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-[-0.02em]">The best places to learn and practice</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            Guides, problem sets, channels and tools that competitive programmers rely on. Everything opens on its own site.
          </p>
        </header>

        {!filtering && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
              <Sparkles className="size-4 text-accent" />
              Start here
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((r) => (
                <FeaturedCard key={r.url} resource={r} />
              ))}
            </div>
          </section>
        )}

        <div className="sticky top-0 z-10 -mx-4 mt-8 flex flex-wrap items-center gap-2 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <div role="radiogroup" aria-label="Category" className="flex max-w-full gap-1 overflow-x-auto">
            {[{ id: 'all' as const, label: 'All' }, ...CATEGORIES].map((c) => {
              const count = c.id === 'all' ? RESOURCES.length : RESOURCES.filter((r) => r.category === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition',
                    category === c.id ? 'border-transparent bg-fg text-bg' : 'border-line bg-panel text-muted hover:text-fg',
                  )}
                >
                  {c.label}
                  <span className={cn('tabular-nums', category === c.id ? 'opacity-70' : 'text-subtle')}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as ResourceLevel | 'any')}
            aria-label="Level"
            className="h-8 rounded-lg border border-line bg-panel px-2 text-[12.5px] text-muted outline-none focus:border-accent/60"
          >
            <option value="any">Any level</option>
            {LEVELS.filter((l) => l !== 'All levels').map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <label className="relative flex w-full items-center sm:w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search resources"
              aria-label="Search resources"
              className="h-8 w-full rounded-lg border border-line bg-panel pr-8 pl-8 text-[13px] outline-none placeholder:text-subtle focus:border-accent/60"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 text-subtle hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </label>
        </div>

        {sections.length ? (
          sections.map((s) => (
            <section key={s.id} className="mt-8">
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{s.label}</h2>
                <p className="text-[12.5px] text-muted">{s.blurb}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {s.items.map((r) => (
                  <ResourceCard key={r.url} resource={r} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="mt-16 text-center text-[13.5px] text-muted">
            Nothing matches.{' '}
            <button
              type="button"
              onClick={() => {
                setCategory('all');
                setLevel('any');
                setQuery('');
              }}
              className="font-medium text-fg underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          </p>
        )}

        <p className="mt-12 text-center text-[12px] text-subtle">CP Studio isn’t affiliated with these sites. Each belongs to its authors.</p>
      </div>
    </PageShell>
  );
}
