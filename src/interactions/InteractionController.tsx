import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { validateConnection } from '@/connections/validate';
import {
  PRESSURE_PROFILES,
  actuates,
  effectivePressure,
  keyAtUv,
  keyById,
  repeatInterval,
} from '@/modules/keyboard';
import { useStore } from '@/state/store';
import type { PortRef } from '@/types';
import { resolvePlacement } from './placement';

type Pick =
  | { kind: 'module'; moduleId: string }
  | { kind: 'port'; moduleId: string; portId: string }
  | { kind: 'button'; moduleId: string; action: string }
  | { kind: 'keys'; moduleId: string; uv?: { u: number; v: number } }
  /** A screen / LED panel set into a block. Pressing it never selects the block (only the casing does). */
  | { kind: 'screen'; moduleId: string };

type DragState =
  | { kind: 'empty'; x: number; y: number; moved: boolean }
  | { kind: 'module'; id: string; offX: number; offZ: number; x: number; y: number; moved: boolean }
  | { kind: 'port'; from: PortRef; x: number; y: number; moved: boolean }
  | { kind: 'button'; moduleId: string; action: string }
  | {
      kind: 'keys';
      moduleId: string;
      keyId: string;
      pointerType: string;
      pressure: number;
      actuated: boolean;
      timer: number;
    };

const THRESHOLD = 4;
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Pointer interaction layer. Picking is done with an explicit raycast against the module group, in the
 * capture phase, so that a press on hardware never reaches the orbit controls (no accidental camera
 * movement), while a press on empty ground orbits as usual. Drags use window listeners and are
 * cancelled on pointercancel / blur, so nothing can get stuck.
 */
