import { BLOCK_HEIGHT } from '@/modules/definitions';
import type { Obb, WorldPort } from '@/modules/spatial';
import { pointInObb } from '@/modules/spatial';

/**
 * Link geometry derived from real connector positions.
 *
 * When two linked connectors are physically docked no cable is needed. When they are apart, a flexible
 * link cable is routed from connector to connector. All maths here is renderer independent.
 */

export const CABLE_RADIUS = 0.04;
export const DOCK_DISTANCE = 0.12;
export const PORT_HEIGHT = 0.095;

export function isDocked(a: WorldPort, b: WorldPort): boolean {
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  const facing = a.nx * b.nx + a.nz * b.nz;
  return d <= DOCK_DISTANCE && facing < -0.9;
}

type P3 = [number, number, number];

function bezier(p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] {
  const u = 1 - t;
  return p0.map(
    (_, i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i],
  );
}

/**
 * Samples a cable path between two connectors. The cable leaves each connector along its normal, lies
 * on the ground in between, and arches over any housing it would otherwise cross.
 */
export function cablePath(a: WorldPort, b: WorldPort, obstacles: Obb[], samples = 40): P3[] {
  const dist = Math.hypot(a.x - b.x, a.z - b.z);
  const k = Math.min(Math.max(dist * 0.42, 0.35), 2.2);
  const p0 = [a.x, a.z];
  const p1 = [a.x + a.nx * k, a.z + a.nz * k];
  const p2 = [b.x + b.nx * k, b.z + b.nz * k];
  const p3 = [b.x, b.z];

  const flat: number[][] = [];
  for (let i = 0; i <= samples; i++) flat.push(bezier(p0, p1, p2, p3, i / samples));

  const hits = flat.map((p, i) => {
    if (i < 2 || i > samples - 2) return false;
    return obstacles.some((o) => pointInObb(o, p[0], p[1]));
  });
  const collides = hits.some(Boolean);

  const yEnd = PORT_HEIGHT;
  const out: P3[] = flat.map((p, i) => {
    const t = i / samples;
    const s = Math.sin(Math.PI * t);
    let y = CABLE_RADIUS + (yEnd - CABLE_RADIUS) * (1 - Math.pow(s, 0.8));
    if (collides) {
      y = yEnd + (BLOCK_HEIGHT + 0.22 - yEnd) * Math.pow(s, 0.6);
    }
    return [p[0], Math.max(y, CABLE_RADIUS), p[1]];
  });
  return out;
}
