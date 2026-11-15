import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/** Procedural micro-textures. Seeded so every session renders identically. */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable value noise heightmap in [0,1]. */
function heightField(size: number, seed: number, octaves: Array<{ cells: number; amp: number }>) {
  const rnd = mulberry32(seed);
  const field = new Float32Array(size * size);
  let total = 0;
  for (const { cells, amp } of octaves) {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    total += amp;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells;
        const gy = (y / size) * cells;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = gx - x0;
        const fy = gy - y0;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const g = (ix: number, iy: number) => grid[(iy % cells) * cells + (ix % cells)];
        const v =
          g(x0, y0) * (1 - sx) * (1 - sy) +
          g(x0 + 1, y0) * sx * (1 - sy) +
          g(x0, y0 + 1) * (1 - sx) * sy +
          g(x0 + 1, y0 + 1) * sx * sy;
        field[y * size + x] += v * amp;
      }
    }
  }
  for (let i = 0; i < field.length; i++) field[i] /= total;
  return field;
}

function finish(canvas: HTMLCanvasElement, srgb = false) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/** Roughness multiplier texture (G channel). `mean` ~ 0.9, small variation. */
export function makeRoughnessNoise(seed: number, mean = 0.92, variance = 0.12, size = 256) {
  const f = heightField(size, seed, [
    { cells: 64, amp: 1 },
    { cells: 16, amp: 0.5 },
    { cells: 4, amp: 0.25 },
  ]);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(0, Math.min(1, mean + (f[i] - 0.5) * 2 * variance));
    const b = Math.round(v * 255);
    img.data[i * 4] = b;
    img.data[i * 4 + 1] = b;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

/** Brushed-metal roughness: fine streaks that run along the U axis. */
export function makeBrushedRoughness(seed: number, size = 256) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e6e6e6';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const v = 200 + rnd() * 55;
    ctx.fillStyle = `rgba(${v},${v},${v},0.55)`;
    ctx.fillRect(0, y, size, 1);
  }
  // sparse longer streaks
  for (let i = 0; i < 260; i++) {
    const y = Math.floor(rnd() * size);
    const x = rnd() * size;
    const len = 20 + rnd() * 120;
    const v = 170 + rnd() * 85;
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.fillRect(x, y, len, 1);
    if (x + len > size) ctx.fillRect(x - size, y, len, 1);
  }
  return finish(c);
}

/** Normal map generated from a noise heightfield. */
export function makeNormalNoise(seed: number, strength = 2, size = 512) {
  const f = heightField(size, seed, [
    { cells: 128, amp: 1 },
    { cells: 48, amp: 0.7 },
    { cells: 12, amp: 0.35 },
  ]);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => f[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

/** LED dot-matrix mask: bright dot centres on a dimmer lattice. Returned as a plain canvas. */
export function makeDotMaskCanvas(size: number, cells: number, floor = 0.26): HTMLCanvasElement {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  const f = Math.round(floor * 255);
  ctx.fillStyle = `rgb(${f},${f},${f})`;
  ctx.fillRect(0, 0, size, size);
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const cx = (x + 0.5) * cell;
      const cy = (y + 0.5) * cell;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.5);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.55, '#fff');
      g.addColorStop(1, `rgb(${f},${f},${f})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

/** Albedo for the silicone LED pad: near-black with slightly lifted dome per LED. */
export function makeDotAlbedo(size: number, cells: number) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#060607';
  ctx.fillRect(0, 0, size, size);
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const cx = (x + 0.5) * cell;
      const cy = (y + 0.5) * cell;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.46);
      g.addColorStop(0, '#16171b');
      g.addColorStop(1, '#060607');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = finish(c, true);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Height map of the same lattice for subtle silicone relief. */
export function makeDotBump(size: number, cells: number) {
  const c = makeDotMaskCanvas(size, cells, 0);
  return finish(c);
}
