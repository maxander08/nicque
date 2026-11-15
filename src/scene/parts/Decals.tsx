import { memo, useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { SCREEN_FONT, drawIcon, type IconName } from '@/materials/screens';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { useThree } from '@react-three/fiber';
import { useFontsReady } from '../hooks';

const TOP = BLOCK_HEIGHT;

interface LabelProps {
  text: string;
  x: number;
  z: number;
  /** World width of the decal plane. */
  width: number;
  height?: number;
  color?: string;
  opacity?: number;
  weight?: number;
}

/** Printed label lying flat on the top cover. */
export const LabelDecal = memo(function LabelDecal({
  text,
  x,
  z,
  width,
  height = 0.12,
  color = '#9a9da6',
  opacity = 0.7,
  weight = 600,
}: LabelProps) {
  const fonts = useFontsReady();
  const invalidate = useThree((s) => s.invalidate);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round((512 * height) / width);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [width, height]);
  useEffect(() => {
    const c = tex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.font = `${weight} ${Math.round(c.height * 0.62)}px ${SCREEN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(c.height * 0.12)}px`;
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    tex.needsUpdate = true;
    invalidate();
  }, [tex, text, color, weight, fonts, invalidate]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[x, TOP + 0.0012, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
});

const iconCache = new Map<IconName, CanvasTexture>();
export function getIconTexture(name: IconName): CanvasTexture {
  let t = iconCache.get(name);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    drawIcon(c.getContext('2d')!, name, 128, '#c3c6ce');
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    iconCache.set(name, t);
  }
  return t;
}
