import { beforeEach, describe, expect, it } from 'vitest';
import { outputKind } from '../src/connections/compat';
import { validateConnection } from '../src/connections/validate';
import { createModule } from '../src/modules/definitions';
import { drawDisplayScreen } from '../src/materials/screens';
import type { ConnectionRecord, ModuleRecord, Workspace } from '../src/types';

const mk = (type: Parameters<typeof createModule>[0], id: string): ModuleRecord => createModule(type, id, { x: 0, z: 0 });
const ref = (moduleId: string, portId: string) => ({ moduleId, portId });

/** Tries to link `from.data-out` to `to.<port>`; adds it to the workspace when compatible. */
function link(ws: Workspace, from: string, to: string, port = 'data-in') {
  const res = validateConnection(ws, ref(from, 'data-out'), ref(to, port));
  if (res.ok) ws.connections.push(res.connection as ConnectionRecord);
  return res;
}

let ws: Workspace;
beforeEach(() => {
  ws = {
    modules: [
      mk('text', 'txt'),
      mk('integer', 'int'),
      mk('integer', 'int2'),
      mk('text', 'txt2'),
      mk('adder', 'add'),
      mk('subtractor', 'sub'),
      mk('multiplier', 'mul'),
      mk('divisor', 'div'),
      mk('display', 'disp'),
      mk('keyboard', 'kb'),
    ],
    connections: [],
  };
});

describe('node compatibility', () => {
  it('lets every operator take Integer Blocks', () => {
    for (const op of ['add', 'sub', 'mul', 'div']) expect(link(ws, 'int', op).ok).toBe(true);
  });

  it('lets only the Adder and Multiplier take Text Blocks', () => {
    expect(link(ws, 'txt', 'add').ok).toBe(true);
    expect(link(ws, 'txt', 'mul').ok).toBe(true);
    const sub = link(ws, 'txt', 'sub');
    const div = link(ws, 'txt', 'div');
    expect(sub.ok).toBe(false);
    expect(div.ok).toBe(false);
    if (!sub.ok) {
      expect(sub.code).toBe('incompatible');
      expect(sub.message).toMatch(/integers only/);
    }
  });

  it('refuses text × text on a Multiplier but accepts text × integer', () => {
    expect(link(ws, 'txt', 'mul').ok).toBe(true);
    expect(link(ws, 'txt2', 'mul').ok).toBe(false);
    expect(link(ws, 'int', 'mul').ok).toBe(true);
  });

  it('takes two operands per operator and no more', () => {
    expect(link(ws, 'int', 'sub').ok).toBe(true);
    expect(link(ws, 'int2', 'sub').ok).toBe(true);
    const third = link(ws, 'int', 'sub');
    expect(third.ok).toBe(false);
  });

  it('follows the kind of data through Adder / Multiplier results', () => {
    expect(outputKind(ws, ws.modules.find((m) => m.id === 'add')!)).toBe('integer');
    link(ws, 'txt', 'add');
    expect(outputKind(ws, ws.modules.find((m) => m.id === 'add')!)).toBe('text');
    // the Adder now sends text, so the Subtractor (integers only) refuses it, the Multiplier accepts it
    expect(link(ws, 'add', 'sub').ok).toBe(false);
    expect(link(ws, 'add', 'mul').ok).toBe(true);
  });

  it('refuses a text link that would turn the result of an operator into text for an integers-only consumer', () => {
    expect(link(ws, 'int', 'add').ok).toBe(true);
    expect(link(ws, 'add', 'sub').ok).toBe(true);
    expect(link(ws, 'txt', 'add').ok).toBe(false);
  });

  it('refuses loops between operators', () => {
    expect(link(ws, 'add', 'mul').ok).toBe(true);
    const back = link(ws, 'mul', 'add');
    expect(back.ok).toBe(false);
  });

  it('lets a Display show text, integers and operator results', () => {
    expect(link(ws, 'txt', 'disp').ok).toBe(true);
    ws.connections = [];
    expect(link(ws, 'int', 'disp').ok).toBe(true);
    ws.connections = [];
    expect(link(ws, 'sub', 'disp').ok).toBe(true);
  });

  it('keeps text and integer blocks from taking data, and keyboards out of operators', () => {
    expect(link(ws, 'int', 'txt').ok).toBe(false);
    const kb = validateConnection(ws, ref('kb', 'key-out'), ref('add', 'key-in'));
    expect(kb.ok).toBe(false);
    if (!kb.ok) expect(kb.code).toBe('missing-port');
    expect(validateConnection(ws, ref('kb', 'key-out'), ref('txt', 'key-in')).ok).toBe(true);
  });
});

describe('display idle state', () => {
  it('paints a faint "Idle" for every powered state without content', () => {
    for (const kind of ['no-source', 'source-off', 'empty', 'cleared'] as const) {
      const words: string[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (t, k) => (k === 'fillText' ? (w: string) => words.push(w) : k in t ? t[k as string] : () => ({ addColorStop() {} })),
        set: (t, k, v) => ((t[k as string] = v), true),
      }) as unknown as CanvasRenderingContext2D;
      // getDotMask needs a DOM canvas; the idle word is drawn before it, so a failure there is irrelevant
      try {
        drawDisplayScreen(ctx, { kind } as never, 'center');
      } catch {
        /* no DOM in the test environment */
      }
      expect(words).toEqual(['Idle']);
    }
  });
});
