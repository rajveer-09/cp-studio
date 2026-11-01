import { AlertCircle, ArrowLeft, Download, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Link, useLocation, useSearch } from 'wouter';
import { afterSignIn, authClient, authErrorMessage, redirectErrorMessage, signInWith } from '../lib/auth';
import { useStore } from '../store';
import type { SocialProvider } from '../types';
import { Logo } from './Header';
import { GithubMark } from './GithubDialog';
import { Button, cn } from './ui';

type Mode = 'signin' | 'signup';

const NO_PROVIDERS: SocialProvider[] = [];

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.55 10.55 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

const PROVIDERS: Record<SocialProvider, { label: string; icon: ReactNode }> = {
  google: { label: 'Google', icon: <GoogleMark className="size-[18px]" /> },
  github: { label: 'GitHub', icon: <GithubMark className="size-[18px]" /> },
};

const inputClass =
  'h-10 w-full rounded-lg border border-line-strong bg-panel px-3 text-[14px] text-fg outline-none transition placeholder:text-subtle focus:border-accent/70 focus:ring-3 focus:ring-accent/15 aria-[invalid=true]:border-danger/60';

function Field({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        minLength={8}
        maxLength={128}
        className={cn(inputClass, 'pr-10')}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-subtle transition hover:text-fg"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** A rough guide (length and variety), not a rule: anything 8+ characters is accepted. */
function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const points = (password.length >= 8 ? 1 : 0) + (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0) + (variety >= 3 ? 1 : 0);
  const score = (password.length < 8 ? 1 : Math.max(1, Math.min(4, points))) as 1 | 2 | 3 | 4;
  return { score, label: password.length < 8 ? 'Too short' : ['', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const tone = score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning' : 'bg-success';
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1 rounded-full transition-colors', i <= score ? tone : 'bg-line')} />
        ))}
      </div>
      <span className="w-16 text-right text-[11.5px] text-subtle">{label || 'At least 8'}</span>
    </div>
  );
}

function SocialButtons({ providers, onError }: { providers: SocialProvider[]; onError: (message: string) => void }) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const start = async (provider: SocialProvider) => {
    setBusy(provider);
    const error = await signInWith(provider); // leaves the page on success
    if (error) {
      onError(error);
      setBusy(null);
    }
  };
  return (
    <div className="grid gap-2.5">
      {providers.map((p) => (
        <Button
          key={p}
          size="md"
          onClick={() => start(p)}
          loading={busy === p}
          disabled={busy !== null}
          className="h-10 w-full justify-center gap-2.5 border-line-strong bg-panel text-[13.5px] hover:bg-hover"
        >
          {busy !== p && PROVIDERS[p].icon}
          Continue with {PROVIDERS[p].label}
        </Button>
      ))}
    </div>
  );
}

