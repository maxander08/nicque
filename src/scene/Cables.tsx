import { memo, useEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { useThree } from '@react-three/fiber';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CABLE_RADIUS, PORT_HEIGHT, cablePath, isDocked } from '@/connections/cable';
import { getMaterials } from '@/materials/library';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { removeCableShape, setCableShape } from '@/rendering/cableShadow';
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
    // enough rings for long, winding routes to stay perfectly round and smooth
    return new TubeGeometry(curve, Math.min(900, Math.max(96, points.length * 2)), CABLE_RADIUS, 10, false);
  }, [points]);
  return <mesh geometry={geo} material={mat.insert} castShadow />;
});

type P3 = [number, number, number];

interface RouteCache {
  key: string;
  points: P3[] | null;
  /** Where every block stood when the route was computed. */
  stood: Map<string, { x: number; z: number; r: number }>;
  /** Area the route (and any detour it could take) can be affected in. */
  box: { minX: number; minZ: number; maxX: number; maxZ: number };
}

/** Reach of a block's footprint from its centre, and how far an obstacle can influence the route (clearances ≤ 0.5). */
const reach = (m: ModuleRecord) =>
  Math.hypot(MODULE_DEFINITIONS[m.type].width, MODULE_DEFINITIONS[m.type].depth) / 2;
const ROUTE_INFLUENCE = 1.4;

const nearBox = (box: RouteCache['box'], x: number, z: number, radius: number) =>
  x + radius >= box.minX && x - radius <= box.maxX && z + radius >= box.minZ && z - radius <= box.maxZ;

const samePoints = (p: P3[], q: P3[]) =>
  p.length === q.length && p.every((v, i) => Math.abs(v[0] - q[i][0]) + Math.abs(v[1] - q[i][1]) + Math.abs(v[2] - q[i][2]) < 1e-6);

/**
 * Routes a cable. The route only depends on its two connectors and on the blocks near it, so while one block is
 * dragged around, every cable that is not attached to it (or passing close to it) keeps its route instead of
 * re-running the path search and rebuilding its tube on every pointer move.
 */
function useCableRoute(a: WorldPort | null, b: WorldPort | null, docked: boolean, key: string, modules: ModuleRecord[]) {
  const cache = useRef<RouteCache | null>(null);
  if (!a || !b || docked) {
    cache.current = null;
    return null;
  }
  const c = cache.current;
  let stale = !c || c.key !== key;
  if (!stale && c) {
    for (const m of modules) {
      const was = c.stood.get(m.id);
      if (was && was.x === m.position.x && was.z === m.position.z && was.r === m.rotation) continue;
      const r = reach(m) + ROUTE_INFLUENCE;
      if (!was || nearBox(c.box, m.position.x, m.position.z, r) || nearBox(c.box, was.x, was.z, r)) {
        stale = true;
        break;
      }
    }
    if (!stale && c.stood.size !== modules.length) stale = true;
  }
  if (!stale && c) return c.points;

  const ends = (p: WorldPort): WorldPort => ({ ...p, x: p.x + p.nx * PLUG_LENGTH, z: p.z + p.nz * PLUG_LENGTH });
  const obstacles = modules.map((m) => footprint(m, 0));
  let points = cablePath(ends(a), ends(b), obstacles);
  if (c?.points && samePoints(c.points, points)) points = c.points; // identical route: keep the tube geometry
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, , z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  cache.current = {
    key,
    points,
    stood: new Map(modules.map((m) => [m.id, { x: m.position.x, z: m.position.z, r: m.rotation }])),
    box: { minX, minZ, maxX, maxZ },
  };
  return points;
}

function LinkedCable({ c, modules }: { c: ConnectionRecord; modules: ModuleRecord[] }) {
  const a = worldPortOf(modules, c.from);
  const b = worldPortOf(modules, c.to);
  const docked = !!a && !!b && isDocked(a, b);
  // Rebuild only when connector coordinates or neighbouring footprints change.
  const key = a && b ? [a.x, a.z, a.nx, a.nz, b.x, b.z, b.nx, b.nz].map((v) => v.toFixed(3)).join(',') : '';
  const points = useCableRoute(a, b, docked, key, modules);
  // Publish the finished cable so the ground can receive its shadow (all quality modes).
  useEffect(() => {
    if (!a || !b || docked || !points) {
      removeCableShape(c.id);
      return;
    }
    setCableShape(c.id, { points, ends: [{ ...a }, { ...b }] });
    return () => removeCableShape(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, points, docked, key]);

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

/**
 * The preview line is created once and only its vertices and colours are updated while dragging. (Re-creating a
 * LineMaterial per pointer move forces a shader recompile every frame, which was the main reason connecting
 * blocks felt like a slideshow.) A solid and a dashed line are both kept alive so toggling never recompiles.
 */
function usePreviewLines() {
  const objs = useMemo(() => {
    const geo = new LineGeometry();
    geo.setPositions([0, 0, 0, 0, 0, 1]);
    const solid = new LineMaterial({ color: 0xffffff, linewidth: 2.4, transparent: true, opacity: 0.95 });
    const dashed = new LineMaterial({
      color: 0xe6e6ea,
      linewidth: 1.6,
      dashed: true,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.7,
    });
    const a = new Line2(geo, solid);
    const b = new Line2(geo, dashed);
    for (const l of [a, b]) {
      l.frustumCulled = false;
      l.raycast = () => {};
      l.visible = false;
    }
    return { geo, solid, dashed, a, b };
  }, []);
  useEffect(
    () => () => {
      objs.geo.dispose();
      objs.solid.dispose();
      objs.dashed.dispose();
    },
    [objs],
  );
  return objs;
}

/** Subtle preview line while the user drags a new link out of a connector. */
export function LinkPreview() {
  const drag = useStore((s) => s.linkDrag);
  const modules = useStore((s) => s.workspace.modules);
  const size = useThree((s) => s.size);
  const objs = usePreviewLines();

  useEffect(() => {
    objs.solid.resolution.set(size.width, size.height);
    objs.dashed.resolution.set(size.width, size.height);
  }, [objs, size.width, size.height]);

  const a = drag ? worldPortOf(modules, drag.from) : null;
  const target = drag?.target ? worldPortOf(modules, drag.target) : null;
  const ok = drag?.verdict?.ok ?? false;
  const hasTarget = !!drag?.target;
  const px = drag?.pointer.x ?? 0;
  const pz = drag?.pointer.z ?? 0;

  useEffect(() => {
    if (!a) {
      objs.a.visible = false;
      objs.b.visible = false;
      return;
    }
    const end: [number, number, number] = target ? [target.x, PORT_HEIGHT, target.z] : [px, 0.04, pz];
    const start: [number, number, number] = [a.x + a.nx * 0.02, PORT_HEIGHT, a.z + a.nz * 0.02];
    const mid = [(start[0] + end[0]) / 2, 0.5, (start[2] + end[2]) / 2];
    objs.geo.setPositions([...start, ...mid, ...end]);
    if (!ok) objs.b.computeLineDistances();
    objs.dashed.color.set(hasTarget ? '#c9c9cf' : '#e6e6ea');
    objs.a.visible = ok;
    objs.b.visible = !ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objs, a?.x, a?.z, a?.nx, a?.nz, target?.x, target?.z, ok, hasTarget, px, pz, !!a]);

  return (
    <>
      <primitive object={objs.a} />
      <primitive object={objs.b} />
    </>
  );
}
