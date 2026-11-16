import { describe, expect, it } from 'vitest';
import { DISPLAY_CELLS, DISPLAY_CELLS_Y } from '../src/materials/screens';
import { DOCK_GAP, MODULE_DEFINITIONS, SQUARE, TEXT_BUTTON_RADIUS } from '../src/modules/definitions';
import {
  KB_CELLS_X,
  KB_CELLS_Y,
  KB_CELL_PX,
  KEYPAD_KEYS,
  KEYS,
  KEY_PITCH,
  KP_CELLS_X,
  LED_CELL,
  keyCap,
  padKeyCap,
} from '../src/modules/keyboard';
import {
  CONTROL_HOLE_RADIUS,
  EDGE,
  FOOTER,
  HEADER,
  LED_BAND,
  LED_RADIUS,
  badgeZ,
  contentBottomZ,
  contentTopZ,
  controlX,
  controlZ,
  powerLedPosition,
} from '../src/modules/layout';

const CELL = LED_CELL;

describe('block layout rules', () => {
  it('puts the single power LED in the same top-left spot on every module', () => {
    for (const d of Object.values(MODULE_DEFINITIONS)) {
      // the Power Block keeps its slim LED band, every other block has the full header
      const header = d.type === 'power' ? LED_BAND : HEADER;
      const p = powerLedPosition(d.width, d.depth, header);
      // centred in the header strip
      expect(p.z + d.depth / 2).toBeCloseTo(header / 2, 6);
      // its left edge lines up with the left edge of the screen window
      expect(p.x + d.width / 2 - LED_RADIUS).toBeCloseTo(EDGE, 6);
      // and it is in the top-left quadrant
      expect(p.x).toBeLessThan(0);
      expect(p.z).toBeLessThan(0);
    }
  });

  it('keeps the keyboard and keypad screen windows EDGE away from both sides', () => {
    const kb = (MODULE_DEFINITIONS.keyboard.width - (KB_CELLS_X * CELL - 0.04)) / 2;
    const kp = (MODULE_DEFINITIONS.keypad.width - (KP_CELLS_X * CELL - 0.04)) / 2;
    expect(Math.abs(kb - EDGE)).toBeLessThan(0.005);
    expect(Math.abs(kp - EDGE)).toBeLessThan(0.005);
  });

  it('gives the Display Block exactly the Keyboard Block bezels', () => {
    const kb = MODULE_DEFINITIONS.keyboard;
    const dp = MODULE_DEFINITIONS.display;
    expect(DISPLAY_CELLS_Y).toBe(62);

    const bezels = (def: { width: number; depth: number }, cellsX: number, cellsY: number) => {
      const w = cellsX * CELL - 0.04;
      const d = cellsY * CELL - 0.04;
      return {
        side: (def.width - w) / 2,
        top: contentTopZ(def.depth) + def.depth / 2,
        bottom: def.depth / 2 - (contentTopZ(def.depth) + d),
      };
    };
    const a = bezels(kb, KB_CELLS_X, KB_CELLS_Y);
    const b = bezels(dp, DISPLAY_CELLS, DISPLAY_CELLS_Y);
    expect(Math.abs(a.side - b.side)).toBeLessThan(0.005);
    expect(b.top).toBeCloseTo(a.top, 6);
    expect(b.bottom).toBeCloseTo(a.bottom, 6);
    expect(b.top).toBeCloseTo(HEADER, 6);
    expect(b.bottom).toBeCloseTo(FOOTER, 6);
    // the badge is centred in the bottom bezel on both blocks
    expect(Math.abs((dp.depth / 2 - b.bottom / 2) - badgeZ(dp.depth))).toBeLessThan(0.03);
  });
});

