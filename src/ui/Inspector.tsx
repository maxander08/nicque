import { useEffect, useRef } from 'react';
import { decimalOp, isDecimal } from '@/modules/bigDecimal';
import { KEY_PRESSURES, MAX_INTEGER_DIGITS, MAX_TEXT_LENGTH, MODULE_DEFINITIONS, isBoolean, isGateType, isInteger, isOperatorType } from '@/modules/definitions';
import { useLogicWorkspace } from '@/state/logicWorkspace';
import { useStore } from '@/state/store';
import { GATES, OPERATORS, TEXT_OPERATORS } from '@/modules/definitions';
import { describeNode } from '@/connections/compat';
import { IconButton, ScrollArea, Segmented, StateMark, Stepper, Switch, TextArea, panelClass, stateLabel } from './primitives';
import { cn } from '@/utils/cn';

/** Contextual configuration for the selected block. */
export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const workspace = useLogicWorkspace();
  const module = workspace.modules.find((m) => m.id === selectedId);
  const rt = useStore((s) => (s.selectedId ? s.runtime.modules[s.selectedId] : undefined));
  const connections = workspace.connections;
  const modules = workspace.modules;
  const runtimeConns = useStore((s) => s.runtime.connections);
  const focusNonce = useStore((s) => s.focusTextNonce);
  const { select, setText, setPower, setAlign, clearDisplay, rotateModule, removeModule, setKeyboardPressure, disconnect } =
    useStore.getState();
  const area = useRef<HTMLTextAreaElement>(null);
  const intInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusNonce > 0) (area.current ?? intInput.current)?.focus();
  }, [focusNonce]);

  if (!module || !rt || !selectedId) return null;
  const def = MODULE_DEFINITIONS[module.type];
  const isOn = module.type === 'power' ? module.config.enabled : module.switchedOff !== true;

  return (
    <section
      aria-label={`${module.name} settings`}
      className={cn(
        panelClass,
        'pointer-events-auto absolute right-3 top-16 z-20 flex max-h-[calc(100%-6rem)] w-[320px] flex-col overflow-hidden',
        'max-md:inset-x-2 max-md:bottom-[4.75rem] max-md:top-auto max-md:w-auto max-md:max-h-[min(46dvh,calc(100dvh-15rem))]',
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

      <ScrollArea className="flex-1" contentClassName="space-y-4 px-4 py-3">
        <p className="text-[13px] leading-snug text-neutral-300">{rt.detail}</p>

        {/* every block has its own power switch, mirroring the button on its cover */}
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-medium" id="power-label">
            {module.type === 'power' ? 'Power' : 'Block power'}
          </label>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-neutral-300">{isOn ? 'On' : 'Off'}</span>
            <Switch
              checked={isOn}
              onChange={(v) => setPower(module.id, v)}
              label={`${module.name} power ${isOn ? 'on' : 'off'}`}
            />
          </div>
        </div>

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
            <TextArea
              id="text-value"
              ref={area}
              maxLength={MAX_TEXT_LENGTH}
              value={module.config.value}
              onChange={(e) => setText(module.id, e.target.value)}
              placeholder="Type the text to send to a display"
              spellCheck={false}
              className="rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-[14px] leading-snug text-neutral-50 outline-none placeholder:text-neutral-500 focus:border-white/50"
            />
            <p className="mt-1.5 text-xs leading-snug text-neutral-400">
              The Text Block has no screen of its own. Link its output to a Display Block to see the text.
            </p>
            {!rt.powered && (
              <p className="mt-1.5 text-xs text-amber-200/90">
                The block is unpowered. The text is kept and will be sent once power returns.
              </p>
            )}
          </div>
        )}

        {isOperatorType(module.type) && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-[#ffd21a] text-[12px] font-bold leading-none text-neutral-900"
                aria-hidden
              >
                {OPERATORS[module.type].symbol}
              </span>
              <span className="text-[13px] font-medium">{OPERATORS[module.type].badge} operator</span>
            </div>
            <p className="text-xs leading-snug text-neutral-400">
              The yellow box and symbol next to the power LED mark this as the {OPERATORS[module.type].badge} operator.
              {TEXT_OPERATORS.includes(module.type)
                ? ' It works with Integer and Decimal Blocks and, in addition, with Text Blocks.'
                : ' It works with Integer and Decimal Blocks only.'}{' '}
              Its Clear button blanks the result stored in this operator only (the blocks feeding it keep their
              values) and Undo brings it back.
            </p>
          </div>
        )}

        {isGateType(module.type) && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-[#2f8bff] px-1 text-[9px] font-bold leading-none text-white"
                aria-hidden
              >
                {GATES[module.type].symbol}
              </span>
              <span className="text-[13px] font-medium">{GATES[module.type].badge} logic gate</span>
            </div>
            <p className="text-xs leading-snug text-neutral-400">
              The blue box next to the power LED marks this as the {GATES[module.type].badge} gate.{' '}
              {GATES[module.type].hint}. It works with Boolean Blocks and other gates (True = 1, False = 0) and has{' '}
              {GATES[module.type].inputs === 1 ? 'one input' : 'two inputs'}. Its Clear button blanks the result stored in
              this gate only (the blocks feeding it keep their values) and Undo brings it back.
            </p>
          </div>
        )}

        {module.type === 'boolean' && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] font-medium">Boolean</span>
              <span className="text-xs text-neutral-400">True = 1 · False = 0</span>
            </div>
            <Segmented
              label="Boolean value"
              value={isBoolean(module.config.value) ? module.config.value : ''}
              onChange={(v) => setText(module.id, v)}
              options={[
                { value: '1', label: 'True (1)' },
                { value: '0', label: 'False (0)' },
              ]}
            />
            <p className="mt-1.5 text-xs leading-snug text-neutral-400">
              Like the Integer Block it has no screen of its own: link its output to a Display Block to see 1 or 0, or to
              a logic gate. With a Keyboard or Keypad linked, type 1 / 0 (or T / F).
            </p>
            {!rt.powered && (
              <p className="mt-1.5 text-xs text-amber-200/90">
                The block is unpowered. The value is kept and will be sent once power returns.
              </p>
            )}
          </div>
        )}

        {module.type === 'integer' && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="integer-value" className="text-[13px] font-medium">
                Integer
              </label>
              <span className="text-xs text-neutral-400">whole numbers only</span>
            </div>
            <Stepper
              label="integer"
              onStep={(dir) => {
                // BigInt keeps all 18 digits exact while stepping
                const cur = isInteger(module.config.value) ? BigInt(module.config.value) : 0n;
                setText(module.id, (cur + BigInt(dir)).toString());
              }}
            >
              <input
                id="integer-value"
                ref={intInput}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={MAX_INTEGER_DIGITS + 1}
                value={module.config.value}
                onChange={(e) => setText(module.id, e.target.value)}
                placeholder="e.g. 42 or -7"
                spellCheck={false}
                aria-invalid={module.config.value !== '' && !isInteger(module.config.value)}
                className="w-full bg-transparent px-3 py-2 text-center font-mono text-[15px] text-neutral-50 outline-none placeholder:text-neutral-500"
              />
            </Stepper>
            <p className="mt-1.5 text-xs leading-snug text-neutral-400">
              Only digits and a leading minus sign are accepted; anything else is ignored. Like the Text Block it has
              no screen of its own: link its output to a Display Block to see the number.
            </p>
            {!rt.powered && (
              <p className="mt-1.5 text-xs text-amber-200/90">
                The block is unpowered. The number is kept and will be sent once power returns.
              </p>
            )}
          </div>
        )}

        {module.type === 'decimal' && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="decimal-value" className="text-[13px] font-medium">
                Decimal
              </label>
              <span className="text-xs text-neutral-400">
                {module.config.value.replace(/\D/g, '').length} digits · no limit
              </span>
            </div>
            <Stepper
              label="decimal"
              onStep={(dir) => {
                // BigDecimal keeps every digit exact while stepping (the number of decimals is kept)
                const cur = isDecimal(module.config.value) ? module.config.value : '0';
                setText(module.id, decimalOp.add(cur, dir > 0 ? '1' : '-1'));
              }}
            >
              <input
                id="decimal-value"
                ref={intInput}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={module.config.value}
                onChange={(e) => setText(module.id, e.target.value)}
                placeholder="e.g. 3.14 or -0.5"
                spellCheck={false}
                aria-invalid={module.config.value !== '' && !isDecimal(module.config.value)}
                className="w-full bg-transparent px-3 py-2 text-center font-mono text-[15px] text-neutral-50 outline-none placeholder:text-neutral-500"
              />
            </Stepper>
            <p className="mt-1.5 text-xs leading-snug text-neutral-400">
              Digits, one decimal point and a leading minus sign are accepted; anything else is ignored. The number is
              an arbitrary-precision decimal (BigDecimal) with as many digits as memory allows. Like the Integer Block
              it has no screen of its own: link its output to a Display Block to see the number.
            </p>
            {!rt.powered && (
              <p className="mt-1.5 text-xs text-amber-200/90">
                The block is unpowered. The number is kept and will be sent once power returns.
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
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Screen</span>
              <IconButton
                onClick={() => clearDisplay(module.id)}
                disabled={!rt.powered}
                aria-label="Clear display"
                className="h-8 bg-white/8"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Clear
              </IconButton>
            </div>
            <p className="text-xs leading-snug text-neutral-400">
              Clear blanks this screen only: the Text, Integer or Decimal Block feeding it keeps its data, and the screen
              shows it again as soon as that data changes. Lines wrap at word boundaries and the type size shrinks to fit. Text that still does not fit is
              clipped with an ellipsis.
            </p>
          </div>
        )}

        {(module.type === 'keyboard' || module.type === 'keypad') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Key pressure</span>
              <Segmented
                label="Key pressure"
                value={module.config.pressure}
                onChange={(v) => setKeyboardPressure(module.id, v)}
                options={KEY_PRESSURES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
              />
            </div>
            <p className="text-xs leading-snug text-neutral-400">
              {module.type === 'keypad'
                ? 'Press the keys on its LED screen (0–9 # * + . , and Backspace), or type those characters on your own keyboard while this block is selected. '
                : 'Press the keys on its LED screen, or type on your own keyboard while this block is selected. '}
              Touch and pen need that much force to register a key, and holding a key harder repeats it faster. A
              mouse always counts as a firm press.
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
                        {p.type === 'power' ? 'power' : p.type === 'keys' ? 'keys' : 'data'} · {p.direction === 'out' ? 'output' : 'input'}
                      </span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">This node {describeNode(p)}</p>
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
      </ScrollArea>

      <footer className="flex items-center justify-between border-t border-white/10 px-3 py-2">
        <IconButton onClick={() => rotateModule(module.id)} aria-label="Rotate block 90 degrees">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M13 8a5 5 0 1 1-1.8-3.8M13 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Rotate
          <kbd className="rounded bg-white/10 px-1.5 text-[11px] text-neutral-300">R</kbd>
        </IconButton>
        <IconButton onClick={() => removeModule(module.id)} aria-label={`Remove ${module.name}`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Remove
        </IconButton>
      </footer>
    </section>
  );
}
