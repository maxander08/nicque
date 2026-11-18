import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { yawOf } from '@/modules/spatial';
import type { ModuleRecord } from '@/types';

/**
 * Custom ray-marched contact shadows + ambient occlusion for the ground plane.
 *
 * The module housings are described to the ground shader as oriented rounded boxes (signed distance
 * functions) stored in a small float data texture (so the number of blocks is not limited by uniform space).
 * For each ground fragment we
 *   1. keep only the boxes that can possibly affect the fragment (exact, Lipschitz-based culling);
 *   2. sphere-trace a ray towards the key light through that distance field → soft, physically shaped
 *      penumbra that sharpens near contact points;
 *   3. sample the field above the fragment → analytic ambient occlusion where blocks meet the ground.
 *
 * Cables and plugs are not part of the distance field (they would be far too many primitives for a per-pixel
 * march). Their shadow and contact occlusion is baked into a small 2D map by `cableShadow.ts` whenever a cable
 * changes, and the ground shader reads it with a single texture fetch. Both paths are used in every quality mode.
 *
 * This is software ray marching inside a fragment shader (not hardware ray tracing).
 */

/** Blocks the ground shader can shadow. One block takes two texels of the data texture. */
export const MAX_BOXES = 256;

/** Housing footprint corner radius (mirrors `CORNER_RADIUS` in scene/parts/Housing.tsx). */
const HOUSING_CORNER = 0.17;
/** Rounding of the housing's top edge (the cover's top bevel is 0.03). */
const HOUSING_EDGE = 0.03;
/** Most nearby boxes a single fragment keeps after culling. */
const MAX_CANDIDATES = 16;

export interface GroundOcclusionUniforms {
  [key: string]: IUniform;
  uNqBoxTex: { value: Texture };
  uNqCount: { value: number };
  uNqLightDir: { value: Vector3 };
  uNqHeight: { value: number };
  uNqStrength: { value: number };
  uNqCableTex: { value: Texture };
  /** x, z of the map's origin and 1 / width, 1 / depth of the area it covers (world units). */
  uNqCableRect: { value: Vector4 };
  uNqCableOn: { value: number };
  /** The baked ray-marched occlusion of the blocks: R = light visibility, G = ambient occlusion. */
  uNqOccTex: { value: Texture };
  /** x, z of the baked map's origin and 1 / width, 1 / depth of the area it covers (world units). */
  uNqOccRect: { value: Vector4 };
  uNqOccOn: { value: number };
}

