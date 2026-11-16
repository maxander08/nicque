import { useMemo } from 'react';
import { MODULE_DEFINITIONS, TEXT_BUTTON_RADIUS } from '@/modules/definitions';
import { badgeZ, contentBottomZ, contentTopZ } from '@/modules/layout';
import { BUTTON_CLEARANCE, ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { HeaderControls, headerHoles, useBlockOn, withPower } from '../parts/HeaderControls';
import { Housing } from '../parts/Housing';
import { PowerLed } from '../parts/PowerLed';

const def = MODULE_DEFINITIONS.text;
const BTN_R = TEXT_BUTTON_RADIUS;

/** Horizontal distance between button centres: one opening (0.428) plus the shared EDGE gap. */
const BTN_PITCH = (BTN_R + BUTTON_CLEARANCE) * 2 + 0.14;

/** The buttons sit in the middle of the content area (between the header and the footer). */
const BTN_Z = (contentTopZ(def.depth) + contentBottomZ(def.depth)) / 2;

const BUTTONS = [
  { x: -BTN_PITCH, action: 'edit', icon: 'edit', label: 'Edit button' },
  { x: 0, action: 'clear', icon: 'clear', label: 'Clear button' },
  { x: BTN_PITCH, action: 'undo', icon: 'undo', label: 'Restore sample text button' },
] as const;

const CONTROLS = withPower();

/**
 * The Text Block is a pure input device: it has no screen. Its buttons edit, clear and restore the text, and the
 * result is read on a Display Block that the Text Block is linked to.
 */
export function TextBlockView({ moduleId }: { moduleId: string }) {
  const powered = useBlockOn(moduleId);

  const holes = useMemo(
    () => [
      ...headerHoles(def.width, def.depth, CONTROLS),
      ...BUTTONS.map((b) => buttonHole(b.x, BTN_Z, BTN_R)),
    ],
    [],
  );

  return (
    <group>
      <Housing width={def.width} depth={def.depth} holes={holes} />
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
      <HeaderControls moduleId={moduleId} width={def.width} depth={def.depth} controls={CONTROLS} />
      <PowerLed width={def.width} depth={def.depth} powered={powered} />
      <BlockBadge name="Text" x={0} z={badgeZ(def.depth)} width={0.36} height={0.15} />
    </group>
  );
}
