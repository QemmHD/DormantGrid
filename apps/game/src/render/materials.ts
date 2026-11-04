// Shared materials. Everything is vertex-colored Lambert (cheap, stylized).
// World chunk materials support an `aEmit` attribute:
//   0..1  -> window glow, scaled by uWindow (night * habitation)
//   >= 2  -> Grid accent glow, scaled by uGrid (power state)
import * as THREE from 'three';

export const GRID_ACCENT = new THREE.Color(0x39e6d0);
export const WINDOW_WARM = new THREE.Color(0xffb866);

export interface ChunkUniforms {
  uWindow: { value: number };
  uGrid: { value: number };
  uTint: { value: THREE.Color };
}

let shared: {
  skinned: THREE.MeshLambertMaterial;
  props: THREE.MeshLambertMaterial;
  flat: THREE.MeshLambertMaterial;
  glow: THREE.MeshBasicMaterial;
} | null = null;

export function sharedMaterials() {
  if (shared) return shared;
  shared = {
    skinned: rimMaterial(),
    props: new THREE.MeshLambertMaterial({ vertexColors: true }),
    flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ color: GRID_ACCENT, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }),
  };
  return shared;
}

/** Character material: Lambert + a cool rim light so silhouettes read against busy backgrounds. */
function rimMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float dgRim = pow(1.0 - clamp(abs(normal.z), 0.0, 1.0), 2.6);
      totalEmissiveRadiance += vec3(0.62, 0.74, 0.86) * dgRim * 0.22;`,
    );
  };
  m.customProgramCacheKey = () => 'dg-rim';
  return m;
}

/** Create a per-chunk world material (shares a compiled program across chunks). */
export function makeChunkMaterial(): THREE.MeshLambertMaterial & { userData: { u: ChunkUniforms } } {
  const u: ChunkUniforms = {
    uWindow: { value: 0 },
    uGrid: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as THREE.MeshLambertMaterial & { userData: { u: ChunkUniforms } };
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindow = u.uWindow;
    shader.uniforms.uGrid = u.uGrid;
    shader.uniforms.uTint = u.uTint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;\nvarying vec3 vGritP;\nvarying vec3 vGritN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vEmit = aEmit;
        vec4 dgW = vec4(transformed, 1.0);
        vec3 dgN = objectNormal;
        #ifdef USE_INSTANCING
          dgW = instanceMatrix * dgW;
          dgN = mat3(instanceMatrix) * dgN;
        #endif
        vGritP = (modelMatrix * dgW).xyz;
        vGritN = normalize(mat3(modelMatrix) * dgN);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vEmit; varying vec3 vGritP; varying vec3 vGritN;
        uniform float uWindow; uniform float uGrid; uniform vec3 uTint;
        float dgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float dgNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(dgHash(i), dgHash(i + vec2(1.0, 0.0)), f.x), mix(dgHash(i + vec2(0.0, 1.0)), dgHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        diffuseColor.rgb *= uTint;
        // surface grit: world-space value noise on the dominant plane (stains, weathering, patchiness)
        {
          vec3 an = abs(vGritN);
          vec2 gp = an.y > 0.6 ? vGritP.xz : (an.x > an.z ? vGritP.zy : vGritP.xy);
          float g = dgNoise(gp * 1.9) * 0.45 + dgNoise(gp * 0.37) * 0.55;
          float streak = an.y < 0.6 ? dgNoise(vec2(gp.x * 3.0, gp.y * 0.25)) * 0.25 : 0.0;
          diffuseColor.rgb *= mix(0.82, 1.1, g) - streak * 0.18;
        }
        if (vEmit > 1.5) {
          totalEmissiveRadiance += vec3(0.22, 0.9, 0.82) * uGrid * 1.6 + diffuseColor.rgb * 0.15;
        } else if (vEmit > 0.01) {
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * vEmit * uWindow * 1.4;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'dg-chunk';
  return m;
}
