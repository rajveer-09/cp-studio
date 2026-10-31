import { Code2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { goToSignIn } from '../lib/auth';
import { useStore } from '../store';
import { AccountMenu, Logo } from './Header';
import { Button, cn } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/stats', label: 'Stats' },
  { href: '/problems', label: 'Problems' },
];

/** The frame for pages outside the editor: brand, navigation, theme and account. */
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · CP Studio`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-panel/70 px-3 backdrop-blur sm:gap-2 sm:px-5">
        <Link href="/" className="mr-3 flex items-center gap-2 text-fg">
          <Logo />
          <span className="hidden text-[15px] font-semibold tracking-[-0.015em] sm:inline">
            CP <span className="font-medium text-muted">Studio</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition',
                location === item.href ? 'text-fg' : 'text-muted hover:bg-hover hover:text-fg',
              )}
            >
              {item.label}
              {location === item.href && <span className="absolute inset-x-2.5 -bottom-[11px] h-0.5 rounded-full bg-accent" />}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <Link
          href="/"
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[13px] font-medium transition hover:border-line-strong hover:bg-hover [&_svg]:size-4"
        >
          <Code2 />
          <span className="hidden sm:inline">Open editor</span>
        </Link>
        <AccountMenu />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

/** Shown on account pages to visitors who aren't signed in (or when accounts are off). */
export function SignInNeeded({ what }: { what: string }) {
  const accounts = useStore((s) => s.serverConfig?.accounts);
  const configLoaded = useStore((s) => s.serverConfig !== null);
  return (
    <div className="mx-auto mt-24 max-w-[380px] px-6 text-center">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{configLoaded && !accounts ? 'Accounts aren’t set up here' : `Sign in to see ${what}`}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        {configLoaded && !accounts
          ? 'This server has no database configured, so nothing is saved to an account.'
          : 'Your account keeps everything you work on, on every device.'}
      </p>
      {(!configLoaded || accounts) && (
        <Button variant="primary" onClick={() => goToSignIn()} className="mt-6">
          Sign in
        </Button>
      )}
    </div>
  );
}
