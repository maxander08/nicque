import { useEffect, useMemo } from 'react';
import { makeSiliconeMaterial } from '@/materials/library';
import { drawKeyboardScreen } from '@/materials/screens';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { KB_CELLS_X, KB_CELLS_Y, KB_TEX_H, KB_TEX_W } from '@/modules/keyboard';
import { useStore } from '@/state/store';
import { useFontsReady, useScreenTexture } from '../hooks';
import { BlockBadge } from '../parts/Decals';
import { Housing } from '../parts/Housing';
import { LedRow } from '../parts/LedRow';
import { badgeZ, contentTopZ } from '@/modules/layout';

const def = MODULE_DEFINITIONS.keyboard;

/** The LED lattice pitch is the Display Block's (1.76 world units over 80 cells), so both screens look alike. */
const CELL = 1.76 / 80;
export const KB_PLANE_W = KB_CELLS_X * CELL;
export const KB_PLANE_H = KB_CELLS_Y * CELL;
const WINDOW_D = KB_PLANE_H - 0.04;
const WINDOW = { cz: contentTopZ(def.depth) + WINDOW_D / 2, w: KB_PLANE_W - 0.04, d: WINDOW_D };

/** Pressure of the pressed keys of one module, as a stable string so that selectors do not re-render needlessly. */
function useDownSignature(moduleId: string) {
  return useStore((s) => {
    const prefix = `${moduleId}:`;
    let out = '';
    for (const k in s.keysDown) if (k.startsWith(prefix)) out += `${k.slice(prefix.length)}=${s.keysDown[k].toFixed(2)};`;
    return out;
  });
}

export function KeyboardBlockView({ moduleId }: { moduleId: string }) {
  const screen = useStore((s) => s.runtime.modules[moduleId]?.screen) ?? { kind: 'off' as const };
  const operational = useStore((s) => s.runtime.modules[moduleId]?.state === 'operational');
  const shift = useStore((s) => s.kbMods[moduleId]?.shift ?? false);
  const caps = useStore((s) => s.kbMods[moduleId]?.caps ?? false);
  const downSig = useDownSignature(moduleId);
  const fonts = useFontsReady();

  const holes = useMemo(
    () => [{ cx: 0, cz: WINDOW.cz, w: WINDOW.w, d: WINDOW.d, r: 0.07, lip: 0.015, segments: 8 }],
    [],
  );

  const down = useMemo(() => {
    const out: Record<string, number> = {};
    for (const part of downSig.split(';')) {
      if (!part) continue;
      const [id, p] = part.split('=');
      out[id] = Number(p);
    }
    return out;
  }, [downSig]);

  const linked = screen.kind === 'keys' && screen.linked;
  const tex = useScreenTexture(
    KB_TEX_W,
    KB_TEX_H,
    (ctx) => drawKeyboardScreen(ctx, screen, { shift, caps }, down),
    [screen.kind, linked, shift, caps, downSig, fonts],
  );
  const silicone = useMemo(
    () => makeSiliconeMaterial(tex, [KB_CELLS_X / 80, KB_CELLS_Y / 80]),
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
        userData={{ pick: { kind: 'keys', moduleId } }}
      >
        <planeGeometry args={[KB_PLANE_W, KB_PLANE_H]} />
      </mesh>
      <LedRow width={def.width} depth={def.depth} level={operational ? 1 : 0} />
      <BlockBadge name="Keyboard" x={0} z={badgeZ(def.depth)} />
    </group>
  );
}
