import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CircleGeometry, LatheGeometry, MeshBasicMaterial, RingGeometry, Vector2, type Group } from 'three';
import { getMaterials } from '@/materials/library';
import type { IconName } from '@/materials/screens';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { CONTROL_CLEARANCE } from '@/modules/layout';
import { useStore } from '@/state/store';
import { getDecalMaterial } from '../hooks';
import { getIconTexture } from './Decals';

const CAP_TOP = BLOCK_HEIGHT + 0.004;
const CAP_BASE = 0.2;
export const BUTTON_CLEARANCE = CONTROL_CLEARANCE;
/** Radius of every physical button on every block, so they all match. */
export const BUTTON_RADIUS = 0.2;

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

const capCache = new Map<number, LatheGeometry>();
/** One cap geometry per radius, shared by every button of every block. */
const sharedCapGeometry = (R: number) => {
  let g = capCache.get(R);
  if (!g) {
    g = capGeometry(R);
    capCache.set(R, g);
  }
  return g;
};

const ringCache = new Map<number, RingGeometry>();
const sharedRingGeometry = (radius: number) => {
  let g = ringCache.get(radius);
  if (!g) {
    g = new RingGeometry(radius - 0.002, radius + BUTTON_CLEARANCE - 0.002, 48);
    ringCache.set(radius, g);
  }
  return g;
};

const iconDiscCache = new Map<number, CircleGeometry>();
const sharedIconDisc = (radius: number) => {
  const r = radius * (radius < 0.15 ? 0.78 : 0.56);
  let g = iconDiscCache.get(r);
  if (!g) {
    g = new CircleGeometry(r, 32);
    iconDiscCache.set(r, g);
  }
  return g;
};

/** The illuminated gap ring is either lit or invisible, so two shared materials replace one per button. */
const ringOn = new MeshBasicMaterial({ color: '#ffe9c4', toneMapped: false, opacity: 1 });
const ringOff = new MeshBasicMaterial({ color: '#ffe9c4', toneMapped: false, opacity: 0, visible: false });

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
  const geo = sharedCapGeometry(radius);
  const group = useRef<Group>(null);
  const key = `${moduleId}:${action}`;
  const pressedRef = useRef(false);
  const iconTex = getIconTexture(icon);

  useFrame(({ invalidate }) => {
    pressedRef.current = useStore.getState().pressed === key;
    const g = group.current;
    if (g) {
      const target = pressedRef.current ? -0.012 : 0;
      g.position.y += (target - g.position.y) * 0.4;
      // keep rendering until the cap has visibly settled (sub-0.02 mm), then snap
      if (Math.abs(target - g.position.y) > 2e-5) invalidate();
      else g.position.y = target;
    }
  });

  return (
    <group position={[x, 0, z]} name={label}>
      {/* illuminated gap ring */}
      <mesh
        position={[0, BLOCK_HEIGHT - 0.03, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={glow ? ringOn : ringOff}
        geometry={sharedRingGeometry(radius)}
      />
      <group ref={group} userData={{ pick: { kind: 'button', moduleId, action } }}>
        <mesh geometry={geo} material={m.button} castShadow />
        <mesh
          position={[0, CAP_TOP - 0.003, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
          geometry={sharedIconDisc(radius)}
          material={getDecalMaterial(iconTex)}
        />
      </group>
    </group>
  );
});
