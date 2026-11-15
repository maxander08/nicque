import { Vector2, Vector3, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { BLOCK_HEIGHT, MODULE_DEFINITIONS } from '@/modules/definitions';
import { yawOf } from '@/modules/spatial';
import type { ModuleRecord } from '@/types';

/**
 * Custom ray-marched contact shadows + ambient occlusion for the ground plane.
 *
 * The module housings are described to the ground shader as oriented rounded boxes (signed distance
 * functions). For each ground fragment we
 *   1. sphere-trace a ray towards the key light through that distance field → soft, physically shaped
 *      penumbra that sharpens near contact points;
 *   2. sample the field above the fragment → analytic ambient occlusion where blocks meet the ground.
 *
 * This is software ray marching inside a fragment shader (not hardware ray tracing).
 */

export const MAX_BOXES = 8;

export interface GroundOcclusionUniforms {
  [key: string]: IUniform;
  uNqBoxA: { value: Vector4[] };
  uNqBoxB: { value: Vector2[] };
  uNqCount: { value: number };
  uNqLightDir: { value: Vector3 };
  uNqHeight: { value: number };
  uNqStrength: { value: number };
}

export function createGroundOcclusionUniforms(lightDir: Vector3): GroundOcclusionUniforms {
  return {
    uNqBoxA: { value: Array.from({ length: MAX_BOXES }, () => new Vector4()) },
    uNqBoxB: { value: Array.from({ length: MAX_BOXES }, () => new Vector2(1, 0)) },
    uNqCount: { value: 0 },
    uNqLightDir: { value: lightDir.clone().normalize() },
    uNqHeight: { value: BLOCK_HEIGHT },
    uNqStrength: { value: 1 },
  };
}

export function updateGroundOcclusionUniforms(u: GroundOcclusionUniforms, modules: ModuleRecord[]) {
  const n = Math.min(modules.length, MAX_BOXES);
  for (let i = 0; i < n; i++) {
    const m = modules[i];
    const def = MODULE_DEFINITIONS[m.type];
    const yaw = yawOf(m.rotation);
    u.uNqBoxA.value[i].set(m.position.x, m.position.z, def.width / 2, def.depth / 2);
    u.uNqBoxB.value[i].set(Math.cos(yaw), Math.sin(yaw));
  }
  u.uNqCount.value = n;
}

const FRAG_DECL = /* glsl */ `
uniform vec4 uNqBoxA[${MAX_BOXES}];
uniform vec2 uNqBoxB[${MAX_BOXES}];
uniform int uNqCount;
uniform vec3 uNqLightDir;
uniform float uNqHeight;
uniform float uNqStrength;
varying vec3 vNqWP;

float nqMap(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uNqCount) break;
    vec2 q = p.xz - uNqBoxA[i].xy;
    vec2 cs = uNqBoxB[i];
    // world -> module local (inverse of rotation about Y)
    vec2 l = vec2(q.x * cs.x - q.y * cs.y, q.x * cs.y + q.y * cs.x);
    vec3 b = vec3(abs(l.x) - uNqBoxA[i].z, abs(p.y - uNqHeight * 0.5) - uNqHeight * 0.5, abs(l.y) - uNqBoxA[i].w);
    float r = 0.12;
    vec3 bb = b + r;
    d = min(d, length(max(bb, 0.0)) + min(max(bb.x, max(bb.y, bb.z)), 0.0) - r);
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
        // Exact early-out: far from every housing both terms are provably 1.0, so skip the ray march.
        //  - AO samples at most 0.312 above the ground; the field is 1-Lipschitz, so d0 >= 0.65 gives occ <= 0.
        //  - The penumbra term only drops below 1 if the ray comes within t/6.5 of a box; boxes are <= uNqHeight
        //    tall, which bounds t and therefore the ground distance d0 at which any occlusion can occur.
        float nqD0 = nqMap(nqP);
        float nqSlope = nqL.y - 1.0 / 6.5;
        float nqCut = nqSlope > 0.05 ? max(0.65, uNqHeight / nqSlope * (1.0 + 1.0 / 6.5) * 1.05) : 1e9;
        float nqS = 1.0;
        float nqA = 1.0;
        if (nqD0 < nqCut) {
          nqS = nqSoftShadow(nqP, nqL);
          nqA = nqAO(nqP);
        }
        outgoingLight *= mix(1.0, mix(0.5, 1.0, nqS) * nqA, uNqStrength);
      }
      #include <opaque_fragment>`,
    );
}
