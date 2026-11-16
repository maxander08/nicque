import { useMemo } from 'react';
import { MODULE_DEFINITIONS } from '@/modules/definitions';
import { useStore } from '@/state/store';
import { Housing } from '../parts/Housing';
import { ButtonCap, buttonHole } from '../parts/ButtonCap';
import { BlockBadge } from '../parts/Decals';
import { LedRow } from '../parts/LedRow';

const def = MODULE_DEFINITIONS.power;
const BUTTON = { x: 0, z: 0.04, r: 0.27 };

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
      <LedRow count={22} span={3.3} z={-0.33} level={on ? 1 : 0} />
      <BlockBadge name="Power" x={-1.4} z={0.06} />
    </group>
  );
}
