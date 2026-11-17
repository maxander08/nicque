import type {
  DisplayConfig,
  IntegerConfig,
  KeyboardConfig,
  KeypadConfig,
  KeyPressure,
  ModuleRecord,
  DataKind,
  ModuleType,
  OperatorConfig,
  OperatorType,
  PortDef,
  PowerConfig,
  TextConfig,
  Vec2,
} from '@/types';
import { KB_CELLS_X, KB_CELLS_Y, KP_CELLS_X, KP_CELLS_Y, LED_CELL } from './keyboard';
import { EDGE, FOOTER, HEADER, depthForWindow } from './layout';

/** Physical constants shared by every module (1 unit ≈ 5 cm). */
export const BLOCK_HEIGHT = 0.26;
export const SQUARE = 2;
export const DOCK_GAP = 0.05;
export const MAX_TEXT_LENGTH = 2000;
export const DEFAULT_TEXT = 'Hello, Nicque';
export const DEFAULT_INTEGER = '42';
/** Longest integer an Integer Block holds (digits only, the minus sign is extra). */
export const MAX_INTEGER_DIGITS = 18;

/**
 * Reduces any string to a valid integer entry: an optional leading minus sign followed by digits. Everything else
 * (letters, spaces, decimal points, plus signs, a minus anywhere but the start) is dropped. A lone "-" is kept so
 * a negative number can be typed.
 */
export function sanitizeInteger(raw: string): string {
  const negative = raw.trimStart().startsWith('-');
  // no leading zeros: typing 5 after a 0 gives 5, not 05 (a single 0 is kept)
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS);
  return (negative ? '-' : '') + digits;
}

/** True when `value` is a complete integer (no lone minus sign, nothing else). */
export const isInteger = (value: string) => /^-?\d+$/.test(value);

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

/** Width / depth of an LED window: its cell count times the cell size, minus the 0.04 the plane overlaps its opening. */
const ledWindow = (cells: number) => cells * LED_CELL - 0.04;

/** The Keyboard Block wraps its 15 × 5 key LED window in the shared header, footer and EDGE bezels. */
export const KEYBOARD_W = ledWindow(KB_CELLS_X) + 2 * EDGE;
export const KEYBOARD_D = depthForWindow(ledWindow(KB_CELLS_Y));

/** The Display Block keeps its 2 wide, 62-cell-tall LED window. */
export const DISPLAY_D = depthForWindow(ledWindow(62));

/**
 * The Text Block has no screen any more, only its three buttons (edit, clear, restore) in the content area:
 * the area is one button opening (0.428) plus EDGE above and below, so the margins match the rest of the block.
 */
export const TEXT_BUTTON_RADIUS = 0.2;
export const TEXT_D = HEADER + FOOTER + (TEXT_BUTTON_RADIUS + 0.014) * 2 + 2 * EDGE;
/**
 * A Text Block is shallower than a Display Block. In the default arrangement their bottom edges line up (so a
 * Keyboard or Keypad can still dock in front of the Text Block without touching the Display), and the Text
 * Block's side connector sits this far above its centre so that it meets the Display's connector exactly.
 */
export const TEXT_DATA_Z = -(DISPLAY_D - TEXT_D) / 2;
export const TEXT_W = SQUARE;
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

/**
 * Distance between the two operand inputs on the west edge of an operator block. Every port holds exactly one
 * wire, so an operator has one pin per operand. Operand A stays where the single input used to be (level with a
 * Text Block's output), operand B sits below it. A plug is 0.48 wide, so this pitch leaves a 0.17 gap between the
 * two plugs, and keeps the lower plug 0.226 clear of the block's rounded corner (radius 0.17), the same
 * clearances the Power Block's connectors keep.
 */
export const OPERAND_PITCH = 0.65;

/**
 * The east edge of a Text Block and of every operator block carries two output pins, spaced like the two operand
 * pins on an operator's west edge. 'data-out' is the original output (level with the Display Block's input), so
 * saved workspaces keep their links; 'data-out-2' sits below it. Every pin still holds exactly one wire.
 */
