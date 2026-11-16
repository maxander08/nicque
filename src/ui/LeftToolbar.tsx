import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { groundPointFromClient, setDropPreview } from '@/interactions/dropBridge';
import { LIGHTING_IDS, LIGHTING_PRESETS } from '@/rendering/lighting';
import { useStore } from '@/state/store';
import type { ModuleType } from '@/types';
import { cn } from '@/utils/cn';
import { panelClass } from './primitives';

/* ------------------------------------------------------------------ */
/* Block library data                                                  */
/* ------------------------------------------------------------------ */

interface LibraryItem {
  type: ModuleType;
  label: string;
  hint: string;
}

const LIBRARY: LibraryItem[] = [
  { type: 'power', label: 'Power', hint: 'Supplies other blocks' },
  { type: 'text', label: 'Text', hint: 'Holds and sends text' },
  { type: 'integer', label: 'Integer', hint: 'Holds and sends a whole number' },
  { type: 'display', label: 'Display', hint: 'Shows text on LEDs' },
  { type: 'keyboard', label: 'Keyboard', hint: 'Types into a Text Block' },
  { type: 'keypad', label: 'Keypad', hint: 'Digits and symbols' },
];

/** A little top-down drawing of each block, so the library reads at a glance. */
function BlockThumb({ type }: { type: ModuleType }) {
  const body = '#2a2c31';
  const edge = '#4b4e56';
  const led = '#4b3fa8';
  const dot = '#c3c6ce';
  const common = { viewBox: '0 0 56 36', width: 56, height: 36, 'aria-hidden': true } as const;
  switch (type) {
    case 'power':
      return (
        <svg {...common}>
          <rect x="3" y="12" width="50" height="12" rx="3.5" fill={body} stroke={edge} />
          <circle cx="28" cy="18" r="3.2" fill="none" stroke={dot} strokeWidth="1.2" />
          <circle cx="7" cy="15" r="1" fill={dot} />
        </svg>
      );
    case 'text':
    case 'integer':
      return (
        <svg {...common}>
          <rect x="14" y="5" width="28" height="26" rx="4" fill={body} stroke={edge} />
          <circle cx="21" cy="19" r="3" fill="none" stroke={dot} strokeWidth="1.1" />
          <circle cx="28" cy="19" r="3" fill="none" stroke={dot} strokeWidth="1.1" />
          <circle cx="35" cy="19" r="3" fill="none" stroke={dot} strokeWidth="1.1" />
          <circle cx="17.5" cy="9" r="1" fill={dot} />
        </svg>
      );
    case 'display':
      return (
        <svg {...common}>
          <rect x="12" y="2" width="32" height="32" rx="4" fill={body} stroke={edge} />
          <rect x="16" y="9" width="24" height="20" rx="2" fill={led} />
          <path d="M20 17h16M20 22h10" stroke="#e8ecff" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="15.5" cy="6" r="1" fill={dot} />
        </svg>
      );
    case 'keyboard':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="52" height="24" rx="4" fill={body} stroke={edge} />
          <rect x="5" y="11" width="46" height="16" rx="2" fill={led} />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <rect key={`${r}-${c}`} x={6.5 + c * 4.4} y={12.6 + r * 3.5} width="3.4" height="2.4" rx="0.6" fill="#8e86e0" opacity="0.8" />
            )),
          )}
        </svg>
      );
    case 'keypad':
      return (
        <svg {...common}>
          <rect x="15" y="3" width="26" height="30" rx="4" fill={body} stroke={edge} />
          <rect x="18" y="10" width="20" height="20" rx="2" fill={led} />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <rect key={`${r}-${c}`} x={19.4 + c * 4.6} y={11.4 + r * 4.6} width="3.4" height="3.4" rx="0.8" fill="#8e86e0" opacity="0.85" />
            )),
          )}
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const stroke = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

const LibraryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
    <rect x="3" y="3" width="6" height="6" rx="1.4" {...stroke} />
    <rect x="11" y="3" width="6" height="6" rx="1.4" {...stroke} />
    <rect x="3" y="11" width="6" height="6" rx="1.4" {...stroke} />
    <path d="M14 11v6M11 14h6" {...stroke} />
  </svg>
);

const LightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
    <path d="M7.2 14.2c0-1.2-1.7-2-1.7-4.2a4.5 4.5 0 0 1 9 0c0 2.2-1.7 3-1.7 4.2z" {...stroke} />
    <path d="M7.6 16.6h4.8M8.4 18.3h3.2" {...stroke} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

type PanelId = 'library' | 'lighting';

interface DragState {
  type: ModuleType;
  x: number;
  y: number;
  /** True while the pointer is over the 3D workspace (a valid drop target). */
  over: boolean;
}

/** True when a screen point is over the 3D workspace itself rather than over a HUD panel. */
const overWorkspace = (x: number, y: number) =>
  !!document.elementFromPoint(x, y)?.closest('main[aria-label="3D workspace"]');

function RailButton({
  id,
  label,
  active,
  onEnter,
  onToggle,
  children,
}: {
  id: PanelId;
  label: string;
  active: boolean;
  onEnter: (id: PanelId) => void;
  onToggle: (id: PanelId) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="true"
      aria-expanded={active}
      onPointerEnter={() => onEnter(id)}
      onFocus={() => onEnter(id)}
      onClick={() => onToggle(id)}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-xl text-neutral-300 transition-colors',
        'hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80',
        active && 'bg-white/15 text-white',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Slim toolbar on the left edge. Hovering a button slides out its panel:
 *  - Blocks: the block library. Drag a block onto the 3D workspace to place it where it is dropped (an outline shows
 *    where it will land); a plain click adds it at the default spot.
 *  - Lighting: switches between lighting scenes, from the studio rig down to pitch black.
 */
export function LeftToolbar() {
  const [hover, setHover] = useState<PanelId | null>(null);
  const [pinned, setPinned] = useState<PanelId | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lighting = useStore((s) => s.lighting);
  const panel = drag ? null : (hover ?? pinned);

  const enter = useCallback((id: PanelId) => {
    clearTimeout(timer.current);
    setHover(id);
  }, []);
  const keepOpen = useCallback(() => clearTimeout(timer.current), []);
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(null), 260);
  }, []);
  const toggle = useCallback((id: PanelId) => setPinned((p) => (p === id ? null : id)), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinned(null);
      setHover(null);
    };
    // a press anywhere outside the toolbar closes a pinned panel
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[data-left-toolbar]')) return;
      setPinned(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [panel]);

  /* ---- dragging a block out of the library ----------------------------------------------------------------- */

  const startDrag = (e: ReactPointerEvent, type: ModuleType) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;

    const update = (x: number, y: number) => {
      const ground = overWorkspace(x, y) ? groundPointFromClient(x, y) : null;
      setDropPreview(ground ? { type, at: ground } : null);
      setDrag({ type, x, y, over: !!ground });
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      document.body.style.cursor = '';
      setDropPreview(null);
      setDrag(null);
    };
    const onMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        started = true;
        setHover(null);
        setPinned(null);
        document.body.style.cursor = 'grabbing';
      }
      update(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      const st = useStore.getState();
      if (!started) {
        // a click, not a drag: add the block at its default spot
        cleanup();
        st.addModule(type);
        return;
      }
      const g = overWorkspace(ev.clientX, ev.clientY) ? groundPointFromClient(ev.clientX, ev.clientY) : null;
      cleanup();
      if (g) st.addModule(type, g);
      else st.notify('Drop the block onto the workspace to place it.', 'warn');
    };
    const onCancel = () => cleanup();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cleanup();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  };

  const dragged = drag && LIBRARY.find((l) => l.type === drag.type);

  return (
    <>
      <div
        data-left-toolbar
        onPointerLeave={leave}
        onPointerEnter={keepOpen}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null);
        }}
        className="pointer-events-auto absolute left-3 top-1/2 z-30 -translate-y-1/2 max-sm:left-2"
      >
        <nav aria-label="Block library and lighting" className={cn(panelClass, 'flex flex-col gap-1 p-1.5')}>
          <RailButton id="library" label="Block library" active={panel === 'library'} onEnter={enter} onToggle={toggle}>
            <LibraryIcon />
          </RailButton>
          <RailButton id="lighting" label="Lighting scenes" active={panel === 'lighting'} onEnter={enter} onToggle={toggle}>
            <LightIcon />
          </RailButton>
        </nav>

        {panel && (
          // the left padding bridges the gap to the rail so the pointer never leaves the hover area
          <div className="absolute left-full top-1/2 -translate-y-1/2 pl-2" onPointerEnter={keepOpen}>
            {panel === 'library' ? (
              <section
                aria-label="Block library"
                className={cn(panelClass, 'nq-flyout max-h-[calc(100dvh-7rem)] w-[250px] overflow-y-auto p-2')}
              >
                <h2 className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Blocks
                </h2>
                <ul className="space-y-1">
                  {LIBRARY.map((item) => (
                    <li key={item.type}>
                      <button
                        type="button"
                        onPointerDown={(e) => startDrag(e, item.type)}
                        onClick={(e) => {
                          // keyboard activation (detail 0); pointer clicks are handled by the drag logic above
                          if (e.detail === 0) useStore.getState().addModule(item.type);
                        }}
                        onDragStart={(e) => e.preventDefault()}
                        aria-label={`${item.label} Block. Drag onto the workspace, or press Enter to add`}
                        className="flex w-full cursor-grab touch-none items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/80 active:cursor-grabbing"
                      >
                        <span className="flex h-11 w-[62px] shrink-0 items-center justify-center rounded-lg bg-black/35">
                          <BlockThumb type={item.type} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-neutral-100">{item.label} Block</span>
                          <span className="block text-xs leading-snug text-neutral-400">{item.hint}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-neutral-500">
                  Drag a block onto the workspace to place it.
                </p>
              </section>
            ) : (
              <section aria-label="Lighting scenes" className={cn(panelClass, 'nq-flyout w-[250px] p-2')}>
                <h2 className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Lighting
                </h2>
                <div role="radiogroup" aria-label="Lighting scene" className="space-y-1">
                  {LIGHTING_IDS.map((id) => {
                    const p = LIGHTING_PRESETS[id];
                    const on = lighting === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => useStore.getState().setLighting(id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors',
                          'hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/80',
                          on && 'bg-white/12',
                        )}
                      >
                        <span
                          aria-hidden
                          className="h-9 w-9 shrink-0 rounded-lg border border-white/15"
                          style={{ background: `linear-gradient(160deg, ${p.fog} 0%, ${p.fog} 45%, ${p.ground} 46%, ${p.ground} 100%)` }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-neutral-100">{p.label}</span>
                          <span className="block text-xs leading-snug text-neutral-400">{p.hint}</span>
                        </span>
                        {on && (
                          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0 text-neutral-100">
                            <path d="M3 7.2l2.6 2.6L11 4.4" {...stroke} strokeWidth={1.8} />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* the block follows the pointer while it is dragged out of the library */}
      {drag && dragged && (
        <div
          aria-hidden
          className={cn(
            panelClass,
            'pointer-events-none fixed z-50 flex items-center gap-2 py-1 pl-1 pr-3 text-[13px] font-medium transition-[opacity,border-color]',
            drag.over ? 'border-white/60 opacity-95' : 'opacity-70',
          )}
          style={{ left: drag.x + 14, top: drag.y + 14 }}
        >
          <span className="flex h-9 w-[54px] items-center justify-center rounded-lg bg-black/35">
            <BlockThumb type={dragged.type} />
          </span>
          {drag.over ? `Drop to place ${dragged.label}` : dragged.label}
        </div>
      )}
    </>
  );
}
