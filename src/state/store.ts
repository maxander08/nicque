import { create } from 'zustand';
import { findFreePortPair } from '@/connections/suggest';
import { validateConnection } from '@/connections/validate';
import { DEFAULT_TEXT, MAX_TEXT_LENGTH } from '@/modules/definitions';
import { footprint, obbOverlap } from '@/modules/spatial';
import {
  STORAGE_KEYS,
  getBrowserStorage,
  loadWorkspace,
  parseWorkspace,
  saveWorkspace,
  serializeWorkspace,
} from '@/persistence/workspace';
import { evaluateWorkspace } from '@/runtime/evaluate';
import type {
  ModuleRecord,
  PortRef,
  RuntimeState,
  ValidationResult,
  Vec2,
  Workspace,
} from '@/types';
import { createDefaultWorkspace } from './defaultWorkspace';

export type Quality = 'high' | 'medium' | 'performance';
export type ToastKind = 'info' | 'success' | 'warn' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface LinkDrag {
  from: PortRef;
  pointer: Vec2;
  target: PortRef | null;
  verdict: ValidationResult | null;
}

export interface HoverInfo {
  kind: 'module' | 'port' | 'button';
  moduleId: string;
  id?: string;
}

const SETTINGS_KEY = 'nicque.settings.v1';

interface Settings {
  quality: Quality;
  snap: boolean;
}

function loadSettings(): Settings {
  const fallback: Settings = { quality: 'high', snap: true };
  try {
    const s = getBrowserStorage()?.getItem(SETTINGS_KEY);
    if (!s) return fallback;
    const p = JSON.parse(s) as Partial<Settings>;
    return {
      quality:
        p.quality === 'performance'
          ? 'performance'
          : p.quality === 'medium'
            ? 'medium'
            : 'high',
      snap: p.snap !== false,
    };
  } catch {
    return fallback;
  }
}

let toastSeq = 1;

interface Store {
  workspace: Workspace;
  runtime: RuntimeState;
  selectedId: string | null;
  quality: Quality;
  snap: boolean;
  toasts: Toast[];
  focusTextNonce: number;
  cameraResetNonce: number;
  pressed: string | null;
  hover: HoverInfo | null;
  linkDrag: LinkDrag | null;
  draggingId: string | null;

  select: (id: string | null) => void;
  moveModule: (id: string, pos: Vec2) => void;
  rotateModule: (id: string) => void;
  setText: (id: string, value: string) => void;
  setPower: (id: string, enabled: boolean) => void;
  setAlign: (id: string, align: 'left' | 'center') => void;
  connect: (a: PortRef, b: PortRef) => ValidationResult;
  linkModules: (fromId: string, toId: string, type: 'power' | 'text') => void;
  disconnect: (connectionId: string) => void;
  pressButton: (moduleId: string, action: string) => void;
  setQuality: (q: Quality) => void;
  setSnap: (v: boolean) => void;
  resetCamera: () => void;
  saveToBrowser: () => void;
  loadFromBrowser: () => void;
  exportJson: () => string;
  importJson: (json: string) => boolean;
  resetWorkspace: () => void;
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
  setPressed: (key: string | null) => void;
  setHover: (h: HoverInfo | null) => void;
  setLinkDrag: (d: LinkDrag | null) => void;
  setDraggingId: (id: string | null) => void;
}

function initialWorkspace(): { ws: Workspace; warnings: string[] } {
  const storage = getBrowserStorage();
  if (storage) {
    const res = loadWorkspace(storage, STORAGE_KEYS.autosave);
    if (res?.ok) return { ws: res.workspace, warnings: res.warnings };
    if (res && !res.ok) {
      return { ws: createDefaultWorkspace(), warnings: [`Saved workspace ignored: ${res.error}`] };
    }
  }
  return { ws: createDefaultWorkspace(), warnings: [] };
}

function updateModule<T extends ModuleRecord>(ws: Workspace, id: string, fn: (m: ModuleRecord) => T): Workspace {
  return { ...ws, modules: ws.modules.map((m) => (m.id === id ? fn(m) : m)) };
}

