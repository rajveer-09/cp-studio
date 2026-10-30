import { Loader2, X } from 'lucide-react';
import { Dialog, Tooltip } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { keyLabel } from '../lib/platform';

/** Joins class names; later classes win conflicts (e.g. a caller's `hidden` over a base `inline-flex`). */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(' '));
}

const VARIANTS = {
  primary: 'btn-primary disabled:opacity-100', // styled in index.css; disabled turns neutral instead of faded
  secondary: 'bg-panel-2 text-fg border border-line hover:bg-hover hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20',
} as const;

const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md [&_svg]:size-3.5',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-lg [&_svg]:size-4',
  icon: 'size-8 rounded-lg justify-center [&_svg]:size-4',
  'icon-sm': 'size-7 rounded-md justify-center [&_svg]:size-3.5',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
});

export function Kbd({ keys, inverted, className }: { keys: string[]; inverted?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className={cn(
            'min-w-[1.5em] rounded px-1 py-px text-center font-mono text-[10px] leading-4 font-medium',
            inverted ? 'bg-white/20 text-white' : 'border border-line bg-panel-2 text-muted',
          )}
        >
          {keyLabel(key)}
        </kbd>
      ))}
    </span>
  );
}

export function Tip({
  label,
  keys,
  side = 'bottom',
  children,
}: {
  label: ReactNode;
  keys?: string[];
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="popover z-50 flex items-center gap-2 rounded-md border border-line bg-panel px-2 py-1 text-xs text-fg shadow-pop"
        >
          {label}
          {keys && <Kbd keys={keys} />}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-6 rounded-md px-2.5 text-xs font-medium transition',
            option.value === value ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const MODAL_WIDTHS = { md: 'max-w-md', lg: 'max-w-lg', '2xl': 'max-w-2xl' } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  width?: keyof typeof MODAL_WIDTHS;
  dismissible?: boolean;
}) {
  const block = (e: Event) => !dismissible && e.preventDefault();
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          // Focus the dialog itself rather than its close button; inputs with autoFocus still get focus.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (!(e.currentTarget as HTMLElement).contains(document.activeElement)) (e.currentTarget as HTMLElement).focus();
          }}
          className={cn(
            'dialog-content fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-panel shadow-pop outline-none',
            MODAL_WIDTHS[width],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            {dismissible && (
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close">
                  <X />
                </Button>
              </Dialog.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-subtle [&_svg]:size-5">
      {icon}
      <div>{children}</div>
    </div>
  );
}
