import { validateConnection } from '@/connections/validate';
import { OPERATORS, isInteger, isOperatorType } from '@/modules/definitions';
import type {
  ConnectionRecord,
  OperatorType,
  ConnectionRuntime,
  ModuleRecord,
  ModuleRuntime,
  RuntimeState,
  ScreenContent,
  Workspace,
} from '@/types';

/**
 * Deterministic runtime evaluation. Pure function of the persistent workspace: it never mutates
 * its input and has no knowledge of rendering.
 *
 * Sequence:
 *  1. Validate connections.
 *  2. Determine which Power Blocks are active.
 *  3. Evaluate power availability for every other module.
 *  4. Read the Text Block value when it is operational.
 *  5. Transfer that value through valid data connections.
 *  6. Resolve what each Display Block shows.
 */
export function evaluateWorkspace(ws: Workspace): RuntimeState {
  const issues: string[] = [];
  const byId = new Map<string, ModuleRecord>(ws.modules.map((m) => [m.id, m]));
  const connRuntime: Record<string, ConnectionRuntime> = {};

  /* 1. validate ------------------------------------------------------ */
  const valid: ConnectionRecord[] = [];
  for (const c of ws.connections) {
    const res = validateConnection({ modules: ws.modules, connections: valid }, c.from, c.to);
    if (res.ok && res.connection.id === c.id) {
      valid.push(c);
    } else {
      const reason = res.ok ? 'Connection is not normalised.' : res.message;
      connRuntime[c.id] = { id: c.id, valid: false, active: false, reason };
      issues.push(`Ignored invalid link: ${reason}`);
    }
  }

  /* 2. power sources -------------------------------------------------- */
  const sourceOn = (m: ModuleRecord | undefined) => !!m && m.type === 'power' && m.config.enabled;

  /* 3. power availability --------------------------------------------- */
  const powerLinksInto = (id: string) => valid.filter((c) => c.type === 'power' && c.to.moduleId === id);
  const powered = new Map<string, boolean>();
  const unpoweredReason = new Map<string, string>();
  for (const m of ws.modules) {
    if (m.type === 'power') {
      powered.set(m.id, m.config.enabled);
      continue;
    }
    if (m.switchedOff) {
      powered.set(m.id, false);
      unpoweredReason.set(m.id, 'Switched off with its own power button.');
      continue;
    }
    const links = powerLinksInto(m.id);
    if (links.length === 0) {
      powered.set(m.id, false);
      unpoweredReason.set(m.id, 'No power link. Connect a Power Block output to its power input.');
      continue;
    }
    const live = links.some((l) => sourceOn(byId.get(l.from.moduleId)));
    powered.set(m.id, live);
    if (!live) unpoweredReason.set(m.id, 'The linked Power Block is switched off.');
  }

  for (const c of valid) {
    if (c.type === 'power') {
      const on = sourceOn(byId.get(c.from.moduleId));
      connRuntime[c.id] = {
        id: c.id,
        valid: true,
        active: on,
        reason: on ? 'Supplying power' : 'Power Block is off',
      };
    }
  }

  /* 4. text output ----------------------------------------------------- */
  const textOut = new Map<string, string>();
  for (const m of ws.modules) {
    if (m.type === 'text' && powered.get(m.id)) textOut.set(m.id, m.config.value);
    // an Integer Block only sends a complete whole number (a lone minus sign is not one yet)
    if (m.type === 'integer' && powered.get(m.id)) textOut.set(m.id, isInteger(m.config.value) ? m.config.value : '');
  }

  /* 5. data transfer --------------------------------------------------- */
  const dataInto = new Map<string, { value: string } | { missing: string }>();
  for (const c of valid) {
    if (c.type !== 'text') continue;
    const srcOut = textOut.get(c.from.moduleId);
    const dstPowered = powered.get(c.to.moduleId) === true;
    const active = srcOut !== undefined && dstPowered;
    let reason = 'Transferring text';
    if (srcOut === undefined) reason = 'Source block is not operational';
    else if (!dstPowered) reason = 'Destination block is not powered';
    connRuntime[c.id] = { id: c.id, valid: true, active, reason };
    if (srcOut !== undefined) {
      if (!dataInto.has(c.to.moduleId) || 'missing' in (dataInto.get(c.to.moduleId) as object)) {
        dataInto.set(c.to.moduleId, { value: srcOut });
      }
    } else if (!dataInto.has(c.to.moduleId)) {
      dataInto.set(c.to.moduleId, { missing: 'The linked Text Block is not operational.' });
    }
  }

  /* 5b. keyboard links ------------------------------------------------- */
  // A key link is active when both the key source (Keyboard or Keypad Block) and the Text Block it types into are powered.
  const typingInto = new Set<string>();
  const keysSent = new Set<string>();
  for (const c of valid) {
    if (c.type !== 'keys') continue;
    const dst = byId.get(c.to.moduleId);
    const typable = dst?.type === 'text' || dst?.type === 'integer';
    const active = typable && powered.get(c.from.moduleId) === true && powered.get(c.to.moduleId) === true;
    let reason = 'Typing into the Text Block';
    if (powered.get(c.from.moduleId) !== true) {
      const src = ws.modules.find((m) => m.id === c.from.moduleId);
      reason = `${src?.type === 'keypad' ? 'Keypad' : 'Keyboard'} Block is not powered`;
    }
    else if (!typable) reason = `${dst?.name ?? 'This block'} has nothing to type into`;
    else if (powered.get(c.to.moduleId) !== true) reason = 'Text Block is not powered';
    connRuntime[c.id] = { id: c.id, valid: true, active, reason };
    if (active) {
      typingInto.add(c.to.moduleId);
      keysSent.add(c.from.moduleId);
    }
  }

  /* 6. per-module runtime ---------------------------------------------- */
  const modules: Record<string, ModuleRuntime> = {};
  for (const m of ws.modules) {
    const isPowered = powered.get(m.id) === true;
    const manualOff = m.type !== 'power' && m.switchedOff === true;
    let rt: ModuleRuntime;

    if (m.type === 'power') {
      const n = valid.filter((c) => c.type === 'power' && c.from.moduleId === m.id).length;
      rt = {
        id: m.id,
        type: 'power',
        state: m.config.enabled ? 'operational' : 'off',
        powered: m.config.enabled,
        summary: m.config.enabled ? 'On' : 'Off',
        detail: m.config.enabled
          ? n === 0
            ? 'Switched on. No block is linked to its outputs.'
            : `Supplying ${n} linked ${n === 1 ? 'block' : 'blocks'}.`
          : 'Switched off. Linked blocks are not operating.',
        screen: { kind: 'off' },
      };
    } else if (isOperatorType(m.type)) {
      // Adder, Subtractor, Multiplier and Divisor Blocks: same body as a Text Block, no data of their own yet
      const name = OPERATORS[m.type as OperatorType].label;
      rt = {
        id: m.id,
        type: m.type,
        state: isPowered ? 'operational' : manualOff ? 'off' : 'unpowered',
        powered: isPowered,
        summary: isPowered ? 'Operational' : manualOff ? 'Off' : 'No power',
        detail: isPowered
          ? `${name} is an operator block. It is powered and ready.`
          : (unpoweredReason.get(m.id) ?? 'Not powered.'),
        screen: isPowered ? { kind: 'empty' } : { kind: 'off' },
      };
    } else if (m.type === 'text' || m.type === 'integer') {
      const noun = m.type === 'integer' ? 'number' : 'text';
      const typing = typingInto.has(m.id);
      const screen: ScreenContent = !isPowered
        ? { kind: 'off' }
        : m.config.value.length === 0
          ? typing
            ? { kind: 'empty', typing }
            : { kind: 'empty' }
          : typing
            ? { kind: 'text', text: m.config.value, typing }
            : { kind: 'text', text: m.config.value };
      const targets = valid.filter((c) => c.type === 'text' && c.from.moduleId === m.id).length;
      rt = {
        id: m.id,
        type: m.type,
        state: isPowered ? 'operational' : manualOff ? 'off' : 'unpowered',
        powered: isPowered,
        summary: isPowered ? 'Operational' : manualOff ? 'Off' : 'No power',
        detail: isPowered
          ? (typing ? 'Typing from a Keyboard or Keypad Block. ' : '') +
            (targets === 0
              ? `Operational. It has no screen of its own: link its output to a Display Block to see the ${noun}.`
              : `Operational. Sending ${noun} to ${targets} ${targets === 1 ? 'display' : 'displays'}.`)
          : (unpoweredReason.get(m.id) ?? 'Not powered.'),
        screen,
      };
    } else if (m.type === 'keyboard' || m.type === 'keypad') {
      const linked = keysSent.has(m.id);
      const hasLink = valid.some((c) => c.type === 'keys' && c.from.moduleId === m.id);
      rt = {
        id: m.id,
        type: m.type,
        state: isPowered ? 'operational' : manualOff ? 'off' : 'unpowered',
        powered: isPowered,
        summary: !isPowered ? (manualOff ? 'Off' : 'No power') : linked ? 'Typing' : 'Not linked',
        detail: !isPowered
          ? (unpoweredReason.get(m.id) ?? 'Not powered.')
          : linked
            ? 'Operational. Keystrokes are typed into the linked Text Block.'
            : hasLink
              ? 'Operational, but the linked Text Block is not powered.'
              : 'Powered, but not linked. Connect its output to a Text Block to type into it.',
        screen: isPowered ? { kind: 'keys', linked } : { kind: 'off' },
      };
    } else {
      const input = dataInto.get(m.id);
      let state: ModuleRuntime['state'];
      let summary: string;
      let detail: string;
      let screen: ScreenContent;
      if (!isPowered) {
        state = manualOff ? 'off' : 'unpowered';
        summary = manualOff ? 'Off' : 'No power';
        detail = unpoweredReason.get(m.id) ?? 'Not powered.';
        screen = { kind: 'off' };
      } else if (!input) {
        state = 'waiting';
        summary = 'No data source';
        detail = 'Powered, but no Text Block is linked to its text input.';
        screen = { kind: 'no-source' };
      } else if ('missing' in input) {
        state = 'waiting';
        summary = 'Source unavailable';
        detail = input.missing;
        screen = { kind: 'source-off' };
      } else if (m.config.cleared) {
        // the Display's own clear button: its screen is blank, the source block keeps its data
        state = 'operational';
        summary = 'Cleared';
        detail = 'The screen was cleared. The linked block still holds its data and the display shows it again as soon as that changes.';
        screen = { kind: 'cleared' };
      } else if (input.value.length === 0) {
        state = 'operational';
        summary = 'Operational';
        detail = 'Receiving an empty text value.';
        screen = { kind: 'empty' };
      } else {
        state = 'operational';
        summary = 'Showing text';
        detail = `Showing ${Array.from(input.value).length} characters from the Text Block.`;
        screen = { kind: 'text', text: input.value };
      }
      rt = { id: m.id, type: 'display', state, powered: isPowered, summary, detail, screen };
    }
    modules[m.id] = rt;
  }

  const systemOk =
    ws.modules.length > 0 &&
    Object.values(modules).every((m) => m.state === 'operational') &&
    issues.length === 0;

  return { modules, connections: connRuntime, issues, systemOk };
}
