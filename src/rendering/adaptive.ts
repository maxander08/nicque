/**
 * Adaptive render resolution.
 *
 * While the scene is being redrawn continuously (dragging, orbiting, animations) the frame times are watched. When
 * the device cannot keep up with its own display refresh rate, the render resolution is lowered one small step at a
 * time (never below `floor`); when there is plenty of headroom it is raised again. A device that renders fast
 * always stays at full resolution, so nothing changes on capable hardware, while slow GPUs and phones get smooth
 * interaction at a slightly softer image instead of a slideshow.
 */
const STEPS = [1, 0.88, 0.76, 0.66, 0.56, 0.5];
const WINDOW = 20;

let idx = 0;
let maxIdx = 3;
const listeners = new Set<() => void>();

let samples: number[] = [];
let gaps: number[] = [];
let lastChange = 0;
let holdUp = 0;
let backoff = 4000;
let lastDown = 0;

export const getRenderScale = () => STEPS[idx];

export function subscribeRenderScale(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setIndex(next: number, now: number) {
  if (next === idx) return;
  idx = next;
  lastChange = now;
  samples = [];
  listeners.forEach((l) => l());
}

/** Forget what was learned (quality mode changed, or a new canvas was created). */
export function resetRenderScale(maxStep = 3) {
  maxIdx = Math.min(maxStep, STEPS.length - 1);
  samples = [];
  gaps = [];
  holdUp = 0;
  backoff = 4000;
  lastDown = 0;
  setIndex(0, performance.now());
}

/**
 * Reports the time between two consecutive frames of a continuous run (never an idle gap).
 */
export function reportFrameGap(gapMs: number, now: number) {
  const gap = Math.min(gapMs, 250);
  gaps.push(gap);
  if (gaps.length > 180) gaps.shift();
  samples.push(gap);
  if (samples.length < WINDOW) return;
  if (samples.length > WINDOW) samples.shift();

  // The display's own refresh interval: the fastest frames seen (a 60 Hz screen never goes below ~16.6 ms).
  const refresh = Math.max(6, Math.min(...gaps));
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (now - lastChange < 600) return;

  if (avg > refresh * 1.3 && avg > 12 && idx < maxIdx) {
    // missing the display refresh: lower the resolution. If we just came back up, remember to stay down longer.
    if (now - lastDown < 8000) backoff = Math.min(backoff * 2, 60000);
    lastDown = now;
    holdUp = now + backoff;
    setIndex(idx + 1, now);
  } else if (avg < refresh * 1.1 && idx > 0 && now > holdUp) {
    setIndex(idx - 1, now);
    holdUp = now + 2500;
  }
}
