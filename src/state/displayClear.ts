import type { DisplayModule, Workspace } from '@/types';

/**
 * A Display Block's own clear button blanks its screen without touching the block that feeds it. That blank lasts
 * only while the feeding data stays as it was: the moment the source text changes (or a link to the display is
 * added, removed or replaced) the display shows live data again.
 */

/** Everything a display is fed with: its text links and the value each source currently holds. */
export function feedSignature(ws: Workspace, displayId: string): string {
  return ws.connections
    .filter((c) => c.type === 'text' && c.to.moduleId === displayId)
    .map((c) => {
      const src = ws.modules.find((m) => m.id === c.from.moduleId);
      const value = src && (src.type === 'text' || src.type === 'integer') ? src.config.value : '';
      return `${c.id}=${value}`;
    })
    .sort()
    .join('\u0000');
}

/**
 * Returns `next` with every display that was already cleared in `prev` un-cleared when its feed changed.
 * Returns the very same object when nothing needs to change.
 */
export function releaseClearedDisplays(prev: Workspace, next: Workspace): Workspace {
  let out = next;
  for (const m of next.modules) {
    if (m.type !== 'display' || !m.config.cleared) continue;
    const before = prev.modules.find((x) => x.id === m.id);
    if (!before || before.type !== 'display' || !before.config.cleared) continue;
    if (feedSignature(prev, m.id) === feedSignature(next, m.id)) continue;
    const { cleared: _drop, ...config } = m.config;
    void _drop;
    const released: DisplayModule = { ...m, config };
    out = { ...out, modules: out.modules.map((x) => (x.id === m.id ? released : x)) };
  }
  return out;
}
