import { beforeEach, describe, expect, it } from 'vitest';
import { MODULE_DEFINITIONS, createModule } from '../src/modules/definitions';
import { serializeWorkspace } from '../src/persistence/workspace';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import { useStore } from '../src/state/store';
import type { ModuleType, Workspace } from '../src/types';

const st = () => useStore.getState();
const valueOf = (id: string) => (st().workspace.modules.find((m) => m.id === id)!.config as { value: string }).value;
const screenOf = (id: string) => st().runtime.modules[id].screen;

const link = (ws: Workspace, from: string, fp: string, to: string, tp: string, type: 'text' | 'power') =>
  ws.connections.push({ id: `link:${from}.${fp}->${to}.${tp}`, type, from: { moduleId: from, portId: fp }, to: { moduleId: to, portId: tp } } as never);

/** 8 (A) + 2 (B) -> ADD -> Display D (everything powered), loaded into the store. */
function loadAdderCircuit() {
  const ws = createDefaultWorkspace();
  ws.connections = [];
  ws.modules = ws.modules.filter((m) => m.type === 'power');
  const power = ws.modules[0];
  const ports = ['power-out-a', 'power-out-b', 'power-out-e', 'power-out-f'];
  const mk = (type: ModuleType, id: string, x: number, value?: string) => {
    const m = createModule(type, id, { x, z: 0 });
    if (value !== undefined) (m as { config: { value: string } }).config.value = value;
    ws.modules.push(m);
    link(ws, power.id, ports.shift()!, id, 'power-in', 'power');
  };
  mk('integer', 'A', 10, '8');
  mk('integer', 'B', 20, '2');
  mk('adder', 'ADD', 30);
  mk('display', 'D', 40);
  link(ws, 'A', 'data-out', 'ADD', 'data-in', 'text');
  link(ws, 'B', 'data-out', 'ADD', 'data-in-2', 'text');
  link(ws, 'ADD', 'data-out', 'D', 'data-in', 'text');
  expect(st().importJson(serializeWorkspace(ws))).toBe(true);
}

describe('two output pins on Text and operator blocks', () => {
  it('Text Block, Integer Block and every operator have two east outputs', () => {
    for (const t of ['text', 'integer', 'adder', 'subtractor', 'multiplier', 'divisor'] as const) {
      const outs = MODULE_DEFINITIONS[t].ports.filter((p) => p.direction === 'out');
      expect(outs.map((p) => p.id)).toEqual(['data-out', 'data-out-2']);
      expect(outs.every((p) => p.normal.x === 1 && p.normal.z === 0 && p.local.x === MODULE_DEFINITIONS[t].width / 2)).toBe(true);
      expect(outs[0].capacity).toBe(1);
      expect(outs[1].capacity).toBe(1);
    }
  });

  it('keeps both plugs clear of each other and of the rounded corner', () => {
    const def = MODULE_DEFINITIONS.text;
    const [a, b] = def.ports.filter((p) => p.direction === 'out');
    expect(b.local.z - a.local.z - 0.48).toBeGreaterThan(0.15);
    expect(def.depth / 2 - 0.17 - (b.local.z + 0.24)).toBeGreaterThan(0.05);
  });

  it('a Text Block can feed two displays, one per pin', () => {
    st().resetWorkspace();
    st().addModule('display');
    const second = st().workspace.modules.filter((m) => m.type === 'display').find((m) => m.id !== 'display-1')!;
    const res = st().connect({ moduleId: 'text-1', portId: 'data-out-2' }, { moduleId: second.id, portId: 'data-in' });
    expect(res.ok).toBe(true);
    // each pin still holds exactly one wire
    const again = st().connect({ moduleId: 'text-1', portId: 'data-out-2' }, { moduleId: 'display-1', portId: 'data-in' });
    expect(again.ok).toBe(false);
  });

  it('an operator can feed two blocks, one per pin', () => {
    loadAdderCircuit();
    st().addModule('display');
    const second = st().workspace.modules.filter((m) => m.type === 'display').find((m) => m.id !== 'D')!;
    expect(st().connect({ moduleId: 'ADD', portId: 'data-out-2' }, { moduleId: second.id, portId: 'data-in' }).ok).toBe(true);
  });
});

describe('Text / Integer Block Undo', () => {
  beforeEach(() => st().resetWorkspace());

  it('undoes a change back to the previous value, one change at a time', () => {
    st().addModule('integer');
    const id = st().workspace.modules.find((m) => m.type === 'integer')!.id;
    st().setText(id, '8');
    st().setText(id, '10');
    st().pressButton(id, 'undo');
    expect(valueOf(id)).toBe('8');
    st().pressButton(id, 'undo');
    expect(valueOf(id)).toBe('42');
    st().pressButton(id, 'undo'); // nothing left
    expect(valueOf(id)).toBe('42');
  });

  it('undoes a clear on the Text Block and does not restore sample text', () => {
    st().setText('text-1', 'Hello');
    st().pressButton('text-1', 'clear');
    expect(valueOf('text-1')).toBe('');
    st().pressButton('text-1', 'undo');
    expect(valueOf('text-1')).toBe('Hello');
    st().pressButton('text-1', 'undo');
    expect(valueOf('text-1')).toBe('Hello, Nicque');
    st().setText('text-1', 'abc');
    st().pressButton('text-1', 'undo');
    expect(valueOf('text-1')).toBe('Hello, Nicque');
  });

  it('has no edit button action any more', () => {
    const before = st().workspace;
    st().pressButton('text-1', 'edit');
    expect(st().workspace).toBe(before);
  });
});

describe('operator Clear / Undo', () => {
  beforeEach(() => loadAdderCircuit());

  it('computes 8 + 2 = 10 to begin with', () => {
    expect(screenOf('D')).toEqual({ kind: 'text', text: '10' });
  });

  it('Clear blanks the operator result only; the Integer Blocks keep their values', () => {
    st().pressButton('ADD', 'clear');
    expect(valueOf('A')).toBe('8');
    expect(valueOf('B')).toBe('2');
    expect(screenOf('D').kind).toBe('empty');
    expect(st().runtime.modules['ADD'].summary).toBe('Cleared');
  });

  it('Undo brings the cleared result back', () => {
    st().pressButton('ADD', 'clear');
    st().pressButton('ADD', 'undo');
    expect(screenOf('D')).toEqual({ kind: 'text', text: '10' });
    expect(valueOf('A')).toBe('8');
  });

  it('a cleared operator computes live again once an operand changes', () => {
    st().pressButton('ADD', 'clear');
    st().setText('A', '20');
    expect(screenOf('D')).toEqual({ kind: 'text', text: '22' });
  });

  it('stays cleared when unrelated things change, and survives save / load', () => {
    st().pressButton('ADD', 'clear');
    st().moveModule('ADD', { x: 31, z: 3 });
    expect(screenOf('D').kind).toBe('empty');
    expect(st().importJson(st().exportJson())).toBe(true);
    expect(screenOf('D').kind).toBe('empty');
  });

  it('Undo with nothing to undo changes nothing', () => {
    const before = st().workspace;
    st().pressButton('ADD', 'undo');
    expect(st().workspace).toBe(before);
  });

  it('the Integer Blocks feeding an operator still undo their own changes', () => {
    st().setText('A', '9');
    st().pressButton('A', 'undo');
    expect(valueOf('A')).toBe('8');
    expect(screenOf('D')).toEqual({ kind: 'text', text: '10' });
  });
});
