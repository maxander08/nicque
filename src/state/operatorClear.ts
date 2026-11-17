import type { RuntimeState, Workspace } from '@/types';

/**
 * An operator block's own clear button blanks the result it stores without touching the Integer / Text Blocks that
 * feed it. That blank lasts only while the result it would compute stays as it was: the moment an operand changes
 * (a value, a link, an upstream operator) the operator computes live again.
 *
 * `prev` is the runtime of the workspace before the change, `next` the runtime of the changed workspace. Returns
 * `ws` itself when no operator needs to be released.
 */
export function releaseClearedOperators(ws: Workspace, prev: RuntimeState, next: RuntimeState): Workspace {
  let out = ws;
  for (const m of ws.modules) {
    if (!('cleared' in m.config) || m.config.cleared !== true) continue;
    const before = prev.modules[m.id]?.liveResult;
    const after = next.modules[m.id]?.liveResult;
    // a result that is momentarily unavailable (e.g. power off) does not release the clear
    if (after === undefined || before === after) continue;
    out = { ...out, modules: out.modules.map((x) => (x.id === m.id ? ({ ...x, config: {} } as typeof x) : x)) };
  }
  return out;
}
