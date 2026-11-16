import { getPortDef } from '@/modules/definitions';
import type {
  ConnectionRecord,
  ModuleRecord,
  PortRef,
  ValidationResult,
  Workspace,
} from '@/types';

/**
 * Connection validation. Independent from any rendering code: it only reasons about module
 * records, port definitions and the already accepted connections.
 */

export const connectionId = (from: PortRef, to: PortRef) =>
  `link:${from.moduleId}.${from.portId}->${to.moduleId}.${to.portId}`;

const refEq = (a: PortRef, b: PortRef) => a.moduleId === b.moduleId && a.portId === b.portId;

const fail = (code: string, message: string): ValidationResult => ({ ok: false, code, message });

export function findModule(ws: Pick<Workspace, 'modules'>, id: string): ModuleRecord | undefined {
  return ws.modules.find((m) => m.id === id);
}

export function validateConnection(
  ws: Workspace,
  a: PortRef,
  b: PortRef,
): ValidationResult {
  const ma = findModule(ws, a.moduleId);
  const mb = findModule(ws, b.moduleId);
  if (!ma || !mb) return fail('missing-endpoint', 'One of the blocks no longer exists.');
  const pa = getPortDef(ma, a.portId);
  const pb = getPortDef(mb, b.portId);
  if (!pa || !pb) return fail('missing-port', 'That connector does not exist on this block.');
  if (ma.id === mb.id) return fail('same-module', 'A block cannot be linked to itself.');

  if (pa.direction === pb.direction) {
    return fail(
      'same-direction',
      pa.direction === 'out'
        ? 'Two outputs cannot be linked. Connect an output to an input.'
        : 'Two inputs cannot be linked. Connect an output to an input.',
    );
  }

  const [fromM, fromP, toM, toP] = pa.direction === 'out' ? [ma, pa, mb, pb] : [mb, pb, ma, pa];
  const from: PortRef = { moduleId: fromM.id, portId: fromP.id };
  const to: PortRef = { moduleId: toM.id, portId: toP.id };

  if (fromP.type !== toP.type) {
    const what = (t: string) => (t === 'power' ? 'power' : t === 'keys' ? 'keystrokes' : 'text');
    return fail(
      'type-mismatch',
      `${fromM.name} supplies ${what(fromP.type)}, but the ${toP.label.toLowerCase()} of ${toM.name} expects ${what(toP.type)}.`,
    );
  }

  const id = connectionId(from, to);
  if (ws.connections.some((c) => c.id === id)) {
    return fail('duplicate', 'These connectors are already linked.');
  }

  const toUse = ws.connections.filter((c) => refEq(c.to, to)).length;
  if (toUse >= toP.capacity) {
    return fail(
      'input-occupied',
      `The ${toP.label.toLowerCase()} of ${toM.name} is already linked. Remove that link first.`,
    );
  }
  const fromUse = ws.connections.filter((c) => refEq(c.from, from)).length;
  if (fromUse >= fromP.capacity) {
    return fail(
      'output-occupied',
      `The ${fromP.label.toLowerCase()} of ${fromM.name} is already in use.`,
    );
  }

  return { ok: true, connection: { id, type: fromP.type, from, to } };
}

/**
 * Re-validates an arbitrary list of connection records against a set of modules.
 * Invalid entries are dropped and reported; nothing throws.
 */
export function sanitizeConnections(
  modules: ModuleRecord[],
  candidates: Array<{ from: PortRef; to: PortRef }>,
): { connections: ConnectionRecord[]; rejected: string[] } {
  const accepted: ConnectionRecord[] = [];
  const rejected: string[] = [];
  for (const c of candidates) {
    const res = validateConnection({ modules, connections: accepted }, c.from, c.to);
    if (res.ok) accepted.push(res.connection);
    else rejected.push(res.message);
  }
  return { connections: accepted, rejected };
}
