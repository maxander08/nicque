import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { missingLinks } from '@/connections/suggest';
import { useLogicWorkspace } from '@/state/logicWorkspace';
import { linkLabel, useStore } from '@/state/store';
import { cn } from '@/utils/cn';
import { ScrollArea, StateMark, Switch, panelClass } from './primitives';

/** Compact runtime / connection status with the master power control. */
export function StatusPanel() {
  const workspace = useLogicWorkspace();
  const runtime = useStore((s) => s.runtime);
  const select = useStore((s) => s.select);
  const { setPower, disconnect, linkModules } = useStore.getState();

  // The drawer slides in while the pointer is at the right edge (or over the drawer). The handle also toggles
  // it, so touch and keyboard users can open it too.
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enter = useCallback(() => {
    clearTimeout(timer.current);
    setHover(true);
  }, []);
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(false), 280);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned]);

  const names = useMemo(() => new Map(workspace.modules.map((m) => [m.id, m.name])), [workspace.modules]);
  const missing = useMemo(() => missingLinks(workspace), [workspace]);
  const powers = workspace.modules.filter((m) => m.type === 'power');
  const ok = runtime.systemOk && missing.length === 0;

  return (
    <>
      {/* invisible hot zone along the whole right edge */}
      <div aria-hidden onPointerEnter={enter} onPointerLeave={leave} className="pointer-events-auto absolute inset-y-0 right-0 z-30 w-3" />

      {/* handle: a slim tab that hints at the drawer, tinted by the system state */}
      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        onPointerEnter={enter}
        onPointerLeave={leave}
        aria-expanded={open}
        aria-controls="status-drawer"
        aria-label={`${ok ? 'System operational' : 'Attention needed'}. Toggle status panel`}
        className={cn(
          'pointer-events-auto absolute right-0 top-1/2 z-30 flex h-24 w-[7px] -translate-y-1/2 items-start justify-center rounded-l-full pt-2',
          'bg-white/30 transition-all duration-200 hover:w-[10px] hover:bg-white/50 focus-visible:w-[10px] focus-visible:outline-2 focus-visible:outline-white/80',
          open && 'pointer-events-none opacity-0',
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-300' : 'bg-amber-300')} />
      </button>

      <section
        id="status-drawer"
        aria-label="System status"
        inert={!open}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={enter}
        className={cn(
          panelClass,
          'absolute bottom-auto right-3 top-16 z-30 flex max-h-[calc(100%-5.5rem)] w-[330px] flex-col overflow-hidden',
          'max-md:right-2 max-md:w-[min(330px,calc(100%-1rem))]',
          'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
          open ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <StateMark state={ok ? 'operational' : 'waiting'} />
            <span role="status" aria-live="polite">
              {ok ? 'System operational' : 'Attention needed'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              setPinned(false);
              setHover(false);
            }}
            aria-label="Close status panel"
            className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-neutral-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/80"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <ScrollArea className="flex-1" contentClassName="space-y-3 px-4 pb-4 pt-3">
          {powers.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-[13px] font-medium">{p.name} <span className="text-xs font-normal text-neutral-400">supply</span></span>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-neutral-300">{p.config.enabled ? 'On' : 'Off'}</span>
                <Switch
                  checked={p.config.enabled}
                  onChange={(v) => setPower(p.id, v)}
                  label={`${p.name} ${p.config.enabled ? 'on' : 'off'}`}
                />
              </div>
            </div>
          ))}

          <ul className="space-y-1">
            {workspace.modules
              .filter((m) => m.type !== 'power')
              .map((m) => {
                const r = runtime.modules[m.id];
                const on = m.switchedOff !== true;
                return (
                  <li key={m.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => select(m.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-white/80"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <StateMark state={r.state} />
                        <span className="truncate">{m.name.replace(' Block', '')}</span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-300">{r.summary}</span>
                    </button>
                    <Switch checked={on} onChange={(v) => setPower(m.id, v)} label={`${m.name} power ${on ? 'on' : 'off'}`} />
                  </li>
                );
              })}
          </ul>

          <div>
            <h3 className="mb-1 text-xs font-medium text-neutral-400">Links</h3>
            <ul className="space-y-1">
              {workspace.connections.map((c) => {
                const rc = runtime.connections[c.id];
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span>
                      <span className="text-neutral-400">{linkLabel[c.type]}</span>{' '}
                      {names.get(c.from.moduleId)?.replace(' Block', '')} →{' '}
                      {names.get(c.to.moduleId)?.replace(' Block', '')}
                      <span className="ml-1.5 text-xs text-neutral-400">{rc?.active ? 'active' : 'inactive'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => disconnect(c.id)}
                      aria-label={`Disconnect ${c.type} link from ${names.get(c.from.moduleId)} to ${names.get(c.to.moduleId)}`}
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80"
                    >
                      Disconnect
                    </button>
                  </li>
                );
              })}
              {missing.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    <span className="text-neutral-400">{linkLabel[l.type]}</span>{' '}
                    {l.label.replace(/ Block/g, '')}
                    <span className="ml-1.5 text-xs text-amber-200/90">not linked</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => linkModules(l.fromId, l.toId, l.type)}
                    aria-label={`Link ${l.label}`}
                    className="shrink-0 rounded-md bg-white/12 px-2 py-0.5 text-xs font-medium text-neutral-100 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white/80"
                  >
                    Link
                  </button>
                </li>
              ))}
              {workspace.connections.length === 0 && missing.length === 0 && (
                <li className="text-xs text-neutral-400">No links</li>
              )}
            </ul>
          </div>
        </ScrollArea>
      </section>
    </>
  );
}
