import type { KeyPressure } from '@/types';

/**
 * Keyboard Block logic: a standard ANSI QWERTY layout, how each key edits text, pressure behaviour and
 * hit-testing of the LED screen. Pure and renderer independent (the painter and the pointer layer both use it).
 */

export type KeyKind = 'char' | 'space' | 'enter' | 'tab' | 'back' | 'shift' | 'caps';

export interface KeyDef {
  id: string;
  /** `KeyboardEvent.code` of the matching physical key. */
  code: string;
  kind: KeyKind;
  /** Character produced without / with Shift (char keys only). */
  base: string;
  shifted: string;
  /** Printed label for non-character keys. */
  label: string;
  /** Row index (0 = number row) and horizontal position / width in key units. */
  row: number;
  x: number;
  w: number;
}

export interface Mods {
  shift: boolean;
  caps: boolean;
}

export const NO_MODS: Mods = { shift: false, caps: false };

/* ---- layout ----------------------------------------------------------------------------- */

type Spec = [code: string, base: string, shifted: string];
const spec = (s: string): Spec[] => s.split(' ').map((p) => {
  const [code, base, shifted] = p.split('|');
  return [code, base, shifted ?? base.toUpperCase()];
});

const ROW0 = spec(
  'Backquote|`|~ Digit1|1|! Digit2|2|@ Digit3|3|# Digit4|4|$ Digit5|5|% Digit6|6|^ Digit7|7|& Digit8|8|* Digit9|9|( Digit0|0|) Minus|-|_ Equal|=|+',
);
const ROW1 = spec(
  'KeyQ|q KeyW|w KeyE|e KeyR|r KeyT|t KeyY|y KeyU|u KeyI|i KeyO|o KeyP|p BracketLeft|[|{ BracketRight|]|}',
);
const ROW2 = spec('KeyA|a KeyS|s KeyD|d KeyF|f KeyG|g KeyH|h KeyJ|j KeyK|k KeyL|l Semicolon|;|: Quote|\'|"');
const ROW3 = spec('KeyZ|z KeyX|x KeyC|c KeyV|v KeyB|b KeyN|n KeyM|m Comma|,|< Period|.|> Slash|/|?');

/** Width of the keyboard in key units. Every row adds up to this. */
export const KEY_UNITS = 15;
export const KEY_ROWS = 5;

function buildLayout(): KeyDef[] {
  const keys: KeyDef[] = [];
  const special = (
    row: number,
    x: number,
    w: number,
    id: string,
    code: string,
    kind: KeyKind,
    label: string,
  ) => keys.push({ id, code, kind, base: '', shifted: '', label, row, x, w });
  const chars = (row: number, x: number, list: Spec[]) => {
    list.forEach(([code, base, shifted], i) =>
      keys.push({ id: code, code, kind: 'char', base, shifted, label: '', row, x: x + i, w: 1 }),
    );
    return x + list.length;
  };

  let x = chars(0, 0, ROW0);
  special(0, x, KEY_UNITS - x, 'Backspace', 'Backspace', 'back', 'Back');

  special(1, 0, 1.5, 'Tab', 'Tab', 'tab', 'Tab');
  x = chars(1, 1.5, ROW1);
  keys.push({ id: 'Backslash', code: 'Backslash', kind: 'char', base: '\\', shifted: '|', label: '', row: 1, x, w: KEY_UNITS - x });

  special(2, 0, 1.75, 'CapsLock', 'CapsLock', 'caps', 'Caps');
  x = chars(2, 1.75, ROW2);
  special(2, x, KEY_UNITS - x, 'Enter', 'Enter', 'enter', 'Enter');

  special(3, 0, 2.25, 'ShiftLeft', 'ShiftLeft', 'shift', 'Shift');
  x = chars(3, 2.25, ROW3);
  special(3, x, KEY_UNITS - x, 'ShiftRight', 'ShiftRight', 'shift', 'Shift');

  special(4, 3, 9, 'Space', 'Space', 'space', '');
  return keys;
}

export const KEYS: readonly KeyDef[] = buildLayout();

const byId = new Map(KEYS.map((k) => [k.id, k]));
const byCode = new Map(KEYS.map((k) => [k.code, k]));
export const keyById = (id: string) => byId.get(id);
export const keyByCode = (code: string) => byCode.get(code);

/* ---- characters and edits ---------------------------------------------------------------- */

const isLetter = (k: KeyDef) => k.kind === 'char' && k.base.toLowerCase() !== k.base.toUpperCase();

/** The character a key currently produces (letters follow Shift XOR Caps Lock, symbols follow Shift). */
export function charOf(k: KeyDef, mods: Mods): string {
  if (k.kind === 'space') return ' ';
  if (k.kind !== 'char') return '';
  const upper = isLetter(k) ? mods.shift !== mods.caps : mods.shift;
  return upper ? k.shifted : k.base;
}

