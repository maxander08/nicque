import { describe, expect, it } from 'vitest';
import { TEXT_SCREEN_H, TEXT_SCREEN_W } from '../src/materials/screens';
import { MODULE_DEFINITIONS } from '../src/modules/definitions';
import { KB_CELLS_X } from '../src/modules/keyboard';
import { EDGE, LED_PITCH, ledRowLayout, ledRowZ } from '../src/modules/layout';

describe('block layout rules', () => {
  it('puts the LED row the same distance from the top border on every module', () => {
    const insets = Object.values(MODULE_DEFINITIONS).map((d) => ledRowZ(d.depth) + d.depth / 2);
    for (const i of insets) expect(i).toBeCloseTo(EDGE, 6);
  });

  it('uses one LED pitch and equal end margins on every module', () => {
    for (const d of Object.values(MODULE_DEFINITIONS)) {
      const { count, span } = ledRowLayout(d.width);
      expect(span / (count - 1)).toBeCloseTo(LED_PITCH, 6);
      const margin = (d.width - span) / 2;
      expect(margin).toBeGreaterThanOrEqual(0.3);
      expect(margin).toBeLessThan(0.3 + LED_PITCH);
    }
  });

  it('keeps the keyboard screen window EDGE away from both sides', () => {
    const window = KB_CELLS_X * (1.76 / 80) - 0.04;
    const margin = (MODULE_DEFINITIONS.keyboard.width - window) / 2;
    expect(Math.abs(margin - EDGE)).toBeLessThan(0.005);
  });

  it('matches the text screen texture to its window aspect', () => {
    const width = MODULE_DEFINITIONS.text.width - 2 * EDGE + 0.04;
    expect(Math.abs((width * TEXT_SCREEN_H) / TEXT_SCREEN_W - 0.872)).toBeLessThan(0.002);
  });
});
