import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { SCREEN_FONT } from '@/materials/screens';

/**
 * Shared font-readiness counter. Every canvas painter subscribes to the same store, so the fonts are requested
 * once and a single `loadingdone` listener serves all components (instead of one per component).
 */
let fontVersion = 0;
const fontListeners = new Set<() => void>();
let fontsWired = false;

function bumpFonts() {
  fontVersion++;
  fontListeners.forEach((l) => l());
}

function wireFonts() {
  if (fontsWired) return;
  fontsWired = true;
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return;
  Promise.all([fonts.load(`700 48px ${SCREEN_FONT}`), fonts.load(`400 48px ${SCREEN_FONT}`)])
    .then(bumpFonts)
    .catch(() => undefined);
  fonts.addEventListener?.('loadingdone', bumpFonts);
}

function subscribeFonts(cb: () => void) {
  wireFonts();
  fontListeners.add(cb);
  return () => {
    fontListeners.delete(cb);
  };
}

/** Increments once the screen fonts are available so canvases can be repainted with real glyphs. */
export function useFontsReady(): number {
  return useSyncExternalStore(subscribeFonts, () => fontVersion, () => 0);
}

/** Creates a GPU resource and disposes it when it is replaced or the component unmounts. */
export function useDisposable<T extends { dispose(): void }>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** A canvas-backed texture that is repainted whenever `deps` change. */
export function useScreenTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
  deps: unknown[],
): CanvasTexture {
  const invalidate = useThree((s) => s.invalidate);
  const tex = useDisposable(() => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [width, height]);

  useEffect(() => {
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    paint(ctx);
    tex.needsUpdate = true;
    invalidate(); // demand frameloop: show the repainted screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex, ...deps]);

  return tex;
}
