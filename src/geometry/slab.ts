import {
  BufferGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural "slab" geometry: a rounded-rectangle plan extruded upwards with real bevelled edges and
 * optional rounded-rectangle / circular openings. Side walls are swept from a bevel profile, so normals
 * are analytically smooth on bevels while the flat caps keep crisp planar normals.
 *
 * Coordinate system: centred on X/Z, Y from 0 to `height`.
 */

export interface HoleSpec {
  cx: number;
  cz: number;
  w: number;
  d: number;
  /** Corner radius (use w/2 with w === d for a circle). */
  r: number;
  /** Radius of the rounded lip on the top edge of the opening. */
  lip?: number;
  segments?: number;
}

export interface SlabSpec {
  width: number;
  depth: number;
  height: number;
  radius: number;
  bevelTop?: number;
  bevelBottom?: number;
  bevelSegments?: number;
  cornerSegments?: number;
  holes?: HoleSpec[];
  uvScale?: number;
}

interface Outline {
  centers: Array<[number, number]>;
  seg: number;
}

interface Ring {
  rho: number;
  y: number;
  nh: number;
  ny: number;
}

const QUARTER = Math.PI / 2;

function makeOutline(cx: number, cz: number, hw: number, hd: number, r: number, seg: number): Outline {
  const ex = Math.max(hw - r, 0);
  const ez = Math.max(hd - r, 0);
  return {
    centers: [
      [cx + ex, cz + ez],
      [cx - ex, cz + ez],
      [cx - ex, cz - ez],
      [cx + ex, cz - ez],
    ],
    seg,
  };
}

const outlineCount = (o: Outline) => 4 * (o.seg + 1);

function pointAt(o: Outline, i: number, rho: number) {
  const k = Math.floor(i / (o.seg + 1));
  const j = i % (o.seg + 1);
  const th = k * QUARTER + (j / o.seg) * QUARTER;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const [cx, cz] = o.centers[k];
  return { x: cx + rho * c, z: cz + rho * s, c, s };
}

/** Flips triangle winding when the geometric normal disagrees with the stored vertex normals. */
function orient(g: BufferGeometry) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.getIndex()!;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    const ux = pos.getX(b) - pos.getX(a);
    const uy = pos.getY(b) - pos.getY(a);
    const uz = pos.getZ(b) - pos.getZ(a);
    const vx = pos.getX(c) - pos.getX(a);
    const vy = pos.getY(c) - pos.getY(a);
    const vz = pos.getZ(c) - pos.getZ(a);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) continue;
    const dot = nx * nor.getX(a) + ny * nor.getY(a) + nz * nor.getZ(a);
    if (dot < 0) flipWinding(g);
    return;
  }
}

function flipWinding(g: BufferGeometry) {
  const idx = g.getIndex()!;
  for (let t = 0; t < idx.count; t += 3) {
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    idx.setX(t + 1, c);
    idx.setX(t + 2, b);
  }
  idx.needsUpdate = true;
}

function band(o: Outline, rings: Ring[], uvScale: number): BufferGeometry {
  const n = outlineCount(o);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const ring of rings) {
    let u = 0;
    let prev: { x: number; z: number } | null = null;
    for (let i = 0; i <= n; i++) {
      const p = pointAt(o, i % n, ring.rho);
      if (prev) u += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
      pos.push(p.x, ring.y, p.z);
      nor.push(p.c * ring.nh, ring.ny, p.s * ring.nh);
      uv.push(u * uvScale, ring.y * uvScale);
    }
  }
  const w = n + 1;
  for (let a = 0; a < rings.length - 1; a++) {
    for (let i = 0; i < n; i++) {
      const v00 = a * w + i;
      const v01 = v00 + 1;
      const v10 = (a + 1) * w + i;
      const v11 = v10 + 1;
      idx.push(v00, v10, v01, v01, v10, v11);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  orient(g);
  return g;
}

function loopPoints(o: Outline, rho: number): Vector2[] {
  const pts: Vector2[] = [];
  const n = outlineCount(o);
  for (let i = 0; i < n; i++) {
    const p = pointAt(o, i, rho);
    // shape space: y = -z (see rotateX below)
    const v = new Vector2(p.x, -p.z);
    const last = pts[pts.length - 1];
    if (!last || last.distanceTo(v) > 1e-6) pts.push(v);
  }
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return pts;
}

function cap(
  outer: Outline,
  rho: number,
  y: number,
  up: boolean,
  holes: Array<{ o: Outline; rho: number }>,
  uvScale: number,
): BufferGeometry {
  const shape = new Shape(loopPoints(outer, rho));
  for (const h of holes) shape.holes.push(new Path(loopPoints(h.o, h.rho)));
  const g = new ShapeGeometry(shape);
  g.rotateX(-QUARTER);
  g.translate(0, y, 0);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  if (!up) {
    flipWinding(g);
    const nor = g.getAttribute('normal');
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, -1, 0);
  }
  return g;
}

