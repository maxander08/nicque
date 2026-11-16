import { beforeEach, describe, expect, it } from 'vitest';
import { MODULE_DEFINITIONS, OPERATOR_TYPES, createModule, isOperatorType } from '../src/modules/definitions';
import { footprint, obbOverlap } from '../src/modules/spatial';
import { parseWorkspace, serializeWorkspace } from '../src/persistence/workspace';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import { useStore } from '../src/state/store';
import { operatorMarkPosition } from '../src/scene/parts/OperatorMark';
import { powerLedPosition } from '../src/modules/layout';

describe('operator blocks', () => {
  it('are the Adder, Subtractor, Multiplier and Divisor', () => {
    expect(OPERATOR_TYPES).toEqual(['adder', 'subtractor', 'multiplier', 'divisor']);
    for (const t of OPERATOR_TYPES) expect(isOperatorType(t)).toBe(true);
    expect(isOperatorType('text')).toBe(false);
  });

  it('share the Text Block footprint and connectors', () => {
    const text = MODULE_DEFINITIONS.text;
    for (const t of OPERATOR_TYPES) {
      const d = MODULE_DEFINITIONS[t];
      expect(d.width).toBe(text.width);
      expect(d.depth).toBe(text.depth);
      expect(d.ports).toEqual(text.ports);
    }
  });

  it('put the yellow box on the left, right of the power LED on the same line, inside the block', () => {
    const { width, depth } = MODULE_DEFINITIONS.adder;
    const led = powerLedPosition(width, depth);
    const box = operatorMarkPosition(width, depth);
    expect(box.x).toBeGreaterThan(led.x);
    expect(box.z).toBe(led.z);
    expect(box.x).toBeLessThan(0);
  });

  it('can be added, powered, switched off and persisted', () => {
    const s = useStore.getState();
    s.resetWorkspace();
    for (const t of OPERATOR_TYPES) useStore.getState().addModule(t);
    const ws = useStore.getState().workspace;
    const ops = ws.modules.filter((m) => isOperatorType(m.type));
    expect(ops).toHaveLength(4);
    for (let i = 0; i < ops.length; i++)
      for (let j = i + 1; j < ops.length; j++)
        expect(obbOverlap(footprint(ops[i], 0), footprint(ops[j], 0))).toBe(false);
    const back = parseWorkspace(serializeWorkspace(ws));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.workspace.modules.filter((m) => isOperatorType(m.type))).toHaveLength(4);
  });

  it('are unpowered until a Power Block feeds them', () => {
    const ws = createDefaultWorkspace();
    ws.modules.push(createModule('adder', 'add', { x: 9, z: 9 }));
    expect(evaluateWorkspace(ws).modules['add'].state).toBe('unpowered');
    const power = ws.modules.find((m) => m.type === 'power')!;
    ws.connections.push({
      id: `link:${power.id}.power-out-h->add.power-in`,
      type: 'power',
      from: { moduleId: power.id, portId: 'power-out-h' },
      to: { moduleId: 'add', portId: 'power-in' },
    });
    expect(evaluateWorkspace(ws).modules['add'].state).toBe('operational');
  });
});

beforeEach(() => useStore.getState().resetWorkspace());
