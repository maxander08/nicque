import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

export const panelClass =
  'rounded-2xl border border-white/10 bg-neutral-950/88 text-neutral-100 shadow-[0_10px_40px_rgba(0,0,0,0.35)]';

export function IconButton({
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; ref?: RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-neutral-200 transition-colors',
        // comfortable touch target on phones
        'max-md:h-10 max-md:min-w-10 max-md:justify-center max-md:px-2.5',
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
            'h-8 rounded-md px-3 text-[13px] font-medium transition-colors max-md:h-9 max-md:px-3.5',
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

/* ------------------------------------------------------------------ */
/* Custom scrollbar, scroll area, text area, stepper and dialog        */
/* None of these fall back to the browser's own controls.              */
/* ------------------------------------------------------------------ */

const TRACK_INSET = 4;
const MIN_THUMB = 28;

/**
 * A vertical scrollbar drawn by the app. It follows any scrollable element (`target`), shows only when there is
 * something to scroll, and supports thumb dragging and track paging. Pass `watch` to re-measure when content that
 * the element cannot report itself (a textarea's value) changes.
 */
export function Scrollbar({ target, watch }: { target: RefObject<HTMLElement | null>; watch?: unknown }) {
  const [m, setM] = useState({ top: 0, size: 0, visible: false });
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ y: 0, scroll: 0 });

  const update = useCallback(() => {
    const el = target.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setM((v) => (v.visible ? { top: 0, size: 0, visible: false } : v));
      return;
    }
    const track = clientHeight - TRACK_INSET * 2;
    const size = Math.max(MIN_THUMB, (track * clientHeight) / scrollHeight);
    const top = (track - size) * (scrollTop / (scrollHeight - clientHeight));
    setM((v) => (v.visible && v.top === top && v.size === size ? v : { top, size, visible: true }));
  }, [target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [target, update, watch]);

  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, scroll: el.scrollTop };
    setDragging(true);
  };
  const onThumbMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!dragging || !el) return;
    const track = el.clientHeight - TRACK_INSET * 2 - m.size;
    if (track <= 0) return;
    el.scrollTop = drag.current.scroll + ((e.clientY - drag.current.y) * (el.scrollHeight - el.clientHeight)) / track;
  };
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!el) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const above = e.clientY < rect.top + TRACK_INSET + m.top;
    el.scrollBy({ top: (above ? -1 : 1) * el.clientHeight * 0.9, behavior: 'smooth' });
  };

  if (!m.visible) return null;
  return (
    <div
      aria-hidden
      onPointerDown={onTrackDown}
      className="absolute inset-y-0 right-0 z-10 w-3 touch-none select-none"
    >
      <div
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        style={{ top: TRACK_INSET + m.top, height: m.size }}
        className={cn(
          'absolute right-[3px] w-[6px] cursor-default rounded-full transition-[background-color,width,right] duration-150',
          dragging ? 'right-[2px] w-[8px] bg-white/55' : 'bg-white/22 hover:right-[2px] hover:w-[8px] hover:bg-white/40',
        )}
      />
    </div>
  );
}

/** A scrolling region with the app's own scrollbar. The native one is hidden. */
export function ScrollArea({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className={cn('relative flex min-h-0 flex-col', className)}>
      <div ref={scroller} className="nq-scroll-hide min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={contentClassName}>{children}</div>
      </div>
      <Scrollbar target={scroller} />
    </div>
  );
}

/** A multi-line field with a custom scrollbar and a custom resize grip (no native resize handle). */
export function TextArea({
  className,
  minHeight = 96,
  maxHeight = 320,
  initialHeight = 124,
  value,
  ref,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number;
  maxHeight?: number;
  initialHeight?: number;
  ref?: RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const el = ref ?? own;
  const [height, setHeight] = useState(initialHeight);
  const start = useRef({ y: 0, h: 0 });

  const onGripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: height };
  };
  const onGripMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setHeight(Math.min(maxHeight, Math.max(minHeight, start.current.h + e.clientY - start.current.y)));
  };

  return (
    <div className="relative" style={{ height }}>
      <textarea
        ref={el}
        value={value}
        {...rest}
        className={cn('nq-scroll-hide h-full w-full resize-none', className, 'pr-5')}
      />
      <Scrollbar target={el} watch={`${value}|${height}`} />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize text field"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        className="absolute bottom-0 right-0 z-20 flex h-5 w-5 cursor-ns-resize touch-none items-end justify-end p-1 text-neutral-500 hover:text-neutral-200"
      >
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
          <path d="M8 1L1 8M8 5L5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

/** − / + button that repeats while it is held down. */
function StepButton({
  dir,
  onStep,
  label,
  disabled,
}: {
  dir: -1 | 1;
  onStep: (dir: -1 | 1) => void;
  label: string;
  disabled?: boolean;
}) {
  const step = useRef(onStep);
  step.current = onStep;
  const timers = useRef<{ delay?: number; tick?: number }>({});
  const stop = useCallback(() => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.tick);
  }, []);
  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        step.current(dir);
        stop();
        timers.current.delay = window.setTimeout(() => {
          timers.current.tick = window.setInterval(() => step.current(dir), 70);
        }, 380);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          step.current(dir);
        }
      }}
      className={cn(
        'flex w-9 shrink-0 touch-none select-none items-center justify-center text-neutral-200 transition-colors',
        'hover:bg-white/12 active:bg-white/20 focus-visible:bg-white/12 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path
          d={dir === -1 ? 'M2 6h8' : 'M2 6h8M6 2v8'}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** A field with custom − / + steppers on either side. `onStep` receives -1 or +1 (repeats while held). */
export function Stepper({
  children,
  onStep,
  label,
  disabled,
}: {
  children: ReactNode;
  onStep: (dir: -1 | 1) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-stretch overflow-hidden rounded-lg border border-white/12 bg-black/40 focus-within:border-white/50"
    >
      <StepButton dir={-1} onStep={onStep} label={`Decrease ${label}`} disabled={disabled} />
      <div className="min-w-0 flex-1 border-x border-white/10">{children}</div>
      <StepButton dir={1} onStep={onStep} label={`Increase ${label}`} disabled={disabled} />
    </div>
  );
}

/** A modal confirmation drawn by the app (replaces the browser's confirm box). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);
  if (!open) return null;
  return createPortal(
    <div
      className="nq-fade pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className={cn(panelClass, 'nq-pop w-full max-w-[360px] p-5')}
      >
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-neutral-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <IconButton ref={cancelBtn} onClick={onCancel} className="bg-white/8">
            Cancel
          </IconButton>
          <IconButton onClick={onConfirm} className="bg-neutral-100 text-neutral-900 hover:bg-white">
            {confirmLabel}
          </IconButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
