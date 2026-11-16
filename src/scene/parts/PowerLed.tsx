import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CircleGeometry, Color, MeshBasicMaterial } from 'three';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { LED_RADIUS, powerLedPosition } from '@/modules/layout';

interface Props {
  /** Footprint of the block: the LED sits in the same top-left spot on every module. */
  width: number;
  depth: number;
  /** True while the block receives power. Fades smoothly. */
  powered: boolean;
  color?: string;
  /** Depth of the header strip the LED is centred in (the Power Block has a slimmer one). */
  header?: number;
}

const OFF = new Color('#2d2f36');

/**
 * The block's single status light: one small round lens flush with the top cover, in the top-left corner.
 * Lit = the block receives power; dark = it does not. It is just the light itself: no halo, no rim.
 */
export const PowerLed = memo(function PowerLed({ width, depth, powered, color = '#d7c9ff', header }: Props) {
  const { x, z } = powerLedPosition(width, depth, header);
  const on = useMemo(() => new Color(color), [color]);
  const level = powered ? 1 : 0;
  const current = useRef(level);
  const settled = useRef(false);

  const lens = useMemo(
    () =>
      new MeshBasicMaterial({
        color: OFF.clone(),
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  );
  const lensGeo = useMemo(() => new CircleGeometry(LED_RADIUS, 24).rotateX(-Math.PI / 2), []);

  useEffect(
    () => () => {
      lens.dispose();
      lensGeo.dispose();
    },
    [lens, lensGeo],
  );

  useEffect(() => {
    settled.current = false;
  }, [level, on]);

  useFrame(({ invalidate }, dt) => {
    if (settled.current) return;
    invalidate();
    current.current += (level - current.current) * Math.min(1, Math.min(dt, 0.05) * 6);
    if (Math.abs(level - current.current) < 0.003) {
      current.current = level;
      settled.current = true;
    }
    lens.color.copy(OFF).lerp(on, current.current);
  });

  const y = BLOCK_HEIGHT + 0.0012;
  return (
    <group position={[x, y, z]} renderOrder={2}>
      <mesh geometry={lensGeo} material={lens} position={[0, 0.0004, 0]} raycast={() => null} />
    </group>
  );
});
