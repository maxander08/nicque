import type { Obb, WorldPort } from '@/modules/spatial';
import { fromLocal, pointInObb, segmentCrossesObb } from '@/modules/spatial';

/**
 * Link geometry derived from real connector positions.
 *
 * When two linked connectors are physically docked no cable is needed. When they are apart, a flexible
 * link cable is routed from connector to connector. All maths here is renderer independent.
 *
 * Routing rules (the cable must always look like a real cable lying on the table):
 *  1. It leaves each connector straight along the connector's normal.
 *  2. It lies on the ground. It never lifts over a housing and never passes through one.
 *  3. If the direct curve is clear it is used; otherwise the shortest path around the footprints (with a
 *     safety margin) is found on a visibility graph and its corners are rounded with wide arcs (as wide as the free space allows), so every bend is a
 *     long, gentle arc instead of a sharp left / right turn.
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
type P2 = [number, number];

/** Margins tried in order: roomy first, then tighter ones when connectors sit close to a neighbour. */
const CLEARANCES = [0.5, 0.36, 0.24, 0.16, 0.1, 0.06];
/** Straight run leaving a plug before the first bend, longest (most room to arc gently) first. */
const LEADS = [0.8, 0.55, 0.34];
/** Smallest distance the finished cable may come to a housing. */
const SAFE_GAP = 0.05;
/** How much a corner bend of a given reach eats into the clearance (quadratic bend at a right angle: 0.35). */
const BEND_BITE = 0.36;
/** The bend reach used by the fallback: the original, tight rounding. */
const TIGHT_BEND = 0.3;
const MAX_BEND = 1.6;
/** Length over which the cable rises from the ground to a plug. */
const LIFT = 0.34;
/** Shortest straight run leaving a plug. */
const LEAD_MIN = 0.12;

function bezier(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

const inflate = (o: Obb, c: number): Obb => ({ ...o, hw: o.hw + c, hd: o.hd + c });

/** Smooth curve between the connectors that follows their normals. */
function directCurve(a: WorldPort, b: WorldPort, samples = 48): P2[] {
  const dist = Math.hypot(a.x - b.x, a.z - b.z);
  const k = Math.min(Math.max(dist * 0.45, 0.08), 2.2);
  const p0: P2 = [a.x, a.z];
  const p1: P2 = [a.x + a.nx * k, a.z + a.nz * k];
  const p2: P2 = [b.x + b.nx * k, b.z + b.nz * k];
  const p3: P2 = [b.x, b.z];
  const out: P2[] = [];
  for (let i = 0; i <= samples; i++) out.push(bezier(p0, p1, p2, p3, i / samples));
  return out;
}

function curveIsClear(points: P2[], boxes: Obb[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const o of boxes) {
      if (segmentCrossesObb(o, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], 0)) return false;
    }
  }
  return true;
}

/** Shortest route from `s` to `e` around the boxes, or null when an end point is inside one. */
function routeAround(s: P2, e: P2, boxes: Obb[]): P2[] | null {
  const inside = (p: P2, ignore = -1) => boxes.some((o, i) => i !== ignore && pointInObb(o, p[0], p[1]));
  if (inside(s) || inside(e)) return null;

  const nodes: P2[] = [s, e];
  boxes.forEach((o, i) => {
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      // nudge the corner slightly outwards so the route is not exactly on the boundary
      const c = fromLocal(o, sx * (o.hw + 0.012), sz * (o.hd + 0.012));
      const p: P2 = [c.x, c.z];
      if (!inside(p, i) && !boxes.some((q, j) => j === i && pointInObb(inflate(q, -0.004), p[0], p[1]))) nodes.push(p);
    }
  });

  const visible = (p: P2, q: P2) => !boxes.some((o) => segmentCrossesObb(o, p[0], p[1], q[0], q[1]));
  const n = nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity) break;
    done[u] = true;
    if (u === 1) break;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      if (!visible(nodes[u], nodes[v])) continue;
      const d = dist[u] + Math.hypot(nodes[u][0] - nodes[v][0], nodes[u][1] - nodes[v][1]);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (dist[1] === Infinity) return null;
  const path: P2[] = [];
  for (let at = 1; at !== -1; at = prev[at]) path.push(nodes[at]);
  return path.reverse();
}

