import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Vector3,
  Vector4,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
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
}

const FRAG_DECL = /* glsl */ `
uniform highp sampler2D uNqBoxTex;
uniform int uNqCount;
uniform vec3 uNqLightDir;
uniform float uNqHeight;
uniform float uNqStrength;
uniform highp sampler2D uNqCableTex;
uniform vec4 uNqCableRect;
uniform float uNqCableOn;
varying vec3 vNqWP;

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
    .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
    .replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      {
        vec3 nqP = vec3(vNqWP.x, 0.0, vNqWP.z);
        vec3 nqL = normalize(uNqLightDir);
        // Exact culling: a box can only matter to this fragment when its distance d0 from the fragment is below nqCut.
        //  - AO samples at most 0.312 above the ground; the field is 1-Lipschitz, so d0 >= 0.65 gives occ <= 0.
        //  - The penumbra term only drops below 1 if the ray comes within t/6.5 of a box; boxes are <= uNqHeight
        //    tall, which bounds t and therefore the ground distance d0 at which any occlusion can occur.
        // Boxes that fail the test are skipped, so the cost no longer grows with the number of blocks on the table.
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
        vec2 nqC = nqCable(nqP.xz);
        nqS = min(nqS, nqC.x);
        nqA *= nqC.y;
        outgoingLight *= mix(1.0, mix(0.5, 1.0, nqS) * nqA, uNqStrength);
      }
      #include <opaque_fragment>`,
    );
}
