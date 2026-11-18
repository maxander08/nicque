import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_HEIGHT } from '@/modules/definitions';

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