export type KeyEdit = { type: 'insert'; text: string } | { type: 'backspace' };

export const TAB_TEXT = '  ';

/** The text edit a key causes, or null for modifier keys. */
export function editFor(k: KeyDef, mods: Mods): KeyEdit | null {
  switch (k.kind) {
    case 'char':
    case 'space':
      return { type: 'insert', text: charOf(k, mods) };
    case 'enter':
      return { type: 'insert', text: '\n' };
    case 'tab':
      return { type: 'insert', text: TAB_TEXT };
    case 'back':
      return { type: 'backspace' };
    default:
      return null;
  }
}

export function applyEdit(value: string, edit: KeyEdit, max: number): string {
  if (edit.type === 'backspace') return Array.from(value).slice(0, -1).join('');
  return (value + edit.text).slice(0, max);
}

/** Printed legend on the LED screen (letters follow the active modifiers, like a live keycap). */
export function legendOf(k: KeyDef, mods: Mods): string {
  return k.kind === 'char' ? charOf(k, mods) : k.label;
}

/* ---- pressure ------------------------------------------------------------------------------ */

export interface PressureProfile {
  /** Pointer pressure (0..1) a touch / pen contact must reach before a key actuates. */
  actuation: number;
  /** Hold time before a key starts to repeat (ms). */
  repeatDelay: number;
  /** Repeat interval at the lightest and the hardest press (ms). */
  repeatSlow: number;
  repeatFast: number;
}

export const PRESSURE_PROFILES: Record<KeyPressure, PressureProfile> = {
  light: { actuation: 0.1, repeatDelay: 600, repeatSlow: 200, repeatFast: 80 },
  normal: { actuation: 0.25, repeatDelay: 450, repeatSlow: 150, repeatFast: 45 },
  firm: { actuation: 0.5, repeatDelay: 300, repeatSlow: 110, repeatFast: 30 },
};

/**
 * Effective pressure of a pointer. A mouse has no force sensor (the browser reports a constant 0.5 while a
 * button is down), so it counts as a firm, decisive press. Touch and pen report real force.
 */
export function effectivePressure(pointerType: string, raw: number): number {
  if (pointerType === 'mouse') return 0.7;
  return Math.max(0, Math.min(1, raw > 0 ? raw : 0.5));
}

export const actuates = (pressure: number, profile: KeyPressure) => pressure >= PRESSURE_PROFILES[profile].actuation;

/** Key repeat interval: the harder the press, the faster the repeat. */
export function repeatInterval(pressure: number, profile: KeyPressure): number {
  const p = PRESSURE_PROFILES[profile];
  const t = Math.max(0, Math.min(1, (pressure - p.actuation) / (1 - p.actuation)));
  return Math.round(p.repeatSlow + (p.repeatFast - p.repeatSlow) * t);
}

/* ---- screen geometry ----------------------------------------------------------------------- */

/** LED lattice pitch (px) of the keyboard screen texture and the lattice size in cells. */
export const KB_CELL_PX = 12;
/** 173 cells × 0.022 = 3.806 wide: the screen window ends up EDGE (0.14) from both side borders of the 4.05 block. */
export const KB_CELLS_X = 173;
export const KB_CELLS_Y = 62;
export const KB_TEX_W = KB_CELLS_X * KB_CELL_PX;
export const KB_TEX_H = KB_CELLS_Y * KB_CELL_PX;

const PAD_X = 42;
const PAD_Y = 30;
const UNIT = (KB_TEX_W - PAD_X * 2) / KEY_UNITS;
const ROW_H = (KB_TEX_H - PAD_Y * 2) / KEY_ROWS;
export const KEY_GAP = 9;

/** Outer cell of a key in texture pixels (no gap). */
export function keyCell(k: KeyDef) {
  return { x: PAD_X + k.x * UNIT, y: PAD_Y + k.row * ROW_H, w: k.w * UNIT, h: ROW_H };
}

/** Visible keycap in texture pixels. */
export function keyCap(k: KeyDef) {
  const c = keyCell(k);
  return { x: c.x + KEY_GAP / 2, y: c.y + KEY_GAP / 2, w: c.w - KEY_GAP, h: c.h - KEY_GAP };
}

/** Key under a point of the screen. `u`/`v` are texture coordinates (v counted from the bottom, like UVs). */
export function keyAtUv(u: number, v: number): KeyDef | null {
  const x = u * KB_TEX_W;
  const y = (1 - v) * KB_TEX_H;
  for (const k of KEYS) {
    const c = keyCell(k);
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return k;
  }
  return null;
}
