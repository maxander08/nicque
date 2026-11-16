import { memo, useMemo } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { Line } from '@react-three/drei';
import { CABLE_RADIUS, PORT_HEIGHT, cablePath, isDocked } from '@/connections/cable';
import { getMaterials } from '@/materials/library';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { footprint, portWorld, type WorldPort } from '@/modules/spatial';
import { useStore } from '@/state/store';
import type { ConnectionRecord, ModuleRecord, PortRef } from '@/types';
import { useDisposable } from './hooks';

const PLUG_LENGTH = 0.126;

function worldPortOf(modules: ModuleRecord[], ref: PortRef): WorldPort | null {
  const m = modules.find((x) => x.id === ref.moduleId);
  const def = m && MODULE_DEFINITIONS[m.type].ports.find((p) => p.id === ref.portId);
  return m && def ? portWorld(m, def) : null;
}

const Plug = memo(function Plug({ port }: { port: WorldPort }) {
  const mat = getMaterials();
  const yaw = Math.atan2(-port.nz, port.nx);
  return (
    <group position={[port.x, PORT_HEIGHT, port.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0.016 + (PLUG_LENGTH - 0.016) / 2, 0, 0]} material={mat.button} castShadow>
        <boxGeometry args={[PLUG_LENGTH - 0.016, 0.082, 0.34]} />
      </mesh>
    </group>
  );
});

const CableMesh = memo(function CableMesh({ points }: { points: Array<[number, number, number]> }) {
  const mat = getMaterials();
  const geo = useDisposable(() => {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal');
    return new TubeGeometry(curve, 64, CABLE_RADIUS, 10, false);
  }, [points]);
  return <mesh geometry={geo} material={mat.insert} castShadow />;
});

function LinkedCable({ c, modules }: { c: ConnectionRecord; modules: ModuleRecord[] }) {
  const a = worldPortOf(modules, c.from);
  const b = worldPortOf(modules, c.to);
  const docked = !!a && !!b && isDocked(a, b);
  // Rebuild only when connector coordinates or neighbouring footprints change.
  const key = a && b ? [a.x, a.z, a.nx, a.nz, b.x, b.z, b.nx, b.nz].map((v) => v.toFixed(3)).join(',') : '';
  const obstacleKey = modules
    .map((m) => `${m.id}:${m.position.x.toFixed(3)},${m.position.z.toFixed(3)},${m.rotation}`)
    .join('|');
  const points = useMemo(() => {
    if (!a || !b || docked) return null;
    const ends = (p: WorldPort): WorldPort => ({ ...p, x: p.x + p.nx * PLUG_LENGTH, z: p.z + p.nz * PLUG_LENGTH });
    const obstacles = modules.map((m) => footprint(m, 0));
    return cablePath(ends(a), ends(b), obstacles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, obstacleKey, docked]);
  if (!a || !b || docked || !points) return null;
  return (
    <group>
      <Plug port={a} />
      <Plug port={b} />
      <CableMesh points={points} />
    </group>
  );
}

/** Physical link cables between connected-but-separated connectors. Docked connectors need none. */
export function Cables() {
  const modules = useStore((s) => s.workspace.modules);
  const connections = useStore((s) => s.workspace.connections);
  return (
    <>
      {connections.map((c) => (
        <LinkedCable key={c.id} c={c} modules={modules} />
      ))}
    </>
  );
}

/** Subtle preview line while the user drags a new link out of a connector. */
export function LinkPreview() {
  const drag = useStore((s) => s.linkDrag);
  const modules = useStore((s) => s.workspace.modules);
  if (!drag) return null;
  const a = worldPortOf(modules, drag.from);
  if (!a) return null;
  const target = drag.target ? worldPortOf(modules, drag.target) : null;
  const end: [number, number, number] = target
    ? [target.x, PORT_HEIGHT, target.z]
    : [drag.pointer.x, 0.04, drag.pointer.z];
  const ok = drag.verdict?.ok ?? false;
  const start: [number, number, number] = [a.x + a.nx * 0.02, PORT_HEIGHT, a.z + a.nz * 0.02];
  return (
    <Line
      points={[start, [(start[0] + end[0]) / 2, 0.5, (start[2] + end[2]) / 2], end]}
      color={ok ? '#ffffff' : drag.target ? '#c9c9cf' : '#e6e6ea'}
      lineWidth={ok ? 2.4 : 1.6}
      dashed={!ok}
      dashSize={0.12}
      gapSize={0.08}
      transparent
      opacity={ok ? 0.95 : 0.7}
      raycast={() => null}
    />
  );
}
