import { CanvasTexture, LinearFilter, type Vector3 } from 'three';
import type { GroundOcclusionUniforms } from './groundOcclusion';

/**
 * Wire shadows for the ground.
 *
 * The key light never moves, so the shadow a cable (or plug) throws on the table is a static 2D picture that only
 * changes when a cable does. That picture is drawn with the 2D canvas API whenever a cable is added, removed or
 * re-routed (rate limited), uploaded as a small texture and read by the ground shader with one fetch per pixel. It
 * therefore costs the same in every quality mode and does not depend on the shadow map, which Fast mode lacks.
 *
 *   R channel: light visibility (1 = lit, lower = shadow)  G channel: contact ambient occlusion (1 = open)
 *
 * The shapes follow the real geometry: every point of the cable is projected onto the table along the light ray,
 * so a cable rising to a plug throws a longer shadow, and the penumbra widens with the height of the occluder
 * (the same 1 / 6.5 slope the ray-marched housing shadows use), so wire and housing shadows read alike.
 */

type P3 = [number, number, number];

export interface CablePort {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

export interface CableShape {
  /** Centre line of the tube (x, y, z). */
  points: P3[];
  /** The two connector ends; a plug sits on each. */
  ends: [CablePort, CablePort];
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Registry: the cable components publish their finished geometry here                                          */
/* ---------------------------------------------------------------------------------------------------------- */

const shapes = new Map<string, CableShape>();
const listeners = new Set<() => void>();
let version = 0;

function bump() {
  version++;
  listeners.forEach((l) => l());
}

export function setCableShape(id: string, shape: CableShape) {
  shapes.set(id, shape);
  bump();
}

export function removeCableShape(id: string) {
  if (shapes.delete(id)) bump();
}

export function subscribeCableShapes(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const cableShapeVersion = () => version;

/** Every cable currently on the table (read-only). */
export const allCableShapes = (): IterableIterator<CableShape> => shapes.values();

/* ---------------------------------------------------------------------------------------------------------- */
/* Baking                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

/** Tube radius and plug box (mirrors connections/cable.ts and scene/Cables.tsx). */
const CABLE_RADIUS = 0.04;
const PLUG_NEAR = 0.016;
const PLUG_FAR = 0.126;
const PLUG_HALF_WIDTH = 0.17;
const PLUG_Y0 = 0.095 - 0.041;
const PLUG_Y1 = 0.095 + 0.041;

/** Penumbra half-width as a function of the height of the occluder (matches the ground shader's k = 6.5). */
const PENUMBRA_SLOPE = 1 / 6.5;
const PENUMBRA_MIN = 0.012;

const LEVELS = 6;
/** Darkest light visibility at the core of a cable's shadow, and darkest contact occlusion under a cable. */
const SHADOW_CORE = 0.1;
const AO_CORE = 0.6;
/** Contact occlusion reaches this far from the cable surface. */
const AO_REACH = 0.13;

const MIN_TEXEL = 0.02;
const SIZES = [256, 512, 1024];
const MARGIN = 0.6;

const smooth = (t: number) => t * t * (3 - 2 * t);

interface BakeState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture;
  size: number;
}

const bakes = new WeakMap<GroundOcclusionUniforms, BakeState>();

function ensureCanvas(u: GroundOcclusionUniforms, size: number): BakeState | null {
  let b = bakes.get(u);
  if (b && b.size === size) return b;
  if (typeof document === 'undefined') return null;
  if (b) b.tex.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) return null;
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  b = { canvas, ctx, tex, size };
  bakes.set(u, b);
  const old = u.uNqCableTex.value;
  u.uNqCableTex.value = tex;
  old.dispose();
  return b;
}

/** World-space shadow offset of a point at height y: it lands on the table at (x, z) - lightXZ * y / lightY. */
function project(x: number, y: number, z: number, L: Vector3): [number, number] {
  const k = y / L.y;
  return [x - L.x * k, z - L.z * k];
}

function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Redraws the cable shadow map from the registered cables and points the ground uniforms at it.
 * Returns false when there is nothing to draw (the ground then skips the lookup entirely).
 */
export function bakeCableShadows(u: GroundOcclusionUniforms, lightDir: Vector3): boolean {
  if (shapes.size === 0) {
    u.uNqCableOn.value = 0;
    return false;
  }
  const L = lightDir;

  // Bounds of everything that can be shadowed (shadow footprints plus a soft margin).
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const s of shapes.values()) {
    for (const [x, y, z] of s.points) {
      grow(x, z);
      grow(...project(x, y, z, L));
    }
    for (const e of s.ends) {
      grow(e.x, e.z);
      grow(e.x + e.nx * PLUG_FAR, e.z + e.nz * PLUG_FAR);
      grow(...project(e.x, PLUG_Y1, e.z, L));
    }
  }
  minX -= MARGIN;
  minZ -= MARGIN;
  maxX += MARGIN;
  maxZ += MARGIN;
  const extent = Math.max(maxX - minX, maxZ - minZ);