/** Builds user-facing feedback by comparing two runtime snapshots. */
function describeChanges(prev: RuntimeState, next: RuntimeState, ws: Workspace): Array<[string, ToastKind]> {
  const names = new Map(ws.modules.map((m) => [m.id, m.name]));
  const out: Array<[string, ToastKind]> = [];
  const powerChanges: string[] = [];
  const others: Array<[string, ToastKind]> = [];
  let anyOn = false;
  for (const m of ws.modules) {
    const a = prev.modules[m.id];
    const b = next.modules[m.id];
    if (!a || !b || a.state === b.state) continue;
    if (m.type === 'power') {
      powerChanges.push(b.state === 'operational' ? 'on' : 'off');
      if (b.state === 'operational') anyOn = true;
    } else if (b.state === 'operational') {
      others.push([`${names.get(m.id)} is operational`, 'success']);
    } else if (b.state === 'unpowered') {
      others.push([`${names.get(m.id)} lost power`, 'warn']);
    } else if (b.state === 'waiting') {
      others.push([`${names.get(m.id)} lost its data source`, 'warn']);
    }
  }
  if (powerChanges.length > 0) {
    const affected = ws.modules.filter(
      (m) => m.type !== 'power' && prev.modules[m.id]?.state !== next.modules[m.id]?.state,
    ).length;
    out.push([
      anyOn
        ? `Power enabled${affected ? ` · ${affected} ${affected === 1 ? 'block' : 'blocks'} came online` : ''}`
        : `Power disabled${affected ? ` · ${affected} ${affected === 1 ? 'block' : 'blocks'} stopped` : ''}`,
      anyOn ? 'success' : 'warn',
    ]);
  } else {
    out.push(...others.slice(0, 2));
  }
  return out;
}

const initial = initialWorkspace();
const settings = loadSettings();

