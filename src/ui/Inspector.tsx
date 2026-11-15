import { useEffect, useRef } from 'react';
import { MAX_TEXT_LENGTH, MODULE_DEFINITIONS } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { IconButton, Segmented, StateMark, Switch, panelClass, stateLabel } from './primitives';
import { cn } from '@/utils/cn';

/** Contextual configuration for the selected block. */
export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const module = useStore((s) => s.workspace.modules.find((m) => m.id === s.selectedId));
  const rt = useStore((s) => (s.selectedId ? s.runtime.modules[s.selectedId] : undefined));
  const connections = useStore((s) => s.workspace.connections);
  const modules = useStore((s) => s.workspace.modules);
  const runtimeConns = useStore((s) => s.runtime.connections);
  const focusNonce = useStore((s) => s.focusTextNonce);
  const { select, setText, setPower, setAlign, rotateModule, disconnect } = useStore.getState();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusNonce > 0) area.current?.focus();
  }, [focusNonce]);

  if (!module || !rt || !selectedId) return null;
  const def = MODULE_DEFINITIONS[module.type];

  return (
    <section
      aria-label={`${module.name} settings`}
      className={cn(
        panelClass,
        'pointer-events-auto absolute right-3 top-16 z-20 flex max-h-[calc(100%-6rem)] w-[320px] flex-col overflow-hidden',
        'max-md:inset-x-2 max-md:bottom-2 max-md:top-auto max-md:w-auto max-md:max-h-[46vh]',
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold leading-tight">{module.name}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-neutral-300">
            <StateMark state={rt.state} />
            <span className="font-medium text-neutral-100">{stateLabel[rt.state]}</span>
            <span className="text-neutral-500">·</span>
            <span>{rt.summary}</span>
          </p>
        </div>
        <IconButton aria-label="Deselect block" onClick={() => select(null)} className="-mr-2 -mt-1 h-8 w-8 justify-center px-0">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </IconButton>
      </header>

      <div className="space-y-4 overflow-y-auto px-4 py-3">
        <p className="text-[13px] leading-snug text-neutral-300">{rt.detail}</p>

        {module.type === 'power' && (
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium" id="power-label">
              Power
            </label>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-neutral-300">{module.config.enabled ? 'On' : 'Off'}</span>
              <Switch
                checked={module.config.enabled}
                onChange={(v) => setPower(module.id, v)}
                label={`Power ${module.config.enabled ? 'on' : 'off'}`}
              />
            </div>
          </div>
        )}

        {module.type === 'text' && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="text-value" className="text-[13px] font-medium">
                Text
              </label>
              <span className="text-xs text-neutral-400">
                {Array.from(module.config.value).length} / {MAX_TEXT_LENGTH}
              </span>
            </div>
            <textarea
              id="text-value"
              ref={area}
              rows={5}
              maxLength={MAX_TEXT_LENGTH}
              value={module.config.value}
              onChange={(e) => setText(module.id, e.target.value)}
              placeholder="Type the text to send to a display"
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-[14px] leading-snug text-neutral-50 outline-none placeholder:text-neutral-500 focus:border-white/50"
            />
            {!rt.powered && (
              <p className="mt-1.5 text-xs text-amber-200/90">
                The block is unpowered. The text is kept and will be sent once power returns.
              </p>
            )}
          </div>
        )}

        {module.type === 'display' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Alignment</span>
              <Segmented
                label="Text alignment"
                value={module.config.align}
                onChange={(v) => setAlign(module.id, v)}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                ]}
              />
            </div>
            <p className="text-xs leading-snug text-neutral-400">
              Lines wrap at word boundaries and the type size shrinks to fit. Text that still does not fit is
              clipped with an ellipsis.
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-[13px] font-medium">Connectors</h3>
          <ul className="space-y-1.5">
            {def.ports.map((p) => {
              const links = connections.filter(
                (c) =>
                  (c.from.moduleId === module.id && c.from.portId === p.id) ||
                  (c.to.moduleId === module.id && c.to.portId === p.id),
              );
              return (
                <li key={p.id} className="rounded-lg bg-white/6 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px]">
                      {p.label}
                      <span className="ml-1.5 text-xs text-neutral-400">
                        {p.type === 'power' ? 'power' : 'text'} · {p.direction === 'out' ? 'output' : 'input'}
                      </span>
                    </span>
                  </div>
                  {links.length === 0 ? (
                    <p className="mt-0.5 text-xs text-neutral-400">Not linked</p>
                  ) : (
                    links.map((c) => {
                      const otherRef = c.from.moduleId === module.id && c.from.portId === p.id ? c.to : c.from;
                      const other = modules.find((m) => m.id === otherRef.moduleId);
                      const active = runtimeConns[c.id]?.active;
                      return (
                        <div key={c.id} className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-neutral-300">
                            {c.from.moduleId === module.id ? '→' : '←'} {other?.name ?? 'Unknown'} ·{' '}
                            {active ? 'active' : 'inactive'}
                          </span>
                          <button
                            type="button"
                            onClick={() => disconnect(c.id)}
                            aria-label={`Disconnect ${p.label} from ${other?.name ?? 'block'}`}
                            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80"
                          >
                            Disconnect
                          </button>
                        </div>
                      );
                    })
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-white/10 px-3 py-2">
        <IconButton onClick={() => rotateModule(module.id)} aria-label="Rotate block 90 degrees">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M13 8a5 5 0 1 1-1.8-3.8M13 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Rotate
          <kbd className="rounded bg-white/10 px-1.5 text-[11px] text-neutral-300">R</kbd>
        </IconButton>
        <span className="pr-2 text-xs text-neutral-400">Arrow keys nudge</span>
      </footer>
    </section>
  );
}
