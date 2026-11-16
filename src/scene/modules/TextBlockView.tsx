import { useMemo } from 'react';
import { Color, MeshPhysicalMaterial } from 'three';
import {
  TEXT_SCREEN_H,
  TEXT_SCREEN_W,
  drawTextScreen,
} from '@/materials/screens';
import { EDGE, badgeZ, contentTopZ, windowWidth } from '@/modules/layout';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { getMaterials } from '@/materials/library';
import { useStore } from '@/state/store';
import { useDisposable, useFontsReady, useScreenTexture } from '../hooks';
import { BUTTON_CLEARANCE, BUTTON_RADIUS, ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { Housing } from '../parts/Housing';
import { PowerLed } from '../parts/PowerLed';

const def = MODULE_DEFINITIONS.text;
const BTN_R = BUTTON_RADIUS;
const BTN_X = 0.55;
/** Buttons end 0.06 above the badge; the screen sits EDGE below the LED band and EDGE above the buttons. */
const BTN_BOTTOM = badgeZ(def.depth) - 0.12;
const BTN_Z = BTN_BOTTOM - BTN_R - BUTTON_CLEARANCE;
const WIN_TOP = contentTopZ(def.depth);
const WIN_BOTTOM = BTN_Z - BTN_R - BUTTON_CLEARANCE - EDGE;
const WIN = { cz: (WIN_TOP + WIN_BOTTOM) / 2, w: windowWidth(def.width), d: WIN_BOTTOM - WIN_TOP };
const BUTTONS = [
  { x: -BTN_X, action: 'edit', icon: 'edit', label: 'Edit button' },
  { x: 0, action: 'clear', icon: 'clear', label: 'Clear button' },
  { x: BTN_X, action: 'undo', icon: 'undo', label: 'Restore sample text button' },
] as const;

export function TextBlockView({ moduleId }: { moduleId: string }) {
  const screen = useStore((s) => s.runtime.modules[moduleId]?.screen) ?? { kind: 'off' as const };
  const powered = useStore((s) => s.runtime.modules[moduleId]?.powered === true);
  const fonts = useFontsReady();
  const m = getMaterials();

  const holes = useMemo(
    () => [
      { cx: 0, cz: WIN.cz, w: WIN.w, d: WIN.d, r: 0.07, lip: 0.014, segments: 8 },
      ...BUTTONS.map((b) => buttonHole(b.x, BTN_Z, BTN_R)),
    ],
    [],
  );

  const text = screen.kind === 'text' ? screen.text : '';
  const typing = (screen.kind === 'text' || screen.kind === 'empty') && !!screen.typing;
  const tex = useScreenTexture(
    TEXT_SCREEN_W,
    TEXT_SCREEN_H,
    (ctx) => drawTextScreen(ctx, screen),
    [screen.kind, text, typing, fonts],
  );
  const mat = useDisposable(
    () =>
      new MeshPhysicalMaterial({
        color: new Color('#020303'),
        emissive: new Color('#ffffff'),
        emissiveMap: tex,
        emissiveIntensity: 1.35,
        roughness: 0.3,
      }),
    [tex],
  );

  const planeW = WIN.w + 0.04;
  const planeH = (planeW * TEXT_SCREEN_H) / TEXT_SCREEN_W;
  const screenPick = { pick: { kind: 'screen', moduleId } };

  return (
    <group>
      <Housing width={def.width} depth={def.depth} holes={holes} />
      {/* embedded screen with a glass cover */}
      <mesh position={[0, BLOCK_HEIGHT - 0.012, WIN.cz]} rotation={[-Math.PI / 2, 0, 0]} material={mat} userData={screenPick}>
        <planeGeometry args={[planeW, planeH]} />
      </mesh>
      <mesh position={[0, BLOCK_HEIGHT - 0.006, WIN.cz]} rotation={[-Math.PI / 2, 0, 0]} material={m.glass} renderOrder={4} userData={screenPick}>
        <planeGeometry args={[planeW, planeH]} />
      </mesh>
      {BUTTONS.map((b) => (
        <ButtonCap
          key={b.action}
          moduleId={moduleId}
          action={b.action}
          x={b.x}
          z={BTN_Z}
          radius={BTN_R}
          icon={b.icon}
          label={b.label}
        />
      ))}
      <PowerLed width={def.width} depth={def.depth} powered={powered} />
      <BlockBadge name="Text" x={0} z={badgeZ(def.depth)} width={0.36} height={0.15} />
    </group>
  );
}