  // Smallest canvas that keeps the texel at or below MIN_TEXEL; capped by the largest one.
  const size = SIZES.find((n) => extent / n <= MIN_TEXEL) ?? SIZES[SIZES.length - 1];
  const texel = Math.max(extent / size, 1e-4);
  const b = ensureCanvas(u, size);
  if (!b) {
    u.uNqCableOn.value = 0;
    return false;
  }
  const { ctx } = b;

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // 'darken' keeps the per-channel minimum, so overlapping shapes never add up beyond the darkest one.
  ctx.globalCompositeOperation = 'darken';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const px = (x: number) => (x - minX) / texel;
  const py = (z: number) => (z - minZ) / texel;
  const rgb = (r: number, g: number) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},255)`;

  // Light direction on the table (unit) and how steeply it falls.
  const lh = Math.hypot(L.x, L.z) || 1e-6;
  const lx = L.x / lh;
  const lz = L.z / lh;
  const perpScale = lh / L.y;

  /* ---- cable tubes ---------------------------------------------------------------------------------------- */
  for (const s of shapes.values()) {
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, z0] = pts[i];
      const [x1, y1, z1] = pts[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6 && Math.abs(y1 - y0) < 1e-6) continue;
      const ym = (y0 + y1) / 2;

      // Width of the umbra: the tube's silhouette seen along the light, which widens when the cable runs along it.
      const along = len > 1e-6 ? (dx * lx + dz * lz) / len : 0;
      const across = Math.sqrt(Math.max(0, 1 - along * along));
      const half = CABLE_RADIUS * Math.sqrt(1 + (across * perpScale) ** 2);
      const pen = ym / L.y * PENUMBRA_SLOPE + PENUMBRA_MIN;

      const [a0, a1] = project(x0, y0, z0, L);
      const [b0, b1] = project(x1, y1, z1, L);

      // shadow: soft edge from the outside in
      for (let k = LEVELS; k >= 1; k--) {
        const w = Math.max(half - pen, 0.004) + 2 * pen * (k / LEVELS);
        const v = SHADOW_CORE + (1 - SHADOW_CORE) * smooth((k - 0.5) / LEVELS);
        ctx.strokeStyle = rgb(v, 1);
        ctx.lineWidth = (2 * w) / texel;
        ctx.beginPath();
        ctx.moveTo(px(a0), py(a1));
        ctx.lineTo(px(b0), py(b1));
        ctx.stroke();
      }

      // contact occlusion directly under the tube
      for (let k = LEVELS; k >= 1; k--) {
        const w = CABLE_RADIUS * 0.5 + (AO_REACH + CABLE_RADIUS * 0.5) * (k / LEVELS);
        const v = AO_CORE + (1 - AO_CORE) * smooth((k - 0.5) / LEVELS);
        ctx.strokeStyle = rgb(1, v);
        ctx.lineWidth = (2 * w) / texel;
        ctx.beginPath();
        ctx.moveTo(px(x0), py(z0));
        ctx.lineTo(px(x1), py(z1));
        ctx.stroke();
      }
    }

    /* ---- plugs: a 0.34 wide box floating at port height; its shadow is the hull of its top and bottom ------ */
    for (const e of s.ends) {
      const tx = -e.nz; // across the plug
      const tz = e.nx;
      const corners: Array<[number, number]> = [];
      for (const y of [PLUG_Y0, PLUG_Y1]) {
        for (const d of [PLUG_NEAR, PLUG_FAR]) {
          for (const w of [-PLUG_HALF_WIDTH, PLUG_HALF_WIDTH]) {
            corners.push(project(e.x + e.nx * d + tx * w, y, e.z + e.nz * d + tz * w, L));
          }
        }
      }
      const hull = convexHull(corners);
      if (hull.length < 3) continue;
      const pen = PLUG_Y1 / L.y * PENUMBRA_SLOPE + PENUMBRA_MIN;
      for (let k = LEVELS; k >= 1; k--) {
        const g = 1.4 * pen * (k / LEVELS);
        const v = SHADOW_CORE + (1 - SHADOW_CORE) * smooth((k - 0.5) / LEVELS);
        ctx.fillStyle = rgb(v, 1);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = (2 * g) / texel;
        ctx.beginPath();
        hull.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(px(x), py(z)) : ctx.lineTo(px(x), py(z))));
        ctx.closePath();
        ctx.fill();
        if (g > 0) ctx.stroke();
      }
    }
  }

  b.tex.needsUpdate = true;
  u.uNqCableRect.value.set(minX, minZ, 1 / (size * texel), 1 / (size * texel));
  u.uNqCableOn.value = 1;
  return true;
}
