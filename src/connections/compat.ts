import { MODULE_DEFINITIONS, TEXT_OPERATORS, getPortDef, isOperatorType } from '@/modules/definitions';
import type { ConnectionRecord, DataKind, ModuleRecord, PortDef, Workspace } from '@/types';

/**
 * Node compatibility. Every block declares, for each of its data nodes, which kinds of data it sends or accepts
 * (`PortDef.kinds`). This module answers the questions "what does this node carry right now?" and "may this
 * output feed that input?" for the whole graph, including operator chains:
 *
 *  - Text Block      sends text.              Integer Block sends integers.
 *  - Subtractor, Divisor   work with integers only (in and out).
 *  - Adder, Multiplier     also work with text. Their result is text as soon as one operand is text.
 *  - A Multiplier can multiply text by an integer, never text by text.
 *  - Display Block   shows text and integers.
 */

const kindList = (ks: DataKind[]) =>
  ks.length === 2 ? 'integers and text' : ks[0] === 'integer' ? 'integers only' : 'text only';

const dataLinks = (conns: ConnectionRecord[]) => conns.filter((c) => c.type === 'text');

/** The kind of data a block's output carries in this workspace. */
export function outputKind(
  ws: Pick<Workspace, 'modules' | 'connections'>,
  module: ModuleRecord,
  seen: Set<string> = new Set(),
): DataKind {
  if (module.type === 'text') return 'text';
  if (module.type === 'integer') return 'integer';
  if (!isOperatorType(module.type) || !TEXT_OPERATORS.includes(module.type)) return 'integer';
  if (seen.has(module.id)) return 'integer';
  seen.add(module.id);
  // Adder / Multiplier: text in, text out
  for (const c of dataLinks(ws.connections)) {
    if (c.to.moduleId !== module.id) continue;
    const src = ws.modules.find((m) => m.id === c.from.moduleId);
    if (src && outputKind(ws, src, new Set(seen)) === 'text') return 'text';
  }
  return 'integer';
}

/** The kinds a data node can handle (empty for nodes that are not data nodes). */
export const nodeKinds = (port: PortDef): DataKind[] => port.kinds ?? [];

/** Human readable description of a node, e.g. "accepts integers and text". */
export function describeNode(port: PortDef): string {
  if (port.type === 'power') return port.direction === 'out' ? 'supplies power' : 'needs power';
  if (port.type === 'keys') return port.direction === 'out' ? 'sends keystrokes' : 'takes keystrokes';
  return `${port.direction === 'out' ? 'sends' : 'accepts'} ${kindList(nodeKinds(port))}`;
}

/** True when `target` is reachable from `start` by following data links downstream. */
function reaches(conns: ConnectionRecord[], start: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const c of dataLinks(conns)) if (c.from.moduleId === id) stack.push(c.to.moduleId);
  }
  return false;
}

/** Checks one data link against its two nodes in the context of `ws`. Returns the reason it is not compatible. */
function linkProblem(ws: Pick<Workspace, 'modules' | 'connections'>, c: ConnectionRecord): string | null {
  const from = ws.modules.find((m) => m.id === c.from.moduleId);
  const to = ws.modules.find((m) => m.id === c.to.moduleId);
  if (!from || !to) return null;
  const inPort = getPortDef(to, c.to.portId);
  if (!inPort) return null;
  const kind = outputKind(ws, from);
  const accepted = nodeKinds(inPort);
  if (!accepted.includes(kind)) {
    const what = kind === 'integer' ? 'an integer' : 'text';
    return `${from.name} sends ${what}, but ${to.name} works with ${kindList(accepted)}.`;
  }
  if (to.type === 'multiplier') {
    const textOperands = dataLinks(ws.connections).filter((l) => {
      if (l.to.moduleId !== to.id) return false;
      const src = ws.modules.find((m) => m.id === l.from.moduleId);
      return !!src && outputKind(ws, src) === 'text';
    }).length;
    if (textOperands > 1) return `${to.name} can multiply text by an integer, but not text by text.`;
  }
  return null;
}

/**
 * Full compatibility check for a new data link: the two nodes must agree on the kind of data, the link must not
 * close a loop, and it must not change an operator's result into something its consumers cannot take.
 * Returns the reason when the link is refused, or null when it is compatible.
 */
export function dataLinkProblem(ws: Workspace, link: ConnectionRecord): string | null {
  if (reaches(ws.connections, link.to.moduleId, link.from.moduleId)) {
    return 'This link would feed a block back into itself. Links must not form a loop.';
  }
  const next = { modules: ws.modules, connections: [...ws.connections, link] };
  const first = linkProblem(next, link);
  if (first) return first;
  // an operator whose result kind changes may no longer fit the blocks it already feeds
  const queue = [link.to.moduleId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const c of dataLinks(next.connections)) {
      if (c.from.moduleId !== id) continue;
      const p = linkProblem(next, c);
      if (p) return `${p} (That link already exists.)`;
      queue.push(c.to.moduleId);
    }
  }
  return null;
}

/** What a block type accepts and sends over its data nodes, used by the inspector. */
export function blockCompatibility(type: ModuleRecord['type']) {
  const ports = MODULE_DEFINITIONS[type].ports.filter((p) => p.type === 'text');
  return {
    accepts: [...new Set(ports.filter((p) => p.direction === 'in').flatMap(nodeKinds))],
    sends: [...new Set(ports.filter((p) => p.direction === 'out').flatMap(nodeKinds))],
  };
}
