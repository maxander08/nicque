import { Environment, Lightformer } from '@react-three/drei';
import { KEY_LIGHT_POSITION, type QualitySettings } from '@/rendering/config';

/**
 * Product-photography rig:
 *  - large soft key (directional light, soft shadow map) from the upper left
 *  - fill from a dim overhead softbox + side strips baked into the environment probe
 *  - restrained rim light from behind to separate dark housings from the gray ground
 * The environment is a procedural PMREM probe built from lightformers (no external HDRI).
 */
export function Lighting({ q }: { q: QualitySettings }) {
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={0.5}>
        <color attach="background" args={['#3b3d41']} />
        {/* overhead softbox */}
        <Lightformer form="rect" intensity={3.2} position={[0, 7, -1]} rotation-x={Math.PI / 2} scale={[11, 8, 1]} />
        {/* left key strip */}
        <Lightformer form="rect" intensity={2.4} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[9, 3.5, 1]} />
        {/* right fill strip */}
        <Lightformer form="rect" intensity={1.1} position={[7, 2.5, 1]} rotation-y={-Math.PI / 2} scale={[8, 2.5, 1]} />
        {/* back rim */}
        <Lightformer form="rect" intensity={2.2} position={[0, 3, -8]} scale={[10, 1.6, 1]} />
        {/* front low fill */}
        <Lightformer form="rect" intensity={0.7} position={[0, 2, 8]} rotation-y={Math.PI} scale={[9, 2, 1]} />
      </Environment>

      <directionalLight
        position={KEY_LIGHT_POSITION.toArray()}
        intensity={1.5}
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
      <directionalLight position={[3.5, 4, -7]} intensity={0.45} />
      <hemisphereLight args={['#ffffff', '#6d6e72', 0.12]} />
    </>
  );
}
