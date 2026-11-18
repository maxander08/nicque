import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Texture } from 'three';
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

/* -------------------------------------------------------------------------------------------------------------- */
/* Shared decal resources                                                                                          */
/* -------------------------------------------------------------------------------------------------------------- */
/*
 * Every block prints the same few labels ("nicque" + the block name, "TXT", "INT", ...). They used to own one canvas,
 * one mip-mapped GPU texture, one plane and one material *each*, so a workspace of 100 blocks carried 100 copies of
 * identical images. They are now painted once per distinct label and shared; the pixels on screen are identical.
 */

interface SharedTexture {
  tex: CanvasTexture;
  painted: number;
}

const sharedTextures = new Map<string, SharedTexture>();

/**
 * A canvas texture shared by every component that asks for the same `key`. `key` must describe everything the
 * painting depends on (text, colour, size ...). It is repainted once when the fonts become available.
 */
export function useSharedCanvasTexture(
  key: string,
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
  fonts: number,
): CanvasTexture {
  const invalidate = useThree((s) => s.invalidate);
  const entry = useMemo(() => {
    let e = sharedTextures.get(key);
    if (!e) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      e = { tex: t, painted: -1 };
      sharedTextures.set(key, e);
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);

  useEffect(() => {
    if (entry.painted === fonts) return;
    entry.painted = fonts;
    const c = entry.tex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    paint(ctx, c);
    entry.tex.needsUpdate = true;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, fonts, invalidate]);

  return entry.tex;
}

const planes = new Map<string, PlaneGeometry>();
/** One plane geometry per distinct size, shared by all blocks. */
export function getPlane(width: number, height: number): PlaneGeometry {
  const k = `${width}x${height}`;
  let g = planes.get(k);
  if (!g) {
    g = new PlaneGeometry(width, height);
    planes.set(k, g);
  }
  return g;
}

const decalMaterials = new WeakMap<Texture, Map<string, MeshBasicMaterial>>();
/** One decal material per texture and look, shared by all blocks (same blending / polygon offset as before). */
export function getDecalMaterial(map: Texture, opacity = 1, toneMapped = true): MeshBasicMaterial {
  let byLook = decalMaterials.get(map);
  if (!byLook) {
    byLook = new Map();
    decalMaterials.set(map, byLook);
  }
  const k = `${opacity}|${toneMapped}`;
  let m = byLook.get(k);
  if (!m) {
    m = new MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      toneMapped,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    byLook.set(k, m);
  }
  return m;
}
