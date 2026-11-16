import { describe, expect, it } from 'vitest';
import { createModule } from '../src/modules/definitions';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import type { ModuleType, Workspace } from '../src/types';

const link = (ws: Workspace, from: string, fp: string, to: string, tp: string, type: 'text' | 'power') =>
  ws.connections.push({ id: `link:${from}.${fp}->${to}.${tp}`, type, from: { moduleId: from, portId: fp }, to: { moduleId: to, portId: tp } } as never);

/** A (int or text) op B -> Display, everything powered. */
function circuit(op: ModuleType, a: { type: 'integer' | 'text'; v: string }, b: { type: 'integer' | 'text'; v: string }) {
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
  mk(b.type, 'B', 20, b.v);
  mk(op, 'OP', 30);
  mk('display', 'D', 40);
  link(ws, 'A', 'data-out', 'OP', 'data-in', 'text');
  link(ws, 'B', 'data-out', 'OP', 'data-in-2', 'text');
  link(ws, 'OP', 'data-out', 'D', 'data-in', 'text');
  return evaluateWorkspace(ws).modules['D'].screen;
}

const int = (v: string) => ({ type: 'integer' as const, v });
const txt = (v: string) => ({ type: 'text' as const, v });

describe('operator evaluation', () => {
  it('777 + 171 shows 948', () => {
    expect(circuit('adder', int('777'), int('171'))).toEqual({ kind: 'text', text: '948' });
  });
  it('subtracts, multiplies and divides integers', () => {
    expect(circuit('subtractor', int('5'), int('12'))).toEqual({ kind: 'text', text: '-7' });
    expect(circuit('multiplier', int('12'), int('-3'))).toEqual({ kind: 'text', text: '-36' });
    expect(circuit('divisor', int('7'), int('2'))).toEqual({ kind: 'text', text: '3' });
  });
  it('divide by zero is unavailable', () => {
    expect(circuit('divisor', int('7'), int('0'))).toEqual({ kind: 'source-off' });
  });
  it('adds text and repeats text', () => {
    expect(circuit('adder', txt('Hi '), txt('there'))).toEqual({ kind: 'text', text: 'Hi there' });
    expect(circuit('adder', txt('n='), int('4'))).toEqual({ kind: 'text', text: 'n=4' });
    expect(circuit('multiplier', txt('ab'), int('3'))).toEqual({ kind: 'text', text: 'ababab' });
  });
});
