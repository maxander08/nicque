import {
  KB_CELL_PX,
  KB_TEX_H,
  KB_TEX_W,
  KEYS,
  keyCap,
  legendOf,
  type Mods,
} from '@/modules/keyboard';
import { layoutText } from '@/modules/textLayout';
import type { ScreenContent } from '@/types';
import { makeDotMaskCanvas } from './textures';

/**
 * Canvas painters for the physical screens. The result is uploaded as an emissive texture on the real 3D
 * screen surface, so it follows perspective, lighting and viewing angle.
 */

export const SCREEN_FONT = '"Atkinson Hyperlegible", "Inter Variable", "Segoe UI", system-ui, sans-serif';

export const DISPLAY_SIZE = 1024;
export const DISPLAY_CELLS = 80;
export const TEXT_SCREEN_W = 1024;
/** Matches the Text Block window (1.72 × 0.832) plus its 0.02 overlap on each side: 1.76 × 0.872 → 1024 × 508 px. */
export const TEXT_SCREEN_H = 508;

let dotMask: HTMLCanvasElement | null = null;
const getDotMask = () => (dotMask ??= makeDotMaskCanvas(DISPLAY_SIZE, DISPLAY_CELLS, 0.24));

const measureCtx = (() => {
  let c: CanvasRenderingContext2D | null = null;
  return () => (c ??= document.createElement('canvas').getContext('2d')!);
})();

function measurer(weight: number) {
  const m = measureCtx();
  return (text: string, size: number) => {
    m.font = `${weight} ${size}px ${SCREEN_FONT}`;
    return m.measureText(text).width;
  };
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontSize: number,
  lineHeight: number,
  box: { x: number; y: number; w: number; h: number },
  align: 'left' | 'center',
  weight: number,
) {
  ctx.font = `${weight} ${fontSize}px ${SCREEN_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  const total = lines.length * fontSize * lineHeight;
  let y = box.y + (box.h - total) / 2 + (fontSize * lineHeight) / 2;
  const x = align === 'center' ? box.x + box.w / 2 : box.x;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += fontSize * lineHeight;
  }
}

/** Draws the LED-matrix display. */
export function drawDisplayScreen(
  ctx: CanvasRenderingContext2D,
  content: ScreenContent,
  align: 'left' | 'center',
) {
  const S = DISPLAY_SIZE;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);

  if (content.kind === 'off') {
    ctx.restore();
    return;
  }

  // Idle LED backlight: deep indigo wash, like the reference pads at low brightness.
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#171d44');
  g.addColorStop(0.55, '#1b1740');
  g.addColorStop(1, '#2a1642');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const pad = 110;
  const box = { x: pad, y: pad, w: S - pad * 2, h: S - pad * 2 };

  if (content.kind === 'text') {
    const layout = layoutText(content.text, {
      width: box.w,
      height: box.h,
      maxFont: 200,
      minFont: 52,
      lineHeight: 1.16,
      measure: measurer(700),
    });
    ctx.fillStyle = '#f2f6ff';
    ctx.shadowColor = 'rgba(160,190,255,0.55)';
    ctx.shadowBlur = 16;
    drawLines(ctx, layout.lines, layout.fontSize, 1.16, box, align, 700);
    ctx.shadowBlur = 0;
  } else {
    const messages: Record<string, [string, string]> = {
      'no-source': ['No data source', 'Link a Text Block to this display'],
      'source-off': ['Source unavailable', 'The linked Text Block is not operating'],
      empty: ['Empty text', 'The Text Block sends no characters'],
    };
    const [title, sub] = messages[content.kind];
    ctx.fillStyle = '#dfe6f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 78px ${SCREEN_FONT}`;
    ctx.fillText(title, S / 2, S / 2 - 30);
    ctx.fillStyle = '#9aa6c8';
    ctx.font = `400 44px ${SCREEN_FONT}`;
    const sl = layoutText(sub, {
      width: box.w,
      height: 140,
      maxFont: 44,
      minFont: 30,
      lineHeight: 1.2,
      measure: measurer(400),
    });
    drawLines(ctx, sl.lines, sl.fontSize, 1.2, { x: box.x, y: S / 2 + 20, w: box.w, h: 140 }, 'center', 400);
    // simple "unlinked" glyph
    ctx.strokeStyle = '#9aa6c8';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(S / 2 - 40, 270, 34, Math.PI * 0.75, Math.PI * 2.25);
    ctx.moveTo(S / 2 + 40, 270 + 0);
    ctx.arc(S / 2 + 40, 270, 34, Math.PI * 1.75, Math.PI * 1.25);
    ctx.stroke();
  }

  // LED diffuser: multiply by the lattice mask.
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(getDotMask(), 0, 0, S, S);
  ctx.restore();
}

