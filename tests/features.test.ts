import { beforeEach, describe, expect, it } from 'vitest';
import { cablePath } from '../src/connections/cable';
import { resolveDrop } from '../src/interactions/drop';
import { MODULE_DEFINITIONS, createModule, sanitizeInteger } from '../src/modules/definitions';
import { footprint, obbOverlap, portWorld } from '../src/modules/spatial';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import { useStore } from '../src/state/store';
import type { Workspace } from '../src/types';

const textOf = (id: string) => {
  const m = useStore.getState().workspace.modules.find((x) => x.id === id)!;
  return 'value' in m.config ? m.config.value : undefined;
};
const screenOf = (id: string) => useStore.getState().runtime.modules[id].screen;

describe('Integer block', () => {
  it('sanitises to a whole number', () => {
    expect(sanitizeInteger('abc123')).toBe('123');
    expect(sanitizeInteger('12.5')).toBe('125');
    expect(sanitizeInteger('-42')).toBe('-42');
    expect(sanitizeInteger('4-2')).toBe('42');
    expect(sanitizeInteger('+7 ')).toBe('7');
    expect(sanitizeInteger('007')).toBe('7');
    expect(sanitizeInteger('0')).toBe('0');
    expect(sanitizeInteger('-')).toBe('-');
    expect(sanitizeInteger('x')).toBe('');
  });

  it('has the same size and connectors as a Text Block', () => {
    const t = MODULE_DEFINITIONS.text;
    const i = MODULE_DEFINITIONS.integer;
    expect([i.width, i.depth]).toEqual([t.width, t.depth]);
    // same connectors in the same places; only the kind of data the output sends differs (integer vs text)
    const strip = (ports: typeof t.ports) => ports.map(({ kinds: _k, ...rest }) => rest);
    expect(strip(i.ports)).toEqual(strip(t.ports));
  });
});

describe('clear buttons (Text / Integer vs Display)', () => {
  beforeEach(() => {
    useStore.getState().resetWorkspace();
  });

  it('X on the Text Block empties the block and therefore the display', () => {
    const s = useStore.getState();
    expect(screenOf('display-1').kind).toBe('text');
    s.pressButton('text-1', 'clear');
    expect(textOf('text-1')).toBe('');
    expect(screenOf('display-1').kind).toBe('empty');
  });

  it('X on the Display clears only the display and the Text Block keeps its data', () => {
    const s = useStore.getState();
    const before = textOf('text-1');
    expect(before).toBeTruthy();
    s.pressButton('display-1', 'clear');
    expect(textOf('text-1')).toBe(before);
    expect(screenOf('display-1').kind).toBe('cleared');
    expect(useStore.getState().runtime.modules['text-1'].screen.kind).toBe('text');
  });

  it('a cleared display shows live data again when the text changes', () => {
    const s = useStore.getState();
    s.pressButton('display-1', 'clear');
    expect(screenOf('display-1').kind).toBe('cleared');
    s.setText('text-1', 'New text');
    expect(screenOf('display-1')).toEqual({ kind: 'text', text: 'New text' });
  });

  it('a cleared display stays cleared when unrelated things change', () => {
    const s = useStore.getState();
    s.pressButton('display-1', 'clear');
    s.setAlign('display-1', 'left');
    s.moveModule('text-1', { x: -6, z: 5 });
    expect(screenOf('display-1').kind).toBe('cleared');
  });

  it('works the same for the Integer Block', () => {
    const s = useStore.getState();
    s.addModule('integer');
    const ws = useStore.getState().workspace;
    const int = ws.modules.find((m) => m.type === 'integer')!;
    // free the display's text input, then feed it from the integer block
    s.disconnect('link:text-1.data-out->display-1.data-in');
    s.linkModules(int.id, 'display-1', 'text');
    expect(textOf(int.id)).toBe('42');
    expect(screenOf('display-1')).toEqual({ kind: 'text', text: '42' });

    s.pressButton('display-1', 'clear');
    expect(textOf(int.id)).toBe('42');
    expect(screenOf('display-1').kind).toBe('cleared');

    s.setText(int.id, '7');
    expect(screenOf('display-1')).toEqual({ kind: 'text', text: '7' });

    s.pressButton(int.id, 'clear');
    expect(textOf(int.id)).toBe('');
    expect(screenOf('display-1').kind).toBe('empty');
  });

  it('the Integer Block rejects non-integers, including typed keys', () => {
    const s = useStore.getState();
    s.addModule('integer');
    const int = useStore.getState().workspace.modules.find((m) => m.type === 'integer')!;
    s.setText(int.id, '42a');
    expect(textOf(int.id)).toBe('42');
    s.setText(int.id, '12a3');
    expect(textOf(int.id)).toBe('123');
    s.setText(int.id, '-9');
    expect(textOf(int.id)).toBe('-9');
    // a lone minus sign is not sent as a value yet
    s.setText(int.id, '-');
    s.disconnect('link:text-1.data-out->display-1.data-in');
    s.linkModules(int.id, 'display-1', 'text');
    expect(screenOf('display-1').kind).toBe('empty');
  });
});

