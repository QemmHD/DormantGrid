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
    skinned: new THREE.MeshLambertMaterial({ vertexColors: true }),
    props: new THREE.MeshLambertMaterial({ vertexColors: true }),
    flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ color: GRID_ACCENT, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }),
  };
  return shared;
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
      .replace('#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vEmit;\nuniform float uWindow;\nuniform float uGrid;\nuniform vec3 uTint;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        diffuseColor.rgb *= uTint;
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
