import { useEffect, useMemo } from 'react';
import { makeSiliconeMaterial } from '@/materials/library';
import { DISPLAY_SIZE, drawDisplayScreen } from '@/materials/screens';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { useFontsReady, useScreenTexture } from '../hooks';
import { BlockBadge } from '../parts/Decals';
import { Housing } from '../parts/Housing';
import { EDGE, windowWidth } from '@/modules/layout';

const def = MODULE_DEFINITIONS.display;
/** The window sits EDGE from every border: the same margin as every other block. */
const WINDOW = windowWidth(def.width);

export function DisplayBlockView({ moduleId }: { moduleId: string }) {
  const screen = useStore((s) => s.runtime.modules[moduleId]?.screen) ?? { kind: 'off' as const };
  const align = useStore((s) => {
    const m = s.workspace.modules.find((x) => x.id === moduleId);
    return m && m.type === 'display' ? m.config.align : 'center';
  });
  const fonts = useFontsReady();

  const holes = useMemo(
    () => [{ cx: 0, cz: 0, w: WINDOW, d: WINDOW, r: 0.07, lip: 0.015, segments: 8 }],
    [],
  );

  const text = screen.kind === 'text' ? screen.text : '';
  const tex = useScreenTexture(
    DISPLAY_SIZE,
    DISPLAY_SIZE,
    (ctx) => drawDisplayScreen(ctx, screen, align),
    [screen.kind, text, align, fonts],
  );
  const silicone = useMemo(() => makeSiliconeMaterial(tex), [tex]);
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
      <mesh position={[0, BLOCK_HEIGHT - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={silicone.material}
        receiveShadow
        userData={{ pick: { kind: 'screen', moduleId } }}
      >
        <planeGeometry args={[WINDOW + 0.04, WINDOW + 0.04]} />
      </mesh>
      {/* no LED band on this block: the badge is centred in the cover margin below the window */}
      <BlockBadge name="Display" x={0} z={def.depth / 2 - EDGE / 2} width={0.34} height={0.14} />
    </group>
  );
}
