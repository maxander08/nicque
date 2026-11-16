import { create } from 'zustand';
import { findFreePortPair } from '@/connections/suggest';
import { validateConnection } from '@/connections/validate';
import { spawnPlacement } from '@/interactions/spawn';
import { DEFAULT_TEXT, MAX_TEXT_LENGTH, createModule, getDefinition } from '@/modules/definitions';
import {
  NO_MODS,
  applyEdit,
  editFor,
  keyById,
  type KeyEdit,
  type Mods,
} from '@/modules/keyboard';
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
  KeyPressure,
  ModuleRecord,
  ModuleType,
  PortRef,
  PortType,
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

export const linkLabel: Record<'power' | 'text' | 'keys', string> = { power: 'Power', text: 'Text', keys: 'Keys' };

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
  /** Keys currently held on Keyboard and Keypad Blocks: `${moduleId}:${keyId}` → pressure (0..1). */
  keysDown: Record<string, number>;
  /** Shift / Caps Lock state of every Keyboard Block (transient, never persisted). */
  kbMods: Record<string, Mods>;

  select: (id: string | null) => void;
  moveModule: (id: string, pos: Vec2) => void;
  rotateModule: (id: string) => void;
  setText: (id: string, value: string) => void;
  setPower: (id: string, enabled: boolean) => void;
  setAlign: (id: string, align: 'left' | 'center') => void;
  connect: (a: PortRef, b: PortRef) => ValidationResult;
  linkModules: (fromId: string, toId: string, type: PortType) => void;
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
  addModule: (type: ModuleType) => void;
  removeModule: (id: string) => void;
  setKeyboardPressure: (id: string, pressure: KeyPressure) => void;
  /** Types an edit into every Text Block the keyboard is linked to. Returns false when nothing received it. */
  typeEdit: (keyboardId: string, edit: KeyEdit, quiet?: boolean) => boolean;
  /** On-screen key press. */
  pressKey: (moduleId: string, keyId: string, pressure: number, repeat?: boolean) => void;
  releaseKey: (moduleId: string, keyId: string) => void;
  setKeyDown: (moduleId: string, keyId: string, pressure: number | null) => void;
  setMods: (moduleId: string, mods: Partial<Mods>) => void;
  clearKeys: (moduleId?: string) => void;
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
    keysDown: {},
    kbMods: {},

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
      get().notify(`${linkLabel[c.type]} link established · ${fromName} → ${toName}`, 'success');
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
      get().notify(`${linkLabel[c.type]} link removed · ${fromName} → ${toName}`, 'info');
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
        } else if (action === 'undo') {
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

    addModule: (type) => {
      const ws = get().workspace;
      const def = getDefinition(type);
      let n = 1;
      const ids = new Set(ws.modules.map((m) => m.id));
      while (ids.has(`${type}-${n}`)) n++;
      const same = ws.modules.filter((m) => m.type === type).length;
      const { position, rotation } = spawnPlacement(ws, type);
      const mod = createModule(type, `${type}-${n}`, position, rotation, same > 0 ? `${def.label} ${same + 1}` : def.label);
      commit({ ...ws, modules: [...ws.modules, mod] }, true);
      set({ selectedId: mod.id });
      get().notify(`${mod.name} added`, 'success');
      // convenience: hook up power when a Power Block still has a free output
      if (type !== 'power') {
        const src = ws.modules.find(
          (m) => m.type === 'power' && findFreePortPair(get().workspace, m, mod, 'power'),
        );
        if (src) get().linkModules(src.id, mod.id, 'power');
      }
    },

    removeModule: (id) => {
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur) return;
      get().clearKeys(id);
      set({ selectedId: null });
      commit(
        {
          modules: ws.modules.filter((m) => m.id !== id),
          connections: ws.connections.filter((c) => c.from.moduleId !== id && c.to.moduleId !== id),
        },
        true,
      );
      get().notify(`${cur.name} removed`, 'info');
    },

    setKeyboardPressure: (id, pressure) => {
      const ws = get().workspace;
      const cur = ws.modules.find((m) => m.id === id);
      if (!cur || (cur.type !== 'keyboard' && cur.type !== 'keypad') || cur.config.pressure === pressure) return;
      commit(updateModule(ws, id, (m) => ({ ...m, config: { pressure } }) as ModuleRecord), true);
    },

    typeEdit: (keyboardId, edit, quiet = false) => {
      const s = get();
      const kb = s.workspace.modules.find((m) => m.id === keyboardId);
      if (!kb || (kb.type !== 'keyboard' && kb.type !== 'keypad')) return false;
      if (!s.runtime.modules[keyboardId]?.powered) {
        if (!quiet) s.notify(`${kb.name} has no power. Its keys are inactive.`, 'warn');
        return false;
      }
      const targets = s.workspace.connections.filter(
        (c) => c.type === 'keys' && c.from.moduleId === keyboardId && s.runtime.connections[c.id]?.active,
      );
      if (targets.length === 0) {
        if (!quiet) s.notify(`Link the ${kb.type} to a powered Text Block to type into it.`, 'warn');
        return false;
      }
      for (const c of targets) {
        const t = get().workspace.modules.find((m) => m.id === c.to.moduleId);
        if (t && t.type === 'text') get().setText(t.id, applyEdit(t.config.value, edit, MAX_TEXT_LENGTH));
      }
      return true;
    },

    setKeyDown: (moduleId, keyId, pressure) => {
      const key = `${moduleId}:${keyId}`;
      const cur = get().keysDown;
      if (pressure === null) {
        if (!(key in cur)) return;
        const next = { ...cur };
        delete next[key];
        set({ keysDown: next });
      } else if (cur[key] !== pressure) {
        set({ keysDown: { ...cur, [key]: pressure } });
      }
    },

    setMods: (moduleId, mods) => {
      const cur = get().kbMods[moduleId] ?? NO_MODS;
      const next = { ...cur, ...mods };
      if (next.shift === cur.shift && next.caps === cur.caps) return;
      set({ kbMods: { ...get().kbMods, [moduleId]: next } });
    },

    clearKeys: (moduleId) => {
      const cur = get().keysDown;
      const keys = Object.keys(cur).filter((k) => !moduleId || k.startsWith(`${moduleId}:`));
      if (keys.length === 0) return;
      const next = { ...cur };
      keys.forEach((k) => delete next[k]);
      set({ keysDown: next });
    },

    pressKey: (moduleId, keyId, pressure, repeat = false) => {
      const s = get();
      const kb = s.workspace.modules.find((m) => m.id === moduleId);
      const k = keyById(keyId);
      if (!kb || (kb.type !== 'keyboard' && kb.type !== 'keypad') || !k) return;
      s.setKeyDown(moduleId, keyId, pressure);
      if (!s.runtime.modules[moduleId]?.powered) {
        if (!repeat) s.notify(`${kb.name} has no power. Its keys are inactive.`, 'warn');
        return;
      }
      const mods = s.kbMods[moduleId] ?? NO_MODS;
      if (k.kind === 'shift') {
        if (!repeat) s.setMods(moduleId, { shift: !mods.shift });
        return;
      }
      if (k.kind === 'caps') {
        if (!repeat) s.setMods(moduleId, { caps: !mods.caps });
        return;
      }
      const edit = editFor(k, mods);
      if (!edit) return;
      get().typeEdit(moduleId, edit, repeat);
      // an on-screen Shift applies to one key only
      if (mods.shift) get().setMods(moduleId, { shift: false });
    },

    releaseKey: (moduleId, keyId) => get().setKeyDown(moduleId, keyId, null),

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
