import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { reportFrameGap } from '@/rendering/adaptive';
import { useStore } from '@/state/store';

/** How long (ms) the loop keeps rendering after the last change, so eased animations can settle. */
const SETTLE_MS = 1500;
/** Extra warm-up on mount: environment probe, textures and shader compilation. */
const WARMUP_MS = 3000;

/**
 * Drives the on-demand render loop (`frameloop="demand"`).
 *
 * The scene is static unless something changes, so instead of redrawing 60x per second forever (ray-marched
 * ground, N8AO, MSAA...) a frame is requested only when:
 *  - the store changes in a way the scene can show (modules, runtime, selection, drag, press, camera reset…),
 *  - fonts finish loading (canvas textures are repainted),
 *  - the window or canvas is resized (handled by R3F), or the orbit controls move (handled by drei),
 *  - an animation reports it has not settled (those call `invalidate()` themselves).
 *
 * Visuals and logic are identical to continuous rendering; only idle GPU/CPU work disappears.
 */
export function FrameDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const clock = useThree((s) => s.clock);
  const gl = useThree((s) => s.gl);
  const until = useRef(0);
  const lastFrame = useRef(0);
  const wasActive = useRef(false);
  const mountedAt = useRef(performance.now());

  useEffect(() => {
    const bump = (ms: number) => {
      // Waking from idle: drop the idle gap so the first frame's delta is one frame, not seconds.
      if (performance.now() >= until.current) clock.getDelta();
      until.current = Math.max(until.current, performance.now() + ms);
      invalidate();
    };

    bump(WARMUP_MS);

    const unsub = useStore.subscribe((s, p) => {
      if (
        s.workspace !== p.workspace ||
        s.runtime !== p.runtime ||
        s.selectedId !== p.selectedId ||
        s.snap !== p.snap ||
        s.lighting !== p.lighting ||
        s.cameraResetNonce !== p.cameraResetNonce ||
        s.pressed !== p.pressed ||
        s.linkDrag !== p.linkDrag ||
        s.draggingId !== p.draggingId
      ) {
        bump(SETTLE_MS);
      }
    });

    const onFonts = () => bump(800);
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', onFonts);
    const onVisible = () => {
      if (!document.hidden) bump(300);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      fonts?.removeEventListener?.('loadingdone', onFonts);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [invalidate, clock]);

  useFrame(() => {
    const now = performance.now();
    const active = now < until.current;
    // adaptive resolution: only gaps between frames of one continuous run say anything about performance
    // (the first seconds are shader compilation and texture upload, not representative)
    if (wasActive.current && now - mountedAt.current > WARMUP_MS + 1000) reportFrameGap(now - lastFrame.current, now);
    wasActive.current = active;
    lastFrame.current = now;
    if (active) invalidate();
    // Perf: shadow casters only move/appear when the store changes (which keeps `until` open). While the
    // camera merely orbits or zooms, re-use the existing shadow map instead of re-rendering every caster.
    if (gl.shadowMap.enabled) {
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = active;
    }
  });

  return null;
}
