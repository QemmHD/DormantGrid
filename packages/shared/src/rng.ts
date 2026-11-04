// Deterministic PRNG + hashing shared by client, sim and server.

/** mulberry32: fast 32-bit seeded PRNG */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Fork a child RNG deterministically */
  fork(salt: number): Rng {
    return new Rng(hash2(this.s, salt));
  }
}

export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul(b + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a 32-bit over a string */
export function fnv1a(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Incremental hasher for determinism checks */
export class Hasher {
  private h = 0x811c9dc5;
  num(n: number): this {
    // quantize to 1 mm to avoid float formatting differences
    return this.str(String(Math.round(n * 1000)));
  }
  str(s: string): this {
    this.h = fnv1a(s + '|', this.h);
    return this;
  }
  bytes(b: ArrayLike<number>): this {
    let h = this.h;
    for (let i = 0; i < b.length; i++) {
      h ^= b[i] & 0xff;
      h = Math.imul(h, 0x01000193);
    }
    this.h = h >>> 0;
    return this;
  }
  hex(): string {
    return this.h.toString(16).padStart(8, '0');
  }
}

/** 2D value noise (deterministic), returns 0..1 */
export function valueNoise2(seed: number, x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const r = (i: number, j: number) => hash2(hash2(seed, i), j) / 4294967296;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = r(xi, zi);
  const b = r(xi + 1, zi);
  const c = r(xi, zi + 1);
  const d = r(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(seed: number, x: number, z: number, octaves = 4): number {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(seed + o * 1013, x * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
