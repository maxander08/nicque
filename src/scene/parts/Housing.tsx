import { memo } from 'react';
import { createSlabGeometry, type HoleSpec } from '@/geometry/slab';
import { getMaterials } from '@/materials/library';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { useDisposable } from '../hooks';

export const CORNER_RADIUS = 0.17;

interface Props {
  width: number;
  depth: number;
  holes?: HoleSpec[];
}

/**
 * Two-part housing: bead-blasted metal chassis on a rubber foot, a hairline seam, and a polymer top
 * cover with real openings for screens and buttons.
 */
export const Housing = memo(function Housing({ width, depth, holes }: Props) {
  const m = getMaterials();
  const R = CORNER_RADIUS;

  const foot = useDisposable(
    () =>
      createSlabGeometry({
        width: width - 0.18,
        depth: depth - 0.18,
        height: 0.012,
        radius: R - 0.09 > 0.04 ? R - 0.09 : 0.04,
        bevelBottom: 0.003,
        cornerSegments: 6,
      }),
    [width, depth],
  );
  const chassis = useDisposable(
    () =>
      createSlabGeometry({
        width,
        depth,
        height: 0.138,
        radius: R,
        bevelBottom: 0.032,
        bevelTop: 0.012,
        bevelSegments: 5,
        cornerSegments: 12,
      }),
    [width, depth],
  );
  const seam = useDisposable(
    () =>
      createSlabGeometry({
        width: width - 0.012,
        depth: depth - 0.012,
        height: 0.014,
        radius: R - 0.006,
        cornerSegments: 8,
      }),
    [width, depth],
  );
  const cover = useDisposable(
    () =>
      createSlabGeometry({
        width,
        depth,
        height: BLOCK_HEIGHT - 0.15,
        radius: R,
        bevelBottom: 0.012,
        bevelTop: 0.03,
        bevelSegments: 5,
        cornerSegments: 12,
        holes,
      }),
    [width, depth, holes],
  );

  return (
    <group>
      <mesh geometry={foot} material={m.foot} castShadow receiveShadow />
      <mesh geometry={chassis} material={m.chassis} position={[0, 0.012, 0]} castShadow receiveShadow />
      <mesh geometry={seam} material={m.seam} position={[0, 0.144, 0]} />
      <mesh geometry={cover} material={m.cover} position={[0, 0.15, 0]} castShadow receiveShadow />
    </group>
  );
});
