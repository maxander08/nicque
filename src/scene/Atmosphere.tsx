import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, FogExp2 } from 'three';
import { getMaterials } from '@/materials/library';
import { LIGHTING_PRESETS } from '@/rendering/lighting';
import { useStore } from '@/state/store';

/** Applies the colour side of the active lighting scene: fog, ground colour and the page-level background. */
export function Atmosphere() {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const lighting = useStore((s) => s.lighting);

  useEffect(() => {
    const p = LIGHTING_PRESETS[lighting];
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.set(p.fog);
      scene.fog.density = p.fogDensity;
    } else {
      scene.fog = new FogExp2(new Color(p.fog), p.fogDensity);
    }
    getMaterials().ground.color.set(p.ground);
    invalidate();
  }, [scene, invalidate, lighting]);

  return null;
}
