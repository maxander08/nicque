import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { getMaterials } from '@/materials/library';
import { KEY_LIGHT_DIRECTION } from '@/rendering/config';
import { LIGHTING_PRESETS } from '@/rendering/lighting';
import { bakeCableShadows, subscribeCableShapes } from '@/rendering/cableShadow';
import {
  createGroundOcclusionUniforms,
  disposeGroundOcclusionUniforms,
  patchGroundShader,
  updateGroundOcclusionUniforms,
} from '@/rendering/groundOcclusion';
import { useStore } from '@/state/store';
import type { ModuleRecord } from '@/types';

/**
 * Endless neutral ground: a very large disc whose far side fades into fog that matches the sky dome colour,
 * so no edge or horizon is ever visible.
 */
export function Ground() {
  const material = getMaterials().ground;
  const skyColor = LIGHTING_PRESETS[useStore((s) => s.lighting)].fog;
  const uniforms = useMemo(() => createGroundOcclusionUniforms(KEY_LIGHT_DIRECTION), []);

  useEffect(() => {
    material.onBeforeCompile = (shader) => patchGroundShader(shader, uniforms);
    material.customProgramCacheKey = () => 'nicque-ground-occlusion';
    material.needsUpdate = true;
    return () => {
      material.onBeforeCompile = () => undefined;
    };
  }, [material, uniforms]);

  useEffect(() => () => disposeGroundOcclusionUniforms(uniforms), [uniforms]);

  // Wire shadows: re-bake the cable shadow map whenever a cable is added, removed or re-routed. The bake is rate
  // limited so dragging a block (which re-routes its cables every frame) never stalls a frame.
  const invalidate = useThree((s) => s.invalidate);
  const cablesDirty = useRef(true);
  const lastBake = useRef(0);
  useEffect(() => {
    cablesDirty.current = true;
    invalidate();
    return subscribeCableShapes(() => {
      cablesDirty.current = true;
      invalidate();
    });
  }, [invalidate]);

  // Only touch uniforms when the module list actually changed.
  const last = useRef<ModuleRecord[] | null>(null);
  useFrame(({ invalidate: again }) => {
    const mods = useStore.getState().workspace.modules;
    if (last.current !== mods) {
      last.current = mods;
      updateGroundOcclusionUniforms(uniforms, mods);
    }
    if (cablesDirty.current) {
      const now = performance.now();
      if (now - lastBake.current >= 40) {
        lastBake.current = now;
        cablesDirty.current = false;
        bakeCableShadows(uniforms, KEY_LIGHT_DIRECTION);
      } else {
        again();
      }
    }
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow={false}>
        <circleGeometry args={[900, 96]} />
      </mesh>
      {/* sky dome: same colour as the fog (of the active lighting scene), drawn behind everything */}
      <mesh renderOrder={-10} raycast={() => null}>
        <sphereGeometry args={[1200, 24, 12]} />
        <meshBasicMaterial color={skyColor} side={1} fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}
