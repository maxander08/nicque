import { useMemo } from 'react';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { Housing } from '../parts/Housing';
import { ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { LedRow } from '../parts/LedRow';
import { EDGE, contentTopZ } from '@/modules/layout';
import { BUTTON_CLEARANCE } from '../parts/ButtonCap';

const def = MODULE_DEFINITIONS.power;
/** The button fills the content zone below the LED band, with EDGE of cover above, below and to the sides. */
const ZONE_TOP = contentTopZ(def.depth);
const ZONE_BOTTOM = def.depth / 2 - EDGE;
const BUTTON = {
  x: 0,
  z: (ZONE_TOP + ZONE_BOTTOM) / 2,
  r: (ZONE_BOTTOM - ZONE_TOP) / 2 - BUTTON_CLEARANCE,
};

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
      <LedRow width={def.width} depth={def.depth} level={on ? 1 : 0} />
      <BlockBadge name="Power" x={-1.4} z={BUTTON.z} />
    </group>
  );
}
