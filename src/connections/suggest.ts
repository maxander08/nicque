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
  for (const m of ws.modules) {
    for (const p of MODULE_DEFINITIONS[m.type].ports) {
      if (p.direction !== 'in') continue;
      const used = ws.connections.some((c) => c.to.moduleId === m.id && c.to.portId === p.id);
      if (used) continue;
      const source = ws.modules.find(
        (s) =>
          s.id !== m.id &&
          MODULE_DEFINITIONS[s.type].ports.some((sp) => sp.direction === 'out' && sp.type === p.type) &&
          findFreePortPair(ws, s, m, p.type),
      );
      if (source) {
        out.push({
          key: `${source.id}->${m.id}:${p.type}`,
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
