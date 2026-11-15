import { useMemo, useState } from 'react';
import { missingLinks } from '@/connections/suggest';
import { useLogicWorkspace } from '@/state/logicWorkspace';
import { useStore } from '@/state/store';
import { cn } from '@/utils/cn';
import { StateMark, Switch, panelClass, stateLabel } from './primitives';

/** Compact runtime / connection status with the master power control. */
export function StatusPanel() {
  const workspace = useLogicWorkspace();
  const runtime = useStore((s) => s.runtime);
  const select = useStore((s) => s.select);
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const { setPower, disconnect, linkModules } = useStore.getState();

  const names = useMemo(() => new Map(workspace.modules.map((m) => [m.id, m.name])), [workspace.modules]);
  const missing = useMemo(() => missingLinks(workspace), [workspace]);
  const powers = workspace.modules.filter((m) => m.type === 'power');
  const ok = runtime.systemOk && missing.length === 0;

  return (
    <section
      aria-label="System status"
      className={cn(
        panelClass,
        'pointer-events-auto absolute bottom-3 left-3 z-10 w-[310px]',
        'max-md:bottom-auto max-md:left-2 max-md:top-14 max-md:w-[min(310px,calc(100%-1rem))]',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-white/80"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <StateMark state={ok ? 'operational' : 'waiting'} />
          <span role="status" aria-live="polite">
            {ok ? 'System operational' : 'Attention needed'}
          </span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={cn('transition-transform', open && 'rotate-180')}>
          <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/10 px-4 pb-3 pt-3">
          {powers.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="text-[13px] font-medium">{p.name}</span>
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
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => select(m.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-white/80"
                    >
                      <span className="flex items-center gap-2">
                        <StateMark state={r.state} />
                        {m.name}
                      </span>
                      <span className="text-xs text-neutral-300">
                        {stateLabel[r.state]} · {r.summary}
                      </span>
                    </button>
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
                      <span className="text-neutral-400">{c.type === 'power' ? 'Power' : 'Text'}</span>{' '}
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
                    <span className="text-neutral-400">{l.type === 'power' ? 'Power' : 'Text'}</span>{' '}
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
        </div>
      )}
    </section>
  );
}
