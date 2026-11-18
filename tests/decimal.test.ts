import { beforeEach, describe, expect, it } from 'vitest';
import { decimalOp, divDecimal, formatDecimal, isDecimal, parseDecimal, sanitizeDecimal } from '../src/modules/bigDecimal';
import { validateConnection } from '../src/connections/validate';
import { MODULE_DEFINITIONS, createModule } from '../src/modules/definitions';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import { useStore } from '../src/state/store';
import type { ModuleType, Workspace } from '../src/types';

describe('BigDecimal', () => {
  it('parses and formats without losing a digit or the scale', () => {
    for (const s of ['0', '5', '-5', '3.14', '-0.5', '2.50', '0.000', '123456789012345678901234567890.123456789012345678901234567890']) {
      expect(formatDecimal(parseDecimal(s))).toBe(s.replace('-0.000', '0.000'));
    }
  });

  it('adds, subtracts and multiplies exactly (no floating point error)', () => {
    expect(decimalOp.add('0.1', '0.2')).toBe('0.3');
    expect(decimalOp.sub('1', '0.9')).toBe('0.1');
    expect(decimalOp.mul('1.5', '-2.25')).toBe('-3.375');
    expect(decimalOp.add('2.5', '2.5')).toBe('5.0');
    expect(decimalOp.sub('0.5', '1')).toBe('-0.5');
  });

  it('has no digit limit', () => {
    const big = '9'.repeat(5000) + '.' + '1'.repeat(5000);
    const sum = decimalOp.add(big, '0.' + '0'.repeat(4999) + '9');
    expect(sum.length).toBe(big.length);
    expect(sum.endsWith('1'.repeat(4998) + '20')).toBe(true);
    expect(decimalOp.mul(big, '1')).toBe(big);
  });

  it('divides exactly when the quotient terminates and truncates after 100 digits otherwise', () => {
    expect(decimalOp.div('1', '4')).toBe('0.25');
    expect(decimalOp.div('10', '4')).toBe('2.5');
    expect(decimalOp.div('-7.5', '2.5')).toBe('-3');
    expect(decimalOp.div('1', '3')).toBe('0.' + '3'.repeat(100));
    expect(decimalOp.div('-2', '3')).toBe('-0.' + '6'.repeat(100));
    expect(decimalOp.div('1', '0')).toBeNull();
    expect(divDecimal(parseDecimal('1'), parseDecimal('0.0'))).toBeNull();
    // tiny quotients keep their significant digits
    expect(decimalOp.div('1', '1' + '0'.repeat(200))).toBe('0.' + '0'.repeat(199) + '1');
  });

  it('sanitises typing: digits, one point, leading minus, no leading zeros', () => {
    expect(sanitizeDecimal('3.14')).toBe('3.14');
    expect(sanitizeDecimal('.')).toBe('0.');
    expect(sanitizeDecimal('.5')).toBe('0.5');
    expect(sanitizeDecimal('-')).toBe('-');
    expect(sanitizeDecimal('-.5')).toBe('-0.5');
    expect(sanitizeDecimal('007')).toBe('7');
    expect(sanitizeDecimal('0.50')).toBe('0.50');
    expect(sanitizeDecimal('1.2.3')).toBe('1.23');
    expect(sanitizeDecimal('a1,b2-3')).toBe('123');
    expect(sanitizeDecimal('1'.repeat(3000))).toHaveLength(3000);
    expect(isDecimal('5.')).toBe(false);
    expect(isDecimal('-')).toBe(false);
    expect(isDecimal('-5.25')).toBe(true);
  });
});

