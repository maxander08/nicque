import { describe, expect, it } from 'vitest';
import { isDocked } from '../src/connections/cable';
import { connectionId, validateConnection } from '../src/connections/validate';
import { spawnPlacement } from '../src/interactions/spawn';
import { MODULE_DEFINITIONS, createModule } from '../src/modules/definitions';
import {
  KEYS,
  KEY_UNITS,
  NO_MODS,
  actuates,
  applyEdit,
  charOf,
  editFor,
  effectivePressure,
  keyAtUv,
  keyById,
  keyByCode,
  keyCell,
  repeatInterval,
  KB_TEX_H,
  KB_TEX_W,
} from '../src/modules/keyboard';
import { portWorld } from '../src/modules/spatial';
import { parseWorkspace, serializeWorkspace } from '../src/persistence/workspace';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import type { Workspace } from '../src/types';

const press = (code: string, mods = NO_MODS) => {
  const edit = editFor(keyByCode(code)!, mods);
  return edit;
};

describe('keyboard layout', () => {
  it('fills every row exactly to the full width without overlaps', () => {
    for (let row = 0; row < 5; row++) {
      const keys = KEYS.filter((k) => k.row === row).sort((a, b) => a.x - b.x);
      if (row === 4) continue; // the space row only holds the space bar
      let x = 0;
      for (const k of keys) {
        expect(k.x).toBeCloseTo(x);
        x += k.w;
      }
      expect(x).toBeCloseTo(KEY_UNITS);
    }
  });

  it('maps every key to a unique physical code', () => {
    expect(new Set(KEYS.map((k) => k.code)).size).toBe(KEYS.length);
    expect(keyByCode('KeyA')?.base).toBe('a');
    expect(keyByCode('Digit1')?.shifted).toBe('!');
  });

  it('hit-tests the centre of every key back to that key', () => {
    for (const k of KEYS) {
      const c = keyCell(k);
      const u = (c.x + c.w / 2) / KB_TEX_W;
      const v = 1 - (c.y + c.h / 2) / KB_TEX_H;
      expect(keyAtUv(u, v)?.id).toBe(k.id);
    }
    expect(keyAtUv(0.001, 0.001)).toBeNull();
  });
});

describe('typing', () => {
  it('types letters, honouring Shift and Caps Lock', () => {
    const a = keyById('KeyA')!;
    expect(charOf(a, NO_MODS)).toBe('a');
    expect(charOf(a, { shift: true, caps: false })).toBe('A');
    expect(charOf(a, { shift: false, caps: true })).toBe('A');
    expect(charOf(a, { shift: true, caps: true })).toBe('a');
  });

  it('applies Shift to symbols but not Caps Lock', () => {
    const one = keyById('Digit1')!;
    expect(charOf(one, { shift: false, caps: true })).toBe('1');
    expect(charOf(one, { shift: true, caps: false })).toBe('!');
  });

  it('edits text for enter, tab, space and backspace', () => {
    expect(press('Enter')).toEqual({ type: 'insert', text: '\n' });
    expect(press('Space')).toEqual({ type: 'insert', text: ' ' });
    expect(press('Tab')).toEqual({ type: 'insert', text: '  ' });
    expect(press('Backspace')).toEqual({ type: 'backspace' });
    expect(press('ShiftLeft')).toBeNull();
    expect(press('CapsLock')).toBeNull();
  });

  it('applies edits, deletes whole characters and respects the length limit', () => {
    expect(applyEdit('Hi', { type: 'insert', text: '!' }, 100)).toBe('Hi!');
    expect(applyEdit('a😀', { type: 'backspace' }, 100)).toBe('a');
    expect(applyEdit('', { type: 'backspace' }, 100)).toBe('');
    expect(applyEdit('abc', { type: 'insert', text: 'd' }, 3)).toBe('abc');
  });
});

describe('pressure', () => {
  it('requires more force on a firmer setting, but a mouse always actuates', () => {
    expect(actuates(0.2, 'light')).toBe(true);
    expect(actuates(0.2, 'normal')).toBe(false);
    expect(actuates(0.4, 'firm')).toBe(false);
    for (const level of ['light', 'normal', 'firm'] as const) {
      expect(actuates(effectivePressure('mouse', 0.5), level)).toBe(true);
    }
  });

  it('repeats faster the harder the key is pressed', () => {
    expect(repeatInterval(1, 'normal')).toBeLessThan(repeatInterval(0.3, 'normal'));
  });
});

