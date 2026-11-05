// Shared soft glow texture (32×32 radial alpha).
import * as THREE from 'three';

let cached: THREE.DataTexture | null = null;

/** soft round alpha falloff, white; shared by every additive glow billboard */
export function glowTexture(): THREE.DataTexture {
  if (cached) return cached;
  const n = 32;
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 2;
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  cached = t;
  return t;
}
