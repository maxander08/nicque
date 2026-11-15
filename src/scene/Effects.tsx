import { EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { QualitySettings } from '@/rendering/config';

/**
 * High-quality post chain: N8AO screen-space ambient occlusion, MSAA (render target multisampling),
 * ACES filmic tone mapping and a very gentle vignette for light falloff.
 */
export function Effects({ q }: { q: QualitySettings }) {
  return (
    <EffectComposer multisampling={q.multisampling} enableNormalPass={false}>
      <N8AO aoRadius={0.55} distanceFalloff={1.1} intensity={2.4} quality={q.ao} color="black" />
      <Vignette offset={0.32} darkness={0.35} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
