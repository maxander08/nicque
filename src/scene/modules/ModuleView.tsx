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
import { getModulePortStatics } from '../parts/portGeometry';
import { getMaterials } from '@/materials/library';
import { AdderBlockView, DivisorBlockView, MultiplierBlockView, SubtractorBlockView } from './OperatorBlockViews';
import { BooleanBlockView } from './BooleanBlockView';
import { AndGateView, NandGateView, NorGateView, NotGateView, OrGateView, XnorGateView, XorGateView } from './GateBlockViews';
import { DecimalBlockView } from './DecimalBlockView';
import { DisplayBlockView } from './DisplayBlockView';
import { IntegerBlockView } from './IntegerBlockView';
import { KeyboardBlockView } from './KeyboardBlockView';
import { KeypadBlockView } from './KeypadBlockView';
import { PowerBlockView } from './PowerBlockView';
import { TextBlockView } from './TextBlockView';

/** Registry mapping module types to their 3D body. Add new module types here. */
const BODIES: Record<ModuleType, ComponentType<{ moduleId: string }>> = {
  power: PowerBlockView,
  text: TextBlockView,
  integer: IntegerBlockView,
  decimal: DecimalBlockView,
  boolean: BooleanBlockView,
  adder: AdderBlockView,
  subtractor: SubtractorBlockView,
  multiplier: MultiplierBlockView,
  divisor: DivisorBlockView,
  not: NotGateView,
  or: OrGateView,
  and: AndGateView,
  nor: NorGateView,
  nand: NandGateView,
  xor: XorGateView,
  xnor: XnorGateView,
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

/** Connector inserts, contact pads and magnets of the whole block: three draw calls however many connectors it has. */
const PortStatics = memo(function PortStatics({ type }: { type: ModuleType }) {
  const m = getMaterials();
  const g = getModulePortStatics(type);
  return (
    <>
      <mesh geometry={g.insert} material={m.insert} castShadow />
      <mesh geometry={g.contacts} material={m.contact} />
      <mesh geometry={g.steel} material={m.steel} />
    </>
  );
});

export const ModuleView = memo(function ModuleView({ moduleId }: { moduleId: string }) {
  // one lookup per store update instead of four (each is a linear search through every block)
  const mod = useStore((s) => s.workspace.modules.find((m) => m.id === moduleId));
  const type = mod?.type;
  const x = mod?.position.x ?? 0;
  const z = mod?.position.z ?? 0;
  const rotation = mod?.rotation ?? 0;
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
      <PortStatics type={type} />
      {def.ports.map((p) => (
        <PortView key={p.id} moduleId={moduleId} port={p} />
      ))}
      {selected && <SelectionRing width={def.width} depth={def.depth} />}
    </group>
  );
});
