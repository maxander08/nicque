import type { IconName } from '@/materials/screens';
import { CONTROL_RADIUS, controlX, controlZ } from '@/modules/layout';
import { useStore } from '@/state/store';
import { ButtonCap, buttonHole } from './ButtonCap';

export interface HeaderControl {
  action: string;
  icon: IconName;
  label: string;
}

/**
 * Header controls of a block, rightmost first. The power button is always slot 0, so it sits in the same
 * corner of every block; extra controls (e.g. the Display's clear button) step to its left.
 */
const POWER: HeaderControl = { action: 'toggle-power', icon: 'power', label: 'Power button' };

export const withPower = (...extra: HeaderControl[]): HeaderControl[] => [POWER, ...extra];

/** Openings the housing cover needs for the controls. */
export const headerHoles = (width: number, depth: number, controls: HeaderControl[]) =>
  controls.map((_, i) => buttonHole(controlX(width, i), controlZ(depth), CONTROL_RADIUS));

/** True while the block is switched on (a Power Block: supplying; any other block: it has power). */
export function useBlockOn(moduleId: string) {
  return useStore((s) => s.runtime.modules[moduleId]?.powered === true);
}

interface Props {
  moduleId: string;
  width: number;
  depth: number;
  controls: HeaderControl[];
}

/** The row of small round buttons in a block's header, right-aligned. The power button glows while on. */
export function HeaderControls({ moduleId, width, depth, controls }: Props) {
  const on = useBlockOn(moduleId);
  return (
    <>
      {controls.map((c, i) => (
        <ButtonCap
          key={c.action}
          moduleId={moduleId}
          action={c.action}
          x={controlX(width, i)}
          z={controlZ(depth)}
          radius={CONTROL_RADIUS}
          icon={c.icon}
          glow={c.action === 'toggle-power' ? on : false}
          label={c.label}
        />
      ))}
    </>
  );
}
