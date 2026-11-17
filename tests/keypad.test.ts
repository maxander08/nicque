import { describe, expect, it } from 'vitest';
import { isDocked } from '../src/connections/cable';
import { connectionId, validateConnection } from '../src/connections/validate';
import { spawnPlacement } from '../src/interactions/spawn';
import { MODULE_DEFINITIONS, createModule } from '../src/modules/definitions';
import {
  KEYPAD_CHARS,
  KEYPAD_KEYS,
  KP_TEX_H,
  KP_TEX_W,
  NO_MODS,
  editFor,
  keyAtScreen,
  keyById,
  padKeyByChar,
  padKeyCap,
  padKeyId,
} from '../src/modules/keyboard';
import { portWorld } from '../src/modules/spatial';
import { parseWorkspace, serializeWorkspace } from '../src/persistence/workspace';
import { evaluateWorkspace } from '../src/runtime/evaluate';
import { createDefaultWorkspace } from '../src/state/defaultWorkspace';
import type { PortRef, Workspace } from '../src/types';

describe('keypad layout', () => {
  it('has exactly 0-9 # * + . , and a Backspace key', () => {
    expect(KEYPAD_KEYS).toHaveLength(16);
    expect([...KEYPAD_CHARS].sort().join('')).toBe([...'0123456789#*+.,'].sort().join(''));
    expect(KEYPAD_KEYS.filter((k) => k.kind === 'back')).toHaveLength(1);
  });

  it('puts Backspace in the bottom row, directly left of 0 (where ~ used to be)', () => {
    const back = keyById('pad:Backspace')!;
    const zero = padKeyByChar('0')!;
    expect(back.kind).toBe('back');
    expect(back.row).toBe(zero.row);
    expect(back.x).toBe(zero.x - 1);
    expect(back.x).toBe(0);
    expect(padKeyByChar('~')).toBeUndefined();
    expect(editFor(back, NO_MODS)).toEqual({ type: 'backspace' });
    expect(editFor(back, { shift: true, caps: true })).toEqual({ type: 'backspace' });
  });

  it('types its own character, whatever Shift does', () => {
    for (const ch of KEYPAD_CHARS) {
      const k = padKeyByChar(ch)!;
      expect(editFor(k, NO_MODS)).toEqual({ type: 'insert', text: ch });
      expect(editFor(k, { shift: true, caps: true })).toEqual({ type: 'insert', text: ch });
      expect(keyById(padKeyId(ch))).toBe(k);
    }
  });

  it('hit-tests every key at the centre of its cap and ignores the margins', () => {
    for (const k of KEYPAD_KEYS) {
      const c = padKeyCap(k);
      const u = (c.x + c.w / 2) / KP_TEX_W;
      const v = 1 - (c.y + c.h / 2) / KP_TEX_H;
      expect(keyAtScreen('keypad', u, v)).toBe(k);
    }
    expect(keyAtScreen('keypad', 0.001, 0.999)).toBeNull();
  });
});

describe('text block with two south key inputs', () => {
  const text = MODULE_DEFINITIONS.text;

  it('has 2 east, 1 north and 2 south connectors', () => {
    const side = (nx: number, nz: number) => text.ports.filter((p) => p.normal.x === nx && p.normal.z === nz);
    expect(side(1, 0)).toHaveLength(2);
    expect(side(0, -1)).toHaveLength(1);
    expect(side(0, 1)).toHaveLength(2);
    expect(side(-1, 0)).toHaveLength(0);
    expect(side(0, 1).every((p) => p.type === 'keys' && p.direction === 'in' && p.local.z === text.depth / 2)).toBe(true);
    const xs = side(0, 1).map((p) => p.local.x);
    expect(xs[0]).not.toBe(xs[1]);
  });

  it('keeps the original key-in id for saved workspaces', () => {
    expect(text.ports.some((p) => p.id === 'key-in')).toBe(true);
    expect(text.ports.some((p) => p.id === 'key-in-2')).toBe(true);
  });
});

