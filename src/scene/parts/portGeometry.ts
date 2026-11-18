import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import type { ModuleType } from '@/types';

/**
 * Every connector of a direction looks the same, so its small parts (pads, magnets, status lights) are merged into
 * one geometry per material and shared by all connectors of all blocks. A block with seven connectors used to
 * draw about 56 meshes for them; it now draws 28, and nothing about the look changes.
 */
const Y = 0.095;
const merge = (parts: BufferGeometry[]) => {
  const g = mergeGeometries(parts, false) ?? parts[0];
  parts.forEach((p) => p !== g && p.dispose());
  return g;
};

const cyl = (r: number, h: number, x: number, z: number) =>
  new CylinderGeometry(r, r, h, 16).rotateZ(Math.PI / 2).translate(x, Y, z);

export interface PortGeometries {
  insert: BufferGeometry;
  contacts: BufferGeometry;
  steel: BufferGeometry;
  lights: BufferGeometry;
}

const cache: Partial<Record<'in' | 'out', PortGeometries>> = {};

export function getPortGeometries(isOut: boolean): PortGeometries {
  const k = isOut ? 'out' : 'in';
  return (cache[k] ??= {
    insert: new BoxGeometry(0.014, 0.072, 0.48).translate(0.002, Y, 0),
    contacts: merge(
      [-0.14, 0, 0.14].map((z) => (isOut ? cyl(0.014, 0.016, 0.014, z) : cyl(0.016, 0.003, 0.0095, z))),
    ),
    steel: merge([-0.205, 0.205].map((z) => cyl(0.018, 0.003, 0.0095, z))),
    lights: merge([
      new BoxGeometry(0.003, 0.007, 0.3).translate(0.0095, Y + 0.043, 0),
      new BoxGeometry(0.022, 0.0014, 0.22).translate(-0.05, BLOCK_HEIGHT + 0.0006, 0),
    ]),
  });
}

export interface ModulePortStatics {
  /** Connector inserts of every port of the block (they cast shadows). */
  insert: BufferGeometry;
  contacts: BufferGeometry;
  steel: BufferGeometry;
}

const statics = new Map<ModuleType, ModulePortStatics>();

/**
 * The inert parts of all of a block's connectors, merged (in block space) into one geometry per material and shared by
 * every block of that type. Each connector used to draw three separate meshes for them; a block with seven connectors
 * now draws three in total, in every pass (shadow map, ambient occlusion, colour). Positions, rotations and
 * materials are exactly the ones the per-connector meshes had. Only the status lights stay per connector, because
 * their colour is animated individually.
 */
export function getModulePortStatics(type: ModuleType): ModulePortStatics {
  let st = statics.get(type);
  if (st) return st;
  const parts: Record<keyof ModulePortStatics, BufferGeometry[]> = { insert: [], contacts: [], steel: [] };
  for (const port of MODULE_DEFINITIONS[type].ports) {
    const geos = getPortGeometries(port.direction === 'out');
    const yaw = Math.atan2(-port.normal.z, port.normal.x);
    const m = new Matrix4().makeRotationY(yaw).setPosition(port.local.x, 0, port.local.z);
    for (const k of ['insert', 'contacts', 'steel'] as const) parts[k].push(geos[k].clone().applyMatrix4(m));
  }
  const merged = (list: BufferGeometry[]) => {
    if (list.length === 0) return new BufferGeometry();
    const g = mergeGeometries(list, false) ?? list[0];
    list.forEach((p) => p !== g && p.dispose());
    return g;
  };
  st = {
    insert: merged(parts.insert),
    contacts: merged(parts.contacts),
    steel: merged(parts.steel),
  };
  statics.set(type, st);
  return st;
}
