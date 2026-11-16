import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '@/state/store';

export const DEFAULT_TARGET = new Vector3(0, 0.1, -0.5);
const ELEVATION = (54 * Math.PI) / 180;

/** Default camera: front-top view that shows all three blocks and their connectors. */
export function defaultCameraPosition(aspect: number): Vector3 {
  const dist = 11 * Math.pow(Math.max(1, 1.6 / aspect), 0.9);
  return new Vector3(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist).add(DEFAULT_TARGET);
}

const PAN_RADIUS = 12;

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const resetNonce = useStore((s) => s.cameraResetNonce);
  const anim = useRef<{ pos: Vector3; target: Vector3 } | null>(null);

  // initial placement
  useEffect(() => {
    camera.position.copy(defaultCameraPosition(size.width / size.height));
    controls.current?.target.copy(DEFAULT_TARGET);
    controls.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetNonce === 0) return;
    anim.current = { pos: defaultCameraPosition(size.width / size.height), target: DEFAULT_TARGET.clone() };
  }, [resetNonce, size.width, size.height]);

  useEffect(() => {
    const c = camera as PerspectiveCamera;
    c.fov = size.width / size.height < 1 ? 38 : 30;
    c.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useFrame(({ invalidate }, dt) => {
    const c = controls.current;
    if (!c) return;
    const a = anim.current;
    if (a) {
      invalidate();
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 7);
      camera.position.lerp(a.pos, k);
      c.target.lerp(a.target, k);
      if (camera.position.distanceTo(a.pos) < 0.005 && c.target.distanceTo(a.target) < 0.005) {
        camera.position.copy(a.pos);
        c.target.copy(a.target);
        anim.current = null;
      }
      c.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.14}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      panSpeed={0.9}
      minDistance={3}
      maxDistance={22}
      minPolarAngle={0.12}
      maxPolarAngle={1.32}
      screenSpacePanning={false}
      onStart={() => {
        anim.current = null;
      }}
      onChange={() => {
        const c = controls.current;
        if (!c) return;
        const t = c.target;
        t.y = Math.min(Math.max(t.y, 0), 1);
        const r = Math.hypot(t.x, t.z);
        if (r > PAN_RADIUS) {
          t.x *= PAN_RADIUS / r;
          t.z *= PAN_RADIUS / r;
        }
        if (camera.position.y < 0.6) camera.position.y = 0.6;
      }}
    />
  );
}
