import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { SCREEN_FONT } from '@/materials/screens';

/** Increments once the screen fonts are available so canvases can be repainted with real glyphs. */
export function useFontsReady(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const bump = () => alive && setN((v) => v + 1);
    const fonts = document.fonts;
    if (!fonts) return;
    Promise.all([
      fonts.load(`700 48px ${SCREEN_FONT}`),
      fonts.load(`400 48px ${SCREEN_FONT}`),
    ])
      .then(bump)
      .catch(() => undefined);
    fonts.addEventListener?.('loadingdone', bump);
    return () => {
      alive = false;
      fonts.removeEventListener?.('loadingdone', bump);
    };
  }, []);
  return n;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex, ...deps]);

  return tex;
}
