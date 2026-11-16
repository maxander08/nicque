import { DOCK_GAP, MODULE_DEFINITIONS } from '@/modules/definitions';
import { footprint, obbOverlap, portWorld } from '@/modules/spatial';
import type { ModuleRecord, ModuleType, Vec2, Workspace } from '@/types';
import { WORLD_LIMIT } from './placement';

/** Where a newly added block appears. Pure and testable. */

const SPAWN_MARGIN = 0.12;

const free = (ws: Workspace, probe: ModuleRecord, margin = 0.01) =>
  !ws.modules.some((m) => obbOverlap(footprint(probe, margin), footprint(m, margin)));

const draft = (type: ModuleType, position: Vec2, rotation = 0): ModuleRecord =>
  ({ id: '__new__', type, name: '', position, rotation, config: {} }) as unknown as ModuleRecord;

/**
 * A Keyboard Block is docked in front of a Text Block whose keyboard input is still free, so that the two
 * connectors face each other and only the link itself is left to make.
 */
function dockedKeyboard(ws: Workspace): { position: Vec2; rotation: number } | null {
  const keyOut = MODULE_DEFINITIONS.keyboard.ports.find((p) => p.id === 'key-out')!;
  for (const text of ws.modules) {
    if (text.type !== 'text') continue;
    const inPort = MODULE_DEFINITIONS.text.ports.find((p) => p.id === 'key-in')!;
    const used = ws.connections.some((c) => c.to.moduleId === text.id && c.to.portId === inPort.id);
    if (used) continue;
    const q = portWorld(text, inPort);
    for (let rotation = 0; rotation < 4; rotation++) {
      const p0 = portWorld(draft('keyboard', { x: 0, z: 0 }, rotation), keyOut);
      if (p0.nx * q.nx + p0.nz * q.nz > -0.9) continue;
      const position = { x: q.x + q.nx * DOCK_GAP - p0.x, z: q.z + q.nz * DOCK_GAP - p0.z };
      if (Math.abs(position.x) > WORLD_LIMIT || Math.abs(position.z) > WORLD_LIMIT) continue;
      if (free(ws, draft('keyboard', position, rotation))) return { position, rotation };
    }
  }
  return null;
}

/** The nearest free spot to the front of the workspace, on a half-unit grid. */
function freeSpot(ws: Workspace, type: ModuleType): Vec2 {
  const anchor = { x: 0, z: 4 };
  const spots: Vec2[] = [];
  for (let x = -10; x <= 10; x += 0.5) for (let z = -10; z <= 10; z += 0.5) spots.push({ x, z });
  spots.sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z));
  return spots.find((s) => free(ws, draft(type, s), SPAWN_MARGIN)) ?? { x: 0, z: WORLD_LIMIT / 2 };
}

export function spawnPlacement(ws: Workspace, type: ModuleType): { position: Vec2; rotation: number } {
  if (type === 'keyboard') {
    const docked = dockedKeyboard(ws);
    if (docked) return docked;
  }
  return { position: freeSpot(ws, type), rotation: 0 };
}
