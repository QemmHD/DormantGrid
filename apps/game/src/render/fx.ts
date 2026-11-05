// Pooled particle FX: debris chunks, dust puffs, sparks, material flyers
// (magnet pickup), and ground decals (blood/scorch). All instanced, no per-frame allocation.
import * as THREE from 'three';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

interface Puff {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  grow: number;
  life: number;
  max: number;
  alpha: number;
  roll: number;
  vroll: number;
  drag: number;
}

/** 32×32 soft radial falloff (alpha) used by smoke and dust puffs. */
function puffTexture(): THREE.DataTexture {
  const n = 32;
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5, dy = (y + 0.5) / n - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      // soft edge + a little lumpy noise so puffs are not perfect discs
      const lump = 0.85 + 0.15 * Math.sin(x * 1.7 + y * 2.3) * Math.cos(x * 0.9 - y * 1.3);
      const a = Math.max(0, 1 - r) ** 1.6 * lump;
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  vr: number;
  size: number;
  life: number;
  max: number;
  kind: 0 | 1 | 2 | 3; // debris, dust, spark, flyer
  tx?: number; ty?: number; tz?: number; // flyer target (updated externally)
  onArrive?: (() => void) | null;
}

export const MAT_COLORS: Record<string, number> = {
  scrap: 0x8a8e92,
  timber: 0xa8835a,
  brick: 0x9a5a48,
  glass: 0x9ad0d8,
  cloth: 0x9a8aa8,
  wiring: 0xd08a3c,
  plastic: 0xd8d0b0,
  chemicals: 0x8ad06a,
  organic: 0x6a8a48,
  metal: 0x8a8e92,
  wood: 0xa8835a,
  stone: 0x8a8478,
  foliage: 0x5f7a48,
  flesh: 0x7a1e1a,
};