const dataOutPins = (kind: DataKind, count: 1 | 2): PortDef[] => {
  const pins: PortDef[] = [
    {
      id: 'data-out',
      label: 'Text output',
      type: 'text',
      direction: 'out',
      local: { x: SQUARE / 2, z: TEXT_DATA_Z },
      normal: { x: 1, z: 0 },
      capacity: 1,
      kinds: [kind],
    },
  ];
  if (count === 2) {
    pins.push({
      id: 'data-out-2',
      label: 'Text output (east 2)',
      type: 'text',
      direction: 'out',
      local: { x: SQUARE / 2, z: TEXT_DATA_Z + OPERAND_PITCH },
      normal: { x: 1, z: 0 },
      capacity: 1,
      kinds: [kind],
    });
  }
  return pins;
};

const textPorts = (kind: DataKind, outputs: 1 | 2 = 1): PortDef[] => [
  {
    id: 'power-in',
    label: 'Power input',
    type: 'power',
    direction: 'in',
    local: { x: 0, z: -TEXT_D / 2 },
    normal: { x: 0, z: -1 },
    capacity: 1,
  },
  ...dataOutPins(kind, outputs),
  // Two key inputs along the south edge. The ids stay stable ('key-in' is the original single input) so saved
  // workspaces keep their links. Either one accepts a Keyboard Block or a Keypad Block.
  {
    id: 'key-in',
    label: 'Key input (south 1)',
    type: 'keys',
    direction: 'in',
    local: { x: -TEXT_KEY_PITCH / 2, z: TEXT_D / 2 },
    normal: { x: 0, z: 1 },
    capacity: 1,
  },
  {
    id: 'key-in-2',
    label: 'Key input (south 2)',
    type: 'keys',
    direction: 'in',
    local: { x: TEXT_KEY_PITCH / 2, z: TEXT_D / 2 },
    normal: { x: 0, z: 1 },
    capacity: 1,
  },
];

const text: ModuleDefinition = {
  type: 'text',
  label: 'Text Block',
  width: TEXT_W,
  depth: TEXT_D,
  ports: textPorts('text', 2),
  defaultConfig: (): TextConfig => ({ value: DEFAULT_TEXT }),
  sanitizeConfig: (raw): TextConfig => ({
    value:
      isObj(raw) && typeof raw.value === 'string' ? raw.value.slice(0, MAX_TEXT_LENGTH) : DEFAULT_TEXT,
  }),
};

/**
 * The Integer Block is a Text Block that only accepts whole numbers. It looks and connects exactly like one (same
 * size, buttons and connectors; its output is a text link, so it feeds a Display Block the same way).
 */
const integer: ModuleDefinition = {
  type: 'integer',
  label: 'Integer Block',
  width: TEXT_W,
  depth: TEXT_D,
  ports: textPorts('integer'),
  defaultConfig: (): IntegerConfig => ({ value: DEFAULT_INTEGER }),
  sanitizeConfig: (raw): IntegerConfig => ({
    value: isObj(raw) && typeof raw.value === 'string' ? sanitizeInteger(raw.value) : DEFAULT_INTEGER,
  }),
};

/** The four operator types, with the name printed on the block and the symbol shown in the UI. */
export const OPERATORS: Record<OperatorType, { label: string; badge: string; symbol: string; hint: string }> = {
  adder: { label: 'Adder Block', badge: 'Adder', symbol: '+', hint: 'Operator: adds' },
  subtractor: { label: 'Subtractor Block', badge: 'Subtractor', symbol: '−', hint: 'Operator: subtracts' },
  multiplier: { label: 'Multiplier Block', badge: 'Multiplier', symbol: '×', hint: 'Operator: multiplies' },
  divisor: { label: 'Divisor Block', badge: 'Divisor', symbol: '÷', hint: 'Operator: divides' },
};
export const OPERATOR_TYPES = Object.keys(OPERATORS) as OperatorType[];

/** True for the Adder, Subtractor, Multiplier and Divisor Blocks (the blocks with the yellow operator box). */
export const isOperatorType = (t: unknown): t is OperatorType => typeof t === 'string' && t in OPERATORS;