describe('Decimal Block', () => {
  it('has the same size and connectors as the Integer Block', () => {
    const i = MODULE_DEFINITIONS.integer;
    const d = MODULE_DEFINITIONS.decimal;
    expect([d.width, d.depth]).toEqual([i.width, i.depth]);
    const strip = (ports: typeof i.ports) => ports.map(({ kinds: _k, ...rest }) => rest);
    expect(strip(d.ports)).toEqual(strip(i.ports));
    expect(d.ports.filter((p) => p.direction === 'out' && p.type === 'text').map((p) => p.id)).toEqual(['data-out', 'data-out-2']);
    expect(d.ports.filter((p) => p.type === 'keys').map((p) => p.id)).toEqual(['key-in', 'key-in-2']);
    expect(d.ports.find((p) => p.id === 'data-out')!.kinds).toEqual(['decimal']);
  });

  describe('in the store', () => {
    beforeEach(() => useStore.getState().resetWorkspace());

    it('only holds decimals, with unlimited digits, and has undo / clear', () => {
      const s = useStore.getState();
      s.addModule('decimal');
      const get = () => useStore.getState().workspace.modules.find((m) => m.type === 'decimal')!;
      const id = get().id;
      expect((get().config as { value: string }).value).toBe('3.14');
      s.setText(id, 'abc-12.5x');
      expect((get().config as { value: string }).value).toBe('12.5');
      const long = '7'.repeat(10000) + '.' + '3'.repeat(10000);
      useStore.getState().setText(id, long);
      expect((get().config as { value: string }).value).toBe(long);
      useStore.getState().undoBlock(id);
      expect((get().config as { value: string }).value).toBe('12.5');
      useStore.getState().setText(id, '');
      expect((get().config as { value: string }).value).toBe('');
    });
  });
});

const link = (ws: Workspace, from: string, fp: string, to: string, tp: string, type: 'text' | 'power') =>
  ws.connections.push({ id: `link:${from}.${fp}->${to}.${tp}`, type, from: { moduleId: from, portId: fp }, to: { moduleId: to, portId: tp } } as never);

type Src = { type: 'integer' | 'decimal' | 'text'; v: string };
function circuit(op: ModuleType | null, a: Src, b?: Src) {
  const ws = createDefaultWorkspace();
  ws.connections = ws.connections.filter((c) => c.type === 'power');
  ws.modules = ws.modules.filter((m) => m.type === 'power');
  const power = ws.modules[0];
  const ports = ['power-out-a', 'power-out-b', 'power-out-e', 'power-out-f'];
  const mk = (type: ModuleType, id: string, x: number, cfg?: string) => {
    const m = createModule(type, id, { x, z: 0 });
    if (cfg !== undefined) (m as { config: { value: string } }).config.value = cfg;
    ws.modules.push(m);
    link(ws, power.id, ports.shift()!, id, 'power-in', 'power');
    return m;
  };
  mk(a.type, 'A', 10, a.v);
  if (op && b) {
    mk(b.type, 'B', 20, b.v);
    mk(op, 'OP', 30);
    mk('display', 'D', 40);
    link(ws, 'A', 'data-out', 'OP', 'data-in', 'text');
    link(ws, 'B', 'data-out', 'OP', 'data-in-2', 'text');
    link(ws, 'OP', 'data-out', 'D', 'data-in', 'text');
  } else {
    mk('display', 'D', 40);
    link(ws, 'A', 'data-out', 'D', 'data-in', 'text');
  }
  return { ws, rt: evaluateWorkspace(ws) };
}
const dec = (v: string): Src => ({ type: 'decimal', v });
const int = (v: string): Src => ({ type: 'integer', v });
const txt = (v: string): Src => ({ type: 'text', v });
const shown = (c: ReturnType<typeof circuit>) => c.rt.modules['D'].screen;

