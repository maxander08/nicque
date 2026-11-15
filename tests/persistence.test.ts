import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  loadWorkspace,
  parseWorkspace,
  saveWorkspace,
  serializeWorkspace,
  type StorageLike,
} from '../src/persistence/workspace';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe('workspace persistence', () => {
  it('round-trips ids, configuration, positions and connections', () => {
    const ws = createDefaultWorkspace();
    ws.modules[1] = { ...ws.modules[1], config: { value: 'Grüße 👋' }, position: { x: -3, z: 1.5 }, rotation: 1 } as never;
    const res = parseWorkspace(serializeWorkspace(ws));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workspace.modules.map((m) => m.id)).toEqual(['power-1', 'text-1', 'display-1']);
      expect(res.workspace.modules[1]).toEqual(ws.modules[1]);
      expect(res.workspace.connections).toEqual(ws.connections);
      expect(res.warnings).toEqual([]);
    }
  });

  it('saves to and loads from storage', () => {
    const s = memory();
    expect(saveWorkspace(s, STORAGE_KEYS.saved, createDefaultWorkspace())).toBe(true);
    const r = loadWorkspace(s, STORAGE_KEYS.saved);
    expect(r && r.ok).toBe(true);
    expect(loadWorkspace(s, 'missing')).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    expect(parseWorkspace('not json').ok).toBe(false);
    expect(parseWorkspace('[]').ok).toBe(false);
    expect(parseWorkspace('{"modules":[]}').ok).toBe(false);
    expect(parseWorkspace('{"modules":[{"type":"toaster","id":"x"}]}').ok).toBe(false);
    expect(parseWorkspace('{"version":99,"modules":[]}').ok).toBe(false);
  });

  it('repairs missing fields and drops invalid connections with warnings', () => {
    const res = parseWorkspace(
      JSON.stringify({
        version: 1,
        modules: [
          { id: 'p', type: 'power' },
          { id: 'd', type: 'display', position: { x: 'bad', z: 2 }, rotation: 5 },
          { id: 'd', type: 'display' },
        ],
        connections: [
          { from: { moduleId: 'p', portId: 'power-out-a' }, to: { moduleId: 'd', portId: 'data-in' } },
          { from: { moduleId: 'p', portId: 'power-out-a' }, to: { moduleId: 'd', portId: 'power-in' } },
          { from: 1 },
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workspace.modules).toHaveLength(2);
      expect(res.workspace.modules[0].config).toEqual({ enabled: true });
      expect(res.workspace.modules[1].position).toEqual({ x: 0, z: 2 });
      expect(res.workspace.modules[1].rotation).toBe(1);
      expect(res.workspace.connections).toHaveLength(1);
      expect(res.warnings.length).toBe(3);
    }
  });
});
