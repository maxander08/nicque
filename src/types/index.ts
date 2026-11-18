/**
 * Shared data definitions for Nicque.
 *
 * Persistent records (ModuleRecord / ConnectionRecord / Workspace) are strictly separated
 * from transient runtime state (RuntimeState), which is always derived by the runtime engine.
 */

export type OperatorType = 'adder' | 'subtractor' | 'multiplier' | 'divisor';
export type ModuleType = 'power' | 'text' | 'integer' | 'decimal' | OperatorType | 'display' | 'keyboard' | 'keypad';
export type PortType = 'power' | 'text' | 'keys';
export type PortDirection = 'in' | 'out';
/** What a text-type (data) connector carries: free text, a whole number or an arbitrary-precision decimal. */
export type DataKind = 'text' | 'integer' | 'decimal';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PowerConfig {
  enabled: boolean;
}
export interface TextConfig {
  value: string;
}
/** The Integer Block looks like a Text Block but only holds a whole number: an optional minus sign and digits. */
export interface IntegerConfig {
  value: string;
}
/** The Decimal Block works like the Integer Block but holds an arbitrary-precision decimal (a BigDecimal, any digit count). */
export interface DecimalConfig {
  value: string;
}
/**
 * Operator blocks (Adder, Subtractor, Multiplier, Divisor) look like a Text Block. Their result is computed from
 * their operand pins; `cleared` is true after the operator's own clear button was pressed: the stored result is blank
 * (the Integer / Text Blocks feeding it keep their values) until the operands change.
 */
export interface OperatorConfig {
  cleared?: boolean;
}
export interface DisplayConfig {
  align: 'left' | 'center';
  /**
   * True after the Display's own clear button was pressed: the screen is blank, but the block that feeds it keeps
   * its data. It is released as soon as the feeding data (or the link) changes.
   */
  cleared?: boolean;
}

/** Key pressure sensitivity of the Keyboard and Keypad Blocks (actuation force and key-repeat behaviour). */
export type KeyPressure = 'light' | 'normal' | 'firm';
export interface KeyboardConfig {
  pressure: KeyPressure;
}
export type KeypadConfig = KeyboardConfig;

interface ModuleBase {
  /** Stable identifier, preserved across save / load. */
  id: string;
  name: string;
  /** Position of the module centre on the ground plane (world units). */
  position: Vec2;
  /** Yaw in quarter turns (0..3). */
  rotation: number;
  /**
   * The block's own power button: true while it has been switched off by hand, even though it may still be
   * wired to a live Power Block. (A Power Block uses `config.enabled` instead.)
   */
  switchedOff?: boolean;
}

export type PowerModule = ModuleBase & { type: 'power'; config: PowerConfig };
export type TextModule = ModuleBase & { type: 'text'; config: TextConfig };
export type IntegerModule = ModuleBase & { type: 'integer'; config: IntegerConfig };
export type DecimalModule = ModuleBase & { type: 'decimal'; config: DecimalConfig };
export type AdderModule = ModuleBase & { type: 'adder'; config: OperatorConfig };
export type SubtractorModule = ModuleBase & { type: 'subtractor'; config: OperatorConfig };
export type MultiplierModule = ModuleBase & { type: 'multiplier'; config: OperatorConfig };
export type DivisorModule = ModuleBase & { type: 'divisor'; config: OperatorConfig };
export type OperatorModule = AdderModule | SubtractorModule | MultiplierModule | DivisorModule;
export type DisplayModule = ModuleBase & { type: 'display'; config: DisplayConfig };
export type KeyboardModule = ModuleBase & { type: 'keyboard'; config: KeyboardConfig };
export type KeypadModule = ModuleBase & { type: 'keypad'; config: KeypadConfig };
export type ModuleRecord =
  | PowerModule
  | TextModule
  | IntegerModule
  | DecimalModule
  | OperatorModule
  | DisplayModule
  | KeyboardModule
  | KeypadModule;

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  direction: PortDirection;
  /** Position in the module's local frame (centre of the edge). */
  local: Vec2;
  /** Outward unit normal in the module's local frame. */
  normal: Vec2;
  /** Maximum number of links this port may hold. */
  capacity: number;
  /**
   * Data connectors only: the kinds of data this node can send (output) or accept (input). Every block declares
   * this for each of its nodes, so a link can be checked for compatibility from both ends.
   */
  kinds?: DataKind[];
}

export interface PortRef {
  moduleId: string;
  portId: string;
}

export interface ConnectionRecord {
  id: string;
  type: PortType;
  /** Always an output port. */
  from: PortRef;
  /** Always an input port. */
  to: PortRef;
}

export interface Workspace {
  modules: ModuleRecord[];
  connections: ConnectionRecord[];
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

export type ModuleState = 'operational' | 'off' | 'unpowered' | 'waiting';

export type ScreenContent =
  | { kind: 'off' }
  /** `typing` is true while a powered Keyboard Block is linked to the Text Block. */
  | { kind: 'text'; text: string; typing?: boolean }
  | { kind: 'empty'; typing?: boolean }
  /** A Display Block whose own clear button was pressed; its source still holds the data. */
  | { kind: 'cleared' }
  /** Keyboard LED screen. `linked` is true when its keystrokes reach a powered Text Block. */
  | { kind: 'keys'; linked: boolean }
  | { kind: 'no-source' }
  | { kind: 'source-off' };

export interface ModuleRuntime {
  id: string;
  type: ModuleType;
  state: ModuleState;
  powered: boolean;
  /**
   * Operator blocks only: the result computed from the operands, ignoring the operator's own clear button. Used to
   * release a cleared operator when its result changes.
   */
  liveResult?: string;
  /** Short human readable status. */
  summary: string;
  /** Longer explanation, useful for the inspector. */
  detail: string;
  screen: ScreenContent;
}

export interface ConnectionRuntime {
  id: string;
  valid: boolean;
  active: boolean;
  reason: string;
}

export interface RuntimeState {
  modules: Record<string, ModuleRuntime>;
  connections: Record<string, ConnectionRuntime>;
  issues: string[];
  /** True when every module is operational. */
  systemOk: boolean;
}

export type ValidationResult =
  | { ok: true; connection: ConnectionRecord }
  | { ok: false; code: string; message: string };
