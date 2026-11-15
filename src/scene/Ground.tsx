import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { getMaterials } from '@/materials/library';
import { FOG_COLOR, KEY_LIGHT_DIRECTION } from '@/rendering/config';
import {
  createGroundOcclusionUniforms,
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
  const uniforms = useMemo(() => createGroundOcclusionUniforms(KEY_LIGHT_DIRECTION), []);

  useEffect(() => {
    material.onBeforeCompile = (shader) => patchGroundShader(shader, uniforms);
    material.customProgramCacheKey = () => 'nicque-ground-occlusion';
    material.needsUpdate = true;
    return () => {
      material.onBeforeCompile = () => undefined;
    };
  }, [material, uniforms]);

  // Only touch uniforms when the module list actually changed.
  const last = useRef<ModuleRecord[] | null>(null);
  useFrame(() => {
    const mods = useStore.getState().workspace.modules;
    if (last.current !== mods) {
      last.current = mods;
      updateGroundOcclusionUniforms(uniforms, mods);
    }
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow={false}>
        <circleGeometry args={[900, 96]} />
      </mesh>
      {/* sky dome: same colour as the fog, drawn behind everything */}
      <mesh renderOrder={-10} raycast={() => null}>
        <sphereGeometry args={[1200, 24, 12]} />
        <meshBasicMaterial color={FOG_COLOR} side={1} fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}
