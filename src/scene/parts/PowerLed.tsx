import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CircleGeometry, Color, MeshBasicMaterial, RingGeometry } from 'three';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { LED_RADIUS, powerLedPosition } from '@/modules/layout';

interface Props {
  /** Footprint of the block: the LED sits in the same top-left spot on every module. */
  width: number;
  depth: number;
  /** True while the block receives power. Fades smoothly. */
  powered: boolean;
  color?: string;
}

const OFF = new Color('#2d2f36');

/**
 * The block's single status light: one small round lens flush with the top cover, in the top-left corner.
 * Lit = the block receives power; dark = it does not.
 */
export const PowerLed = memo(function PowerLed({ width, depth, powered, color = '#d7c9ff' }: Props) {
  const { x, z } = powerLedPosition(width, depth);
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
  // soft light spill on the cover around the lens, visible only while powered
  const halo = useMemo(
    () =>
      new MeshBasicMaterial({
        color: on,
        toneMapped: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [on],
  );
  const lensGeo = useMemo(() => new CircleGeometry(LED_RADIUS, 24).rotateX(-Math.PI / 2), []);
  const haloGeo = useMemo(
    () => new RingGeometry(LED_RADIUS, LED_RADIUS * 2.1, 32).rotateX(-Math.PI / 2),
    [],
  );
  // thin dark rim that seats the lens in the cover
  const rimGeo = useMemo(
    () => new RingGeometry(LED_RADIUS, LED_RADIUS + 0.007, 32).rotateX(-Math.PI / 2),
    [],
  );
  const rim = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#15161a',
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  );

  useEffect(
    () => () => {
      lens.dispose();
      halo.dispose();
      rim.dispose();
      lensGeo.dispose();
      haloGeo.dispose();
      rimGeo.dispose();
    },
    [lens, halo, rim, lensGeo, haloGeo, rimGeo],
  );

  useEffect(() => {
    settled.current = false;
  }, [level]);

  useFrame(({ invalidate }, dt) => {
    if (settled.current) return;
    invalidate();
    current.current += (level - current.current) * Math.min(1, Math.min(dt, 0.05) * 6);
    if (Math.abs(level - current.current) < 0.003) {
      current.current = level;
      settled.current = true;
    }
    lens.color.copy(OFF).lerp(on, current.current);
    halo.opacity = 0.2 * current.current;
  });

  const y = BLOCK_HEIGHT + 0.0012;
  return (
    <group position={[x, y, z]} renderOrder={2}>
      <mesh geometry={rimGeo} material={rim} />
      <mesh geometry={haloGeo} material={halo} position={[0, 0.0002, 0]} raycast={() => null} />
      <mesh geometry={lensGeo} material={lens} position={[0, 0.0004, 0]} raycast={() => null} />
    </group>
  );
});
