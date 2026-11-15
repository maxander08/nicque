import { useEffect } from 'react';
import { useStore, type Toast } from '@/state/store';
import { cn } from '@/utils/cn';
import { panelClass } from './primitives';

const GLYPH: Record<Toast['kind'], string> = {
  info: 'M7 4v.01M7 6.5V10',
  success: 'M3.5 7.2l2.3 2.3 4.7-5',
  warn: 'M7 4.5v3M7 9.6v.01',
  error: 'M4.5 4.5l5 5M9.5 4.5l-5 5',
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 5200 : 3400);
    return () => clearTimeout(t);
  }, [toast.id, toast.kind, dismiss]);
  return (
    <li
      className={cn(
        panelClass,
        'nq-toast pointer-events-auto flex max-w-[min(520px,calc(100vw-1.5rem))] items-start gap-2.5 px-3.5 py-2.5 text-[13px] leading-snug',
      )}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" className="mt-0.5 shrink-0" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="6.2" stroke={toast.kind === 'error' ? '#fca5a5' : toast.kind === 'warn' ? '#fcd34d' : '#e5e5e5'} strokeWidth="1.3" />
        <path d={GLYPH[toast.kind]} stroke="#f5f5f5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{toast.message}</span>
    </li>
  );
}

/** Restrained, polite live-region feedback for selection, link, power and persistence events. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <ul
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none absolute inset-x-0 top-16 z-40 flex flex-col items-center gap-2 px-3 max-md:top-[4.25rem]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </ul>
  );
}

/** Explains what will happen while the user drags a new link. */
export function LinkHint() {
  const drag = useStore((s) => s.linkDrag);
  const modules = useStore((s) => s.workspace.modules);
  if (!drag) return null;
  const name = (id: string) => modules.find((m) => m.id === id)?.name ?? 'block';
  let msg = 'Release on a compatible connector to link';
  let ok = false;
  if (drag.verdict) {
    if (drag.verdict.ok) {
      ok = true;
      msg = `Release to link ${name(drag.verdict.connection.from.moduleId)} → ${name(drag.verdict.connection.to.moduleId)}`;
    } else {
      msg = `Cannot link: ${drag.verdict.message}`;
    }
  }
  return (
    <div
      role="status"
      className={cn(
        panelClass,
        'pointer-events-none absolute bottom-6 left-1/2 z-40 max-w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 px-4 py-2.5 text-[13px]',
        ok ? 'border-white/40' : 'border-amber-200/40',
      )}
    >
      {ok ? '✓ ' : drag.verdict ? '✕ ' : ''}
      {msg}
    </div>
  );
}

export function Hint() {
  return (
    <p className="pointer-events-none absolute bottom-3 left-1/2 z-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-3 py-1 text-xs text-neutral-100/90 max-lg:hidden">
      Drag blocks to move · drag from a connector to link · drag the ground to orbit · right-drag to pan · scroll to zoom
    </p>
  );
}
