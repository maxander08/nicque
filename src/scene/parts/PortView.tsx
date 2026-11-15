import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshBasicMaterial } from 'three';
import { validateConnection } from '@/connections/validate';
import { getMaterials } from '@/materials/library';
import { BLOCK_HEIGHT } from '@/modules/definitions';
import { useStore } from '@/state/store';
import type { PortDef } from '@/types';

const COLORS = {
  power: new Color('#ffd9a3'),
  text: new Color('#9fcbff'),
  off: new Color('#2a2b30'),
  white: new Color('#ffffff'),
};

type LinkState = 'none' | 'linked' | 'active';
type Candidate = 'none' | 'origin' | 'valid' | 'invalid';

/**
 * Physical connector: an edge insert with contact pads (pogo pins on outputs, flat pads on inputs),
 * two retention magnets, a status light on the top cover and an invisible pick volume.
 * The status light shows: dark = not linked, dim = linked but inactive, bright = link active.
 */
export const PortView = memo(function PortView({ moduleId, port }: { moduleId: string; port: PortDef }) {
  const m = getMaterials();
  const led = useMemo(() => new MeshBasicMaterial({ color: COLORS.off, toneMapped: false }), []);
  useEffect(() => () => led.dispose(), [led]);

  const linkState = useStore((s): LinkState => {
    let linked = false;
    for (const c of s.workspace.connections) {
      const hit =
        (c.from.moduleId === moduleId && c.from.portId === port.id) ||
        (c.to.moduleId === moduleId && c.to.portId === port.id);
      if (!hit) continue;
      linked = true;
      if (s.runtime.connections[c.id]?.active) return 'active';
    }
    return linked ? 'linked' : 'none';
  });

  const candidate = useStore((s): Candidate => {
    const d = s.linkDrag;
    if (!d) return 'none';
    if (d.from.moduleId === moduleId && d.from.portId === port.id) return 'origin';
    return validateConnection(s.workspace, d.from, { moduleId, portId: port.id }).ok ? 'valid' : 'invalid';
  });

  const state = useRef({ linkState, candidate });
  state.current = { linkState, candidate };
  const tmp = useMemo(() => new Color(), []);

  useFrame(({ clock }) => {
    const { linkState: ls, candidate: cd } = state.current;
    const base = COLORS[port.type];
    if (cd === 'valid') {
      const pulse = 0.55 + 0.45 * Math.sin(clock.elapsedTime * 7);
      tmp.copy(COLORS.off).lerp(COLORS.white, 0.35 + 0.65 * pulse);
    } else if (cd === 'origin') {
      tmp.copy(COLORS.white);
    } else if (ls === 'active') {
      tmp.copy(base);
    } else if (ls === 'linked') {
      tmp.copy(COLORS.off).lerp(base, 0.3);
    } else {
      tmp.copy(COLORS.off);
    }
    led.color.lerp(tmp, 0.25);
  });

  const yaw = Math.atan2(-port.normal.z, port.normal.x);
  const isOut = port.direction === 'out';
  const y = 0.095;
  const pads = [-0.14, 0, 0.14];

  return (
    <group position={[port.local.x, 0, port.local.z]} rotation={[0, yaw, 0]}>
      {/* connector insert */}
      <mesh position={[0.002, y, 0]} material={m.insert} castShadow>
        <boxGeometry args={[0.014, 0.072, 0.48]} />
      </mesh>
      {pads.map((z) =>
        isOut ? (
          <mesh key={z} position={[0.014, y, z]} rotation={[0, 0, Math.PI / 2]} material={m.contact}>
            <cylinderGeometry args={[0.014, 0.014, 0.016, 16]} />
          </mesh>
        ) : (
          <mesh key={z} position={[0.0095, y, z]} rotation={[0, 0, Math.PI / 2]} material={m.contact}>
            <cylinderGeometry args={[0.016, 0.016, 0.003, 16]} />
          </mesh>
        ),
      )}
      {[-0.205, 0.205].map((z) => (
        <mesh key={z} position={[0.0095, y, z]} rotation={[0, 0, Math.PI / 2]} material={m.steel}>
          <cylinderGeometry args={[0.018, 0.018, 0.003, 16]} />
        </mesh>
      ))}
      {/* status strip on the edge insert */}
      <mesh position={[0.0095, y + 0.043, 0]} material={led}>
        <boxGeometry args={[0.003, 0.007, 0.3]} />
      </mesh>
      {/* status lens on the top cover */}
      <mesh position={[-0.05, BLOCK_HEIGHT + 0.0006, 0]} material={led}>
        <boxGeometry args={[0.022, 0.0014, 0.22]} />
      </mesh>
      {/* pick volume: covers the edge insert and the strip of cover next to it */}
      <mesh position={[-0.1, 0.14, 0]} userData={{ pick: { kind: 'port', moduleId, portId: port.id } }}>
        <boxGeometry args={[0.34, 0.3, 0.6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
});
