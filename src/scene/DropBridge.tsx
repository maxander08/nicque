import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { createFootprintRing } from '@/geometry/slab';
import { getDropPreview, registerGroundPicker, subscribeDropPreview } from '@/interactions/dropBridge';
import { resolveDrop } from '@/interactions/drop';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { useDisposable } from './hooks';
import { CORNER_RADIUS } from './parts/Housing';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/** Lets the DOM block library ask "which ground point is under this screen position?". */
export function DropBridge() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();
    registerGroundPicker((cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(GROUND, hit) ? { x: hit.x, z: hit.z } : null;
    });
    return () => registerGroundPicker(null);
  }, [gl, camera]);

  return null;
}

const previewMaterial = new MeshBasicMaterial({
  color: '#f4f4f6',
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
  fog: false,
});

function PreviewRing({ type, x, z, rotation }: { type: keyof typeof MODULE_DEFINITIONS; x: number; z: number; rotation: number }) {
  const def = MODULE_DEFINITIONS[type];
  const geo = useDisposable(() => createFootprintRing(def.width, def.depth, CORNER_RADIUS, 0.03, 0.06), [def.width, def.depth]);
  return (
    <mesh
      geometry={geo}
      material={previewMaterial}
      position={[x, 0.006, z]}
      rotation={[0, (rotation * Math.PI) / 2, 0]}
      raycast={() => null}
      renderOrder={3}
    />
  );
}

/** Outline of where a block dragged out of the library would land (snapped, docked and kept clear of other blocks). */
export function DropPreview() {
  const preview = useSyncExternalStore(subscribeDropPreview, getDropPreview, getDropPreview);
  const invalidate = useThree((s) => s.invalidate);
  const workspace = useStore((s) => s.workspace);
  const snap = useStore((s) => s.snap);

  const spot = useMemo(
    () => (preview ? resolveDrop(workspace, preview.type, preview.at, snap) : null),
    [preview, workspace, snap],
  );

  useEffect(() => {
    invalidate();
  }, [spot, invalidate]);

  if (!preview || !spot) return null;
  return <PreviewRing type={preview.type} x={spot.position.x} z={spot.position.z} rotation={spot.rotation} />;
}