function AuthForm({ mode }: { mode: Mode }) {
  const providers = useStore((s) => s.serverConfig?.accounts?.providers ?? NO_PROVIDERS);
  const [, navigate] = useLocation();
  const search = useSearch();
  const ids = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const code = new URLSearchParams(search).get('error');
    return code ? redirectErrorMessage(code) : null;
  });
  const signup = mode === 'signup';
  const keepNext = (path: string) => {
    const next = new URLSearchParams(search).get('next');
    return next ? `${path}?next=${encodeURIComponent(next)}` : path;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = signup
      ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
      : await authClient.signIn.email({ email: email.trim(), password, rememberMe: true });
    setBusy(false);
    if (error || !data) {
      setError(authErrorMessage(error));
      return;
    }
    const first = data.user.name.split(/\s+/)[0];
    toast.success(signup ? `Welcome to CP Studio, ${first}` : `Welcome back, ${first}`);
    navigate(afterSignIn());
  };

  return (
    <div className="w-full max-w-[380px]">
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        {signup ? 'Free, and takes a few seconds. Your account unlocks the AI assistant.' : 'Sign in to pick up where you left off.'}
      </p>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {providers.length > 0 && (
        <>
          <div className="mt-6">
            <SocialButtons providers={providers} onError={setError} />
          </div>
          <div className="my-6 flex items-center gap-3 text-[12px] text-subtle">
            <span className="h-px flex-1 bg-line" />
            or with email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className={cn('space-y-4', providers.length === 0 && 'mt-7')} noValidate={false}>
        {signup && (
          <Field label="Name" id={`${ids}-name`}>
            <input
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              maxLength={80}
              placeholder="Your name"
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Email" id={`${ids}-email`}>
          <input
            id={`${ids}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.com"
            className={inputClass}
          />
        </Field>
        <Field label="Password" id={`${ids}-password`} hint={signup ? <StrengthMeter password={password} /> : undefined}>
          <PasswordInput id={`${ids}-password`} value={password} onChange={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="!mt-6 h-10 w-full justify-center text-[14px]">
          {signup ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-muted">
        {signup ? 'Already have an account?' : 'New to CP Studio?'}{' '}
        <Link href={keepNext(signup ? '/login' : '/signup')} className="font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}

/** A small, static picture of the product: a solution and its passing tests. */
function Preview() {
  const kw = 'text-accent';
  const ty = 'text-info';
  const fn = 'text-fg';
  const num = 'text-success';
  const cm = 'text-subtle italic';
  const lines: ReactNode[] = [
    <><span className={kw}>int</span> <span className={fn}>main</span>() {'{'}</>,
    <>    <span className={kw}>int</span> t; cin {'>>'} t;</>,
    <>    <span className={kw}>while</span> (t--) {'{'}</>,
    <>        <span className={ty}>long long</span> n; cin {'>>'} n;</>,
    <>        <span className={cm}>// sum of 1..n, no overflow</span></>,
    <>        cout {'<<'} n * (n + <span className={num}>1</span>) / <span className={num}>2</span> {'<<'} <span className="text-success">'\n'</span>;</>,
    <>    {'}'}</>,
    <>{'}'}</>,
  ];
  const tests = [
    ['Test 1', '12 ms'],
    ['Test 2', '9 ms'],
    ['Test 3', '15 ms'],
  ];
  return (
    <div className="relative mx-auto mb-20 w-full max-w-[460px]">
      <div className="overflow-hidden rounded-xl border border-line-strong bg-bg shadow-pop">
        <div className="flex h-9 items-center gap-2 border-b border-line bg-panel-2/60 px-3 text-[12px] text-muted">
          <span className="size-2 rounded-full" style={{ background: '#5b8def' }} />
          solution.cpp
        </div>
        <pre className="overflow-hidden px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] text-muted">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-4 whitespace-pre">
              <span className="w-3 text-right text-subtle/70 select-none">{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </pre>
      </div>
      {/* Sits over the short closing lines, below the line that matters. */}
      <div className="absolute top-[calc(100%-58px)] right-[-18px] w-[230px] overflow-hidden rounded-xl border border-line-strong bg-panel shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[12px]">
          <span className="font-semibold">Accepted</span>
          <span className="text-muted tabular-nums">3 / 3</span>
        </div>
        {tests.map(([name, time]) => (
          <div key={name} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="flex-1">{name}</span>
            <span className="text-subtle tabular-nums">{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Showcase() {
  const points = [
    { icon: <Download />, text: 'Import problems from Codeforces, LeetCode, CodeChef and AtCoder' },
    { icon: <ShieldCheck />, text: 'Judge-style verdicts on every sample test' },
    { icon: <Sparkles />, text: 'AI hints, fixes and generated edge cases' },
  ];
  return (
    <aside className="relative hidden w-[48%] max-w-[760px] shrink-0 overflow-hidden border-l border-line bg-panel lg:flex">
      {/* Dot grid and a soft glow, kept faint so the preview stays the focus. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: 'radial-gradient(var(--border-strong) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'linear-gradient(to bottom, black, transparent 85%)' }}
      />
      <div
        className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 65%)' }}
      />
      <div className="relative m-auto w-full max-w-[520px] px-12 py-16">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">Competitive programming studio</p>
        <h2 className="mt-3 text-[32px] leading-[1.15] font-semibold tracking-[-0.025em]">Practice like it’s contest day.</h2>
        <p className="mt-3 max-w-[420px] text-[14.5px] leading-relaxed text-muted">
          Write, run and debug C++, Java and Python against the real sample tests, with an assistant for when you’re stuck.
        </p>
        <div className="mt-10">
          <Preview />
        </div>
        <ul className="space-y-3">
          {points.map((p) => (
            <li key={p.text} className="flex items-center gap-3 text-[13.5px] text-muted">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-accent [&_svg]:size-3.5">{p.icon}</span>
              {p.text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const accounts = useStore((s) => s.serverConfig?.accounts);
  const configLoaded = useStore((s) => s.serverConfig !== null);
  const signedIn = useStore((s) => s.account.status === 'signedIn');
  const [, navigate] = useLocation();

  useEffect(() => {
    const previous = document.title;
    document.title = `${mode === 'signup' ? 'Create account' : 'Sign in'} · CP Studio`;
    return () => {
      document.title = previous;
    };
  }, [mode]);

  // Already signed in (e.g. back from Google or GitHub, or an old tab): carry on.
  useEffect(() => {
    if (signedIn) navigate(afterSignIn(), { replace: true });
  }, [signedIn, navigate]);

  return (
    <div className="flex h-full overflow-auto bg-bg text-fg">
      <main className="flex min-h-full flex-1 flex-col px-6 py-5 sm:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-fg">
            <Logo />
            <span className="text-[15px] font-semibold tracking-[-0.015em]">
              CP <span className="font-medium text-muted">Studio</span>
            </span>
          </Link>
          <Link href="/editor" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted transition hover:bg-hover hover:text-fg">
            <ArrowLeft className="size-3.5" />
            Back to the editor
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center py-12">
          {configLoaded && !accounts ? (
            <div className="max-w-[360px] text-center">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Accounts aren’t set up here</h1>
              <p className="mt-2 text-[14px] text-muted">This server has no database configured, so everything stays in this browser.</p>
              <Link href="/editor" className="mt-6 inline-block text-[13px] font-medium text-accent hover:underline">
                Back to the editor
              </Link>
            </div>
          ) : (
            <AuthForm key={mode} mode={mode} />
          )}
        </div>
        <footer className="text-[12px] text-subtle">Your code stays yours. CP Studio never submits anything without you.</footer>
      </main>
      <Showcase />
    </div>
  );
}
