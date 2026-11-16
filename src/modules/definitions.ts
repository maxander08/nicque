import type {
  DisplayConfig,
  KeyboardConfig,
  KeypadConfig,
  KeyPressure,
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

export const KEYBOARD_W = SQUARE * 2 + DOCK_GAP;
const POWER_D = 1;

/**
 * Power Block connector layout: 8 outputs — 1 on the west edge, 1 on the east edge and 6 along the south edge.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ●                                            │
 * W ▮                      (power)                 ▮ E
 *   │                                              │
 *   └──▮─────▮─────▮─────▮─────▮─────▮─────────────┘
 *        S1    S2    S3    S4    S5    S6
 *
 * The south pitch is a third of a docked block's width, so S2 and S5 sit exactly where two 2-wide blocks
 * dock side by side (the original outputs A and B). A plug is 0.48 wide, which leaves a 0.2 gap between
 * neighbours, and POWER_END keeps the outer plugs clear of the rounded corners.
 */
const POWER_PITCH = (SQUARE + DOCK_GAP) / 3;
const POWER_PLUG = 0.48;
const POWER_END = POWER_PLUG / 2 + 0.25;
const POWER_W = 5 * POWER_PITCH + 2 * POWER_END;
const southX = (i: number) => (i - 2.5) * POWER_PITCH;

const powerOut = (id: string, label: string, x: number, z: number, nx: number, nz: number): PortDef => ({
  id,
  label: `Power output ${label}`,
  type: 'power',
  direction: 'out',
  local: { x, z },
  normal: { x: nx, z: nz },
  capacity: 1,
});

const power: ModuleDefinition = {
  type: 'power',
  label: 'Power Block',
  width: POWER_W,
  depth: POWER_D,
  // ids a–c are the original outputs and keep their meaning in saved workspaces
  ports: [
    powerOut('power-out-a', 'A (south 2)', southX(1), POWER_D / 2, 0, 1),
    powerOut('power-out-b', 'B (south 5)', southX(4), POWER_D / 2, 0, 1),
    powerOut('power-out-c', 'C (east)', POWER_W / 2, 0, 1, 0),
    powerOut('power-out-d', 'D (west)', -POWER_W / 2, 0, -1, 0),
    powerOut('power-out-e', 'E (south 1)', southX(0), POWER_D / 2, 0, 1),
    powerOut('power-out-f', 'F (south 3)', southX(2), POWER_D / 2, 0, 1),
    powerOut('power-out-g', 'G (south 4)', southX(3), POWER_D / 2, 0, 1),
    powerOut('power-out-h', 'H (south 6)', southX(5), POWER_D / 2, 0, 1),
  ],
  defaultConfig: (): PowerConfig => ({ enabled: true }),
  sanitizeConfig: (raw): PowerConfig => ({
    enabled: isObj(raw) && typeof raw.enabled === 'boolean' ? raw.enabled : true,
  }),
};

/** Distance between the two key inputs on the south edge of a Text Block. */
export const TEXT_KEY_PITCH = 1;

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
    // Two key inputs along the south edge. The ids stay stable ('key-in' is the original single input) so saved
    // workspaces keep their links. Either one accepts a Keyboard Block or a Keypad Block.
    {
      id: 'key-in',
      label: 'Key input (south 1)',
      type: 'keys',
      direction: 'in',
      local: { x: -TEXT_KEY_PITCH / 2, z: SQUARE / 2 },
      normal: { x: 0, z: 1 },
      capacity: 1,
    },
    {
      id: 'key-in-2',
      label: 'Key input (south 2)',
      type: 'keys',
      direction: 'in',
      local: { x: TEXT_KEY_PITCH / 2, z: SQUARE / 2 },
      normal: { x: 0, z: 1 },
      capacity: 1,
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

export const KEY_PRESSURES: KeyPressure[] = ['light', 'normal', 'firm'];

const keyboard: ModuleDefinition = {
  type: 'keyboard',
  label: 'Keyboard Block',
  width: KEYBOARD_W,
  depth: SQUARE,
  ports: [
    {
      id: 'power-in',
      label: 'Power input',
      type: 'power',
      direction: 'in',
      local: { x: KEYBOARD_W / 2, z: 0 },
      normal: { x: 1, z: 0 },
      capacity: 1,
    },
    {
      // aligned with the key input of a Text Block that sits directly in front of the left half
      id: 'key-out',
      label: 'Keyboard output',
      type: 'keys',
      direction: 'out',
      local: { x: -(SQUARE + DOCK_GAP) / 2, z: -SQUARE / 2 },
      normal: { x: 0, z: -1 },
      capacity: 1,
    },
  ],
  defaultConfig: (): KeyboardConfig => ({ pressure: 'normal' }),
  sanitizeConfig: (raw): KeyboardConfig => ({
    pressure:
      isObj(raw) && (raw.pressure === 'light' || raw.pressure === 'firm') ? raw.pressure : 'normal',
  }),
};

/**
 * Keypad Block: a minimal, square sibling of the Keyboard Block with only 0–9 # * + . , ~ (a 4 × 4 pad).
 * Same connectors as the keyboard (power in on the east edge, key output on the north edge), so it plugs into
 * either key input of a Text Block.
 */
export const KEYPAD_D = 2.4;

const keypad: ModuleDefinition = {
  type: 'keypad',
  label: 'Keypad Block',
  width: SQUARE,
  depth: KEYPAD_D,
  ports: [
    {
      id: 'power-in',
      label: 'Power input',
      type: 'power',
      direction: 'in',
      local: { x: SQUARE / 2, z: 0 },
      normal: { x: 1, z: 0 },
      capacity: 1,
    },
    {
      // aligned with the left key input of a Text Block that sits directly in front of it
      id: 'key-out',
      label: 'Keypad output',
      type: 'keys',
      direction: 'out',
      local: { x: -TEXT_KEY_PITCH / 2, z: -KEYPAD_D / 2 },
      normal: { x: 0, z: -1 },
      capacity: 1,
    },
  ],
  defaultConfig: (): KeypadConfig => ({ pressure: 'normal' }),
  sanitizeConfig: (raw): KeypadConfig => ({
    pressure:
      isObj(raw) && (raw.pressure === 'light' || raw.pressure === 'firm') ? raw.pressure : 'normal',
  }),
};

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = { power, text, display, keyboard, keypad };

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
