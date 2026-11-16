import { useEffect, useMemo } from 'react';
import { makeSiliconeMaterial } from '@/materials/library';
import { drawKeypadScreen } from '@/materials/screens';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { KP_CELLS_X, KP_CELLS_Y, KP_TEX_H, KP_TEX_W, LED_CELL } from '@/modules/keyboard';
import { badgeZ, contentTopZ } from '@/modules/layout';
import { useStore } from '@/state/store';
import { useFontsReady, useScreenTexture } from '../hooks';
import { BlockBadge } from '../parts/Decals';
import { Housing } from '../parts/Housing';
import { HeaderControls, headerHoles, useBlockOn, withPower } from '../parts/HeaderControls';
import { PowerLed } from '../parts/PowerLed';

const def = MODULE_DEFINITIONS.keypad;
const CONTROLS = withPower();

/** Same LED pitch as the Display and Keyboard Blocks (1.76 world units over 80 cells). */
const CELL = LED_CELL;
const PLANE_W = KP_CELLS_X * CELL;
const PLANE_H = KP_CELLS_Y * CELL;
const WINDOW = { cz: contentTopZ(def.depth) + (PLANE_H - 0.04) / 2, w: PLANE_W - 0.04, d: PLANE_H - 0.04 };

/** Pressure of the pressed keys of one module, as a stable string so that selectors do not re-render needlessly. */
function useDownSignature(moduleId: string) {
  return useStore((s) => {
    const prefix = `${moduleId}:`;
    let out = '';
    for (const k in s.keysDown) if (k.startsWith(prefix)) out += `${k.slice(prefix.length)}=${s.keysDown[k].toFixed(2)};`;
    return out;
  });
}

/** Keypad Block: a small square pad with the keys 0–9 # * + . , ~ on an LED screen. */
export function KeypadBlockView({ moduleId }: { moduleId: string }) {
  const screen = useStore((s) => s.runtime.modules[moduleId]?.screen) ?? { kind: 'off' as const };
  const powered = useBlockOn(moduleId);
  const downSig = useDownSignature(moduleId);
  const fonts = useFontsReady();

  const holes = useMemo(
    () => [
      { cx: 0, cz: WINDOW.cz, w: WINDOW.w, d: WINDOW.d, r: 0.07, lip: 0.015, segments: 8 },
      ...headerHoles(def.width, def.depth, CONTROLS),
    ],
    [],
  );

  const down = useMemo(() => {
    const out: Record<string, number> = {};
    for (const part of downSig.split(';')) {
      if (!part) continue;
      const i = part.lastIndexOf('=');
      out[part.slice(0, i)] = Number(part.slice(i + 1));
    }
    return out;
  }, [downSig]);

  const linked = screen.kind === 'keys' && screen.linked;
  const tex = useScreenTexture(KP_TEX_W, KP_TEX_H, (ctx) => drawKeypadScreen(ctx, screen, down), [
    screen.kind,
    linked,
    downSig,
    fonts,
  ]);
  const silicone = useMemo(() => makeSiliconeMaterial(tex, [KP_CELLS_X / 80, KP_CELLS_Y / 80]), [tex]);
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
        userData={{ pick: { kind: 'keys', moduleId } }}
      >
        <planeGeometry args={[PLANE_W, PLANE_H]} />
      </mesh>
      <HeaderControls moduleId={moduleId} width={def.width} depth={def.depth} controls={CONTROLS} />
      <PowerLed width={def.width} depth={def.depth} powered={powered} />
      <BlockBadge name="Keypad" x={0} z={badgeZ(def.depth)} />
    </group>
  );
}
