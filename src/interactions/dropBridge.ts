import type { ModuleType, Vec2 } from '@/types';

/**
 * Tiny bridge between the DOM block library and the 3D canvas while a block is dragged out of the library:
 *  - the canvas registers a function that turns a screen position into a point on the ground plane;
 *  - the library publishes the block being dragged and where it is hovering, which the canvas draws as a preview.
 */

export interface DropPreview {
  type: ModuleType;
  at: Vec2;
}

type GroundPicker = (clientX: number, clientY: number) => Vec2 | null;

let picker: GroundPicker | null = null;
let preview: DropPreview | null = null;
const listeners = new Set<() => void>();

export function registerGroundPicker(fn: GroundPicker | null) {
  picker = fn;
}

export const groundPointFromClient = (x: number, y: number): Vec2 | null => picker?.(x, y) ?? null;

export const getDropPreview = () => preview;

export function setDropPreview(next: DropPreview | null) {
  if (next === preview) return;
  preview = next;
  listeners.forEach((l) => l());
}

export function subscribeDropPreview(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
