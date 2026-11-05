// Shared materials. Everything is vertex-colored Lambert (cheap, stylized).
// World chunk materials support an `aEmit` attribute:
//   0..1  -> window glow, scaled by uWindow (night * habitation)
//   >= 2  -> Grid accent glow, scaled by uGrid (power state)
//   <= -1 -> surface pattern code (PATTERN below), procedural, no textures/normal maps
import * as THREE from 'three';

export const GRID_ACCENT = new THREE.Color(0x39e6d0);
export const WINDOW_WARM = new THREE.Color(0xffb866);

/** Procedural surface patterns, written by MeshBuilder.setPattern into the emit channel as -code. */
export const PATTERN = { none: 0, brick: 1, siding: 2, panels: 3, corrugated: 4, shingles: 5, plaster: 6 } as const;

export interface ChunkUniforms {
  uWindow: { value: number };
  uGrid: { value: number };
  uTint: { value: THREE.Color };
  /** facade pattern strength (0 disables the pattern branch entirely) */
  uPattern: { value: number };
  /** occluder cutout: geometry on the lens→player line is dithered away (1 = on) */
  uCut: { value: number };
  uCamPos: { value: THREE.Vector3 };
  uFocus: { value: THREE.Vector3 };
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
    uPattern: { value: 1 },
    uCut: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uFocus: { value: new THREE.Vector3() },
  };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as THREE.MeshLambertMaterial & { userData: { u: ChunkUniforms } };
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindow = u.uWindow;
    shader.uniforms.uGrid = u.uGrid;
    shader.uniforms.uTint = u.uTint;
    shader.uniforms.uPattern = u.uPattern;
    shader.uniforms.uCut = u.uCut;
    shader.uniforms.uCamPos = u.uCamPos;
    shader.uniforms.uFocus = u.uFocus;
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
        uniform float uWindow; uniform float uGrid; uniform vec3 uTint; uniform float uPattern;
        uniform float uCut; uniform vec3 uCamPos; uniform vec3 uFocus;
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
        // occluder cutout (review finding #5/#6): anything between the lens and the player,
        // within ~0.9 m of that line, is dithered away so walls, cars and bushes never hide them
        if (uCut > 0.5) {
          vec3 seg = uFocus - uCamPos;
          float L2 = dot(seg, seg);
          float t = dot(vGritP - uCamPos, seg) / max(L2, 1e-4);
          float along = t * sqrt(L2);
          if (t > 0.0 && along < sqrt(L2) - 0.35) {
            float r = length(vGritP - (uCamPos + seg * t));
            float cut = 1.0 - smoothstep(0.55, 0.95, r);
            if (cut > 0.0 && dgHash(floor(gl_FragCoord.xy)) < cut * 0.88) discard;
          }
        }
        // surface grit: world-space value noise on the dominant plane (stains, weathering, patchiness)
        {
          vec3 an = abs(vGritN);
          vec2 gp = an.y > 0.6 ? vGritP.xz : (an.x > an.z ? vGritP.zy : vGritP.xy);
          float g = dgNoise(gp * 1.9) * 0.45 + dgNoise(gp * 0.37) * 0.55;
          float streak = an.y < 0.6 ? dgNoise(vec2(gp.x * 3.0, gp.y * 0.25)) * 0.25 : 0.0;
          diffuseColor.rgb *= mix(0.82, 1.1, g) - streak * 0.18;
          // procedural surface patterns (normal-map-free detail). Faded by screen-space
          // derivative so they never shimmer at distance.
          if (uPattern > 0.0 && vEmit < -0.5) {
            float code = floor(-vEmit + 0.5);
            // wall plane: u = horizontal along the face, v = world height
            vec2 wp = vec2(an.x > an.z ? vGritP.z : vGritP.x, vGritP.y);
            float k = 1.0;
            if (code < 1.5) { // brick 0.5 x 0.22 m running bond
              vec2 bp = vec2(wp.x / 0.5, wp.y / 0.22);
              bp.x += mod(floor(bp.y), 2.0) * 0.5;
              vec2 f = fract(bp);
              float mortar = step(f.x, 0.06) + step(f.y, 0.1);
              float tone = dgHash(floor(bp)) * 0.12;
              k = mix(0.94 + tone, 0.72, clamp(mortar, 0.0, 1.0));
            } else if (code < 2.5) { // horizontal siding, 0.28 m boards with a shadow lip
              float f = fract(wp.y / 0.28);
              k = 0.8 + 0.22 * smoothstep(0.0, 0.35, f);
            } else if (code < 3.5) { // panels 1.6 x 1.1 m with seams + per-panel tone
              vec2 pp = vec2(wp.x / 1.6, wp.y / 1.1);
              vec2 f = fract(pp);
              float seam = step(f.x, 0.025) + step(f.y, 0.035);
              k = mix(0.93 + dgHash(floor(pp)) * 0.1, 0.7, clamp(seam, 0.0, 1.0));
            } else if (code < 4.5) { // corrugated metal: fake normal via a sine shading ramp
              float h = an.y > 0.6 ? vGritP.x : wp.x;
              k = 0.86 + 0.16 * (0.5 + 0.5 * sin(h * 41.9));
            } else if (code < 5.5) { // roof shingles: rows follow height, staggered tabs
              vec2 sp = vec2((vGritP.x + vGritP.z) / 0.45, vGritP.y / 0.13);
              sp.x += mod(floor(sp.y), 2.0) * 0.5;
              vec2 f = fract(sp);
              k = (0.8 + 0.22 * smoothstep(0.0, 0.5, f.y)) * (1.0 - step(f.x, 0.05) * 0.18) * (0.94 + dgHash(floor(sp)) * 0.1);
            } else { // plaster: blotchy patches + hairline cracks
              float n = dgNoise(wp * 0.9);
              float crack = smoothstep(0.012, 0.0, abs(dgNoise(wp * 1.7) - 0.5)) * 0.07;
              k = 0.94 + n * 0.1 - crack;
            }
            vec2 fw = fwidth(wp);
            float fade = 1.0 - smoothstep(0.02, 0.07, max(fw.x, fw.y));
            diffuseColor.rgb *= mix(1.0, k, fade * uPattern);
          }
        }
        // roughness variation: a faint, noise-modulated grazing sheen so surfaces are not uniform
        // matte plastic (dusty patches stay flat, smoother patches pick up a little sky)
        {
          vec3 an2 = abs(vGritN);
          vec2 rp = an2.y > 0.6 ? vGritP.xz : (an2.x > an2.z ? vGritP.zy : vGritP.xy);
          float dgSmoothK = smoothstep(0.45, 0.85, dgNoise(rp * 0.6));
          float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0);
          totalEmissiveRadiance += vec3(0.55, 0.6, 0.66) * fres * dgSmoothK * 0.07;
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
