import type {
  DisplayConfig,
  ModuleRecord,
  ModuleType,
  PortDef,
  PowerConfig,
  TextConfig,
  Vec2,
} from '@/types';

/** Physical constants shared by every module (1 unit ≈ 5 cm). */
export const BLOCK_HEIGHT = 0.26;
export const SQUARE = 2;
export const DOCK_GAP = 0.05;
export const MAX_TEXT_LENGTH = 2000;
export const DEFAULT_TEXT = 'Hello, Nicque';

export interface ModuleDefinition {
  type: ModuleType;
  label: string;
  width: number;
  depth: number;
  ports: PortDef[];
  defaultConfig: () => ModuleRecord['config'];
  sanitizeConfig: (raw: unknown) => ModuleRecord['config'];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const POWER_W = SQUARE * 2 + DOCK_GAP;
const POWER_D = 1;

const power: ModuleDefinition = {
  type: 'power',
  label: 'Power Block',
  width: POWER_W,
  depth: POWER_D,
  ports: [
    {
      id: 'power-out-a',
      label: 'Power output A',
      type: 'power',
      direction: 'out',
      local: { x: -(SQUARE + DOCK_GAP) / 2, z: POWER_D / 2 },
      normal: { x: 0, z: 1 },
      capacity: 1,
    },
    {
      id: 'power-out-b',
      label: 'Power output B',
      type: 'power',
      direction: 'out',
      local: { x: (SQUARE + DOCK_GAP) / 2, z: POWER_D / 2 },
      normal: { x: 0, z: 1 },
      capacity: 1,
    },
  ],
  defaultConfig: (): PowerConfig => ({ enabled: true }),
  sanitizeConfig: (raw): PowerConfig => ({
    enabled: isObj(raw) && typeof raw.enabled === 'boolean' ? raw.enabled : true,
  }),
};

const text: ModuleDefinition = {
  type: 'text',
  label: 'Text Block',
  width: SQUARE,
  depth: SQUARE,
  ports: [
    {
      id: 'power-in',
      label: 'Power input',
      type: 'power',
      direction: 'in',
      local: { x: 0, z: -SQUARE / 2 },
      normal: { x: 0, z: -1 },
      capacity: 1,
    },
    {
      id: 'data-out',
      label: 'Text output',
      type: 'text',
      direction: 'out',
      local: { x: SQUARE / 2, z: 0 },
      normal: { x: 1, z: 0 },
      capacity: 4,
    },
  ],
  defaultConfig: (): TextConfig => ({ value: DEFAULT_TEXT }),
  sanitizeConfig: (raw): TextConfig => ({
    value:
      isObj(raw) && typeof raw.value === 'string' ? raw.value.slice(0, MAX_TEXT_LENGTH) : DEFAULT_TEXT,
  }),
};

const display: ModuleDefinition = {
  type: 'display',
  label: 'Display Block',
  width: SQUARE,
  depth: SQUARE,
  ports: [
    {
      id: 'power-in',
      label: 'Power input',
      type: 'power',
      direction: 'in',
      local: { x: 0, z: -SQUARE / 2 },
      normal: { x: 0, z: -1 },
      capacity: 1,
    },
    {
      id: 'data-in',
      label: 'Text input',
      type: 'text',
      direction: 'in',
      local: { x: -SQUARE / 2, z: 0 },
      normal: { x: -1, z: 0 },
      capacity: 1,
    },
  ],
  defaultConfig: (): DisplayConfig => ({ align: 'center' }),
  sanitizeConfig: (raw): DisplayConfig => ({
    align: isObj(raw) && raw.align === 'left' ? 'left' : 'center',
  }),
};

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = { power, text, display };

export const MODULE_TYPES = Object.keys(MODULE_DEFINITIONS) as ModuleType[];

export function isModuleType(v: unknown): v is ModuleType {
  return typeof v === 'string' && v in MODULE_DEFINITIONS;
}

export function getDefinition(type: ModuleType): ModuleDefinition {
  return MODULE_DEFINITIONS[type];
}

export function getPortDef(module: ModuleRecord, portId: string): PortDef | undefined {
  return MODULE_DEFINITIONS[module.type].ports.find((p) => p.id === portId);
}

export function createModule(
  type: ModuleType,
  id: string,
  position: Vec2,
  rotation = 0,
  name?: string,
): ModuleRecord {
  const def = MODULE_DEFINITIONS[type];
  return {
    id,
    type,
    name: name ?? def.label,
    position: { ...position },
    rotation,
    config: def.defaultConfig(),
  } as ModuleRecord;
}
