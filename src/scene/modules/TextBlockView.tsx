import { useMemo } from 'react';
import { MODULE_DEFINITIONS, TEXT_BUTTON_RADIUS } from '@/modules/definitions';
import { badgeZ, contentBottomZ, contentTopZ } from '@/modules/layout';
import { BUTTON_CLEARANCE, ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { HeaderControls, headerHoles, useBlockOn, withPower } from '../parts/HeaderControls';
import { Housing } from '../parts/Housing';
import { GATES } from '@/modules/definitions';
import type { GateType, OperatorType } from '@/types';
import { GATE_BLUE, OperatorMark, TYPE_GRAY } from '../parts/OperatorMark';
import { PowerLed } from '../parts/PowerLed';

const def = MODULE_DEFINITIONS.text;
const BTN_R = TEXT_BUTTON_RADIUS;

/** Horizontal distance between button centres: one opening (0.428) plus the shared EDGE gap. */
const BTN_PITCH = (BTN_R + BUTTON_CLEARANCE) * 2 + 0.14;

/** The buttons sit in the middle of the content area (between the header and the footer). */
const BTN_Z = (contentTopZ(def.depth) + contentBottomZ(def.depth)) / 2;

/** No block has a pencil (edit) button any more: Clear and Undo sit centred in the content area. */
const BUTTONS = [
  { x: -BTN_PITCH / 2, action: 'clear', icon: 'clear', label: 'Clear button' },
  { x: BTN_PITCH / 2, action: 'undo', icon: 'undo', label: 'Undo button' },
] as const;

const CONTROLS = withPower();

/**
 * The Text Block is a pure input device: it has no screen. Its buttons clear the text and undo the last change, and
 * the result is read on a Display Block that the Text Block is linked to. The Integer Block reuses this exact body
 * and only changes the printed name; the operator blocks (Adder, Subtractor, Multiplier,
 * Divisor) additionally show a yellow box next to the power LED.
 */
export function TextBlockView({
  moduleId,
  badge = 'Text',
  operator,
  gate,
  typeLabel = 'TXT',
}: {
  moduleId: string;
  badge?: string;
  /** Set on operator blocks: which operator this is (yellow box + symbol). */
  operator?: OperatorType;
  /** Set on logic gate blocks: which gate this is (blue box + name). */
  gate?: GateType;
  /** Printed next to the gray box on non-operator blocks: "TXT" on the Text Block, "INT" on the Integer Block. */
  typeLabel?: string;
}) {
  const powered = useBlockOn(moduleId);
  const buttons = BUTTONS;

  const holes = useMemo(
    () => [
      ...headerHoles(def.width, def.depth, CONTROLS),
      ...buttons.map((b) => buttonHole(b.x, BTN_Z, BTN_R)),
    ],
    [buttons],
  );

  return (
    <group>
      <Housing width={def.width} depth={def.depth} holes={holes} />
      {buttons.map((b) => (
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
      {operator ? (
        <OperatorMark width={def.width} depth={def.depth} symbol={operator} />
      ) : gate ? (
        <OperatorMark width={def.width} depth={def.depth} color={GATE_BLUE} label={GATES[gate].symbol} />
      ) : (
        <OperatorMark width={def.width} depth={def.depth} color={TYPE_GRAY} label={typeLabel} />
      )}
      <BlockBadge name={badge} x={0} z={badgeZ(def.depth)} width={0.36} height={0.15} />
    </group>
  );
}
