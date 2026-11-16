import { memo } from 'react';
import { MeshBasicMaterial, Shape, ShapeGeometry } from 'three';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { LED_RADIUS, powerLedPosition } from '@/modules/layout';
import { useDisposable } from '../hooks';

/** Side of the yellow operator box: a little larger than the power LED lens next to it. */
export const OPERATOR_BOX_SIZE = 0.1;
/** Air gap between the power LED lens and the operator box. */
export const OPERATOR_BOX_GAP = 0.07;
const CORNER = 0.018;
export const OPERATOR_YELLOW = '#ffd21a';

/** Local (x, z) of the operator box: directly to the right of the power LED, on the same centre line. */
export const operatorMarkPosition = (width: number, depth: number, header?: number) => {
  const led = powerLedPosition(width, depth, header);
  return { x: led.x + LED_RADIUS + OPERATOR_BOX_GAP + OPERATOR_BOX_SIZE / 2, z: led.z };
};

function roundedSquare(size: number, r: number) {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

interface Props {
  width: number;
  depth: number;
  header?: number;
}

/**
 * The yellow box that marks a block as an operator block. It lies flush on the top cover, to the right of the
 * power LED (the left-hand side of the header), and is the only thing that tells an operator from a Text Block.
 */
export const OperatorMark = memo(function OperatorMark({ width, depth, header }: Props) {
  const { x, z } = operatorMarkPosition(width, depth, header);
  const geo = useDisposable(
    () => new ShapeGeometry(roundedSquare(OPERATOR_BOX_SIZE, CORNER), 6).rotateX(-Math.PI / 2),
    [],
  );
  const mat = useDisposable(
    () =>
      new MeshBasicMaterial({
        color: OPERATOR_YELLOW,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  );
  return (
    <mesh
      geometry={geo}
      material={mat}
      position={[x, BLOCK_HEIGHT + 0.0012, z]}
      renderOrder={2}
      raycast={() => null}
      name="operator-box"
    />
  );
});
