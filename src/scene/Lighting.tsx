import { Environment, Lightformer } from '@react-three/drei';
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
export function Lighting({ q }: { q: QualitySettings }) {
  const p = LIGHTING_PRESETS[useStore((s) => s.lighting)];
  const f = p.softboxes;

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
        position={KEY_LIGHT_POSITION.toArray()}
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
        shadow-radius={5}
      />
      <directionalLight position={[3.5, 4, -7]} color={p.rim.color} intensity={p.rim.intensity} />
      <hemisphereLight args={[p.hemisphere.sky, p.hemisphere.ground, p.hemisphere.intensity]} />
    </>
  );
}
