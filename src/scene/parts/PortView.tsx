import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MeshBasicMaterial } from 'three';
import { validateConnection } from '@/connections/validate';
import { useStore } from '@/state/store';
import { getPortGeometries } from './portGeometry';
import type { PortDef, PortRef, Workspace } from '@/types';

const COLORS = {
  power: new Color('#ffd9a3'),
  text: new Color('#9fcbff'),
  keys: new Color('#c9a8ff'),
  off: new Color('#2a2b30'),
  white: new Color('#ffffff'),
};

/**
 * While a link is being dragged every connector asks whether it is a valid target, on every pointer move.
 * The answer only depends on the workspace and the connector the drag started from, so it is computed once per
 * connector and reused until one of those changes.
 */
let verdictWs: Workspace | null = null;
let verdictFrom = '';
const verdicts = new Map<string, boolean>();
function isValidTarget(ws: Workspace, from: PortRef, to: PortRef): boolean {
  const fk = `${from.moduleId}:${from.portId}`;
  if (ws !== verdictWs || fk !== verdictFrom) {
    verdictWs = ws;
    verdictFrom = fk;
    verdicts.clear();
  }
  const tk = `${to.moduleId}:${to.portId}`;
  let v = verdicts.get(tk);
  if (v === undefined) {
    v = validateConnection(ws, from, to).ok;
    verdicts.set(tk, v);
  }
  return v;
}

type LinkState = 'none' | 'linked' | 'active';
type Candidate = 'none' | 'origin' | 'valid' | 'invalid';

/**
 * Physical connector: an edge insert with contact pads (pogo pins on outputs, flat pads on inputs),
 * two retention magnets, a status light on the top cover and an invisible pick volume.
 * The status light shows: dark = not linked, dim = linked but inactive, bright = link active.
 */
export const PortView = memo(function PortView({ moduleId, port }: { moduleId: string; port: PortDef }) {
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
    return isValidTarget(s.workspace, d.from, { moduleId, portId: port.id }) ? 'valid' : 'invalid';
  });

  const state = useRef({ linkState, candidate });
  state.current = { linkState, candidate };
  const tmp = useMemo(() => new Color(), []);

  useFrame(({ clock, invalidate }) => {
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
    // the valid-target pulse never settles; the colour ease settles once within ~1/1000 of the target
    if (
      cd === 'valid' ||
      Math.abs(led.color.r - tmp.r) + Math.abs(led.color.g - tmp.g) + Math.abs(led.color.b - tmp.b) > 1e-3
    ) {
      invalidate();
    }
  });

  const yaw = Math.atan2(-port.normal.z, port.normal.x);
  const isOut = port.direction === 'out';
  const geos = getPortGeometries(isOut);

  return (
    <group position={[port.local.x, 0, port.local.z]} rotation={[0, yaw, 0]}>
      {/* the two status lights (the insert, pads and magnets are drawn merged per block, see ModulePortStatics) */}
      <mesh geometry={geos.lights} material={led} />
      {/* pick volume: covers the edge insert and the strip of cover next to it */}
      <mesh position={[-0.1, 0.14, 0]} userData={{ pick: { kind: 'port', moduleId, portId: port.id } }}>
        <boxGeometry args={[0.34, 0.3, 0.6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
});
