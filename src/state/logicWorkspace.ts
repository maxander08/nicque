import { useRef, useSyncExternalStore } from 'react';
import type { Workspace } from '@/types';
import { useStore } from './store';

/** True when two workspaces differ at most in module placement (position / rotation). */
function sameLogic(a: Workspace, b: Workspace): boolean {
  if (a === b) return true;
  if (a.connections !== b.connections || a.modules.length !== b.modules.length) return false;
  for (let i = 0; i < a.modules.length; i++) {
    const x = a.modules[i];
    const y = b.modules[i];
    if (x !== y && (x.id !== y.id || x.type !== y.type || x.name !== y.name || x.config !== y.config || x.switchedOff !== y.switchedOff)) return false;
  }
  return true;
}

/**
 * The workspace as seen by the DOM panels. Dragging a block only changes placement, which no panel displays,
 * so the reference stays stable (no React re-render, no `missingLinks` recomputation) until the logic changes.
 */
export function useLogicWorkspace(): Workspace {
  const ref = useRef<Workspace | null>(null);
  const get = () => {
    const ws = useStore.getState().workspace;
    if (!ref.current || !sameLogic(ref.current, ws)) ref.current = ws;
    return ref.current;
  };
  return useSyncExternalStore(useStore.subscribe, get, get);
}
