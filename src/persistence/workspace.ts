import { sanitizeConnections } from '@/connections/validate';
import { MODULE_DEFINITIONS, isModuleType } from '@/modules/definitions';
import type { ModuleRecord, PortRef, Workspace } from '@/types';

/**
 * Workspace persistence. Stores only the persistent workspace (modules + connections);
 * transient UI state such as selection or camera is never serialised.
 */

export const WORKSPACE_VERSION = 1;
export const STORAGE_KEYS = {
  autosave: 'nicque.workspace.autosave.v2',
  saved: 'nicque.workspace.saved.v2',
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ParseResult =
  | { ok: true; workspace: Workspace; warnings: string[] }
  | { ok: false; error: string };

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify({
    app: 'nicque',
    version: WORKSPACE_VERSION,
    modules: ws.modules,
    connections: ws.connections.map(({ id, type, from, to }) => ({ id, type, from, to })),
  });
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number, limit = 40) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(-limit, Math.min(limit, v)) : fallback;

function parsePortRef(v: unknown): PortRef | null {
  if (!isObj(v) || typeof v.moduleId !== 'string' || typeof v.portId !== 'string') return null;
  return { moduleId: v.moduleId, portId: v.portId };
}

export function parseWorkspace(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The workspace file is not valid JSON.' };
  }
  if (!isObj(raw)) return { ok: false, error: 'The workspace data has an unexpected format.' };
  if (typeof raw.version === 'number' && raw.version > WORKSPACE_VERSION) {
    return { ok: false, error: 'This workspace was created by a newer version of Nicque.' };
  }
  if (!Array.isArray(raw.modules)) {
    return { ok: false, error: 'The workspace has no module list.' };
  }

  const warnings: string[] = [];
  const modules: ModuleRecord[] = [];
  const ids = new Set<string>();

  raw.modules.forEach((m, index) => {
    if (!isObj(m) || !isModuleType(m.type)) {
      warnings.push(`Skipped module #${index + 1}: unknown or missing type.`);
      return;
    }
    if (typeof m.id !== 'string' || m.id.length === 0 || ids.has(m.id)) {
      warnings.push(`Skipped module #${index + 1}: missing or duplicate id.`);
      return;
    }
    const def = MODULE_DEFINITIONS[m.type];
    const pos = isObj(m.position) ? m.position : {};
    const rot = typeof m.rotation === 'number' && Number.isFinite(m.rotation) ? Math.round(m.rotation) : 0;
    ids.add(m.id);
    modules.push({
      id: m.id,
      type: m.type,
      name: typeof m.name === 'string' && m.name.trim() ? m.name.slice(0, 40) : def.label,
      position: { x: num(pos.x, 0), z: num(pos.z, 0) },
      rotation: ((rot % 4) + 4) % 4,
      config: def.sanitizeConfig(m.config),
      ...(m.switchedOff === true && m.type !== 'power' ? { switchedOff: true } : {}),
    } as ModuleRecord);
  });

  if (modules.length === 0) {
    return { ok: false, error: 'The workspace contains no valid modules.' };
  }

  const candidates: Array<{ from: PortRef; to: PortRef }> = [];
  if (Array.isArray(raw.connections)) {
    raw.connections.forEach((c, index) => {
      const from = isObj(c) ? parsePortRef(c.from) : null;
      const to = isObj(c) ? parsePortRef(c.to) : null;
      if (!from || !to) warnings.push(`Skipped connection #${index + 1}: malformed endpoints.`);
      else candidates.push({ from, to });
    });
  }
  const { connections, rejected } = sanitizeConnections(modules, candidates);
  rejected.forEach((r) => warnings.push(`Dropped a connection: ${r}`));

  return { ok: true, workspace: { modules, connections }, warnings };
}

export function saveWorkspace(storage: StorageLike, key: string, ws: Workspace): boolean {
  try {
    storage.setItem(key, serializeWorkspace(ws));
    return true;
  } catch {
    return false;
  }
}

export function loadWorkspace(storage: StorageLike, key: string): ParseResult | null {
  let text: string | null = null;
  try {
    text = storage.getItem(key);
  } catch {
    return null;
  }
  if (text === null) return null;
  return parseWorkspace(text);
}

export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