export class FX {
  private pool: P[] = [];
  private mesh: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private decals: THREE.InstancedMesh;
  private decalIdx = 0;
  private readonly N = 320;
  /** player position for flyers */
  target = new THREE.Vector3();
  /** camera the soft puffs face (set by the game) */
  camera: THREE.Camera | null = null;
  // soft billboard puffs (smoke, dust): camera-facing quads, per-instance alpha, no depth write
  private puffs: THREE.InstancedMesh;
  private puffAlpha: THREE.InstancedBufferAttribute;
  private puffPool: Puff[] = [];
  private puffNext = 0;
  private readonly PN = 96;
  reduced = false;

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(box, mat, this.N);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.N;
    this.mesh.castShadow = false;
    for (let i = 0; i < this.N; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, vr: 0, size: 0, life: 0, max: 1, kind: 0 });
      m4.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, m4);
      this.mesh.setColorAt(i, c.setRGB(1, 1, 1));
    }
    scene.add(this.mesh);
    // additive glow sparks share the pool indices but render via a second mesh
    this.glow = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      this.N,
    );
    this.glow.frustumCulled = false;
    this.glow.count = this.N;
    for (let i = 0; i < this.N; i++) {
      m4.makeScale(0, 0, 0);
      this.glow.setMatrixAt(i, m4);
      this.glow.setColorAt(i, c.setRGB(1, 1, 1));
    }
    scene.add(this.glow);
    // decals: flat dark splats (blood/scorch/oil) on the ground, ring buffer
    const dg = new THREE.CircleGeometry(0.5, 7);
    dg.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(
      dg,
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      64,
    );
    for (let i = 0; i < 64; i++) {
      m4.makeScale(0, 0, 0);
      this.decals.setMatrixAt(i, m4);
      this.decals.setColorAt(i, c.setRGB(1, 1, 1));
    }
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    scene.add(this.decals);
    // soft puffs
    const pm = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: true });
    pm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vPuffA;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuffA = aAlpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vPuffA;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vPuffA;');
    };
    pm.customProgramCacheKey = () => 'dg-puff';
    this.puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), pm, this.PN);
    this.puffAlpha = new THREE.InstancedBufferAttribute(new Float32Array(this.PN), 1);
    this.puffAlpha.setUsage(THREE.DynamicDrawUsage);
    this.puffs.geometry.setAttribute('aAlpha', this.puffAlpha);
    this.puffs.frustumCulled = false;
    this.puffs.renderOrder = 2;
    for (let i = 0; i < this.PN; i++) {
      this.puffPool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, grow: 0, life: 0, max: 1, alpha: 0, roll: 0, vroll: 0, drag: 0 });
      m4.makeScale(0, 0, 0);
      this.puffs.setMatrixAt(i, m4);
      this.puffs.setColorAt(i, c.setRGB(1, 1, 1));
    }
    scene.add(this.puffs);
  }

  private puff(x: number, y: number, z: number, color: number, size: number, grow: number, life: number, alpha: number, vx: number, vy: number, vz: number, drag: number): void {
    const i = this.puffNext++ % this.PN;
    const p = this.puffPool[i];
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size; p.grow = grow;
    p.life = 0; p.max = life;
    p.alpha = alpha;
    p.roll = Math.random() * 6.28;
    p.vroll = (Math.random() - 0.5) * 0.6;
    p.drag = drag;
    this.puffs.setColorAt(i, c.setHex(color).multiplyScalar(0.92 + Math.random() * 0.16));
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
  }

  private alloc(): number {
    for (let i = 0; i < this.N; i++) if (!this.pool[i].alive) return i;
    // steal the oldest-ish particle
    let best = 0;
    let bestLife = -1;
    for (let i = 0; i < this.N; i++) {
      const p = this.pool[i];
      if (p.kind !== 3 && p.life / p.max > bestLife) {
        bestLife = p.life / p.max;
        best = i;
      }
    }
    return best;
  }

  private spawn(kind: P['kind'], x: number, y: number, z: number, color: number, size: number, life: number, vx: number, vy: number, vz: number): number {
    const i = this.alloc();
    const p = this.pool[i];
    p.alive = true;
    p.kind = kind;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.rz = Math.random() * 6;
    p.vr = (Math.random() - 0.5) * 14;
    p.size = size;
    p.life = 0;
    p.max = life;
    p.onArrive = null;
    m4.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, m4);
    this.glow.setMatrixAt(i, m4);
    if (kind === 2) this.glow.setColorAt(i, c.setHex(color));
    else this.mesh.setColorAt(i, c.setHex(color));
    return i;
  }

  /** Chunky debris burst. weight 0..1 scales count/size. */
  debris(x: number, y: number, z: number, material: string, weight = 0.5, count?: number): void {
    const col = MAT_COLORS[material] ?? 0x8a8478;
    const n = count ?? Math.round((5 + weight * 12) * (this.reduced ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5 * (0.5 + weight);
      c.setHex(col).multiplyScalar(0.75 + Math.random() * 0.4);
      this.spawn(0, x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.4, c.getHex(), 0.06 + Math.random() * 0.12 * (0.6 + weight), 1.4 + Math.random() * 0.8, Math.cos(a) * sp, 2.5 + Math.random() * 4, Math.sin(a) * sp);
    }
    this.dust(x, y, z, 3 + Math.round(weight * 5));
  }

  dust(x: number, y: number, z: number, n = 4, color = 0x9a958a): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.puff(x + Math.cos(a) * 0.3, y + 0.15, z + Math.sin(a) * 0.3, color, 0.45 + Math.random() * 0.3, 1.2, 0.9 + Math.random() * 0.6, 0.55, Math.cos(a) * 0.9, 0.35 + Math.random() * 0.4, Math.sin(a) * 0.9, 2);
    }
  }

  /** Rising smoke puff (camp fires, chimneys). */
  smoke(x: number, y: number, z: number, color = 0x5e5a55): void {
    // soft, growing, fading puff drifting up and downwind (was an opaque box, review finding #2)
    this.puff(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, color, 0.5 + Math.random() * 0.3, 0.7, 3.2 + Math.random() * 1.6, 0.62, (Math.random() - 0.5) * 0.3 + 0.25, 0.8 + Math.random() * 0.35, (Math.random() - 0.5) * 0.3, 0.25);
  }

  sparks(x: number, y: number, z: number, n = 8, color = 0xffc070): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      this.spawn(2, x, y, z, color, 0.05 + Math.random() * 0.04, 0.25 + Math.random() * 0.3, Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp);
    }
  }

  /** Grid-accent burst (reboot/craft) */
  glowBurst(x: number, y: number, z: number, n = 24, color = 0x39e6d0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.spawn(2, x, y, z, color, 0.08 + Math.random() * 0.06, 0.7 + Math.random() * 0.6, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp);
    }
  }

  /** A material chip that arcs up then homes into the player. */
  flyer(x: number, y: number, z: number, material: string, delay: number, onArrive?: () => void): void {
    const col = MAT_COLORS[material] ?? 0xd8d0b0;
    const i = this.spawn(3, x, y, z, col, 0.13, 3, (Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.pool[i].life = -delay;
    this.pool[i].onArrive = onArrive ?? null;
  }

  decal(x: number, y: number, z: number, color: number, size: number): void {
    const i = this.decalIdx++ % 64;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * 6.28);
    m4.compose(v.set(x, y + 0.02, z), q, s.set(size * (0.8 + Math.random() * 0.5), 1, size));
    this.decals.setMatrixAt(i, m4);
    this.decals.setColorAt(i, c.setHex(color));
    this.decals.instanceMatrix.needsUpdate = true;
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
  }

  update(dt: number, ground: (x: number, z: number) => number): void {
    let any = false;
    let anyGlow = false;
    for (let i = 0; i < this.N; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life < 0) {
        // delayed flyer: hide
        m4.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, m4);
        any = true;
        continue;
      }
      if (p.kind === 3) {
        // phase 1: pop up (0.25 s), phase 2: home to target with acceleration
        if (p.life < 0.25) {
          p.vy -= 12 * dt;
        } else {
          const dx = this.target.x - p.x, dy = this.target.y + 1.1 - p.y, dz = this.target.z - p.z;
          const d = Math.hypot(dx, dy, dz);
          const k = Math.min(1, (p.life - 0.25) * 2.5);
          const sp = 6 + (p.life - 0.25) * 22;
          p.vx += ((dx / d) * sp - p.vx) * k * dt * 12;
          p.vy += ((dy / d) * sp - p.vy) * k * dt * 12;
          p.vz += ((dz / d) * sp - p.vz) * k * dt * 12;
          if (d < 0.45 || p.life > 2.5) {
            p.alive = false;
            p.onArrive?.();
            m4.makeScale(0, 0, 0);
            this.mesh.setMatrixAt(i, m4);
            any = true;
            continue;
          }
        }
      } else if (p.kind === 1) {
        p.vx *= 1 - dt * 2;
        p.vz *= 1 - dt * 2;
        p.vy *= 1 - dt * 1.5;
      } else {
        p.vy -= 16 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.vr * dt;
      p.ry += p.vr * 0.7 * dt;
      if (p.kind === 0) {
        const g = ground(p.x, p.z);
        if (p.y < g + p.size * 0.5) {
          p.y = g + p.size * 0.5;
          if (Math.abs(p.vy) > 1) {
            p.vy *= -0.3;
            p.vx *= 0.5;
            p.vz *= 0.5;
            p.vr *= 0.5;
          } else {
            p.vy = 0;
            p.vx *= 0.8;
            p.vz *= 0.8;
            p.vr *= 0.8;
          }
        }
      }
      const t = p.life / p.max;
      if (t >= 1) {
        p.alive = false;
        m4.makeScale(0, 0, 0);
        if (p.kind === 2) this.glow.setMatrixAt(i, m4);
        else this.mesh.setMatrixAt(i, m4);
        if (p.kind === 2) anyGlow = true;
        else any = true;
        continue;
      }
      let sz = p.size;
      if (p.kind === 0) sz *= t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      else if (p.kind === 1) sz *= (0.6 + t * 1.6) * (1 - t);
      else if (p.kind === 2) sz *= 1 - t;
      else sz *= 1 + Math.sin(p.life * 20) * 0.15;
      e.set(p.rx, p.ry, p.rz);
      q.setFromEuler(e);
      m4.compose(v.set(p.x, p.y, p.z), q, s.set(sz, sz, sz));
      if (p.kind === 2) {
        this.glow.setMatrixAt(i, m4);
        anyGlow = true;
      } else {
        this.mesh.setMatrixAt(i, m4);
        any = true;
      }
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    if (anyGlow) {
      this.glow.instanceMatrix.needsUpdate = true;
      if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
    }
    this.updatePuffs(dt);
  }

  private updatePuffs(dt: number): void {
    const cq = this.camera ? this.camera.quaternion : null;
    let any = false;
    for (let i = 0; i < this.PN; i++) {
      const p = this.puffPool[i];
      if (!p.alive) continue;
      any = true;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1 || !cq) {
        p.alive = false;
        m4.makeScale(0, 0, 0);
        this.puffs.setMatrixAt(i, m4);
        this.puffAlpha.setX(i, 0);
        continue;
      }
      const k = 1 - Math.min(1, p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy *= 1 - Math.min(1, p.drag * 0.5 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.roll += p.vroll * dt;
      const sz = p.size * (1 + p.grow * t * 2.2);
      // fade in quickly, out slowly
      const a = p.alpha * Math.min(1, t * 6) * (1 - t) * (1 - t);
      q.setFromAxisAngle(v.set(0, 0, 1), p.roll);
      q.premultiply(cq);
      m4.compose(v.set(p.x, p.y, p.z), q, s.set(sz, sz, sz));
      this.puffs.setMatrixAt(i, m4);
      this.puffAlpha.setX(i, a);
    }
    if (any) {
      this.puffs.instanceMatrix.needsUpdate = true;
      this.puffAlpha.needsUpdate = true;
    }
  }
}