export function createSlabGeometry(spec: SlabSpec): BufferGeometry {
  const { width, depth, height: h, radius: R0 } = spec;
  const bt = spec.bevelTop ?? 0;
  const bb = spec.bevelBottom ?? 0;
  const segB = spec.bevelSegments ?? 4;
  const cs = spec.cornerSegments ?? 10;
  const uvScale = spec.uvScale ?? 1;

  const outer = makeOutline(0, 0, width / 2, depth / 2, R0, cs);
  const rings: Ring[] = [];
  if (bb > 0) {
    for (let s = 0; s <= segB; s++) {
      const phi = -QUARTER + (s / segB) * QUARTER;
      rings.push({
        rho: R0 - (bb - bb * Math.cos(phi)),
        y: bb + bb * Math.sin(phi),
        nh: Math.cos(phi),
        ny: Math.sin(phi),
      });
    }
  } else rings.push({ rho: R0, y: 0, nh: 1, ny: 0 });
  if (bt > 0) {
    for (let s = 0; s <= segB; s++) {
      const phi = (s / segB) * QUARTER;
      rings.push({
        rho: R0 - (bt - bt * Math.cos(phi)),
        y: h - bt + bt * Math.sin(phi),
        nh: Math.cos(phi),
        ny: Math.sin(phi),
      });
    }
  } else rings.push({ rho: R0, y: h, nh: 1, ny: 0 });

  const parts: BufferGeometry[] = [band(outer, rings, uvScale)];

  const topHoles: Array<{ o: Outline; rho: number }> = [];
  for (const hs of spec.holes ?? []) {
    const lip = hs.lip ?? 0.012;
    const ho = makeOutline(hs.cx, hs.cz, hs.w / 2, hs.d / 2, hs.r, hs.segments ?? cs);
    const hr: Ring[] = [];
    for (let s = 0; s <= 3; s++) {
      const phi = QUARTER - (s / 3) * QUARTER;
      hr.push({
        rho: hs.r + lip - lip * Math.cos(phi),
        y: h - lip + lip * Math.sin(phi),
        nh: -Math.cos(phi),
        ny: Math.sin(phi),
      });
    }
    hr.push({ rho: hs.r, y: 0, nh: -1, ny: 0 });
    parts.push(band(ho, hr, uvScale));
    topHoles.push({ o: ho, rho: hs.r + lip });
  }

  parts.push(cap(outer, R0 - bt, h, true, topHoles, uvScale));
  parts.push(cap(outer, R0 - bb, 0, false, [], uvScale));

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Outline of the rounded rectangle as a three.js Shape (for flat rings / decals), in X/Z space. */
export function roundedRectPoints(width: number, depth: number, r: number, seg = 10): Array<[number, number]> {
  const o = makeOutline(0, 0, width / 2, depth / 2, r, seg);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < outlineCount(o); i++) {
    const p = pointAt(o, i, r);
    out.push([p.x, p.z]);
  }
  return out;
}

/** A flat ring (annulus) following the module footprint, lying on the XZ plane facing +Y. */
export function createFootprintRing(
  width: number,
  depth: number,
  r: number,
  inner: number,
  outer: number,
  seg = 10,
): BufferGeometry {
  const o = makeOutline(0, 0, width / 2, depth / 2, r, seg);
  const g = cap(o, r + outer, 0, true, [{ o, rho: r + inner }], 1);
  return g;
}
