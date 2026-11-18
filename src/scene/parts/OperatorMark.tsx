import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry, CanvasTexture, MeshBasicMaterial, SRGBColorSpace, Shape, ShapeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import type { OperatorType } from '@/types';
import { LED_RADIUS, powerLedPosition } from '@/modules/layout';
import { SCREEN_FONT } from '@/materials/screens';
import { useDisposable, useFontsReady } from '../hooks';

/** Side of the yellow operator box: a little larger than the power LED lens next to it. */
export const OPERATOR_BOX_SIZE = 0.1;
/** Air gap between the power LED lens and the operator box. */
export const OPERATOR_BOX_GAP = 0.07;
const CORNER = 0.018;
export const OPERATOR_YELLOW = '#ffd21a';
/** Gray of the box on the Integer and Text Blocks (same square as the operator box, just gray). */
export const TYPE_GRAY = '#9a9da6';

/** Extent of the operator symbol printed next to the box: a touch smaller than the box so the two read as a pair. */
export const OPERATOR_SYMBOL_SIZE = OPERATOR_BOX_SIZE * 0.86;
/** Stroke weight of the symbol, in proportion to its size. */
export const OPERATOR_SYMBOL_STROKE = OPERATOR_SYMBOL_SIZE * 0.2;
/** Air gap between the yellow box and its symbol (a little less than the LED-to-box gap, so they stay grouped). */
export const OPERATOR_SYMBOL_GAP = OPERATOR_BOX_GAP * 0.6;

/** Local (x, z) of the operator symbol: directly to the right of the yellow box, on the same centre line. */
export const operatorSymbolPosition = (width: number, depth: number, header?: number) => {
  const box = operatorMarkPosition(width, depth, header);
  return { x: box.x + OPERATOR_BOX_SIZE / 2 + OPERATOR_SYMBOL_GAP + OPERATOR_SYMBOL_SIZE / 2, z: box.z };
};

/** Local (x, z) of the operator box: directly to the right of the power LED, on the same centre line. */
export const operatorMarkPosition = (width: number, depth: number, header?: number) => {
  const led = powerLedPosition(width, depth, header);
  return { x: led.x + LED_RADIUS + OPERATOR_BOX_GAP + OPERATOR_BOX_SIZE / 2, z: led.z };
};

function roundedSquare(size: number, r: number) {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

/** A flat bar (in the XY plane, centred on the origin), optionally turned by `angle`. */
function bar(length: number, thickness: number, angle = 0, ox = 0, oy = 0) {
  const g = new ShapeGeometry(
    new Shape()
      .moveTo(-length / 2, -thickness / 2)
      .lineTo(length / 2, -thickness / 2)
      .lineTo(length / 2, thickness / 2)
      .lineTo(-length / 2, thickness / 2)
      .closePath(),
  );
  g.rotateZ(angle);
  g.translate(ox, oy, 0);
  return g;
}

function dot(radius: number, ox: number, oy: number) {
  const g = new ShapeGeometry(new Shape().absarc(0, 0, radius, 0, Math.PI * 2, false), 20);
  g.translate(ox, oy, 0);
  return g;
}

/** The +, −, × or ÷ glyph as one flat geometry lying on the cover (its size follows the yellow box). */
export function operatorSymbolGeometry(type: OperatorType): BufferGeometry {
  const G = OPERATOR_SYMBOL_SIZE;
  const t = OPERATOR_SYMBOL_STROKE;
  let parts: BufferGeometry[];
  switch (type) {
    case 'adder':
      parts = [bar(G, t), bar(G, t, Math.PI / 2)];
      break;
    case 'subtractor':
      parts = [bar(G, t)];
      break;
    case 'multiplier':
      parts = [bar(G * 1.14, t, Math.PI / 4), bar(G * 1.14, t, -Math.PI / 4)];
      break;
    case 'divisor':
    default:
      parts = [bar(G, t), dot(t * 0.78, 0, G * 0.34), dot(t * 0.78, 0, -G * 0.34)];
      break;
  }
  const merged = mergeGeometries(parts, false) ?? parts[0];
  parts.forEach((p) => p !== merged && p.dispose());
  return merged.rotateX(-Math.PI / 2);
}

interface Props {
  width: number;
  depth: number;
  header?: number;
  /** Which operator this is: its symbol is printed next to the box. */
  symbol?: OperatorType;
  /** Colour of the box (yellow on operator blocks, gray on the Integer and Text Blocks). */
  color?: string;
  /** Short text printed next to the box instead of an operator symbol ("INT" / "TXT"). */
  label?: string;
}

/** Width/height of the plane the label is painted on (transparent, so only the glyphs show). */
const LABEL_W = 0.3;
const LABEL_H = 0.12;
/** Font size of the label: its capitals come out about as tall as the operator symbols. */
const LABEL_FONT = 0.115;

/** Short text lying flat on the cover, starting where an operator symbol would start, on the box's centre line. */
const BoxLabel = memo(function BoxLabel({
  text,
  x,
  z,
  color,
}: {
  text: string;
  x: number;
  z: number;
  color: string;
}) {
  const fonts = useFontsReady();
  const invalidate = useThree((s) => s.invalidate);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round((512 * LABEL_H) / LABEL_W);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => {
    const c = tex.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    const px = Math.round((LABEL_FONT * c.width) / LABEL_W);
    ctx.font = `700 ${px}px ${SCREEN_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px * 0.05)}px`;
    const cap = ctx.measureText('H').actualBoundingBoxAscent || px * 0.7;
    ctx.fillText(text, 2, c.height / 2 + cap / 2);
    tex.needsUpdate = true;
    invalidate();
  }, [tex, text, color, fonts, invalidate]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh
      position={[x + LABEL_W / 2, BLOCK_HEIGHT + 0.0012, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      raycast={() => null}
      name="block-type-label"
    >
      <planeGeometry args={[LABEL_W, LABEL_H]} />
      <meshBasicMaterial
        map={tex}
        transparent
        toneMapped={false}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
});

/**
 * The yellow box that marks a block as an operator block. It lies flush on the top cover, to the right of the
 * power LED (the left-hand side of the header), and is the only thing that tells an operator from a Text Block.
 */
export const OperatorMark = memo(function OperatorMark({ width, depth, header, symbol, color = OPERATOR_YELLOW, label }: Props) {
  const { x, z } = operatorMarkPosition(width, depth, header);
  const sym = operatorSymbolPosition(width, depth, header);
  const geo = useDisposable(
    () => new ShapeGeometry(roundedSquare(OPERATOR_BOX_SIZE, CORNER), 6).rotateX(-Math.PI / 2),
    [],
  );
  const mat = useDisposable(
    () =>
      new MeshBasicMaterial({
        color,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [color],
  );
  const symGeo = useDisposable(() => (symbol ? operatorSymbolGeometry(symbol) : new BufferGeometry()), [symbol]);
  return (
    <>
      <mesh
        geometry={geo}
        material={mat}
        position={[x, BLOCK_HEIGHT + 0.0012, z]}
        renderOrder={2}
        raycast={() => null}
        name="operator-box"
      />
      {symbol && (
        <mesh
          geometry={symGeo}
          material={mat}
          position={[sym.x, BLOCK_HEIGHT + 0.0012, sym.z]}
          renderOrder={2}
          raycast={() => null}
          name="operator-symbol"
        />
      )}
      {label && !symbol && <BoxLabel text={label} x={sym.x - OPERATOR_SYMBOL_SIZE / 2} z={sym.z} color={color} />}
    </>
  );
});
