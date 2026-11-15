import { useEffect } from 'react';
import { resolvePlacement, GRID_STEP } from '@/interactions/placement';
import { Scene } from '@/scene/Scene';
import { startAutosave, useStore } from '@/state/store';
import { Hint, LinkHint, Toasts } from '@/ui/Feedback';
import { Inspector } from '@/ui/Inspector';
import { StatusPanel } from '@/ui/StatusPanel';
import { TopBar } from '@/ui/TopBar';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Global keyboard shortcuts. They never fire while the user types in a field. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const st = useStore.getState();
      const sel = st.workspace.modules.find((m) => m.id === st.selectedId);
      switch (e.key) {
        case 'Escape':
          st.select(null);
          break;
        case 'r':
        case 'R':
          if (sel) st.rotateModule(sel.id);
          break;
        case 'p':
        case 'P': {
          const p = st.workspace.modules.find((m) => m.type === 'power');
          if (p && p.type === 'power') st.setPower(p.id, !p.config.enabled);
          break;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!sel) return;
          e.preventDefault();
          const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
          const dz = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          const next = resolvePlacement(
            st.workspace,
            sel.id,
            { x: sel.position.x + dx * GRID_STEP, z: sel.position.z + dz * GRID_STEP },
            sel.position,
            { snap: st.snap },
          );
          st.moveModule(sel.id, next);
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useShortcuts();
  useEffect(() => startAutosave(), []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#6a6c70] select-none">
      <main className="absolute inset-0" aria-label="3D workspace">
        <Scene />
      </main>
      <TopBar />
      <StatusPanel />
      <Inspector />
      <Toasts />
      <LinkHint />
      <Hint />
    </div>
  );
}