/** Drops vertices that lie (almost) on the line between their neighbours. */
function simplify(path: P2[]): P2[] {
  const out: P2[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (len > 1e-9 && Math.abs(cross) / len < 0.01) continue;
    out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * Rounds every corner of a polyline into a quadratic bend and samples the result. `reach` is how far before and
 * after a corner the bend may begin (limited to half of each adjoining straight run): the larger it is, the wider
 * and gentler the arc.
 */
function roundCorners(path: P2[], reach: number, steps = 18): P2[] {
  if (path.length < 3) return path;
  const out: P2[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i - 1];
    const v = path[i];
    const q = path[i + 1];
    const l0 = Math.hypot(v[0] - p[0], v[1] - p[1]);
    const l1 = Math.hypot(q[0] - v[0], q[1] - v[1]);
    const d = Math.min(reach, l0 * 0.5, l1 * 0.5);
    const a: P2 = [v[0] + ((p[0] - v[0]) / l0) * d, v[1] + ((p[1] - v[1]) / l0) * d];
    const b: P2 = [v[0] + ((q[0] - v[0]) / l1) * d, v[1] + ((q[1] - v[1]) / l1) * d];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * v[0] + t * t * b[0], u * u * a[1] + 2 * u * t * v[1] + t * t * b[1]]);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/** Inserts points so that no sample is further apart than `step`. */
function densify(path: P2[], step = 0.25): P2[] {
  const out: P2[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = 1; s <= n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Lays a ground path into 3D: flat on the table, rising smoothly to the plug height at both ends. */
function toHeights(path: P2[]): P3[] {
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  return path.map((p, i) => {
    const edge = Math.min(cum[i], total - cum[i]);
    const t = Math.min(1, edge / Math.min(LIFT, total / 2 || LIFT));
    const y = CABLE_RADIUS + (PORT_HEIGHT - CABLE_RADIUS) * (1 - smooth(t));
    return [p[0], Math.max(y, CABLE_RADIUS), p[1]];
  });
}

/**
 * Samples a cable path between two connector ends (`a`, `b` are the plug tips). `obstacles` are the housing
 * footprints of every block, un-inflated.
 */
export function cablePath(a: WorldPort, b: WorldPort, obstacles: Obb[]): P3[] {
  // 1. the direct curve, when nothing is in its way
  const direct = directCurve(a, b);
  if (curveIsClear(direct, obstacles.map((o) => inflate(o, 0.07)))) return toHeights(direct);

  // 2. the shortest way around the housings. Tried with the longest lead and the widest clearance first, and the
  //    corners are rounded with the gentlest bends that still keep the cable clear of every housing.
  const dist = Math.hypot(a.x - b.x, a.z - b.z);
  const safe = obstacles.map((o) => inflate(o, SAFE_GAP));
  for (const maxLead of LEADS) {
    const lead = Math.max(LEAD_MIN, Math.min(maxLead, dist * 0.4));
    const s: P2 = [a.x + a.nx * lead, a.z + a.nz * lead];
    const e: P2 = [b.x + b.nx * lead, b.z + b.nz * lead];
    for (const clearance of CLEARANCES) {
      const route = routeAround(s, e, obstacles.map((o) => inflate(o, clearance)));
      if (!route) continue;
      const full = simplify([[a.x, a.z], ...route, [b.x, b.z]]);
      const wide = Math.min(MAX_BEND, Math.max(TIGHT_BEND, (clearance * Math.SQRT2 - SAFE_GAP) / BEND_BITE));
      for (const reach of [wide, wide * 0.75, wide * 0.55, wide * 0.4]) {
        if (reach < TIGHT_BEND) break;
        const rounded = roundCorners(full, reach);
        if (curveIsClear(rounded, safe)) return toHeights(densify(rounded, 0.12));
      }
    }
  }

  // 2b. cramped: the original tight rounding on the first route that exists
  {
    const lead = Math.min(0.34, Math.max(LEAD_MIN, dist * 0.3));
    const s: P2 = [a.x + a.nx * lead, a.z + a.nz * lead];
    const e: P2 = [b.x + b.nx * lead, b.z + b.nz * lead];
    for (const clearance of CLEARANCES) {
      const route = routeAround(s, e, obstacles.map((o) => inflate(o, clearance)));
      if (!route) continue;
      const full = simplify([[a.x, a.z], ...route, [b.x, b.z]]);
      return toHeights(densify(roundCorners(full, TIGHT_BEND, 10)));
    }
  }

  // 3. nothing fits (blocks are jammed together): fall back to the direct curve rather than hiding the link
  return toHeights(direct);
}
