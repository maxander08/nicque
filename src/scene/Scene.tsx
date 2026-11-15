import { Bvh } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, FogExp2 } from 'three';
import { InteractionController } from '@/interactions/InteractionController';
import { FOG_COLOR, FOG_DENSITY, QUALITY } from '@/rendering/config';
import { useStore } from '@/state/store';
import { Cables, LinkPreview } from './Cables';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { FrameDriver } from './FrameDriver';
import { Ground } from './Ground';
import { Lighting } from './Lighting';
import { ModuleView } from './modules/ModuleView';

function Modules() {
  const ids = useStore((s) => s.workspace.modules.map((m) => m.id).join('\u0000'));
  return (
    <group name="pickRoot">
      {/* Perf: BVH-accelerated raycasts so hover/drag picking never brute-forces the bevelled housings. */}
      <Bvh>
        {ids.split('\u0000').map((id) => (
          <ModuleView key={id} moduleId={id} />
        ))}
      </Bvh>
    </group>
  );
}

/** The 3D workspace: endless gray plane, studio lighting and the three hardware modules. */
export function Scene() {
  const quality = useStore((s) => s.quality);
  const q = QUALITY[quality];

  return (
    <Canvas
      // Remount when the quality mode changes so the GL context gets the right anti-aliasing setup.
      key={quality}
      frameloop="demand"
      shadows={q.shadows ? 'percentage' : false}
      dpr={q.dpr}
      camera={{ fov: 30, near: 0.2, far: 1600, position: [0, 6, 5] }}
      gl={{
        antialias: !q.postprocessing,
        stencil: false,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1,
      }}
      onCreated={({ scene }) => {
        scene.fog = new FogExp2(new Color(FOG_COLOR), FOG_DENSITY);
      }}
      style={{ touchAction: 'none' }}
    >
      <Lighting q={q} />
      <Ground />
      <Modules />
      <Cables />
      <LinkPreview />
      <CameraRig />
      <FrameDriver />
      <InteractionController />
      {q.postprocessing && <Effects q={q} />}
    </Canvas>
  );
}
