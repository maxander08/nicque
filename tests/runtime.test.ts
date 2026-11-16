import { describe, expect, it } from 'vitest';
import { connectionId, validateConnection } from '../src/connections/validate';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import type { Workspace } from '../src/types';

const ws = (): Workspace => createDefaultWorkspace();
const setText = (w: Workspace, value: string): Workspace => ({
  ...w,
  modules: w.modules.map((m) => (m.id === 'text-1' ? { ...m, config: { value } } : m)) as Workspace['modules'],
});
const setPower = (w: Workspace, enabled: boolean): Workspace => ({
  ...w,
  modules: w.modules.map((m) => (m.id === 'power-1' ? { ...m, config: { enabled } } : m)) as Workspace['modules'],
});
const without = (w: Workspace, from: string, to: string): Workspace => ({
  ...w,
  connections: w.connections.filter((c) => !(c.from.moduleId === from && c.to.moduleId === to)),
});

describe('default workspace layout', () => {
  it('places Power above Text (left) and Display (right)', () => {
    const w = ws();
    const p = w.modules.find((m) => m.id === 'power-1')!.position;
    const t = w.modules.find((m) => m.id === 'text-1')!.position;
    const d = w.modules.find((m) => m.id === 'display-1')!.position;
    expect(p.z).toBeLessThan(t.z); // smaller z is "up" in the default view
    expect(p.z).toBeLessThan(d.z);
    expect(t.x).toBeLessThan(d.x);
    expect(t.z).toBeGreaterThan(d.z); // the shallower Text Block shares the Display's bottom edge
  });

  it('contains exactly the required topology with valid links', () => {
    const w = ws();
    expect(w.connections).toHaveLength(3);
    expect(w.connections.filter((c) => c.type === 'power')).toHaveLength(2);
    const data = w.connections.find((c) => c.type === 'text')!;
    expect(data.from.moduleId).toBe('text-1');
    expect(data.to.moduleId).toBe('display-1');
  });
});

describe('runtime', () => {
  it('is fully operational by default and shows the text', () => {
    const rt = evaluateWorkspace(ws());
    expect(rt.systemOk).toBe(true);
    expect(rt.modules['display-1'].screen).toEqual({ kind: 'text', text: 'Hello, Nicque' });
  });

  it('propagates edited text immediately', () => {
    const rt = evaluateWorkspace(setText(ws(), 'Line 1\nLine 2 ✓ 日本語'));
    expect(rt.modules['display-1'].screen).toEqual({ kind: 'text', text: 'Line 1\nLine 2 ✓ 日本語' });
  });

  it('stops both dependants when power is off and recovers when restored', () => {
    const off = evaluateWorkspace(setPower(ws(), false));
    expect(off.modules['power-1'].state).toBe('off');
    expect(off.modules['text-1'].state).toBe('unpowered');
    expect(off.modules['display-1'].state).toBe('unpowered');
    expect(off.modules['display-1'].screen).toEqual({ kind: 'off' });
    const on = evaluateWorkspace(setPower(setPower(ws(), false), true));
    expect(on.systemOk).toBe(true);
  });

  it('reports a missing data link and recovers on reconnect with the latest text', () => {
    const base = setText(ws(), 'latest');
    const cut = evaluateWorkspace(without(base, 'text-1', 'display-1'));
    expect(cut.modules['display-1'].state).toBe('waiting');
    expect(cut.modules['display-1'].screen).toEqual({ kind: 'no-source' });
    expect(cut.modules['text-1'].state).toBe('operational');
    const restored = evaluateWorkspace(base);
    expect(restored.modules['display-1'].screen).toEqual({ kind: 'text', text: 'latest' });
  });

  it('deactivates a block whose power link is removed', () => {
    const rt = evaluateWorkspace(without(ws(), 'power-1', 'text-1'));
    expect(rt.modules['text-1'].state).toBe('unpowered');
    // an unpowered Text Block cannot feed the display
    expect(rt.modules['display-1'].state).toBe('waiting');
    expect(rt.modules['display-1'].screen).toEqual({ kind: 'source-off' });
    const rt2 = evaluateWorkspace(without(ws(), 'power-1', 'display-1'));
    expect(rt2.modules['display-1'].state).toBe('unpowered');
    expect(rt2.modules['text-1'].state).toBe('operational');
  });

  it('handles empty text explicitly', () => {
    const rt = evaluateWorkspace(setText(ws(), ''));
    expect(rt.modules['text-1'].screen).toEqual({ kind: 'empty' });
    expect(rt.modules['display-1'].screen).toEqual({ kind: 'empty' });
  });

  it('ignores dangling connections instead of crashing', () => {
    const w = ws();
    w.connections.push({
      id: 'bogus',
      type: 'text',
      from: { moduleId: 'ghost', portId: 'data-out' },
      to: { moduleId: 'display-1', portId: 'data-in' },
    });
    const rt = evaluateWorkspace(w);
    expect(rt.connections['bogus'].valid).toBe(false);
    expect(rt.issues.length).toBeGreaterThan(0);
  });

  it('does not mutate its input', () => {
    const w = ws();
    const snapshot = JSON.stringify(w);
    evaluateWorkspace(w);
    expect(JSON.stringify(w)).toBe(snapshot);
  });
});