describe('library drop', () => {
  const ws: Workspace = createDefaultWorkspace();

  it('puts the block where it is dropped, clear of other blocks', () => {
    const { position } = resolveDrop(ws, 'integer', { x: 8, z: 8 }, true);
    expect(Math.abs(position.x - 8)).toBeLessThan(0.3);
    expect(Math.abs(position.z - 8)).toBeLessThan(0.3);
  });

  it('never overlaps an existing block, even when dropped on one', () => {
    const display = ws.modules.find((m) => m.id === 'display-1')!;
    const { position, rotation } = resolveDrop(ws, 'text', display.position, true);
    const dropped = createModule('text', 'd', position, rotation);
    for (const m of ws.modules) expect(obbOverlap(footprint(dropped, 0), footprint(m, 0))).toBe(false);
  });

  it('addModule(type, at) adds the block at that spot', () => {
    useStore.getState().resetWorkspace();
    useStore.getState().addModule('keypad', { x: 9, z: 9 });
    const kp = useStore.getState().workspace.modules.find((m) => m.type === 'keypad')!;
    expect(Math.hypot(kp.position.x - 9, kp.position.z - 9)).toBeLessThan(0.5);
  });
});

describe('evaluate with integers', () => {
  it('an unpowered integer block sends nothing', () => {
    const ws = createDefaultWorkspace();
    ws.modules.push(createModule('integer', 'int', { x: 9, z: 9 }));
    const rt = evaluateWorkspace(ws);
    expect(rt.modules['int'].state).toBe('unpowered');
  });
});

describe('natural cable curves', () => {
  it('bends gently: no sharp left / right turns when routed round blocks', () => {
    const ws = createDefaultWorkspace();
    const kb = createModule('keyboard', 'kb', { x: -0.5, z: 3.5 }, 0);
    ws.modules.push(kb);
    const port = (id: string, pid: string) => {
      const m = ws.modules.find((x) => x.id === id)!;
      return portWorld(m, MODULE_DEFINITIONS[m.type].ports.find((p) => p.id === pid)!);
    };
    const ends = (p: ReturnType<typeof port>) => ({ ...p, x: p.x + p.nx * 0.126, z: p.z + p.nz * 0.126 });
    const pts = cablePath(ends(port('power-1', 'power-out-d')), ends(port('kb', 'power-in')), ws.modules.map((m) => footprint(m, 0)));
    let tightest = Infinity;
    for (let i = 1; i < pts.length - 1; i++) {
      const v0 = [pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]];
      const v1 = [pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2]];
      const l0 = Math.hypot(v0[0], v0[1]);
      const l1 = Math.hypot(v1[0], v1[1]);
      if (l0 < 1e-6 || l1 < 1e-6) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (v0[0] * v1[0] + v0[1] * v1[1]) / (l0 * l1))));
      if (ang > 1e-6) tightest = Math.min(tightest, (l0 + l1) / 2 / ang);
    }
    expect(tightest).toBeGreaterThan(0.15);
  });
});
