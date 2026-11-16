import type { ModuleRecord, PortDef } from '@/types';
import { MODULE_DEFINITIONS } from './definitions';

/** Spatial helpers. Pure math, no rendering dependencies. */

const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

export const yawOf = (quarterTurns: number) => (quarterTurns * Math.PI) / 2;

/** Rotates (x, z) about the Y axis using the same convention as three.js `rotation.y`. */
export function rotateXZ(x: number, z: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: clean(x * c + z * s), z: clean(-x * s + z * c) };
}

export interface WorldPort {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

export function portWorld(module: ModuleRecord, port: PortDef): WorldPort {
  const yaw = yawOf(module.rotation);
  const p = rotateXZ(port.local.x, port.local.z, yaw);
  const n = rotateXZ(port.normal.x, port.normal.z, yaw);
  return { x: module.position.x + p.x, z: module.position.z + p.z, nx: n.x, nz: n.z };
}

export interface Obb {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  yaw: number;
}

export function footprint(module: ModuleRecord, inflate = 0): Obb {
  const def = MODULE_DEFINITIONS[module.type];
  return {
    cx: module.position.x,
    cz: module.position.z,
    hw: def.width / 2 + inflate,
    hd: def.depth / 2 + inflate,
    yaw: yawOf(module.rotation),
  };
}

function axes(o: Obb) {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  // local x axis and local z axis in world space
  return [
    { x: c, z: -s },
    { x: s, z: c },
  ];
}

/** Separating-axis test between two oriented boxes on the ground plane. */
export function obbOverlap(a: Obb, b: Obb): boolean {
  const aa = axes(a);
  const ba = axes(b);
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  for (const ax of [...aa, ...ba]) {
    const ra =
      a.hw * Math.abs(aa[0].x * ax.x + aa[0].z * ax.z) + a.hd * Math.abs(aa[1].x * ax.x + aa[1].z * ax.z);
    const rb =
      b.hw * Math.abs(ba[0].x * ax.x + ba[0].z * ax.z) + b.hd * Math.abs(ba[1].x * ax.x + ba[1].z * ax.z);
    const dist = Math.abs(dx * ax.x + dz * ax.z);
    if (dist >= ra + rb - 1e-9) return false;
  }
  return true;
}

export function pointInObb(o: Obb, x: number, z: number): boolean {
  const [ax, az] = axes(o);
  const dx = x - o.cx;
  const dz = z - o.cz;
  return Math.abs(dx * ax.x + dz * ax.z) <= o.hw && Math.abs(dx * az.x + dz * az.z) <= o.hd;
}

/** World point → the box's local frame (x along its width, z along its depth). */
export function toLocal(o: Obb, x: number, z: number): { x: number; z: number } {
  const [ax, az] = axes(o);
  const dx = x - o.cx;
  const dz = z - o.cz;
  return { x: dx * ax.x + dz * ax.z, z: dx * az.x + dz * az.z };
}

/** The box's local point → world. */
export function fromLocal(o: Obb, lx: number, lz: number): { x: number; z: number } {
  const [ax, az] = axes(o);
  return { x: o.cx + lx * ax.x + lz * az.x, z: o.cz + lx * ax.z + lz * az.z };
}

/**
 * True when the segment passes through the interior of the box (touching its boundary does not count, so a
 * route may run exactly along an inflated box).
 */
export function segmentCrossesObb(o: Obb, x0: number, z0: number, x1: number, z1: number, eps = 0.004): boolean {
  const a = toLocal(o, x0, z0);
  const b = toLocal(o, x1, z1);
  const hw = o.hw - eps;
  const hd = o.hd - eps;
  if (hw <= 0 || hd <= 0) return false;
  let t0 = 0;
  let t1 = 1;
  const d = [b.x - a.x, b.z - a.z];
  const p = [a.x, a.z];
  const lim = [hw, hd];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (Math.abs(p[i]) >= lim[i]) return false;
    } else {
      let ta = (-lim[i] - p[i]) / d[i];
      let tb = (lim[i] - p[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) return false;
    }
  }
  return t0 < t1;
}
