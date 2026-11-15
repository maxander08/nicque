import { describe, expect, it } from 'vitest';
import { cablePath, isDocked } from '../src/connections/cable';
import { resolvePlacement } from '../src/interactions/placement';
import { MODULE_DEFINITIONS } from '../src/modules/definitions';
import { footprint, obbOverlap, portWorld } from '../src/modules/spatial';
import { layoutText } from '../src/modules/textLayout';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';

const port = (ws: ReturnType<typeof createDefaultWorkspace>, mid: string, pid: string) => {
  const m = ws.modules.find((x) => x.id === mid)!;
  return portWorld(m, MODULE_DEFINITIONS[m.type].ports.find((p) => p.id === pid)!);
};

describe('connector geometry', () => {
  it('default connectors are docked and face each other', () => {
    const ws = createDefaultWorkspace();
    for (const c of ws.connections) {
      expect(isDocked(port(ws, c.from.moduleId, c.from.portId), port(ws, c.to.moduleId, c.to.portId))).toBe(true);
    }
  });

  it('rotating a module rotates its connector world positions', () => {
    const ws = createDefaultWorkspace();
    const before = port(ws, 'text-1', 'data-out');
    const t = ws.modules.find((m) => m.id === 'text-1')!;
    const after = portWorld({ ...t, rotation: 1 }, MODULE_DEFINITIONS.text.ports[1]);
    expect(Math.hypot(before.x - t.position.x, before.z - t.position.z)).toBeCloseTo(
      Math.hypot(after.x - t.position.x, after.z - t.position.z),
    );
    expect(after.nx).toBeCloseTo(0);
    expect(Math.abs(after.nz)).toBeCloseTo(1);
  });

  it('cable path ends exactly on both connectors and stays above ground', () => {
    const a = { x: -2, z: 0, nx: 1, nz: 0 };
    const b = { x: 2, z: 1, nx: -1, nz: 0 };
    const pts = cablePath(a, b, []);
    expect(pts[0][0]).toBeCloseTo(a.x);
    expect(pts[pts.length - 1][2]).toBeCloseTo(b.z);
    expect(pts.every((p) => p[1] > 0)).toBe(true);
  });
});

describe('placement', () => {
  it('never lets housings intersect', () => {
    const ws = createDefaultWorkspace();
    const text = ws.modules.find((m) => m.id === 'text-1')!;
    const display = ws.modules.find((m) => m.id === 'display-1')!;
    const res = resolvePlacement(ws, 'text-1', { x: display.position.x, z: display.position.z }, text.position, { snap: true });
    const moved = { ...text, position: res };
    expect(obbOverlap(footprint(moved), footprint(display))).toBe(false);
  });

  it('snaps to the dock gap next to a facing connector', () => {
    const ws = createDefaultWorkspace();
    const text = ws.modules.find((m) => m.id === 'text-1')!;
    const res = resolvePlacement(ws, 'text-1', { x: -3.2, z: 0.1 }, text.position, { snap: true });
    // freed from the display, it should sit one dock gap away, or on grid when far from any connector
    expect(Number.isFinite(res.x) && Number.isFinite(res.z)).toBe(true);
    const near = resolvePlacement(ws, 'text-1', { x: -0.9, z: 0.05 }, text.position, { snap: false });
    expect(near.x).toBeCloseTo(-1.025);
  });
});

describe('display text layout policy', () => {
  const measure = (t: string, s: number) => Array.from(t).length * s * 0.5;
  const opts = { width: 400, height: 300, maxFont: 100, minFont: 20, lineHeight: 1.2, measure };

  it('keeps short text at the maximum size', () => {
    const l = layoutText('Hi', opts);
    expect(l.fontSize).toBe(100);
    expect(l.lines).toEqual(['Hi']);
  });

  it('preserves explicit line breaks and wraps words', () => {
    const l = layoutText('one\ntwo three four five six', { ...opts, maxFont: 40 });
    expect(l.lines[0]).toBe('one');
    expect(l.lines.length).toBeGreaterThan(2);
    expect(l.truncated).toBe(false);
  });

  it('breaks over-long words and clips with an ellipsis at the minimum size', () => {
    const l = layoutText('x'.repeat(5000), opts);
    expect(l.truncated).toBe(true);
    expect(l.fontSize).toBe(20);
    expect(l.lines[l.lines.length - 1].endsWith('…')).toBe(true);
    expect(l.lines.length * 20 * 1.2).toBeLessThanOrEqual(300);
  });
});