/** A 1 x 1 "no shadow" map: R = visibility, G = ambient occlusion. */
function blankCableMap(): DataTexture {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export function createGroundOcclusionUniforms(lightDir: Vector3): GroundOcclusionUniforms {
  const boxes = new DataTexture(new Float32Array(MAX_BOXES * 2 * 4), MAX_BOXES * 2, 1, RGBAFormat, FloatType);
  boxes.minFilter = NearestFilter;
  boxes.magFilter = NearestFilter;
  boxes.generateMipmaps = false;
  boxes.needsUpdate = true;
  return {
    uNqBoxTex: { value: boxes },
    uNqCount: { value: 0 },
    uNqLightDir: { value: lightDir.clone().normalize() },
    uNqHeight: { value: BLOCK_HEIGHT },
    uNqStrength: { value: 1 },
    uNqCableTex: { value: blankCableMap() },
    uNqCableRect: { value: new Vector4(0, 0, 1, 1) },
    uNqCableOn: { value: 0 },
    uNqOccTex: { value: blankCableMap() },
    uNqOccRect: { value: new Vector4(0, 0, 1, 1) },
    uNqOccOn: { value: 0 },
  };
}

export function updateGroundOcclusionUniforms(u: GroundOcclusionUniforms, modules: ModuleRecord[]) {
  const tex = u.uNqBoxTex.value as DataTexture;
  const data = tex.image.data as Float32Array;
  const n = Math.min(modules.length, MAX_BOXES);
  for (let i = 0; i < n; i++) {
    const m = modules[i];
    const def = MODULE_DEFINITIONS[m.type];
    const yaw = yawOf(m.rotation);
    const o = i * 8;
    data[o] = m.position.x;
    data[o + 1] = m.position.z;
    data[o + 2] = def.width / 2;
    data[o + 3] = def.depth / 2;
    data[o + 4] = Math.cos(yaw);
    data[o + 5] = Math.sin(yaw);
  }
  u.uNqCount.value = n;
  tex.needsUpdate = true;
}

export function disposeGroundOcclusionUniforms(u: GroundOcclusionUniforms) {
  u.uNqBoxTex.value.dispose();
  u.uNqCableTex.value.dispose();
  u.uNqOccTex.value.dispose();
}

const SDF_GLSL = /* glsl */ `
uniform highp sampler2D uNqBoxTex;
uniform int uNqCount;
uniform vec3 uNqLightDir;
uniform float uNqHeight;

#define NQ_CAND ${MAX_CANDIDATES}
#define NQ_CORNER ${HOUSING_CORNER.toFixed(4)}
#define NQ_EDGE ${HOUSING_EDGE.toFixed(4)}

int nqIdx[NQ_CAND];
int nqN = 0;

vec4 nqBoxA(int i) { return texelFetch(uNqBoxTex, ivec2(i * 2, 0), 0); }
vec2 nqBoxB(int i) { return texelFetch(uNqBoxTex, ivec2(i * 2 + 1, 0), 0).xy; }

// Housing: rounded-rectangle footprint (the real corner radius) extruded to the block height with a rounded top edge.
float nqBoxD(int i, vec3 p) {
  vec4 a = nqBoxA(i);
  vec2 cs = nqBoxB(i);
  vec2 q = p.xz - a.xy;
  // world -> module local (inverse of rotation about Y)
  vec2 l = vec2(q.x * cs.x - q.y * cs.y, q.x * cs.y + q.y * cs.x);
  vec2 e = abs(l) - a.zw + NQ_CORNER;
  float d2 = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - NQ_CORNER;
  float dy = abs(p.y - uNqHeight * 0.5) - uNqHeight * 0.5;
  vec2 w = vec2(d2 + NQ_EDGE, dy + NQ_EDGE);
  return length(max(w, 0.0)) + min(max(w.x, w.y), 0.0) - NQ_EDGE;
}

float nqMap(vec3 p) {
  float d = 1e5;
  for (int k = 0; k < NQ_CAND; k++) {
    if (k >= nqN) break;
    d = min(d, nqBoxD(nqIdx[k], p));
  }
  return d;
}

float nqSoftShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  for (int i = 0; i < 30; i++) {
    float h = nqMap(ro + rd * t);
    res = min(res, 6.5 * h / t);
    t += clamp(h, 0.03, 0.5);
    if (res < 0.004 || t > 9.0) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

float nqAO(vec3 p) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 6; i++) {
    float h = 0.012 + 0.3 * float(i) / 5.0;
    float d = nqMap(p + vec3(0.0, h, 0.0));
    occ += (h - d) * sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 1.9 * occ, 0.0, 1.0);
}

// Exact evaluation of the ray-marched shadow (x) and ambient occlusion (y) of all blocks at a ground point.
vec2 nqEvaluate(vec2 xz) {
  vec3 nqP = vec3(xz.x, 0.0, xz.y);
  vec3 nqL = normalize(uNqLightDir);
  // Exact culling: a box can only matter to this point when its distance d0 from it is below nqCut.
  //  - AO samples at most 0.312 above the ground; the field is 1-Lipschitz, so d0 >= 0.65 gives occ <= 0.
  //  - The penumbra term only drops below 1 if the ray comes within t/6.5 of a box; boxes are <= uNqHeight
  //    tall, which bounds t and therefore the ground distance d0 at which any occlusion can occur.
  float nqSlope = nqL.y - 1.0 / 6.5;
  float nqCut = nqSlope > 0.05 ? max(0.65, uNqHeight / nqSlope * (1.0 + 1.0 / 6.5) * 1.05) : 1e9;
  nqN = 0;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uNqCount) break;
    vec4 nqBA = nqBoxA(i);
    vec2 nqQ = nqP.xz - nqBA.xy;
    float nqReach = length(nqBA.zw) + nqCut;
    if (dot(nqQ, nqQ) > nqReach * nqReach) continue;
    if (nqBoxD(i, nqP) < nqCut) {
      nqIdx[nqN] = i;
      nqN++;
      if (nqN >= NQ_CAND) break;
    }
  }
  float nqS = 1.0;
  float nqA = 1.0;
  if (nqN > 0) {
    nqS = nqSoftShadow(nqP, nqL);
    nqA = nqAO(nqP);
  }
  return vec2(nqS, nqA);
}
`;

const GROUND_GLSL = /* glsl */ `
uniform float uNqStrength;
uniform highp sampler2D uNqCableTex;
uniform vec4 uNqCableRect;
uniform float uNqCableOn;
uniform sampler2D uNqOccTex;
uniform vec4 uNqOccRect;
uniform float uNqOccOn;
varying vec3 vNqWP;

// Baked block shadow (x) and occlusion (y) at a ground point; (1, 1) outside the baked area.
vec2 nqBlocks(vec2 xz) {
  if (uNqOccOn < 0.5) return vec2(1.0);
  vec2 uv = (xz - uNqOccRect.xy) * uNqOccRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(1.0);
  return texture2D(uNqOccTex, uv).xy;
}

// Baked cable + plug shadow (x) and contact occlusion (y) at a ground point; (1, 1) outside the baked area.
vec2 nqCable(vec2 xz) {
  if (uNqCableOn < 0.5) return vec2(1.0);
  vec2 uv = (xz - uNqCableRect.xy) * uNqCableRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(1.0);
  return texture2D(uNqCableTex, uv).xy;
}
`;

/** Patches a MeshStandardMaterial shader so the ground receives the ray-marched occlusion. */
export function patchGroundShader(shader: WebGLProgramParametersWithUniforms, u: GroundOcclusionUniforms) {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vNqWP;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvNqWP = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GROUND_GLSL}`)
    .replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      {
        vec3 nqP = vec3(vNqWP.x, 0.0, vNqWP.z);
        vec2 nqB = nqBlocks(nqP.xz);
        float nqS = nqB.x;
        float nqA = nqB.y;
        vec2 nqC = nqCable(nqP.xz);
        nqS = min(nqS, nqC.x);
        nqA *= nqC.y;
        outgoingLight *= mix(1.0, mix(0.5, 1.0, nqS) * nqA, uNqStrength);
      }
      #include <opaque_fragment>`,
    );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Baking                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

