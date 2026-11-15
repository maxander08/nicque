import { Vector3 } from 'three';
import type { Quality } from '@/state/store';

/**
 * Rendering configuration.
 *
 * Techniques that are actually implemented (see README "Rendering"):
 *  - PBR materials (MeshPhysicalMaterial) with a procedural studio environment (PMREM probe)
 *  - Directional key light with PCF soft shadow maps (high quality only)
 *  - Ground: analytic SDF *ray-marched* soft shadow and ambient occlusion evaluated in the ground shader
 *  - N8AO screen-space ambient occlusion, MSAA, ACES tone mapping, subtle vignette (high quality only)
 *
 * NOT implemented: hardware ray tracing (WebGL exposes none), screen-space reflections, temporal accumulation.
 */

export const KEY_LIGHT_POSITION = new Vector3(-4.2, 9.5, 5.5);
export const KEY_LIGHT_DIRECTION = KEY_LIGHT_POSITION.clone().normalize();

/** Colour the ground fades to in the distance; also the sky-dome colour so no horizon is visible. */
export const FOG_COLOR = '#4d4f53';
export const FOG_DENSITY = 0.013;

export interface QualitySettings {
  shadows: boolean;
  shadowMapSize: number;
  postprocessing: boolean;
  multisampling: number;
  dpr: [number, number];
  ao: 'medium' | 'high';
}

export const QUALITY: Record<Quality, QualitySettings> = {
  high: {
    shadows: true,
    shadowMapSize: 2048,
    postprocessing: true,
    multisampling: 4,
    dpr: [1, 2],
    ao: 'high',
  },
  performance: {
    shadows: false,
    shadowMapSize: 512,
    postprocessing: false,
    multisampling: 0,
    dpr: [1, 1],
    ao: 'medium',
  },
};