/** Draws the Text Block's embedded screen. */
export function drawTextScreen(ctx: CanvasRenderingContext2D, content: ScreenContent) {
  const W = TEXT_SCREEN_W;
  const H = TEXT_SCREEN_H;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (content.kind === 'off') {
    ctx.restore();
    return;
  }
  // faint panel backlight
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1a1c');
  g.addColorStop(1, '#071012');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const pad = 44;
  const box = { x: pad, y: 40, w: W - pad * 2, h: H - 80 };
  ctx.fillStyle = '#d9fff6';
  if (content.kind === 'text') {
    // a bar after the last character shows that a Keyboard Block is typing into this block
    const shown = content.typing ? `${content.text}|` : content.text;
    const layout = layoutText(shown, {
      width: box.w,
      height: box.h,
      maxFont: 110,
      minFont: 34,
      lineHeight: 1.18,
      measure: measurer(700),
    });
    ctx.shadowColor = 'rgba(120,255,225,0.45)';
    ctx.shadowBlur = 10;
    drawLines(ctx, layout.lines, layout.fontSize, 1.18, box, 'left', 700);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = '#9fd8cc';
    ctx.font = `700 54px ${SCREEN_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Empty', pad, H / 2 - 24);
    ctx.fillStyle = '#6fa59c';
    ctx.font = `400 36px ${SCREEN_FONT}`;
    ctx.fillText(content.kind === 'empty' && content.typing ? 'Type on the keyboard' : 'Press Edit to enter text', pad, H / 2 + 34);
  }
  ctx.restore();
}

/* ---- small icon / label canvases ---------------------------------------------------------- */

export type IconName = 'power' | 'edit' | 'clear' | 'undo';

export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, size: number, color: string) {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.075;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (name) {
    case 'power':
      ctx.arc(c, c + size * 0.03, size * 0.28, -Math.PI * 0.32, Math.PI * 1.32 + Math.PI * 0.0, false);
      ctx.moveTo(c, c - size * 0.34);
      ctx.lineTo(c, c - size * 0.06);
      break;
    case 'edit':
      ctx.moveTo(c - size * 0.26, c + size * 0.26);
      ctx.lineTo(c - size * 0.2, c + size * 0.1);
      ctx.lineTo(c + size * 0.14, c - size * 0.24);
      ctx.lineTo(c + size * 0.26, c - size * 0.12);
      ctx.lineTo(c - size * 0.1, c + size * 0.22);
      ctx.closePath();
      ctx.moveTo(c + size * 0.06, c - size * 0.16);
      ctx.lineTo(c + size * 0.18, c - size * 0.04);
      break;
    case 'clear':
      ctx.moveTo(c - size * 0.22, c - size * 0.22);
      ctx.lineTo(c + size * 0.22, c + size * 0.22);
      ctx.moveTo(c + size * 0.22, c - size * 0.22);
      ctx.lineTo(c - size * 0.22, c + size * 0.22);
      break;
    case 'undo': {
      // classic undo arrow: head on the left, shaft turning down through a rounded bowl on the right
      const u = size;
      ctx.moveTo(c - u * 0.1, c - u * 0.3);
      ctx.lineTo(c - u * 0.28, c - u * 0.14);
      ctx.lineTo(c - u * 0.1, c + u * 0.02);
      ctx.moveTo(c - u * 0.27, c - u * 0.14);
      ctx.lineTo(c + u * 0.06, c - u * 0.14);
      ctx.arc(c + u * 0.06, c + u * 0.07, u * 0.21, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(c - u * 0.2, c + u * 0.28);
      break;
    }
  }
  ctx.stroke();
}

/* ---- keyboard ----------------------------------------------------------------------------- */

let kbMask: HTMLCanvasElement | null = null;
const getKbMask = () => (kbMask ??= makeDotMaskCanvas(KB_CELL_PX * DISPLAY_CELLS, DISPLAY_CELLS, 0.24));

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws the Keyboard Block's LED screen: the same indigo LED look and typeface as the Display Block, with one
 * lit keycap per key. `down` holds the pressure (0..1) of every key that is currently pressed.
 */
export function drawKeyboardScreen(
  ctx: CanvasRenderingContext2D,
  content: ScreenContent,
  mods: Mods,
  down: Readonly<Record<string, number>>,
) {
  const W = KB_TEX_W;
  const H = KB_TEX_H;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (content.kind !== 'keys') {
    ctx.restore();
    return;
  }

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#171d44');
  g.addColorStop(0.55, '#1b1740');
  g.addColorStop(1, '#2a1642');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // keycaps dim while the keyboard is not linked to a Text Block
  const live = content.linked ? 1 : 0.55;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  for (const k of KEYS) {
    const cap = keyCap(k);
    const pressure = down[k.id];
    const pressed = pressure !== undefined;
    const latched = (k.kind === 'caps' && mods.caps) || (k.kind === 'shift' && mods.shift);
    const lit = pressed ? 0.62 + 0.38 * pressure : latched ? 0.5 : 0;

    ctx.globalAlpha = live;
    roundRect(ctx, cap.x, cap.y, cap.w, cap.h, 16);
    ctx.fillStyle = lit > 0 ? `rgba(214,228,255,${lit.toFixed(3)})` : 'rgba(150,170,255,0.09)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = lit > 0 ? 'rgba(235,242,255,0.9)' : 'rgba(170,190,255,0.34)';
    ctx.stroke();

    const legend = legendOf(k, mods);
    if (legend) {
      const small = k.kind !== 'char';
      ctx.font = `700 ${small ? 36 : 60}px ${SCREEN_FONT}`;
      ctx.fillStyle = lit > 0.45 ? '#10163a' : '#f2f6ff';
      ctx.shadowColor = lit > 0.45 ? 'transparent' : 'rgba(160,190,255,0.55)';
      ctx.shadowBlur = lit > 0.45 ? 0 : 12;
      ctx.fillText(legend, cap.x + cap.w / 2, cap.y + cap.h / 2 + 3);
      ctx.shadowBlur = 0;
    } else if (k.kind === 'space') {
      // spacebar: a short bar, so that it reads as a key even without a legend
      ctx.fillStyle = lit > 0.45 ? '#10163a' : 'rgba(242,246,255,0.55)';
      roundRect(ctx, cap.x + cap.w / 2 - 90, cap.y + cap.h / 2 - 3, 180, 6, 3);
      ctx.fill();
    }
    // Caps Lock indicator
    if (k.kind === 'caps') {
      ctx.fillStyle = mods.caps ? '#10163a' : 'rgba(170,190,255,0.35)';
      ctx.beginPath();
      ctx.arc(cap.x + 22, cap.y + 22, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // LED diffuser: multiply by the lattice mask, tiled from the bottom-left (the albedo lattice origin)
  ctx.globalCompositeOperation = 'multiply';
  const tile = getKbMask();
  for (let x = 0; x < W; x += tile.width) ctx.drawImage(tile, x, H - tile.height);
  ctx.restore();
}