export function InteractionController() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const canvas = gl.domElement;
    const root = canvas.parentElement ?? canvas;
    const raycaster = new Raycaster();
    raycaster.camera = camera;
    const ndc = new Vector2();
    const hitPoint = new Vector3();
    let drag: DragState | null = null;
    let hoverFrame = 0;
    let lastMove: PointerEvent | null = null;

    const setNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
    };

    const pickAt = (e: PointerEvent): Pick | null => {
      const pickRoot = scene.getObjectByName('pickRoot');
      if (!pickRoot) return null;
      setNdc(e);
      const hits = raycaster.intersectObject(pickRoot, true);
      for (const h of hits) {
        let o: Object3D | null = h.object;
        while (o) {
          const p = o.userData?.pick as Pick | undefined;
          if (p) return p.kind === 'keys' && h.uv ? { ...p, uv: { u: h.uv.x, v: h.uv.y } } : p;
          o = o.parent;
        }
      }
      return null;
    };

    const groundAt = (e: PointerEvent): { x: number; z: number } | null => {
      setNdc(e);
      return raycaster.ray.intersectPlane(GROUND, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null;
    };

    const moved = (d: { x: number; y: number }, e: PointerEvent) =>
      Math.hypot(e.clientX - d.x, e.clientY - d.y) > THRESHOLD;

    const setCursor = (c: string) => {
      root.style.cursor = c;
    };

    const endDrag = () => {
      const st = useStore.getState();
      if (drag?.kind === 'keys') {
        window.clearTimeout(drag.timer);
        st.releaseKey(drag.moduleId, drag.keyId);
      }
      st.setPressed(null);
      st.setLinkDrag(null);
      st.setDraggingId(null);
      drag = null;
      setCursor('');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
    };

    const onCancel = () => endDrag();

    /** Actuates a key once the contact is firm enough, then repeats it while it stays pressed (harder = faster). */
    const fireKey = (d: Extract<DragState, { kind: 'keys' }>) => {
      const st = useStore.getState();
      const kb = st.workspace.modules.find((m) => m.id === d.moduleId);
      if (!kb || kb.type !== 'keyboard' || d.actuated) return;
      if (!actuates(d.pressure, kb.config.pressure)) return;
      d.actuated = true;
      st.pressKey(d.moduleId, d.keyId, d.pressure);
      const key = keyById(d.keyId);
      if (!key || key.kind === 'shift' || key.kind === 'caps') return;
      const profile = PRESSURE_PROFILES[kb.config.pressure];
      const tick = () => {
        if (drag !== d) return;
        const s2 = useStore.getState();
        s2.pressKey(d.moduleId, d.keyId, d.pressure, true);
        d.timer = window.setTimeout(tick, repeatInterval(d.pressure, kb.config.pressure));
      };
      d.timer = window.setTimeout(tick, profile.repeatDelay);
    };

    const onMove = (e: PointerEvent) => {
      const st = useStore.getState();
      if (!drag) return;
      if (drag.kind === 'empty') {
        if (moved(drag, e)) drag.moved = true;
      } else if (drag.kind === 'module') {
        if (!drag.moved && !moved(drag, e)) return;
        drag.moved = true;
        st.setDraggingId(drag.id);
        setCursor('grabbing');
        const g = groundAt(e);
        const modId = drag.id;
        const cur = st.workspace.modules.find((m) => m.id === modId);
        if (!g || !cur) return;
        const next = resolvePlacement(
          st.workspace,
          modId,
          { x: g.x + drag.offX, z: g.z + drag.offZ },
          cur.position,
          { snap: st.snap },
        );
        st.moveModule(modId, next);
      } else if (drag.kind === 'port') {
        if (!drag.moved && !moved(drag, e)) return;
        drag.moved = true;
        setCursor('crosshair');
        const g = groundAt(e) ?? st.linkDrag?.pointer ?? { x: 0, z: 0 };
        const pk = pickAt(e);
        const target: PortRef | null =
          pk && pk.kind === 'port' && !(pk.moduleId === drag.from.moduleId && pk.portId === drag.from.portId)
            ? { moduleId: pk.moduleId, portId: pk.portId }
            : null;
        st.setLinkDrag({
          from: drag.from,
          pointer: g,
          target,
          verdict: target ? validateConnection(st.workspace, drag.from, target) : null,
        });
      } else if (drag.kind === 'keys') {
        drag.pressure = effectivePressure(drag.pointerType, e.pressure);
        if (!drag.actuated) fireKey(drag);
        else st.setKeyDown(drag.moduleId, drag.keyId, drag.pressure);
      } else if (drag.kind === 'button') {
        const pk = pickAt(e);
        const same = pk?.kind === 'button' && pk.moduleId === drag.moduleId && pk.action === drag.action;
        st.setPressed(same ? `${drag.moduleId}:${drag.action}` : null);
      }
    };

    const onUp = (e: PointerEvent) => {
      const st = useStore.getState();
      const d = drag;
      if (!d) return endDrag();
      if (d.kind === 'empty') {
        if (!d.moved && !moved(d, e)) st.select(null);
      } else if (d.kind === 'port') {
        const ld = st.linkDrag;
        if (!d.moved) {
          const links = st.workspace.connections.filter(
            (c) =>
              (c.from.moduleId === d.from.moduleId && c.from.portId === d.from.portId) ||
              (c.to.moduleId === d.from.moduleId && c.to.portId === d.from.portId),
          );
          if (links.length === 0) {
            st.notify('Drag from this connector to another connector to link them.', 'info');
          } else {
            links.forEach((c) => st.disconnect(c.id));
          }
        } else if (ld?.target) {
          st.connect(d.from, ld.target);
        }
      } else if (d.kind === 'button') {
        const pk = pickAt(e);
        if (pk?.kind === 'button' && pk.moduleId === d.moduleId && pk.action === d.action) {
          st.pressButton(d.moduleId, d.action);
        }
      }
      endDrag();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      if (drag) endDrag();
      const st = useStore.getState();
      let pk = pickAt(e);
      let key = null as ReturnType<typeof keyAtUv>;
      if (pk?.kind === 'keys') {
        // keys only react on a powered keyboard; the gaps between them (or an unpowered screen) are inert
        key = pk.uv && st.runtime.modules[pk.moduleId]?.powered ? keyAtUv(pk.uv.u, pk.uv.v) : null;
        if (!key) pk = { kind: 'screen', moduleId: pk.moduleId };
      }
      if (!pk) {
        drag = { kind: 'empty', x: e.clientX, y: e.clientY, moved: false };
      } else {
        // Hardware was hit: keep the press away from the orbit controls.
        e.stopPropagation();
        e.preventDefault();
        if (pk.kind === 'keys' && key) {
          // typing on the LED screen never selects the block or opens its panel
          drag = {
            kind: 'keys',
            moduleId: pk.moduleId,
            keyId: key.id,
            pointerType: e.pointerType,
            pressure: effectivePressure(e.pointerType, e.pressure),
            actuated: false,
            timer: 0,
          };
          fireKey(drag);
        } else if (pk.kind === 'module' || pk.kind === 'screen') {
          // only the casing selects; a press on a screen leaves the selection untouched (it can still drag the block)
          if (pk.kind === 'module') st.select(pk.moduleId);
          const g = groundAt(e);
          const m = st.workspace.modules.find((x) => x.id === pk.moduleId);
          if (!g || !m) return;
          drag = {
            kind: 'module',
            id: pk.moduleId,
            offX: m.position.x - g.x,
            offZ: m.position.z - g.z,
            x: e.clientX,
            y: e.clientY,
            moved: false,
          };
        } else if (pk.kind === 'port') {
          drag = {
            kind: 'port',
            from: { moduleId: pk.moduleId, portId: pk.portId },
            x: e.clientX,
            y: e.clientY,
            moved: false,
          };
        } else if (pk.kind === 'button') {
          drag = { kind: 'button', moduleId: pk.moduleId, action: pk.action };
          st.setPressed(`${pk.moduleId}:${pk.action}`);
        }
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('blur', onCancel);
    };

    // hover feedback (cursor + hover state), throttled to one raycast per frame
    const onHover = (e: PointerEvent) => {
      if (drag) return;
      lastMove = e;
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!lastMove || drag) return;
        const pk = pickAt(lastMove);
        const st = useStore.getState();
        if (!pk) {
          st.setHover(null);
          setCursor('');
        } else if (pk.kind === 'button') {
          st.setHover({ kind: 'button', moduleId: pk.moduleId, id: pk.action });
          setCursor('pointer');
        } else if (pk.kind === 'keys' || pk.kind === 'screen') {
          // screens are not part of the selectable casing: no block hover highlight
          st.setHover(null);
          const over =
            pk.kind === 'keys' && pk.uv && st.runtime.modules[pk.moduleId]?.powered
              ? keyAtUv(pk.uv.u, pk.uv.v)
              : null;
          setCursor(over ? 'pointer' : 'default');
        } else if (pk.kind === 'port') {
          st.setHover({ kind: 'port', moduleId: pk.moduleId, id: pk.portId });
          setCursor('crosshair');
        } else {
          st.setHover({ kind: 'module', moduleId: pk.moduleId });
          setCursor('grab');
        }
      });
    };
    const onLeave = () => {
      if (!drag) {
        useStore.getState().setHover(null);
        setCursor('');
      }
    };

    root.addEventListener('pointerdown', onDown, { capture: true });
    root.addEventListener('pointermove', onHover);
    root.addEventListener('pointerleave', onLeave);
    return () => {
      root.removeEventListener('pointerdown', onDown, { capture: true });
      root.removeEventListener('pointermove', onHover);
      root.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(hoverFrame);
      if (drag) endDrag();
      setCursor('');
    };
  }, [gl, camera, scene]);

  return null;
}
