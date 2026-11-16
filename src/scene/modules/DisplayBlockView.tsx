import { useEffect, useMemo } from 'react';
import { makeSiliconeMaterial } from '@/materials/library';
import {
  DISPLAY_CELLS,
  DISPLAY_CELLS_Y,
  DISPLAY_H,
  DISPLAY_W,
  drawDisplayScreen,
} from '@/materials/screens';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { badgeZ, contentTopZ } from '@/modules/layout';
import { useStore } from '@/state/store';
import { useFontsReady, useScreenTexture } from '../hooks';
import { BlockBadge } from '../parts/Decals';
import { Housing } from '../parts/Housing';
import { HeaderControls, headerHoles, useBlockOn, withPower } from '../parts/HeaderControls';
import { PowerLed } from '../parts/PowerLed';

const def = MODULE_DEFINITIONS.display;

/** Slot 0 is the power button, slot 1 (to its left) clears the screen. */
const CONTROLS = withPower({ action: 'clear', icon: 'clear', label: 'Clear button' });

/**
 * Same bezels as the Keyboard Block: the LED band above the window (power LED top-left), EDGE at both sides and
 * the badge margin below. The block stays square (2 × 2); the window is the keyboard's 62-cell height.
 * The LED lattice pitch is shared with the Keyboard Block (1.76 world units over 80 cells).
 */
const CELL = 1.76 / DISPLAY_CELLS;
const PLANE_W = DISPLAY_CELLS * CELL;
const PLANE_H = DISPLAY_CELLS_Y * CELL;
const WINDOW_D = PLANE_H - 0.04;
const WINDOW = { cz: contentTopZ(def.depth) + WINDOW_D / 2, w: PLANE_W - 0.04, d: WINDOW_D };

export function DisplayBlockView({ moduleId }: { moduleId: string }) {
  const screen = useStore((s) => s.runtime.modules[moduleId]?.screen) ?? { kind: 'off' as const };
  const powered = useBlockOn(moduleId);
  const align = useStore((s) => {
    const m = s.workspace.modules.find((x) => x.id === moduleId);
    return m && m.type === 'display' ? m.config.align : 'center';
  });
  const fonts = useFontsReady();

  const holes = useMemo(
    () => [
      { cx: 0, cz: WINDOW.cz, w: WINDOW.w, d: WINDOW.d, r: 0.07, lip: 0.015, segments: 8 },
      ...headerHoles(def.width, def.depth, CONTROLS),
    ],
    [],
  );

  const text = screen.kind === 'text' ? screen.text : '';
  const tex = useScreenTexture(
    DISPLAY_W,
    DISPLAY_H,
    (ctx) => drawDisplayScreen(ctx, screen, align),
    [screen.kind, text, align, fonts],
  );
  const silicone = useMemo(
    () => makeSiliconeMaterial(tex, [1, DISPLAY_CELLS_Y / DISPLAY_CELLS]),
    [tex],
  );
  useEffect(
    () => () => {
      silicone.material.dispose();
      silicone.dispose();
    },
    [silicone],
  );

  return (
    <group>
      <Housing width={def.width} depth={def.depth} holes={holes} />
      <mesh
        position={[0, BLOCK_HEIGHT - 0.01, WINDOW.cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={silicone.material}
        receiveShadow
        userData={{ pick: { kind: 'screen', moduleId } }}
      >
        <planeGeometry args={[PLANE_W, PLANE_H]} />
      </mesh>
      <HeaderControls moduleId={moduleId} width={def.width} depth={def.depth} controls={CONTROLS} />
      <PowerLed width={def.width} depth={def.depth} powered={powered} />
      <BlockBadge name="Display" x={0} z={badgeZ(def.depth)} />
    </group>
  );
}
