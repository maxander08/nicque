import { useMemo } from 'react';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { Housing } from '../parts/Housing';
import { BUTTON_RADIUS, ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { PowerLed } from '../parts/PowerLed';

const def = MODULE_DEFINITIONS.power;

/**
 * The same button as on the Text Block (radius 0.2), centred on the cover: with a block depth of 1 that leaves
 * ≈0.29 of cover above and below it, which equals the LED band (0.28), and it lines up with the side connectors.
 */
const BUTTON = { x: 0, z: 0, r: BUTTON_RADIUS };

/** The badge sits halfway between the west connector and the button, on the button's centre line. */
const BADGE_X = -1.2;

export function PowerBlockView({ moduleId }: { moduleId: string }) {
  const on = useStore((s) => s.runtime.modules[moduleId]?.state === 'operational');
  const holes = useMemo(() => [buttonHole(BUTTON.x, BUTTON.z, BUTTON.r)], []);

  return (
    <group>
      <Housing width={def.width} depth={def.depth} holes={holes} />
      <ButtonCap
        moduleId={moduleId}
        action="toggle-power"
        x={BUTTON.x}
        z={BUTTON.z}
        radius={BUTTON.r}
        icon="power"
        glow={on}
        label="Power button"
      />
      <PowerLed width={def.width} depth={def.depth} powered={on} />
      <BlockBadge name="Power" x={BADGE_X} z={BUTTON.z} />
    </group>
  );
}