export const useStore = create<Store>((set, get) => {
  /** Applies a logic change: recompute runtime once and emit feedback. */
  const commit = (ws: Workspace, quiet = false) => {
    const prev = get().runtime;
    const next = evaluateWorkspace(ws);
    set({ workspace: ws, runtime: next });
    if (!quiet) describeChanges(prev, next, ws).forEach(([m, k]) => get().notify(m, k));
  };

  return {
    workspace: initial.ws,
    runtime: evaluateWorkspace(initial.ws),
    selectedId: null,
    quality: settings.quality,
    snap: settings.snap,
    toasts: initial.warnings.map((message) => ({ id: toastSeq++, kind: 'warn' as const, message })),
    focusTextNonce: 0,
    cameraResetNonce: 0,
    pressed: null,
    hover: null,
    linkDrag: null,
    draggingId: null,

    select: (id) => {
      if (get().selectedId === id) return;
      set({ selectedId: id });
      if (id) {
        const m = get().workspace.modules.find((x) => x.id === id);
        if (m) get().notify(`${m.name} selected`, 'info');
      }
    },

    moveModule: (id, pos) => {
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur || (cur.position.x === pos.x && cur.position.z === pos.z)) return;
      // Position changes never alter the logical graph, so the runtime is not recomputed.
      set({ workspace: updateModule(ws, id, (m) => ({ ...m, position: { ...pos } }) as ModuleRecord) });
    },

    rotateModule: (id) => {
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur) return;
      const rotated = updateModule(ws, id, (m) => ({ ...m, rotation: (m.rotation + 1) % 4 }) as ModuleRecord);
      const probe = rotated.modules.find((m) => m.id === id)!;
      // Reject a rotation that would make the block intersect a neighbour.
      const clash = rotated.modules.some(
        (m) => m.id !== id && obbOverlap(footprint(probe, 0.01), footprint(m, 0.01)),
      );
      if (clash) get().notify('Not enough room to rotate here. Move the block first.', 'warn');
      else set({ workspace: rotated });
    },

    setText: (id, value) => {
      const v = value.slice(0, MAX_TEXT_LENGTH);
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur || cur.type !== 'text' || cur.config.value === v) return;
      commit(updateModule(ws, id, (m) => ({ ...m, config: { value: v } }) as ModuleRecord), true);
    },

    setPower: (id, enabled) => {
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur || cur.type !== 'power' || cur.config.enabled === enabled) return;
      commit(updateModule(ws, id, (m) => ({ ...m, config: { enabled } }) as ModuleRecord));
    },

    setAlign: (id, align) => {
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur || cur.type !== 'display' || cur.config.align === align) return;
      commit(updateModule(ws, id, (m) => ({ ...m, config: { align } }) as ModuleRecord), true);
    },

    connect: (a, b) => {
      const ws = get().workspace;
      const res = validateConnection(ws, a, b);
      if (!res.ok) {
        get().notify(`Connection rejected. ${res.message}`, 'error');
        return res;
      }
      const c = res.connection;
      const fromName = ws.modules.find((m) => m.id === c.from.moduleId)?.name;
      const toName = ws.modules.find((m) => m.id === c.to.moduleId)?.name;
      commit({ ...ws, connections: [...ws.connections, c] }, true);
      get().notify(`${c.type === 'power' ? 'Power' : 'Text'} link established · ${fromName} → ${toName}`, 'success');
      describeChanges(
        // Use the runtime of the workspace without the new link as the baseline.
        evaluateWorkspace(ws),
        get().runtime,
        get().workspace,
      ).forEach(([m, k]) => get().notify(m, k));
      return res;
    },

    linkModules: (fromId, toId, type) => {
      const ws = get().workspace;
      const from = ws.modules.find((m) => m.id === fromId);
      const to = ws.modules.find((m) => m.id === toId);
      if (!from || !to) return;
      const pair = findFreePortPair(ws, from, to, type);
      if (!pair) {
        get().notify('No free compatible connectors are available for that link.', 'error');
        return;
      }
      get().connect(pair.from, pair.to);
    },

    disconnect: (connectionId) => {
      const ws = get().workspace;
      const c = ws.connections.find((x) => x.id === connectionId);
      if (!c) return;
      const fromName = ws.modules.find((m) => m.id === c.from.moduleId)?.name;
      const toName = ws.modules.find((m) => m.id === c.to.moduleId)?.name;
      const prev = get().runtime;
      const next: Workspace = { ...ws, connections: ws.connections.filter((x) => x.id !== connectionId) };
      commit(next, true);
      get().notify(`${c.type === 'power' ? 'Power' : 'Text'} link removed · ${fromName} → ${toName}`, 'info');
      describeChanges(prev, get().runtime, next).forEach(([m, k]) => get().notify(m, k));
    },

    pressButton: (moduleId, action) => {
      const s = get();
      const m = s.workspace.modules.find((x) => x.id === moduleId);
      if (!m) return;
      if (action === 'toggle-power' && m.type === 'power') {
        s.setPower(moduleId, !m.config.enabled);
        return;
      }
      const rt = s.runtime.modules[moduleId];
      if (!rt?.powered) {
        s.notify(`${m.name} has no power. Its controls are inactive.`, 'warn');
        return;
      }
      if (m.type === 'text') {
        if (action === 'edit') {
          set({ selectedId: moduleId, focusTextNonce: s.focusTextNonce + 1 });
        } else if (action === 'clear') {
          s.setText(moduleId, '');
          s.notify('Text cleared', 'info');
        } else if (action === 'sample') {
          s.setText(moduleId, DEFAULT_TEXT);
          s.notify('Sample text restored', 'info');
        }
      }
    },

    setQuality: (q) => {
      set({ quality: q });
      persistSettings(q, get().snap);
      get().notify(
        q === 'high'
          ? 'High quality rendering'
          : q === 'medium'
            ? 'Medium quality rendering'
            : 'Performance mode',
        'info',
      );
    },
    setSnap: (v) => {
      set({ snap: v });
      persistSettings(get().quality, v);
      get().notify(v ? 'Grid snapping on' : 'Grid snapping off', 'info');
    },
    resetCamera: () => set({ cameraResetNonce: get().cameraResetNonce + 1 }),

    saveToBrowser: () => {
      const storage = getBrowserStorage();
      if (storage && saveWorkspace(storage, STORAGE_KEYS.saved, get().workspace)) {
        get().notify('Workspace saved to this browser', 'success');
      } else {
        get().notify('Could not save: browser storage is unavailable', 'error');
      }
    },

    loadFromBrowser: () => {
      const storage = getBrowserStorage();
      const res = storage ? loadWorkspace(storage, STORAGE_KEYS.saved) : null;
      if (!res) return get().notify('No saved workspace found. Use Save first.', 'warn');
      if (!res.ok) return get().notify(`Load failed. ${res.error}`, 'error');
      set({ selectedId: null });
      commit(res.workspace, true);
      get().notify('Workspace loaded', 'success');
      res.warnings.slice(0, 2).forEach((w) => get().notify(w, 'warn'));
    },

    exportJson: () => serializeWorkspace(get().workspace),

    importJson: (json) => {
      const res = parseWorkspace(json);
      if (!res.ok) {
        get().notify(`Import failed. ${res.error}`, 'error');
        return false;
      }
      set({ selectedId: null });
      commit(res.workspace, true);
      get().notify('Workspace imported', 'success');
      res.warnings.slice(0, 2).forEach((w) => get().notify(w, 'warn'));
      return true;
    },

    resetWorkspace: () => {
      set({ selectedId: null });
      commit(createDefaultWorkspace(), true);
      get().notify('Workspace reset to the default arrangement', 'info');
    },

    notify: (message, kind = 'info') =>
      set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, kind, message }].slice(-3) })),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setPressed: (key) => set({ pressed: key }),
    setHover: (h) => {
      const cur = get().hover;
      if (cur?.kind === h?.kind && cur?.moduleId === h?.moduleId && cur?.id === h?.id) return;
      set({ hover: h });
    },
    setLinkDrag: (d) => set({ linkDrag: d }),
    setDraggingId: (id) => set({ draggingId: id }),
  };
});

function persistSettings(quality: Quality, snap: boolean) {
  try {
    getBrowserStorage()?.setItem(SETTINGS_KEY, JSON.stringify({ quality, snap }));
  } catch {
    /* ignore */
  }
}

/** Debounced autosave of the persistent workspace. Returns an unsubscribe function. */
export function startAutosave(): () => void {
  const storage = getBrowserStorage();
  if (!storage) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((s, prev) => {
    if (s.workspace === prev.workspace) return;
    clearTimeout(timer);
    timer = setTimeout(() => saveWorkspace(storage, STORAGE_KEYS.autosave, s.workspace), 300);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
