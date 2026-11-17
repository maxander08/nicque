import { useEffect, useRef } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { DirectionalLight } from 'three';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { footprint } from '@/modules/spatial';
import { allCableShapes } from '@/rendering/cableShadow';
import { KEY_LIGHT_POSITION, type QualitySettings } from '@/rendering/config';
import { LIGHTING_PRESETS } from '@/rendering/lighting';
import { useStore } from '@/state/store';

/**
 * Product-photography rig:
 *  - large soft key (directional light, soft shadow map) from the upper left
 *  - fill from a dim overhead softbox + side strips baked into the environment probe
 *  - restrained rim light from behind to separate dark housings from the gray ground
 * The environment is a procedural PMREM probe built from lightformers (no external HDRI).
 *
 * The rig is driven by the active lighting scene (Studio is the original; Dim, Dusk, Night and Blackout dim and
 * tint the same rig). Changing scene rebuilds the probe, which is rendered once.
 */
/** Extra room around the blocks and cables that the shadow map must cover (plug and cable shadows, penumbra). */
const SHADOW_MARGIN = 1.1;
/** Stable reference, so React never re-applies (and so never resets) the light's fitted position. */
const KEY_POSITION = KEY_LIGHT_POSITION.toArray();

/**
 * Keeps the key light's shadow frustum wrapped tightly around everything that casts or receives a shadow.
 * The light keeps its direction (so the look is unchanged); only its position / target slide with the workspace.
 * A fixed 12 x 12 box around the origin silently dropped the shadows of blocks placed further out, and wasted
 * resolution when the workspace is compact. A bounding circle is used, so rotation of the light never clips.
 */
function useFittedShadow(light: React.RefObject<DirectionalLight | null>, q: QualitySettings) {
  const invalidate = useThree((s) => s.invalidate);
  const lastKey = useRef('');
  useFrame(() => {
    const l = light.current;
    if (!l || !q.shadows) return;
    const st = useStore.getState();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const add = (x: number, z: number) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    };
    for (const m of st.workspace.modules) {
      const o = footprint(m, 0);
      const r = Math.hypot(MODULE_DEFINITIONS[m.type].width, MODULE_DEFINITIONS[m.type].depth) / 2;
      add(o.cx - r, o.cz - r);
      add(o.cx + r, o.cz + r);
    }
    for (const c of allCableShapes()) for (const [x, , z] of c.points) add(x, z);
    if (minX === Infinity) {
      minX = maxX = minZ = maxZ = 0;
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const radius = Math.max(3, Math.hypot(maxX - minX, maxZ - minZ) / 2 + SHADOW_MARGIN);
    // quantise so tiny drags do not re-fit (and shimmer) the map on every frame
    const key = `${Math.round(cx * 8)},${Math.round(cz * 8)},${Math.ceil(radius * 4)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    const R = Math.ceil(radius * 4) / 4;
    const dist = Math.max(KEY_LIGHT_POSITION.length(), R + 4);
    const dir = KEY_LIGHT_POSITION.clone().normalize();
    const tx = Math.round(cx * 8) / 8;
    const tz = Math.round(cz * 8) / 8;
    l.target.position.set(tx, 0, tz);
    l.target.updateMatrixWorld();
    l.position.set(tx + dir.x * dist, dir.y * dist, tz + dir.z * dist);
    const cam = l.shadow.camera;
    cam.left = -R;
    cam.right = R;
    cam.top = R;
    cam.bottom = -R;
    cam.near = Math.max(0.5, dist - R - 1);
    cam.far = dist + R + 1;
    cam.updateProjectionMatrix();
    // the radius is in texels: texel = 2R / mapSize, which is what keeps the PCF filter smooth
    l.shadow.radius = q.shadowRadius;
    invalidate();
  });
}

export function Lighting({ q }: { q: QualitySettings }) {
  const p = LIGHTING_PRESETS[useStore((s) => s.lighting)];
  const f = p.softboxes;
  const key = useRef<DirectionalLight>(null);
  useFittedShadow(key, q);
  useEffect(() => {
    if (key.current) key.current.shadow.radius = q.shadowRadius;
  }, [q.shadowRadius]);

  return (
    <>
      <Environment key={p.id} resolution={256} frames={1} environmentIntensity={p.envIntensity}>
        <color attach="background" args={[p.probe]} />
        {/* overhead softbox */}
        <Lightformer form="rect" color={p.tint} intensity={3.2 * f} position={[0, 7, -1]} rotation-x={Math.PI / 2} scale={[11, 8, 1]} />
        {/* left key strip */}
        <Lightformer form="rect" color={p.tint} intensity={2.4 * f} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[9, 3.5, 1]} />
        {/* right fill strip */}
        <Lightformer form="rect" color={p.tint} intensity={1.1 * f} position={[7, 2.5, 1]} rotation-y={-Math.PI / 2} scale={[8, 2.5, 1]} />
        {/* back rim */}
        <Lightformer form="rect" color={p.tint} intensity={2.2 * f} position={[0, 3, -8]} scale={[10, 1.6, 1]} />
        {/* front low fill */}
        <Lightformer form="rect" color={p.tint} intensity={0.7 * f} position={[0, 2, 8]} rotation-y={Math.PI} scale={[9, 2, 1]} />
      </Environment>

      <directionalLight
        ref={key}
        position={KEY_POSITION}
        color={p.key.color}
        intensity={p.key.intensity}
        castShadow={q.shadows}
        shadow-mapSize={[q.shadowMapSize, q.shadowMapSize]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={2}
        shadow-camera-far={26}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
        shadow-radius={q.shadowRadius}
      />
      <directionalLight position={[3.5, 4, -7]} color={p.rim.color} intensity={p.rim.intensity} />
      <hemisphereLight args={[p.hemisphere.sky, p.hemisphere.ground, p.hemisphere.intensity]} />
    </>
  );
}
