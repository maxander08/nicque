import { describe, expect, it } from 'vitest';
import {
  DISPLAY_CELLS,
  DISPLAY_CELLS_Y,
  TEXT_SCREEN_H,
  TEXT_SCREEN_W,
} from '../src/materials/screens';
import { DOCK_GAP, MODULE_DEFINITIONS, SQUARE } from '../src/modules/definitions';
import { KB_CELLS_X, KB_CELLS_Y } from '../src/modules/keyboard';
import {
  EDGE,
  LED_BAND,
  LED_RADIUS,
  badgeZ,
  contentTopZ,
  powerLedPosition,
} from '../src/modules/layout';

const CELL = 1.76 / 80;

describe('block layout rules', () => {
  it('puts the single power LED in the same top-left spot on every module', () => {
    for (const d of Object.values(MODULE_DEFINITIONS)) {
      const p = powerLedPosition(d.width, d.depth);
      // centred in the LED band, EDGE from the top border
      expect(p.z + d.depth / 2).toBeCloseTo(EDGE, 6);
      expect(p.z + d.depth / 2).toBeCloseTo(LED_BAND / 2, 6);
      // its left edge lines up with the left edge of the screen window
      expect(p.x + d.width / 2 - LED_RADIUS).toBeCloseTo(EDGE, 6);
      // and it is in the top-left quadrant
      expect(p.x).toBeLessThan(0);
      expect(p.z).toBeLessThan(0);
    }
  });

  it('keeps the keyboard screen window EDGE away from both sides', () => {
    const window = KB_CELLS_X * CELL - 0.04;
    const margin = (MODULE_DEFINITIONS.keyboard.width - window) / 2;
    expect(Math.abs(margin - EDGE)).toBeLessThan(0.005);
  });

  it('gives the square Display Block exactly the Keyboard Block bezels', () => {
    const kb = MODULE_DEFINITIONS.keyboard;
    const dp = MODULE_DEFINITIONS.display;
    expect(dp.width).toBe(dp.depth); // still square
    expect(DISPLAY_CELLS_Y).toBe(KB_CELLS_Y);

    const bezels = (def: { width: number; depth: number }, cellsX: number) => {
      const w = cellsX * CELL - 0.04;
      const d = KB_CELLS_Y * CELL - 0.04;
      return {
        side: (def.width - w) / 2,
        top: contentTopZ(def.depth) + def.depth / 2,
        bottom: def.depth / 2 - (contentTopZ(def.depth) + d),
      };
    };
    const a = bezels(kb, KB_CELLS_X);
    const b = bezels(dp, DISPLAY_CELLS);
    expect(Math.abs(a.side - b.side)).toBeLessThan(0.005);
    expect(b.top).toBeCloseTo(a.top, 6);
    expect(b.bottom).toBeCloseTo(a.bottom, 6);
    // the badge is centred in the bottom bezel on both blocks
    expect(Math.abs((dp.depth / 2 - b.bottom / 2) - badgeZ(dp.depth))).toBeLessThan(0.01);
  });

  it('matches the text screen texture to its window aspect', () => {
    const width = MODULE_DEFINITIONS.text.width - 2 * EDGE + 0.04;
    expect(Math.abs((width * TEXT_SCREEN_H) / TEXT_SCREEN_W - 0.872)).toBeLessThan(0.002);
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
