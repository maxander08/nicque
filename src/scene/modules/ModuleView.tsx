import { memo, type ComponentType } from 'react';
import { MeshBasicMaterial } from 'three';
import { createFootprintRing } from '@/geometry/slab';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { yawOf } from '@/modules/spatial';
import { useStore } from '@/state/store';
import type { ModuleType } from '@/types';
import { useDisposable } from '../hooks';
import { CORNER_RADIUS } from '../parts/Housing';
import { PortView } from '../parts/PortView';
import { DisplayBlockView } from './DisplayBlockView';
import { KeyboardBlockView } from './KeyboardBlockView';
import { KeypadBlockView } from './KeypadBlockView';
import { PowerBlockView } from './PowerBlockView';
import { TextBlockView } from './TextBlockView';

/** Registry mapping module types to their 3D body. Add new module types here. */
const BODIES: Record<ModuleType, ComponentType<{ moduleId: string }>> = {
  power: PowerBlockView,
  text: TextBlockView,
  display: DisplayBlockView,
  keyboard: KeyboardBlockView,
  keypad: KeypadBlockView,
};

const ringMaterial = new MeshBasicMaterial({
  color: '#f4f4f6',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  fog: false,
});

function SelectionRing({ width, depth }: { width: number; depth: number }) {
  const geo = useDisposable(() => createFootprintRing(width, depth, CORNER_RADIUS, 0.03, 0.05), [width, depth]);
  return <mesh geometry={geo} material={ringMaterial} position={[0, 0.004, 0]} raycast={() => null} renderOrder={1} />;
}

export const ModuleView = memo(function ModuleView({ moduleId }: { moduleId: string }) {
  const type = useStore((s) => s.workspace.modules.find((m) => m.id === moduleId)?.type);
  const x = useStore((s) => s.workspace.modules.find((m) => m.id === moduleId)?.position.x ?? 0);
  const z = useStore((s) => s.workspace.modules.find((m) => m.id === moduleId)?.position.z ?? 0);
  const rotation = useStore((s) => s.workspace.modules.find((m) => m.id === moduleId)?.rotation ?? 0);
  const selected = useStore((s) => s.selectedId === moduleId);
  if (!type) return null;

  const def = MODULE_DEFINITIONS[type];
  const Body = BODIES[type];

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, yawOf(rotation), 0]}
      userData={{ pick: { kind: 'module', moduleId } }}
      name={`module-${moduleId}`}
    >
      <Body moduleId={moduleId} />
      {def.ports.map((p) => (
        <PortView key={p.id} moduleId={moduleId} port={p} />
      ))}
      {selected && <SelectionRing width={def.width} depth={def.depth} />}
    </group>
  );
});
