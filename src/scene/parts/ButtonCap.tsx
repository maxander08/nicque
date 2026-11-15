import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { LatheGeometry, MeshBasicMaterial, Vector2, type Group } from 'three';
import { getMaterials } from '@/materials/library';
import type { IconName } from '@/materials/screens';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { useDisposable } from '../hooks';
import { getIconTexture } from './Decals';

const CAP_TOP = BLOCK_HEIGHT + 0.004;
const CAP_BASE = 0.2;
const BUTTON_CLEARANCE = 0.014;

/** Hole spec for the housing cover so a button of `radius` can sit in a real opening. */
export const buttonHole = (x: number, z: number, radius: number) => ({
  cx: x,
  cz: z,
  w: (radius + BUTTON_CLEARANCE) * 2,
  d: (radius + BUTTON_CLEARANCE) * 2,
  r: radius + BUTTON_CLEARANCE,
  lip: 0.012,
  segments: 14,
});

function capGeometry(R: number) {
  const b = 0.016;
  const pts: Vector2[] = [
    new Vector2(0.0001, CAP_BASE),
    new Vector2(R * 0.96, CAP_BASE),
    new Vector2(R, CAP_BASE + 0.006),
    new Vector2(R, CAP_TOP - b),
  ];
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new Vector2(R - b + b * Math.cos(a), CAP_TOP - b + b * Math.sin(a)));
  }
  // slightly concave finger dish
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const r = (R - b) * (1 - t);
    const depth = 0.0085 * (1 - Math.pow(r / (R - b), 2));
    pts.push(new Vector2(Math.max(r, 0.0001), CAP_TOP - depth));
  }
  return new LatheGeometry(pts, 48);
}

interface Props {
  moduleId: string;
  action: string;
  x: number;
  z: number;
  radius: number;
  icon: IconName;
  /** Light leaking from the gap around the cap. */
  glow?: boolean;
  label: string;
}

/** Soft-touch round button with a printed icon, sitting in an opening of the cover. */
export const ButtonCap = memo(function ButtonCap({ moduleId, action, x, z, radius, icon, glow, label }: Props) {
  const m = getMaterials();
  const geo = useDisposable(() => capGeometry(radius), [radius]);
  const group = useRef<Group>(null);
  const key = `${moduleId}:${action}`;
  const pressedRef = useRef(false);
  const ringMat = useMemo(() => new MeshBasicMaterial({ color: '#ffe9c4', toneMapped: false }), []);
  const iconTex = getIconTexture(icon);

  useFrame(() => {
    pressedRef.current = useStore.getState().pressed === key;
    const g = group.current;
    if (g) g.position.y += ((pressedRef.current ? -0.012 : 0) - g.position.y) * 0.4;
    ringMat.opacity = glow ? 1 : 0;
    ringMat.visible = !!glow;
  });

  return (
    <group position={[x, 0, z]} name={label}>
      {/* illuminated gap ring */}
      <mesh position={[0, BLOCK_HEIGHT - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[radius - 0.002, radius + BUTTON_CLEARANCE - 0.002, 48]} />
      </mesh>
      <group ref={group} userData={{ pick: { kind: 'button', moduleId, action } }}>
        <mesh geometry={geo} material={m.button} castShadow />
        <mesh position={[0, CAP_TOP - 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <circleGeometry args={[radius * 0.56, 32]} />
          <meshBasicMaterial
            map={iconTex}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      </group>
    </group>
  );
});