describe('header controls', () => {
  it('fit the header with EDGE of cover above and below, and sit on the LED centre line', () => {
    expect(HEADER).toBeCloseTo(EDGE * 2 + CONTROL_HOLE_RADIUS * 2, 9);
    for (const t of ['text', 'display', 'keyboard', 'keypad'] as const) {
      const d = MODULE_DEFINITIONS[t];
      expect(controlZ(d.depth)).toBeCloseTo(powerLedPosition(d.width, d.depth).z, 9);
      // opening edge to border = EDGE on top
      expect(controlZ(d.depth) - CONTROL_HOLE_RADIUS + d.depth / 2).toBeCloseTo(EDGE, 9);
      // power button hugs the right border by EDGE
      expect(d.width / 2 - (controlX(d.width, 0) + CONTROL_HOLE_RADIUS)).toBeCloseTo(EDGE, 9);
    }
  });

  it('never collides with the LED or with each other on the narrowest block', () => {
    const w = MODULE_DEFINITIONS.keypad.width;
    const led = powerLedPosition(w, 2).x;
    // two controls (power + clear) still leave room next to the LED
    expect(controlX(w, 1) - CONTROL_HOLE_RADIUS).toBeGreaterThan(led + LED_RADIUS + EDGE);
    expect(controlX(w, 0) - controlX(w, 1)).toBeGreaterThanOrEqual(CONTROL_HOLE_RADIUS * 2 + 0.05);
  });

  it('keeps the Text Block content area at EDGE margins around its buttons', () => {
    const d = MODULE_DEFINITIONS.text;
    const area = contentBottomZ(d.depth) - contentTopZ(d.depth);
    expect(area).toBeCloseTo((TEXT_BUTTON_RADIUS + 0.014) * 2 + 2 * EDGE, 9);
  });
});

describe('keys', () => {
  it('are the same size on the Keyboard and the Keypad', () => {
    const a = keyCap(KEYS.find((k) => k.id === 'KeyQ')!);
    const b = padKeyCap(KEYPAD_KEYS[0]);
    expect(a.w).toBe(b.w);
    expect(a.h).toBe(b.h);
    // squares, and both blocks are laid out on the same LED cell grid
    expect(a.w).toBe(a.h);
    expect(KEY_PITCH % KB_CELL_PX).toBe(0);
    // the world size lies between the two former sizes (0.24 keyboard, 0.41 keypad)
    const world = (KEY_PITCH / KB_CELL_PX) * CELL;
    expect(world).toBeGreaterThan(0.26);
    expect(world).toBeLessThan(0.36);
  });
});

describe('power block connectors', () => {
  const def = MODULE_DEFINITIONS.power;
  const outs = def.ports;
  const PLUG = 0.48;

  it('offers 8 outputs: 1 west, 1 east and 6 south', () => {
    expect(outs).toHaveLength(8);
    expect(outs.every((p) => p.direction === 'out' && p.type === 'power' && p.capacity === 1)).toBe(true);
    expect(outs.filter((p) => p.normal.x === 1)).toHaveLength(1);
    expect(outs.filter((p) => p.normal.x === -1)).toHaveLength(1);
    expect(outs.filter((p) => p.normal.z === 1)).toHaveLength(6);
    expect(new Set(outs.map((p) => p.id)).size).toBe(8);
  });

  it('keeps the original outputs A, B and C where they were', () => {
    const by = (id: string) => outs.find((p) => p.id === id)!;
    expect(by('power-out-a').local.x).toBeCloseTo(-(SQUARE + DOCK_GAP) / 2, 6);
    expect(by('power-out-b').local.x).toBeCloseTo((SQUARE + DOCK_GAP) / 2, 6);
    expect(by('power-out-c').local).toEqual({ x: def.width / 2, z: 0 });
  });

  it('spaces the south plugs evenly with clear gaps and keeps them off the rounded corners', () => {
    const xs = outs
      .filter((p) => p.normal.z === 1)
      .map((p) => p.local.x)
      .sort((a, b) => a - b);
    const pitch = xs[1] - xs[0];
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(pitch, 6);
    expect(pitch - PLUG).toBeGreaterThan(0.15); // visible gap between neighbouring plugs
    expect(xs[0]).toBeCloseTo(-xs[xs.length - 1], 6); // symmetric
    const cornerRadius = 0.17;
    expect(def.width / 2 - cornerRadius - (xs[xs.length - 1] + PLUG / 2)).toBeGreaterThan(0.05);
  });

  it('centres the side connectors on the block depth, clear of the corners', () => {
    for (const p of outs.filter((q) => q.normal.z === 0)) {
      expect(p.local.z).toBe(0);
      expect(def.depth / 2 - 0.17 - PLUG / 2).toBeGreaterThan(0.05);
    }
  });
});
