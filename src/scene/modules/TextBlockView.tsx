import { useMemo } from 'react';
import { Color, MeshPhysicalMaterial } from 'three';
import {
  TEXT_SCREEN_H,
  TEXT_SCREEN_W,
  drawTextScreen,
} from '@/materials/screens';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { getMaterials } from '@/materials/library';
import { useStore } from '@/state/store';
import { useDisposable, useFontsReady, useScreenTexture } from '../hooks';
import { ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { Housing } from '../parts/Housing';
import { LedRow } from '../parts/LedRow';

const def = MODULE_DEFINITIONS.text;
const WIN = { cz: -0.3, w: 1.7, d: 0.7 };
const BUTTONS = [
  { x: -0.55, action: 'edit', icon: 'edit', label: 'Edit button' },
  { x: 0, action: 'clear', icon: 'clear', label: 'Clear button' },
  { x: 0.55, action: 'undo', icon: 'undo', label: 'Restore sample text button' },
] as const;
const BTN_Z = 0.52;
const BTN_R = 0.19;

export function TextBlockView({ moduleId }: { moduleId: string }) {
  const screen = useStore((s) => s.runtime.modules[moduleId]?.screen) ?? { kind: 'off' as const };
  const operational = useStore((s) => s.runtime.modules[moduleId]?.state === 'operational');
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

  return (
    <group>
      <Housing width={def.width} depth={def.depth} holes={holes} />
      {/* embedded screen with a glass cover */}
      <mesh position={[0, BLOCK_HEIGHT - 0.012, WIN.cz]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
        <planeGeometry args={[planeW, planeH]} />
      </mesh>
      <mesh position={[0, BLOCK_HEIGHT - 0.006, WIN.cz]} rotation={[-Math.PI / 2, 0, 0]} material={m.glass} renderOrder={4}>
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
      <LedRow count={12} span={1.56} z={-0.84} level={operational ? 1 : 0} />
      <BlockBadge name="Text" x={0} z={0.865} width={0.36} height={0.15} />
    </group>
  );
}
