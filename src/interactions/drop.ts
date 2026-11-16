import { createModule } from '@/modules/definitions';
import type { ModuleType, Vec2, Workspace } from '@/types';
import { resolvePlacement } from './placement';
import { spawnPlacement } from './spawn';

/**
 * Where a block dragged out of the block library ends up when it is released at `at` (a point on the ground).
 * The centre of the block follows the pointer, then the usual placement rules apply: grid snapping, magnetic
 * docking of facing connectors and no overlap with other blocks (it falls back to the free spot a normal
 * "Add block" would use). Pure and testable.
 */
export function resolveDrop(
  ws: Workspace,
  type: ModuleType,
  at: Vec2,
  snap: boolean,
): { position: Vec2; rotation: number } {
  const fallback = spawnPlacement(ws, type);
  const id = '__drop__';
  const probe = createModule(type, id, fallback.position, fallback.rotation);
  const position = resolvePlacement({ ...ws, modules: [...ws.modules, probe] }, id, at, fallback.position, { snap });
  return { position, rotation: fallback.rotation };
}