/** Operators that can also take (and give back) text: the Adder joins text, the Multiplier repeats it. */
export const TEXT_OPERATORS: OperatorType[] = ['adder', 'multiplier'];
/** Data kinds an operator's nodes work with. Only the Adder and Multiplier also work with text. */
export const operatorKinds = (type: OperatorType): DataKind[] =>
  TEXT_OPERATORS.includes(type) ? ['integer', 'text'] : ['integer'];

/**
 * An operator block has the footprint, header, buttons and power connector of a Text Block (it looks the same);
 * the visual difference is the yellow operator box next to its power LED, which now also carries the operator's
 * symbol. It has no key inputs (nothing to type into): its nodes are a power input, two operand inputs on the west
 * edge (one wire each) and a result output on the east edge, aligned with the Text and Display Block data nodes.
 */
const operatorDef = (type: OperatorType): ModuleDefinition => {
  const kinds = operatorKinds(type);
  const base = textPorts('integer', 2);
  return {
    type,
    label: OPERATORS[type].label,
    width: TEXT_W,
    depth: TEXT_D,
    ports: [
      base[0],
      // 'data-in' is the original operand input, so saved workspaces keep their links
      {
        id: 'data-in',
        label: 'Operand input (west 1)',
        type: 'text',
        direction: 'in',
        local: { x: -SQUARE / 2, z: TEXT_DATA_Z },
        normal: { x: -1, z: 0 },
        capacity: 1,
        kinds,
      },
      {
        id: 'data-in-2',
        label: 'Operand input (west 2)',
        type: 'text',
        direction: 'in',
        local: { x: -SQUARE / 2, z: TEXT_DATA_Z + OPERAND_PITCH },
        normal: { x: -1, z: 0 },
        capacity: 1,
        kinds,
      },
      { ...base[1], label: 'Result output (east 1)', kinds },
      { ...base[2], label: 'Result output (east 2)', kinds },
    ],
    defaultConfig: (): OperatorConfig => ({}),
    // `cleared` is the operator's own clear button: its stored result is blank until its inputs change
    sanitizeConfig: (raw): OperatorConfig => (isObj(raw) && raw.cleared === true ? { cleared: true } : {}),
  };
};

const adder = operatorDef('adder');
const subtractor = operatorDef('subtractor');
const multiplier = operatorDef('multiplier');
const divisor = operatorDef('divisor');

const display: ModuleDefinition = {
  type: 'display',
  label: 'Display Block',
  width: SQUARE,
  depth: DISPLAY_D,
  ports: [
    {
      id: 'power-in',
      label: 'Power input',
      type: 'power',
      direction: 'in',
      local: { x: 0, z: -DISPLAY_D / 2 },
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
      kinds: ['text', 'integer'],
    },
  ],
  defaultConfig: (): DisplayConfig => ({ align: 'center' }),
  sanitizeConfig: (raw): DisplayConfig => {
    const align = isObj(raw) && raw.align === 'left' ? 'left' : 'center';
    return isObj(raw) && raw.cleared === true ? { align, cleared: true } : { align };
  },
};

export const KEY_PRESSURES: KeyPressure[] = ['light', 'normal', 'firm'];

const keyboard: ModuleDefinition = {
  type: 'keyboard',
  label: 'Keyboard Block',
  width: KEYBOARD_W,
  depth: KEYBOARD_D,
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
      local: { x: -(SQUARE + DOCK_GAP) / 2, z: -KEYBOARD_D / 2 },
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
export const KEYPAD_W = ledWindow(KP_CELLS_X) + 2 * EDGE;
export const KEYPAD_D = depthForWindow(ledWindow(KP_CELLS_Y));

const keypad: ModuleDefinition = {
  type: 'keypad',
  label: 'Keypad Block',
  width: KEYPAD_W,
  depth: KEYPAD_D,
  ports: [
    {
      id: 'power-in',
      label: 'Power input',
      type: 'power',
      direction: 'in',
      local: { x: KEYPAD_W / 2, z: 0 },
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

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = {
  power,
  text,
  integer,
  adder,
  subtractor,
  multiplier,
  divisor,
  display,
  keyboard,
  keypad,
};

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