describe('Decimal Block in the runtime', () => {
  it('shows its number on a Display, through either output pin', () => {
    expect(shown(circuit(null, dec('3.14')))).toEqual({ kind: 'text', text: '3.14' });
    const c = circuit(null, dec('2.5'));
    const out2 = c.ws.connections.find((x) => x.type === 'text')!;
    out2.from.portId = 'data-out-2';
    out2.id = 'link:A.data-out-2->D.data-in';
    expect(evaluateWorkspace(c.ws).modules['D'].screen).toEqual({ kind: 'text', text: '2.5' });
  });

  it('sends nothing until the number is complete, or while unpowered', () => {
    expect(shown(circuit(null, dec('5.')))).toEqual({ kind: 'empty' });
    expect(shown(circuit(null, dec('-')))).toEqual({ kind: 'empty' });
    const c = circuit(null, dec('1.5'));
    c.ws.modules.find((m) => m.id === 'A')!.switchedOff = true;
    expect(evaluateWorkspace(c.ws).modules['D'].screen.kind).toBe('source-off');
  });

  it('all four operators calculate with BigDecimals', () => {
    expect(shown(circuit('adder', dec('0.1'), dec('0.2')))).toEqual({ kind: 'text', text: '0.3' });
    expect(shown(circuit('subtractor', dec('1'), dec('0.9')))).toEqual({ kind: 'text', text: '0.1' });
    expect(shown(circuit('multiplier', dec('1.5'), int('4')))).toEqual({ kind: 'text', text: '6.0' });
    expect(shown(circuit('divisor', dec('1'), dec('4')))).toEqual({ kind: 'text', text: '0.25' });
    expect(shown(circuit('divisor', int('1'), dec('4')))).toEqual({ kind: 'text', text: '0.25' });
    expect(shown(circuit('divisor', dec('1'), dec('0')))).toEqual({ kind: 'source-off' });
  });

  it('keeps integer-only maths unchanged (integer ÷ integer still truncates)', () => {
    expect(shown(circuit('divisor', int('7'), int('2')))).toEqual({ kind: 'text', text: '3' });
    expect(shown(circuit('adder', int('777'), int('171')))).toEqual({ kind: 'text', text: '948' });
  });

  it('adds digit-for-digit with very long numbers', () => {
    const a = '1'.repeat(3000) + '.' + '2'.repeat(3000);
    const r = shown(circuit('adder', dec(a), dec(a)));
    expect(r.kind).toBe('text');
    expect((r as { text: string }).text).toBe('2'.repeat(3000) + '.' + '4'.repeat(3000));
  });

  it('joins text with a decimal on the Adder, refuses text × decimal on the Multiplier', () => {
    expect(shown(circuit('adder', txt('pi='), dec('3.14')))).toEqual({ kind: 'text', text: 'pi=3.14' });
    const c = circuit('multiplier', txt('ab'), int('3'));
    expect(shown(c)).toEqual({ kind: 'text', text: 'ababab' });
    const ws = createDefaultWorkspace();
    ws.modules.push(createModule('text', 't', { x: 50, z: 0 }), createModule('decimal', 'd', { x: 60, z: 0 }), createModule('multiplier', 'm', { x: 70, z: 0 }));
    const first = validateConnection(ws, { moduleId: 't', portId: 'data-out' }, { moduleId: 'm', portId: 'data-in' });
    expect(first.ok).toBe(true);
    if (first.ok) ws.connections.push(first.connection);
    const second = validateConnection(ws, { moduleId: 'd', portId: 'data-out' }, { moduleId: 'm', portId: 'data-in-2' });
    expect(second.ok).toBe(false);
  });

  it('is accepted by Displays and every operator, and by a Keypad / Keyboard link', () => {
    const ws = createDefaultWorkspace();
    ws.modules.push(createModule('decimal', 'd', { x: 50, z: 0 }), createModule('keypad', 'k', { x: 60, z: 0 }));
    for (const op of ['adder', 'subtractor', 'multiplier', 'divisor'] as const) {
      const w2: Workspace = { ...ws, modules: [...ws.modules, createModule(op, 'o', { x: 70, z: 0 })], connections: [] };
      expect(validateConnection(w2, { moduleId: 'd', portId: 'data-out' }, { moduleId: 'o', portId: 'data-in' }).ok).toBe(true);
    }
    expect(validateConnection({ ...ws, connections: [] }, { moduleId: 'k', portId: 'key-out' }, { moduleId: 'd', portId: 'key-in' }).ok).toBe(true);
  });
});