describe('keyboard block in the workspace', () => {
  const base = (): Workspace => {
    const w = createDefaultWorkspace();
    const kb = createModule('keyboard', 'keyboard-1', { x: 0, z: 2.05 });
    return { ...w, modules: [...w.modules, kb] };
  };
  const power = { moduleId: 'power-1', portId: 'power-out-c' };
  const kbIn = { moduleId: 'keyboard-1', portId: 'power-in' };
  const keysOut = { moduleId: 'keyboard-1', portId: 'key-out' };
  const keysIn = { moduleId: 'text-1', portId: 'key-in' };

  const link = (w: Workspace, a: typeof power, b: typeof power): Workspace => {
    const r = validateConnection(w, a, b);
    if (!r.ok) throw new Error(r.message);
    return { ...w, connections: [...w.connections, r.connection] };
  };

  it('accepts a keys link into a Text Block and rejects mismatched types', () => {
    const w = base();
    expect(validateConnection(w, keysOut, keysIn).ok).toBe(true);
    const bad = validateConnection(w, keysOut, { moduleId: 'display-1', portId: 'data-in' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('type-mismatch');
    expect(validateConnection(w, { moduleId: 'text-1', portId: 'data-out' }, keysIn).ok).toBe(false);
  });

  it('is dark without power and lights up once powered', () => {
    const w = base();
    expect(evaluateWorkspace(w).modules['keyboard-1'].screen).toEqual({ kind: 'off' });
    const on = evaluateWorkspace(link(w, power, kbIn));
    expect(on.modules['keyboard-1'].state).toBe('operational');
    expect(on.modules['keyboard-1'].screen).toEqual({ kind: 'keys', linked: false });
  });

  it('becomes linked, and the Text Block shows that it is being typed into', () => {
    const w = link(link(base(), power, kbIn), keysOut, keysIn);
    const rt = evaluateWorkspace(w);
    expect(rt.modules['keyboard-1'].screen).toEqual({ kind: 'keys', linked: true });
    expect(rt.modules['text-1'].screen).toEqual({ kind: 'text', text: 'Hello, Nicque', typing: true });
    expect(rt.connections[connectionId(keysOut, keysIn)].active).toBe(true);
  });

  it('keeps the key link inactive while the keyboard is unpowered', () => {
    const rt = evaluateWorkspace(link(base(), keysOut, keysIn));
    expect(rt.connections[connectionId(keysOut, keysIn)].active).toBe(false);
    expect(rt.modules['text-1'].screen).toEqual({ kind: 'text', text: 'Hello, Nicque' });
  });

  it('survives save and load', () => {
    const w = link(link(base(), power, kbIn), keysOut, keysIn);
    const res = parseWorkspace(serializeWorkspace(w));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workspace.modules).toHaveLength(4);
      expect(res.workspace.connections).toHaveLength(5);
      expect(res.warnings).toEqual([]);
    }
  });

  it('docks a new Keyboard Block under a free Text Block with facing connectors', () => {
    const w = createDefaultWorkspace();
    const { position, rotation } = spawnPlacement(w, 'keyboard');
    const kb = createModule('keyboard', 'keyboard-1', position, rotation);
    const out = portWorld(kb, MODULE_DEFINITIONS.keyboard.ports.find((p) => p.id === 'key-out')!);
    const text = w.modules.find((m) => m.id === 'text-1')!;
    const inp = portWorld(text, MODULE_DEFINITIONS.text.ports.find((p) => p.id === 'key-in')!);
    expect(isDocked(out, inp)).toBe(true);
  });

  it('places blocks without overlapping when the dock spot is taken', () => {
    const w = base();
    const p = spawnPlacement({ ...w, connections: [...w.connections, link(w, keysOut, keysIn).connections.at(-1)!] }, 'keyboard');
    expect(Math.hypot(p.position.x - 0, p.position.z - 2.05)).toBeGreaterThan(1.5);
  });
});
