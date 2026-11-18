import { Vector3 } from 'three';
import type { Quality } from '@/state/store';

/**
 * Rendering configuration.
 *
 * Techniques that are actually implemented (see README "Rendering"):
 *  - PBR materials (MeshPhysicalMaterial) with a procedural studio environment (PMREM probe)
 *  - Directional key light with PCF soft shadow maps (high and medium quality)
 *  - Ground: analytic SDF *ray-marched* soft shadow and ambient occlusion evaluated in the ground shader
 *  - N8AO screen-space ambient occlusion, MSAA, ACES tone mapping, subtle vignette (high and medium quality)
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
  /**
   * PCF filter radius in shadow-map texels. three's PCF filter takes only 5 (bilinear) samples per pixel, so a radius
   * much beyond 2 texels turns into visible grain; the radius is kept small and the map is fitted tightly instead.
   */
  shadowRadius: number;
  postprocessing: boolean;
  multisampling: number;
  dpr: [number, number];
  ao: 'medium' | 'high';
  /** Run the N8AO pass at half resolution with depth-aware upsampling. */
  aoHalfRes: boolean;
  /** Skip N8AO transparent-object re-render passes. */
  aoSkipTransparency: boolean;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  high: {
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 2,
    postprocessing: true,
    multisampling: 4,
    dpr: [1, 2],
    ao: 'high',
    // half-resolution AO with depth-aware upsampling is visually the same for soft occlusion at a quarter of the cost
    aoHalfRes: true,
    aoSkipTransparency: false,
  },
  medium: {
    shadows: true,
    // 1024 is plenty for the 12x12 shadow frustum; the map is also only re-rendered when the scene changes.
    shadowMapSize: 1024,
    shadowRadius: 1.5,
    postprocessing: true,
    // 2x MSAA + a 1.5 DPR cap cuts fill-rate and bandwidth by more than half on HiDPI screens.
    multisampling: 2,
    dpr: [1, 1.5],
    ao: 'medium',
    aoHalfRes: true,
    aoSkipTransparency: true,
  },
  performance: {
    shadows: false,
    shadowMapSize: 512,
    shadowRadius: 1,
    postprocessing: false,
    multisampling: 0,
    dpr: [1, 1],
    ao: 'medium',
    aoHalfRes: true,
    aoSkipTransparency: true,
  },
};