describe('connection validation', () => {
  const empty = (): Workspace => ({ ...ws(), connections: [] });

  it('accepts power → power-in and text → text-in, in either drag direction', () => {
    const w = empty();
    const a = validateConnection(w, { moduleId: 'power-1', portId: 'power-out-a' }, { moduleId: 'text-1', portId: 'power-in' });
    const b = validateConnection(w, { moduleId: 'display-1', portId: 'data-in' }, { moduleId: 'text-1', portId: 'data-out' });
    expect(a.ok && b.ok).toBe(true);
    if (b.ok) {
      expect(b.connection.from.moduleId).toBe('text-1');
      expect(b.connection.id).toBe(connectionId(b.connection.from, b.connection.to));
    }
  });

  it('rejects power into a text input (Display cannot be fed by the Power Block)', () => {
    const r = validateConnection(empty(), { moduleId: 'power-1', portId: 'power-out-a' }, { moduleId: 'display-1', portId: 'data-in' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('type-mismatch');
  });

  it('rejects output↔output, input↔input, self links, duplicates and occupied inputs', () => {
    const w = ws();
    const codes = [
      validateConnection(w, { moduleId: 'power-1', portId: 'power-out-a' }, { moduleId: 'power-1', portId: 'power-out-b' }),
      validateConnection(w, { moduleId: 'text-1', portId: 'power-in' }, { moduleId: 'display-1', portId: 'power-in' }),
      validateConnection(w, { moduleId: 'text-1', portId: 'power-in' }, { moduleId: 'text-1', portId: 'data-out' }),
      validateConnection(w, { moduleId: 'text-1', portId: 'data-out' }, { moduleId: 'display-1', portId: 'data-in' }),
      validateConnection(w, { moduleId: 'power-1', portId: 'power-out-a' }, { moduleId: 'display-1', portId: 'power-in' }),
      validateConnection(w, { moduleId: 'nope', portId: 'x' }, { moduleId: 'text-1', portId: 'power-in' }),
    ].map((r) => (r.ok ? 'ok' : r.code));
    expect(codes).toEqual([
      'same-module',
      'same-direction',
      'same-module',
      'duplicate',
      'input-occupied',
      'missing-endpoint',
    ]);
  });
});

describe('per-block power buttons', () => {
  const off = (w: ReturnType<typeof ws>, id: string) => ({
    ...w,
    modules: w.modules.map((m) => (m.id === id ? { ...m, switchedOff: true } : m)),
  });

  it('switches a wired block off without touching the rest of the system', () => {
    const rt = evaluateWorkspace(off(ws(), 'display-1'));
    expect(rt.modules['display-1'].state).toBe('off');
    expect(rt.modules['display-1'].powered).toBe(false);
    expect(rt.modules['display-1'].screen.kind).toBe('off');
    expect(rt.modules['text-1'].state).toBe('operational');
    expect(rt.systemOk).toBe(false);
  });

  it('a switched-off Text Block sends nothing to the display', () => {
    const rt = evaluateWorkspace(off(ws(), 'text-1'));
    expect(rt.modules['text-1'].state).toBe('off');
    expect(rt.modules['display-1'].screen.kind).toBe('source-off');
  });

  it('is operational again once switched back on', () => {
    const rt = evaluateWorkspace(ws());
    expect(rt.systemOk).toBe(true);
    expect(rt.modules['display-1'].screen.kind).toBe('text');
  });
});
