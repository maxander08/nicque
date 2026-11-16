import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CircleGeometry, Color, Matrix4, type InstancedMesh } from 'three';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { ledRowLayout, ledRowZ } from '@/modules/layout';

interface Props {
  /** Footprint of the block. Count, pitch and distance from the top border all derive from it, so every module matches. */
  width: number;
  depth: number;
  /** 0..1 fill level. Animated smoothly. */
  level: number;
  color?: string;
}

const OFF = new Color('#2d2f36');

/** Row of small LEDs flush with the top cover (like the status strip on the reference controllers). */
export const LedRow = memo(function LedRow({ width, depth, level, color = '#d7c9ff' }: Props) {
  const { count, span } = useMemo(() => ledRowLayout(width), [width]);
  const z = ledRowZ(depth);
  const ref = useRef<InstancedMesh>(null);
  const current = useRef(level);
  const settled = useRef(false);
  const on = useMemo(() => new Color(color), [color]);
  const tmp = useMemo(() => new Color(), []);
  const geo = useMemo(() => new CircleGeometry(0.019, 16).rotateX(-Math.PI / 2), []);
  useEffect(() => () => geo.dispose(), [geo]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = new Matrix4();
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1);
      mat.makeTranslation(x, BLOCK_HEIGHT + 0.0012, z);
      mesh.setMatrixAt(i, mat);
      mesh.setColorAt(i, OFF);
    }
    mesh.instanceMatrix.needsUpdate = true;
    settled.current = false;
  }, [count, span, z]);

  useEffect(() => {
    settled.current = false;
  }, [level]);

  useFrame(({ invalidate }, dt) => {
    const mesh = ref.current;
    if (!mesh || settled.current) return;
    invalidate();
    current.current += (level - current.current) * Math.min(1, Math.min(dt, 0.05) * 5);
    if (Math.abs(level - current.current) < 0.002) {
      current.current = level;
      settled.current = true;
    }
    for (let i = 0; i < count; i++) {
      const v = Math.max(0, Math.min(1, current.current * count - i));
      tmp.copy(OFF).lerp(on, v);
      mesh.setColorAt(i, tmp);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh key={count} ref={ref} args={[geo, undefined, count]} renderOrder={2} frustumCulled={false}>
      <meshBasicMaterial
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </instancedMesh>
  );
});
