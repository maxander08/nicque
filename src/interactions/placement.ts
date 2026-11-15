import { DOCK_GAP, MODULE_DEFINITIONS } from '@/modules/definitions';
import { footprint, obbOverlap, portWorld } from '@/modules/spatial';
import type { ModuleRecord, Vec2, Workspace } from '@/types';

/** Drag placement: grid snapping, magnetic docking and collision handling. Pure and testable. */

export const GRID_STEP = 0.25;
export const MAGNET_RANGE = 0.45;
export const WORLD_LIMIT = 14;
const COLLISION_MARGIN = 0.01;

export interface PlacementOptions {
  snap: boolean;
}

const snapValue = (v: number, step: number) => Math.round(v / step) * step;
const clampLimit = (v: number) => Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, v));

function collides(ws: Workspace, moving: ModuleRecord, pos: Vec2): boolean {
  const candidate = footprint({ ...moving, position: pos }, COLLISION_MARGIN);
  return ws.modules.some((m) => m.id !== moving.id && obbOverlap(candidate, footprint(m, COLLISION_MARGIN)));
}

/** Offsets a position so that a facing pair of connectors sits exactly one dock gap apart. */
export function magnetOffset(ws: Workspace, moving: ModuleRecord, pos: Vec2): Vec2 | null {
  const probe: ModuleRecord = { ...moving, position: pos };
  let best: { d: number; dx: number; dz: number } | null = null;
  for (const pDef of MODULE_DEFINITIONS[moving.type].ports) {
    const p = portWorld(probe, pDef);
    for (const other of ws.modules) {
      if (other.id === moving.id) continue;
      for (const qDef of MODULE_DEFINITIONS[other.type].ports) {
        const q = portWorld(other, qDef);
        if (p.nx * q.nx + p.nz * q.nz > -0.9) continue;
        const tx = q.x + q.nx * DOCK_GAP;
        const tz = q.z + q.nz * DOCK_GAP;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < MAGNET_RANGE && (!best || d < best.d)) best = { d, dx, dz };
      }
    }
  }
  return best ? { x: pos.x + best.dx, z: pos.z + best.dz } : null;
}

export function resolvePlacement(
  ws: Workspace,
  id: string,
  proposed: Vec2,
  previous: Vec2,
  opts: PlacementOptions,
): Vec2 {
  const moving = ws.modules.find((m) => m.id === id);
  if (!moving) return previous;

  const tryPos = (p: Vec2): Vec2 | null => {
    let pos = { x: clampLimit(p.x), z: clampLimit(p.z) };
    if (opts.snap) pos = { x: snapValue(pos.x, GRID_STEP), z: snapValue(pos.z, GRID_STEP) };
    const docked = magnetOffset(ws, moving, pos);
    if (docked) pos = docked;
    return collides(ws, moving, pos) ? null : pos;
  };

  return (
    tryPos(proposed) ??
    tryPos({ x: proposed.x, z: previous.z }) ??
    tryPos({ x: previous.x, z: proposed.z }) ??
    previous
  );
}
