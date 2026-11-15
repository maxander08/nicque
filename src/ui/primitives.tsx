import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export const panelClass =
  'rounded-2xl border border-white/10 bg-neutral-950/88 text-neutral-100 shadow-[0_10px_40px_rgba(0,0,0,0.35)]';

export function IconButton({
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-neutral-200 transition-colors',
        'hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-white/15 text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-[52px] shrink-0 rounded-full border transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80',
        checked ? 'border-white/40 bg-neutral-100' : 'border-white/15 bg-neutral-800',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-bold transition-all',
          checked ? 'left-[27px] bg-neutral-900 text-neutral-100' : 'left-0.5 bg-neutral-500 text-neutral-900',
        )}
        aria-hidden
      >
        {checked ? 'I' : 'O'}
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-white/8 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-white/80',
            value === o.value ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-300 hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Status mark that never relies on colour alone: the shape and the accompanying text carry the meaning. */
export function StateMark({ state }: { state: 'operational' | 'off' | 'unpowered' | 'waiting' }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  if (state === 'operational')
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="6" fill="#f4f4f5" />
        <path d="M4 7.2l2 2 4-4.4" stroke="#18181b" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'off')
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.2" stroke="#a1a1aa" strokeWidth="1.6" fill="none" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M7 1.5l6 10.5H1z" fill="#fbbf24" />
      <path d="M7 5.4v3" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10" r="0.9" fill="#18181b" />
    </svg>
  );
}

export const stateLabel = {
  operational: 'Operational',
  off: 'Off',
  unpowered: 'No power',
  waiting: 'Waiting',
} as const;
