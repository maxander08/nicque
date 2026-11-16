/**
 * Lighting scenes: the whole mood of the workspace (ground, fog / sky, environment probe and lights) in one
 * preset. `studio` is the original product-photography rig; the others get progressively darker.
 */

export type LightingId = 'studio' | 'dim' | 'dusk' | 'night' | 'black';

export interface LightingPreset {
  id: LightingId;
  label: string;
  hint: string;
  /** Ground colour. */
  ground: string;
  /** Fog and sky-dome colour (the ground fades into it, so no horizon is visible). */
  fog: string;
  fogDensity: number;
  /** Background of the procedural environment probe. */
  probe: string;
  /** Colour tint of the probe's softboxes. */
  tint: string;
  /** Overall environment-light strength and a multiplier for the softboxes inside the probe. */
  envIntensity: number;
  softboxes: number;
  key: { color: string; intensity: number };
  rim: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
}

export const LIGHTING_PRESETS: Record<LightingId, LightingPreset> = {
  studio: {
    id: 'studio',
    label: 'Studio',
    hint: 'Soft, neutral product lighting',
    ground: '#76777b',
    fog: '#4d4f53',
    fogDensity: 0.013,
    probe: '#3b3d41',
    tint: '#ffffff',
    envIntensity: 0.5,
    softboxes: 1,
    key: { color: '#ffffff', intensity: 1.5 },
    rim: { color: '#ffffff', intensity: 0.45 },
    hemisphere: { sky: '#ffffff', ground: '#6d6e72', intensity: 0.12 },
  },
  dim: {
    id: 'dim',
    label: 'Dim room',
    hint: 'A much darker, low-key room',
    ground: '#3e3f43',
    fog: '#232427',
    fogDensity: 0.016,
    probe: '#141517',
    tint: '#e4e9ff',
    envIntensity: 0.3,
    softboxes: 0.5,
    key: { color: '#eef1ff', intensity: 0.55 },
    rim: { color: '#dfe6ff', intensity: 0.22 },
    hemisphere: { sky: '#cfd6ff', ground: '#2a2b2e', intensity: 0.05 },
  },
  dusk: {
    id: 'dusk',
    label: 'Warm dusk',
    hint: 'Low amber light, cool rim',
    ground: '#5a4c49',
    fog: '#271d1f',
    fogDensity: 0.015,
    probe: '#1a1210',
    tint: '#ffc59a',
    envIntensity: 0.34,
    softboxes: 0.75,
    key: { color: '#ffae72', intensity: 1.05 },
    rim: { color: '#7f90ff', intensity: 0.4 },
    hemisphere: { sky: '#ffd2b0', ground: '#2a1d1a', intensity: 0.07 },
  },
  night: {
    id: 'night',
    label: 'Night',
    hint: 'Deep blue moonlight',
    ground: '#14171f',
    fog: '#06080f',
    fogDensity: 0.02,
    probe: '#04060c',
    tint: '#7f9bff',
    envIntensity: 0.22,
    softboxes: 0.45,
    key: { color: '#8ea6ff', intensity: 0.5 },
    rim: { color: '#5c7cff', intensity: 0.32 },
    hemisphere: { sky: '#6d86ff', ground: '#05060a', intensity: 0.05 },
  },
  black: {
    id: 'black',
    label: 'Blackout',
    hint: 'Pitch black. Only the LEDs glow',
    ground: '#040405',
    fog: '#000000',
    fogDensity: 0.03,
    probe: '#000000',
    tint: '#ffffff',
    envIntensity: 0.1,
    softboxes: 0.3,
    key: { color: '#ffffff', intensity: 0.22 },
    rim: { color: '#ffffff', intensity: 0.14 },
    hemisphere: { sky: '#ffffff', ground: '#000000', intensity: 0.0 },
  },
};

export const LIGHTING_IDS = Object.keys(LIGHTING_PRESETS) as LightingId[];

export const isLightingId = (v: unknown): v is LightingId => typeof v === 'string' && v in LIGHTING_PRESETS;