/**
 * The key light never moves and the blocks only change when the user moves, adds or removes one, so the ray-marched
 * shadow and ambient occlusion of the blocks is a static picture of the table. It is rendered once into a small
 * texture (a GPU pass over only the region that changed) and the ground shader reads it with a single bilinear
 * fetch per pixel. Orbiting, zooming and every other frame therefore no longer pay for the ray march at all, and
 * its cost no longer depends on the screen resolution.
 */

/** World size of one baked texel: 2.5 cm, finer than the ray-marched penumbra needs (about 3 px at the default view). */
const BASE_TEXEL = 0.025;
const BAKE_SIZES = [256, 512, 1024];
/** Room around the blocks the baked map must cover (the exact culling distance used by the shader plus a margin). */
const BAKE_MARGIN = 0.85;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec4 uBakeRect;
${SDF_GLSL}
void main() {
  vec2 xz = uBakeRect.xy + vUv * uBakeRect.zw;
  vec2 r = nqEvaluate(xz);
  gl_FragColor = vec4(r, 0.0, 1.0);
}`;

interface ModSig {
  x: number;
  z: number;
  r: number;
  t: string;
}

interface Region {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface GroundBaker {
  /** Re-renders what changed. `interactive` caps the resolution while a block is being dragged. */
  update(gl: WebGLRenderer, modules: ModuleRecord[], interactive: boolean): void;
  dispose(): void;
}

const bounds = (m: ModSig | ModuleRecord, type?: string): Region => {
  const x = 'position' in m ? m.position.x : m.x;
  const z = 'position' in m ? m.position.z : m.z;
  const def = MODULE_DEFINITIONS[(type ?? (m as ModuleRecord).type) as ModuleRecord['type']];
  const r = Math.hypot(def.width, def.depth) / 2 + BAKE_MARGIN;
  return { minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r };
};

export function createGroundBaker(u: GroundOcclusionUniforms): GroundBaker {
  const material = new ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    uniforms: {
      uBakeRect: { value: new Vector4() },
      uNqBoxTex: u.uNqBoxTex,
      uNqCount: u.uNqCount,
      uNqLightDir: u.uNqLightDir,
      uNqHeight: u.uNqHeight,
    },
    depthTest: false,
    depthWrite: false,
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let rt: WebGLRenderTarget | null = null;
  let size = 0;
  let texel = BASE_TEXEL;
  let originX = 0;
  let originZ = 0;
  let prev: Map<string, ModSig> = new Map();

  const ensureTarget = (gl: WebGLRenderer, n: number) => {
    if (rt && size === n) return;
    rt?.dispose();
    const half = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
    rt = new WebGLRenderTarget(n, n, {
      type: half ? HalfFloatType : UnsignedByteType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    size = n;
    u.uNqOccTex.value = rt.texture;
  };

  const draw = (gl: WebGLRenderer, area: Region | null) => {
    if (!rt) return;
    const t = rt;
    const prevTarget = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    const prevShadow = gl.shadowMap.autoUpdate;
    (material.uniforms.uBakeRect.value as Vector4).set(originX, originZ, size * texel, size * texel);
    if (area) {
      const x0 = Math.max(0, Math.floor((area.minX - originX) / texel));
      const y0 = Math.max(0, Math.floor((area.minZ - originZ) / texel));
      const x1 = Math.min(size, Math.ceil((area.maxX - originX) / texel));
      const y1 = Math.min(size, Math.ceil((area.maxZ - originZ) / texel));
      if (x1 <= x0 || y1 <= y0) return;
      t.scissor.set(x0, y0, x1 - x0, y1 - y0);
      t.scissorTest = true;
    } else {
      t.scissorTest = false;
    }
    gl.autoClear = false;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(t);
    gl.render(scene, cam);
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAuto;
    gl.shadowMap.autoUpdate = prevShadow;
  };

  return {
    update(gl, modules, interactive) {
      const next = new Map<string, ModSig>();
      for (const m of modules) next.set(m.id, { x: m.position.x, z: m.position.z, r: m.rotation, t: m.type });
      if (modules.length === 0) {
        u.uNqOccOn.value = 0;
        prev = next;
        return;
      }

      // everything the blocks can shadow (their footprints plus the culling distance)
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const m of modules) {
        const b = bounds(m);
        minX = Math.min(minX, b.minX);
        minZ = Math.min(minZ, b.minZ);
        maxX = Math.max(maxX, b.maxX);
        maxZ = Math.max(maxZ, b.maxZ);
      }
      const extent = Math.max(maxX - minX, maxZ - minZ);

      // texel size: fixed at 2.5 cm while the table fits in the biggest map, then doubled as often as needed;
      // a drag caps the map at 512 so that a large workspace still re-bakes in a fraction of a frame
      const maxSize = interactive ? BAKE_SIZES[1] : BAKE_SIZES[2];
      let nextTexel = BASE_TEXEL;
      while (extent > maxSize * nextTexel) nextTexel *= 2;

      // keep the grid where it is while it still covers the table (no shimmer, and a dirty-region update is valid)
      const covers =
        rt &&
        texel <= nextTexel * 1.001 &&
        minX >= originX &&
        minZ >= originZ &&
        maxX <= originX + size * texel &&
        maxZ <= originZ + size * texel;
      if (covers) {
        const dirty: Region[] = [];
        for (const [id, sig] of next) {
          const old = prev.get(id);
          if (!old || old.x !== sig.x || old.z !== sig.z || old.r !== sig.r || old.t !== sig.t) {
            dirty.push(bounds(sig, sig.t));
            if (old) dirty.push(bounds(old, old.t));
          }
        }
        for (const [id, old] of prev) if (!next.has(id)) dirty.push(bounds(old, old.t));
        prev = next;
        if (dirty.length === 0) return;
        const area = dirty.reduce((a, b) => ({
          minX: Math.min(a.minX, b.minX),
          minZ: Math.min(a.minZ, b.minZ),
          maxX: Math.max(a.maxX, b.maxX),
          maxZ: Math.max(a.maxZ, b.maxZ),
        }));
        draw(gl, area);
        return;
      }

      // new grid: snapped to whole texels so it never drifts relative to the world
      texel = nextTexel;
      let n = 0;
      for (;;) {
        const pad = texel * 4;
        originX = Math.floor((minX - pad) / texel) * texel;
        originZ = Math.floor((minZ - pad) / texel) * texel;
        const need = Math.max(maxX - originX, maxZ - originZ) + pad;
        n = BAKE_SIZES.find((s) => s * texel >= need) ?? 0;
        if (n) break;
        texel *= 2;
      }
      ensureTarget(gl, n);
      u.uNqOccRect.value.set(originX, originZ, 1 / (size * texel), 1 / (size * texel));
      u.uNqOccOn.value = 1;
      prev = next;
      draw(gl, null);
    },
    dispose() {
      rt?.dispose();
      material.dispose();
      geo.dispose();
    },
  };
}
