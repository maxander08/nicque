import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bvh } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, FogExp2 } from 'three';
import { InteractionController } from '@/interactions/InteractionController';
import { getRenderScale, resetRenderScale, subscribeRenderScale } from '@/rendering/adaptive';
import { MAX_RENDER_PIXELS, QUALITY } from '@/rendering/config';
import { LIGHTING_PRESETS } from '@/rendering/lighting';
import { useStore } from '@/state/store';
import { Atmosphere } from './Atmosphere';
import { Cables, LinkPreview } from './Cables';
import { CameraRig } from './CameraRig';
import { DropBridge, DropPreview } from './DropBridge';
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

/** The window's CSS size, kept current on resize, so the render resolution can respect the pixel budget. */
function useViewportPixels() {
  const [px, setPx] = useState(() =>
    typeof window === 'undefined' ? 1920 * 1080 : window.innerWidth * window.innerHeight,
  );
  useEffect(() => {
    const on = () => setPx(window.innerWidth * window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return px;
}

/** The 3D workspace: endless gray plane, studio lighting and the three hardware modules. */
export function Scene() {
  const quality = useStore((s) => s.quality);
  const q = QUALITY[quality];
  const scale = useSyncExternalStore(subscribeRenderScale, getRenderScale);
  // a new canvas starts at full resolution; Fast mode may go lower than the other modes before giving up
  // Perf: every mode may now step all the way down (0.5x); fast GPUs never leave 1x, so nothing changes for them
  useEffect(() => resetRenderScale(5), [quality]);
  // Touch screens are 2-3x density: more than 1.25x the CSS resolution costs far more than it shows
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const base = Math.min(Math.max(device, q.dpr[0]), coarse ? Math.min(q.dpr[1], 1.25) : q.dpr[1]);
  // never render more than the pixel budget, whatever the window / screen density
  const cssPixels = useViewportPixels();
  const budget = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, cssPixels));
  const dpr = Math.max(0.5, Math.min(base, budget) * scale);

  return (
    <Canvas
      // Remount when the quality mode changes so the GL context gets the right anti-aliasing setup.
      key={quality}
      frameloop="demand"
      shadows={q.shadows ? 'percentage' : false}
      dpr={dpr}
      camera={{ fov: 30, near: 0.2, far: 1600, position: [0, 6, 5] }}
      gl={{
        antialias: !q.postprocessing,
        stencil: false,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1,
      }}
      onCreated={(state) => {
        const { scene } = state;
        (window as unknown as { __three: unknown }).__three = state;
        // Perf/robustness: if the GPU process drops the context (memory pressure), let three.js restore it
        // and redraw instead of leaving a dead canvas.
        const el = state.gl.domElement;
        el.addEventListener('webglcontextlost', (ev) => ev.preventDefault());
        el.addEventListener('webglcontextrestored', () => state.invalidate());
        const look = LIGHTING_PRESETS[useStore.getState().lighting];
        scene.fog = new FogExp2(new Color(look.fog), look.fogDensity);
      }}
      style={{ touchAction: 'none' }}
    >
      <Lighting q={q} />
      <Atmosphere />
      <Ground />
      <Modules />
      <Cables />
      <LinkPreview />
      <DropBridge />
      <DropPreview />
      <CameraRig />
      <FrameDriver />
      <InteractionController />
      {q.postprocessing && <Effects q={q} />}
    </Canvas>
  );
}
