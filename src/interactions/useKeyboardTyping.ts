import { useEffect } from 'react';
import { TAB_TEXT, keyByCode, type KeyEdit } from '@/modules/keyboard';
import { useStore } from '@/state/store';

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** What a physical key press types. Uses the produced character, so every keyboard layout works. */
function editOf(e: KeyboardEvent): KeyEdit | null {
  if (e.key === 'Backspace') return { type: 'backspace' };
  if (e.key === 'Enter') return { type: 'insert', text: '\n' };
  if (e.key === 'Tab') return { type: 'insert', text: TAB_TEXT };
  if (Array.from(e.key).length === 1) return { type: 'insert', text: e.key };
  return null;
}

/**
 * Physical keyboard → Keyboard Block. While a powered Keyboard Block is selected, the real keyboard types
 * through it (into the linked Text Block) and the matching keys light up on its LED screen. The listener runs
 * in the capture phase so typed letters never trigger the global shortcuts (R, P, ...). Keys that do not
 * type (Escape, arrows, function keys) still reach the shortcuts.
 */
export function useKeyboardTyping() {
  useEffect(() => {
    const active = () => {
      const st = useStore.getState();
      const kb = st.workspace.modules.find((m) => m.id === st.selectedId);
      return kb && kb.type === 'keyboard' && st.runtime.modules[kb.id]?.powered ? kb : null;
    };

    const syncMods = (id: string, e: KeyboardEvent) =>
      useStore.getState().setMods(id, {
        shift: e.shiftKey,
        caps: e.getModifierState?.('CapsLock') ?? false,
      });

    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isField(e.target)) return;
      const kb = active();
      if (!kb) return;
      const st = useStore.getState();
      const isModifier = e.key === 'Shift' || e.key === 'CapsLock';
      const edit = editOf(e);
      if (!edit && !isModifier) return;

      const key = keyByCode(e.code);
      if (key) st.setKeyDown(kb.id, key.id, 0.8);
      syncMods(kb.id, e);
      if (edit) st.typeEdit(kb.id, edit, e.repeat);
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    const onUp = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const id = st.selectedId;
      const key = keyByCode(e.code);
      if (id && key) st.setKeyDown(id, key.id, null);
      if (id && st.workspace.modules.find((m) => m.id === id)?.type === 'keyboard') syncMods(id, e);
    };

    const release = () => useStore.getState().clearKeys();
    const unsub = useStore.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId) release();
    });

    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', release);
      unsub();
    };
  }, []);
}
