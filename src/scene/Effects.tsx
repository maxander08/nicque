import { useCallback } from 'react';
import { EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { QualitySettings } from '@/rendering/config';

/**
 * In Medium quality, N8AO's auto-detected transparent re-render pass (glass cover, selection ring)
 * is disabled to save two full-resolution render targets per frame, while High quality preserves
 * the exact original behaviour.
 */
interface AOPassLike {
  autoDetectTransparency: boolean;
  configuration: { transparencyAware: boolean };
}

/**
 * Post chain: N8AO screen-space ambient occlusion, MSAA (render target multisampling),
 * ACES filmic tone mapping and a very gentle vignette for light falloff.
 */
export function Effects({ q }: { q: QualitySettings }) {
  const tuneAO = useCallback(
    (pass: unknown) => {
      const p = pass as AOPassLike | null;
      if (!p || !q.aoSkipTransparency) return;
      p.autoDetectTransparency = false;
      p.configuration.transparencyAware = false;
    },
    [q.aoSkipTransparency],
  );

  return (
    <EffectComposer multisampling={q.multisampling} enableNormalPass={false}>
      <N8AO
        ref={tuneAO}
        aoRadius={0.55}
        distanceFalloff={1.1}
        intensity={2.4}
        quality={q.ao}
        halfRes={q.aoHalfRes}
        color="black"
      />
      <Vignette offset={0.32} darkness={0.35} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