describe('keypad block in the workspace', () => {
  const base = (): Workspace => {
    const w = createDefaultWorkspace();
    const pad = createModule('keypad', 'keypad-1', { x: 6, z: 6 });
    const kb = createModule('keyboard', 'keyboard-1', { x: -6, z: 6 });
    return { ...w, modules: [...w.modules, pad, kb] };
  };
  const padPower: PortRef = { moduleId: 'keypad-1', portId: 'power-in' };
  const padOut: PortRef = { moduleId: 'keypad-1', portId: 'key-out' };
  const kbPower: PortRef = { moduleId: 'keyboard-1', portId: 'power-in' };
  const kbOut: PortRef = { moduleId: 'keyboard-1', portId: 'key-out' };
  const power: PortRef = { moduleId: 'power-1', portId: 'power-out-c' };
  const power2: PortRef = { moduleId: 'power-1', portId: 'power-out-d' };
  const in1: PortRef = { moduleId: 'text-1', portId: 'key-in' };
  const in2: PortRef = { moduleId: 'text-1', portId: 'key-in-2' };

  const link = (w: Workspace, a: PortRef, b: PortRef): Workspace => {
    const r = validateConnection(w, a, b);
    if (!r.ok) throw new Error(r.message);
    return { ...w, connections: [...w.connections, r.connection] };
  };

  it('links into either south input of a Text Block', () => {
    const w = base();
    expect(validateConnection(w, padOut, in1).ok).toBe(true);
    expect(validateConnection(w, padOut, in2).ok).toBe(true);
  });

  it('takes a keypad and a keyboard on the two inputs at once, one plug per input', () => {
    let w = link(link(base(), padOut, in1), kbOut, in2);
    expect(w.connections.filter((c) => c.type === 'keys')).toHaveLength(2);
    const third = createModule('keypad', 'keypad-2', { x: 9, z: 9 });
    w = { ...w, modules: [...w.modules, third] };
    const r = validateConnection(w, { moduleId: 'keypad-2', portId: 'key-out' }, in2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('input-occupied');
  });

  it('is dark until powered, then lights up and reports typing once linked', () => {
    let w = base();
    expect(evaluateWorkspace(w).modules['keypad-1'].screen).toEqual({ kind: 'off' });
    w = link(w, power, padPower);
    expect(evaluateWorkspace(w).modules['keypad-1'].screen).toEqual({ kind: 'keys', linked: false });
    w = link(w, padOut, in2);
    const rt = evaluateWorkspace(w);
    expect(rt.modules['keypad-1'].type).toBe('keypad');
    expect(rt.modules['keypad-1'].screen).toEqual({ kind: 'keys', linked: true });
    expect(rt.modules['text-1'].screen).toEqual({ kind: 'text', text: 'Hello, Nicque', typing: true });
    expect(rt.connections[connectionId(padOut, in2)].active).toBe(true);
  });

  it('keeps typing sources independent: an unpowered one stays inactive', () => {
    let w = link(link(base(), padOut, in1), kbOut, in2);
    w = link(link(w, power, padPower), power2, kbPower);
    const rt = evaluateWorkspace(w);
    expect(rt.connections[connectionId(padOut, in1)].active).toBe(true);
    expect(rt.connections[connectionId(kbOut, in2)].active).toBe(true);
    const off = evaluateWorkspace(link(base(), padOut, in1));
    expect(off.connections[connectionId(padOut, in1)].active).toBe(false);
    expect(off.connections[connectionId(padOut, in1)].reason).toBe('Keypad Block is not powered');
  });

  it('docks a new Keypad Block under a free Text Block input with facing connectors', () => {
    const w = createDefaultWorkspace();
    const { position, rotation } = spawnPlacement(w, 'keypad');
    const pad = createModule('keypad', 'keypad-1', position, rotation);
    const out = portWorld(pad, MODULE_DEFINITIONS.keypad.ports.find((p) => p.id === 'key-out')!);
    const textMod = w.modules.find((m) => m.id === 'text-1')!;
    const docked = MODULE_DEFINITIONS.text.ports
      .filter((p) => p.type === 'keys')
      .some((p) => isDocked(out, portWorld(textMod, p)));
    expect(docked).toBe(true);
  });

  it('survives save and load', () => {
    const w = link(link(base(), power, padPower), padOut, in2);
    const res = parseWorkspace(serializeWorkspace(w));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workspace.modules.find((m) => m.id === 'keypad-1')?.type).toBe('keypad');
      expect(res.workspace.connections).toHaveLength(5);
      expect(res.warnings).toEqual([]);
    }
  });
});
