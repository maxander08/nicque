import { MODULE_DEFINITIONS } from '@/modules/definitions';
import type { ModuleRecord, PortRef, PortType, Workspace } from '@/types';
import { validateConnection } from './validate';

/** Finds the first free, compatible output → input pair between two modules. */
export function findFreePortPair(
  ws: Workspace,
  fromModule: ModuleRecord,
  toModule: ModuleRecord,
  type: PortType,
): { from: PortRef; to: PortRef } | null {
  const outs = MODULE_DEFINITIONS[fromModule.type].ports.filter(
    (p) => p.direction === 'out' && p.type === type,
  );
  const ins = MODULE_DEFINITIONS[toModule.type].ports.filter(
    (p) => p.direction === 'in' && p.type === type,
  );
  for (const o of outs) {
    for (const i of ins) {
      const from = { moduleId: fromModule.id, portId: o.id };
      const to = { moduleId: toModule.id, portId: i.id };
      if (validateConnection(ws, from, to).ok) return { from, to };
    }
  }
  return null;
}

export interface MissingLink {
  key: string;
  label: string;
  type: PortType;
  fromId: string;
  toId: string;
}

/**
 * Lists the links a workable system still lacks: every power input should be fed by a power
 * source and every text input by a text source.
 */
export function missingLinks(ws: Workspace): MissingLink[] {
  const out: MissingLink[] = [];
  const seen = new Set<string>();
  for (const m of ws.modules) {
    const inputs = MODULE_DEFINITIONS[m.type].ports.filter((p) => p.direction === 'in');
    for (const p of inputs) {
      // a block with several inputs of one type (the Text Block's two key inputs) needs only one of them linked
      const sameType = inputs.filter((q) => q.type === p.type);
      const used = ws.connections.some(
        (c) => c.to.moduleId === m.id && sameType.some((q) => q.id === c.to.portId),
      );
      if (used) continue;
      const source = ws.modules.find(
        (s) =>
          s.id !== m.id &&
          MODULE_DEFINITIONS[s.type].ports.some((sp) => sp.direction === 'out' && sp.type === p.type) &&
          findFreePortPair(ws, s, m, p.type),
      );
      if (!source) continue;
      const key = `${source.id}->${m.id}:${p.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          key,
          label: `${source.name} → ${m.name}`,
          type: p.type,
          fromId: source.id,
          toId: m.id,
        });
      }
    }
  }
  return out;
}
