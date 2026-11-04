// Parametric low-poly humanoid: one SkinnedMesh (1 draw call), rigid skinning,
// procedural animation (walk/run/idle/attack/interact/dodge/hit/sleep/sit).
import * as THREE from 'three';
import { Rng } from '@dg/shared';
import { MeshBuilder } from './geo';
import { sharedMaterials } from './materials';

export const enum Bone {
  Hips = 0,
  Spine,
  Chest,
  Head,
  UArmL,
  LArmL,
  UArmR,
  LArmR,
  ULegL,
  LLegL,
  ULegR,
  LLegR,
  COUNT,
}

export interface Look {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  shoes: number;
  accent: number;
  hairStyle: 0 | 1 | 2 | 3; // none, short, cap, bun
  build: number; // 0.9..1.1 width
  height: number; // 0.94..1.06
  backpack: boolean;
  hood: boolean;
  mask: boolean; // raider bandana
}

const SKINS = [0xf1c8a6, 0xd9a47c, 0xb57b55, 0x8a5a3c, 0x5e3b27, 0xe9b98f];
const SHIRTS = [0x5b6b74, 0x7a6a55, 0x46535c, 0x6e7f5d, 0x8a5e4a, 0x5d5a6e, 0x9a8a6a, 0x3f4c52, 0x7c4a3f];
const PANTS = [0x3a3f45, 0x4a4a3f, 0x2f3a46, 0x5a4b3c, 0x3d3a36];
const HAIRS = [0x2a211b, 0x4a3426, 0x7a5a3a, 0x1b1b1b, 0x9a8a7a, 0xb58a52];

export function randomLook(seed: number, opts: Partial<Look> = {}): Look {
  const r = new Rng(seed);
  return {
    skin: r.pick(SKINS),
    shirt: r.pick(SHIRTS),
    pants: r.pick(PANTS),
    hair: r.pick(HAIRS),
    shoes: 0x2a2622,
    accent: 0xe8a65a,
    hairStyle: r.int(0, 3) as Look['hairStyle'],
    build: r.range(0.92, 1.1),
    height: r.range(0.94, 1.05),
    backpack: r.chance(0.35),
    hood: r.chance(0.2),
    mask: false,
    ...opts,
  };
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function buildGeometry(look: Look): THREE.BufferGeometry {
  const key = JSON.stringify(look);
  const cached = geoCache.get(key);
  if (cached) return cached;
  const b = new MeshBuilder();
  const w = look.build;
  // Hips/pelvis
  b.setBone(Bone.Hips).setColor(look.pants);
  b.bevelBox(0, 0.95, 0, 0.17 * w, 0.1, 0.11, 0.035);
  // Spine/torso lower
  b.setBone(Bone.Spine).setColor(look.shirt);
  b.bevelBox(0, 1.12, 0, 0.18 * w, 0.1, 0.12, 0.04);
  // Chest
  b.setBone(Bone.Chest).setColor(look.shirt);
  b.bevelBox(0, 1.33, 0, 0.21 * w, 0.14, 0.13, 0.05);
  // collar/accent strap
  b.setColor(look.accent);
  b.box(0.09 * w, 1.36, 0.135, 0.025, 0.12, 0.008);
  if (look.backpack) {
    b.setColor(0x4d4537);
    b.bevelBox(0, 1.3, -0.2, 0.15, 0.19, 0.08, 0.035);
    b.setColor(0x6b5f4a);
    b.bevelBox(0, 1.13, -0.22, 0.13, 0.05, 0.07, 0.02);
  }
  // Head
  b.setBone(Bone.Head).setColor(look.skin);
  b.bevelBox(0, 1.62, 0.0, 0.1, 0.12, 0.11, 0.04);
  b.box(0, 1.5, 0, 0.05, 0.04, 0.05); // neck
  // eyes (dark slits) and brow
  b.setColor(0x1a1614);
  b.box(-0.045, 1.635, 0.111, 0.018, 0.012, 0.004);
  b.box(0.045, 1.635, 0.111, 0.018, 0.012, 0.004);
  if (look.mask) {
    b.setColor(0x8a2f2a);
    b.bevelBox(0, 1.57, 0.02, 0.108, 0.05, 0.105, 0.02);
  }
  if (look.hood) {
    b.setColor(look.shirt);
    b.bevelBox(0, 1.68, -0.02, 0.125, 0.11, 0.13, 0.05);
  } else if (look.hairStyle === 1) {
    b.setColor(look.hair);
    b.bevelBox(0, 1.73, -0.01, 0.108, 0.035, 0.118, 0.02);
    b.box(0, 1.65, -0.1, 0.1, 0.07, 0.02);
  } else if (look.hairStyle === 2) {
    b.setColor(look.accent === 0xe8a65a ? 0x5a4a38 : look.accent);
    b.bevelBox(0, 1.735, 0, 0.115, 0.04, 0.12, 0.02);
    b.box(0, 1.705, 0.14, 0.09, 0.012, 0.05); // brim
  } else if (look.hairStyle === 3) {
    b.setColor(look.hair);
    b.bevelBox(0, 1.73, -0.01, 0.105, 0.03, 0.115, 0.02);
    b.blob(0, 1.72, -0.13, 0.055, 0.055, 0.05, 0.1, 3);
  }
  // Arms
  for (const side of [-1, 1]) {
    const ua = side < 0 ? Bone.UArmL : Bone.UArmR;
    const la = side < 0 ? Bone.LArmL : Bone.LArmR;
    const x = side * 0.27 * w;
    b.setBone(ua).setColor(look.shirt);
    b.bevelBox(x, 1.29, 0, 0.06, 0.15, 0.065, 0.025);
    b.setBone(la).setColor(look.shirt);
    b.bevelBox(x, 1.04, 0, 0.052, 0.12, 0.055, 0.02);
    b.setColor(look.skin);
    b.bevelBox(x, 0.88, 0.0, 0.045, 0.05, 0.05, 0.018);
  }
  // Legs
  for (const side of [-1, 1]) {
    const ul = side < 0 ? Bone.ULegL : Bone.ULegR;
    const ll = side < 0 ? Bone.LLegL : Bone.LLegR;
    const x = side * 0.095 * w;
    b.setBone(ul).setColor(look.pants);
    b.bevelBox(x, 0.7, 0, 0.075, 0.2, 0.08, 0.03);
    b.setBone(ll).setColor(look.pants);
    b.bevelBox(x, 0.3, 0, 0.065, 0.2, 0.07, 0.025);
    b.setColor(look.shoes);
    b.bevelBox(x, 0.05, 0.035, 0.068, 0.05, 0.11, 0.025);
  }
  const g = b.toGeometry(false, true);
  geoCache.set(key, g);
  return g;
}

// Bone rest positions (relative to parent) — pivots at joints.
const REST: [number, number, number, number][] = [
  // [parent, x, y, z]
  [-1, 0, 0.95, 0], // hips
  [0, 0, 0.08, 0], // spine (pivot at waist)
  [1, 0, 0.16, 0], // chest
  [2, 0, 0.24, 0], // head pivot (neck) ~1.43
  [2, -0.27, 0.19, 0], // UArmL shoulder ~1.42
  [4, 0, -0.27, 0], // LArmL elbow ~1.15
  [2, 0.27, 0.19, 0], // UArmR
  [6, 0, -0.27, 0], // LArmR
  [0, -0.095, -0.03, 0], // ULegL hip ~0.92
  [8, 0, -0.42, 0], // LLegL knee ~0.5
  [0, 0.095, -0.03, 0], // ULegR
  [10, 0, -0.42, 0], // LLegR
];

const LOOK_TMP = new THREE.Vector3();
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export type AnimState = 'idle' | 'move' | 'attack' | 'heavy' | 'interact' | 'dodge' | 'hit' | 'sleep' | 'sit' | 'carry' | 'dead' | 'aim';

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[] = [];
  readonly hand = new THREE.Group(); // attach held items here
  state: AnimState = 'idle';
  stateT = 0;
  speed = 0; // m/s
  private phase = 0;
  private breath = Math.random() * 10;
  private lean = 0;
  /** 0..1 strength of a hit flinch */
  private flinch = 0;
  /** attack swing progress driver */
  attackDur = 0.45;
  /** world-space point to look at (head + a little chest), or null to look ahead */
  lookTarget: THREE.Vector3 | null = null;
  /** smoothed locomotion weight 0..1 (no snapping between idle and walk) */
  private walkW = 0;
  /** smoothed run weight */
  private runW = 0;
  /** decaying "settle" after stopping */
  private settle = 0;
  private wasMoving = false;
  private headYaw = 0;
  private headPitch = 0;
  /** per-rig idle timing offset so crowds don't sway in sync */
  private readonly idleSeed = Math.random() * 100;

  constructor(public look: Look) {
    for (let i = 0; i < Bone.COUNT; i++) {
      const bone = new THREE.Bone();
      const [p, x, y, z] = REST[i];
      bone.position.set(x, y, z);
      if (p >= 0) this.bones[p].add(bone);
      this.bones.push(bone);
    }
    const geo = buildGeometry(look);
    this.mesh = new THREE.SkinnedMesh(geo, sharedMaterials().skinned);
    this.mesh.add(this.bones[0]);
    this.mesh.scale.set(1, look.height, 1);
    this.bones[0].position.y = 0.95;
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false; // skinned bounds are unreliable; we cull by distance
    this.root.add(this.mesh);
    this.hand.position.set(0, -0.32, 0.03);
    this.bones[Bone.LArmR].add(this.hand);
  }

  setState(s: AnimState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateT = 0;
    }
  }

  hit(strength = 1): void {
    this.flinch = Math.min(1, this.flinch + strength);
  }

  update(dt: number): void {
    this.stateT += dt;
    this.breath += dt;
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    const B = this.bones;
    for (const b of B) b.rotation.set(0, 0, 0);
    B[0].position.y = 0.95;
    B[0].position.x = 0;
    B[0].position.z = 0;
    this.root.rotation.x = 0;

    const sp = this.speed;
    const moving = sp > 0.15;
    const k8 = Math.min(1, dt * 8);
    this.walkW += ((moving ? 1 : 0) - this.walkW) * k8;
    this.runW += (Math.min(1, Math.max(0, (sp - 2.6) / 2.5)) - this.runW) * Math.min(1, dt * 5);
    if (this.wasMoving && !moving) this.settle = 1;
    this.wasMoving = moving;
    this.settle = Math.max(0, this.settle - dt * 2.8);
    const run = this.runW;
    const walkF = this.walkW;
    const idleW = 1 - walkF;
    this.phase += dt * (moving ? 2.2 + sp * 1.25 : 0);
    const ph = this.phase;
    const sw = Math.sin(ph);
    const cw = Math.cos(ph);
    const legAmp = (0.5 + run * 0.45) * walkF;
    // legs
    B[Bone.ULegL].rotation.x = sw * legAmp;
    B[Bone.ULegR].rotation.x = -sw * legAmp;
    B[Bone.LLegL].rotation.x = Math.max(0, -cw) * (0.7 + run * 0.6) * walkF;
    B[Bone.LLegR].rotation.x = Math.max(0, cw) * (0.7 + run * 0.6) * walkF;
    // arms counter-swing; elbows bend more on the forward swing and pump when running
    const armAmp = (0.45 + run * 0.6) * walkF;
    B[Bone.UArmL].rotation.x = -sw * armAmp;
    B[Bone.UArmR].rotation.x = sw * armAmp;
    const elbow = 0.15 + run * 0.95;
    B[Bone.LArmL].rotation.x = -(elbow + Math.max(0, sw) * (0.25 + run * 0.3)) * walkF - 0.08;
    B[Bone.LArmR].rotation.x = -(elbow + Math.max(0, -sw) * (0.25 + run * 0.3)) * walkF - 0.08;
    B[Bone.UArmL].rotation.z = -0.06 - run * 0.12 * walkF;
    B[Bone.UArmR].rotation.z = 0.06 + run * 0.12 * walkF;
    // hips: bob, lateral sway over the planted foot, twist + roll; shoulders counter-rotate
    B[0].position.y = 0.95 + Math.abs(cw) * 0.045 * walkF * (1 + run) - run * 0.03 * walkF;
    B[0].position.x = sw * 0.028 * walkF * (1 - run * 0.5);
    B[0].rotation.y = -sw * (0.07 + run * 0.05) * walkF;
    B[0].rotation.z = cw * 0.045 * walkF;
    this.lean += ((moving ? 0.06 + run * 0.16 : 0) - this.lean) * k8;
    B[Bone.Spine].rotation.x = this.lean - this.settle * 0.07;
    B[Bone.Spine].rotation.y = sw * 0.08 * walkF;
    B[Bone.Chest].rotation.y = sw * (0.06 + run * 0.06) * walkF;
    B[Bone.Spine].rotation.z = -cw * 0.03 * walkF;
    // idle: breathing + slow weight shift from foot to foot (hip slides, one knee softens)
    const br = Math.sin(this.breath * 1.7) * 0.025;
    const shift = Math.sin((this.breath + this.idleSeed) * 0.42);
    B[Bone.Chest].rotation.x = br * idleW;
    B[0].position.x += shift * 0.035 * idleW;
    B[0].rotation.z += -shift * 0.04 * idleW;
    B[Bone.Spine].rotation.z += shift * 0.05 * idleW;
    B[Bone.ULegL].rotation.z = -shift * 0.04 * idleW;
    B[Bone.ULegR].rotation.z = -shift * 0.04 * idleW;
    B[Bone.LLegL].rotation.x += Math.max(0, shift) * 0.12 * idleW;
    B[Bone.LLegR].rotation.x += Math.max(0, -shift) * 0.12 * idleW;
    B[Bone.UArmL].rotation.x += Math.sin(this.breath * 0.9 + 1) * 0.03 * idleW;
    B[Bone.UArmR].rotation.x += Math.sin(this.breath * 0.9 + 2) * 0.03 * idleW;
    // head: look at a target (clamped, smoothed), otherwise idle glances; stabilized against hip twist
    let wantYaw = idleW * Math.sin((this.breath + this.idleSeed) * 0.37) * 0.25;
    let wantPitch = 0;
    if (this.lookTarget) {
      const lp = LOOK_TMP.copy(this.lookTarget);
      this.root.worldToLocal(lp);
      const dx = lp.x, dz = lp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.3) {
        wantYaw = clampN(Math.atan2(dx, dz), -1.15, 1.15);
        // eye height ~1.6 m
        wantPitch = clampN(-Math.atan2(lp.y - 1.6, dist), -0.5, 0.45);
        // past the clamp the head gives up rather than twisting to its back
        if (Math.abs(Math.atan2(dx, dz)) > 2.2) wantYaw = 0;
      }
    }
    const k6 = Math.min(1, dt * 6);
    this.headYaw += (wantYaw - this.headYaw) * k6;
    this.headPitch += (wantPitch - this.headPitch) * k6;
    B[Bone.Chest].rotation.y += this.headYaw * 0.3;
    B[Bone.Head].rotation.y = this.headYaw * 0.7 - (B[Bone.Spine].rotation.y + B[0].rotation.y) * 0.8;
    B[Bone.Head].rotation.x = -br * 0.5 * idleW - this.lean * 0.5 + this.headPitch + this.settle * 0.05;

    const t = this.stateT;
    switch (this.state) {
      case 'attack':
      case 'heavy': {
        const dur = this.state === 'heavy' ? this.attackDur * 1.5 : this.attackDur;
        const k = Math.min(1, t / dur);
        // wind-up (0..0.35) then fast swing
        const wind = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        const swing = k < 0.35 ? 0 : Math.min(1, (k - 0.35) / 0.2);
        B[Bone.UArmR].rotation.x = -2.2 * wind + 0.6 * swing * (1 - k);
        B[Bone.UArmR].rotation.z = 0.3 - swing * 0.6;
        B[Bone.LArmR].rotation.x = -0.6 * wind - 0.2;
        B[Bone.Spine].rotation.y = 0.45 * wind - 0.55 * swing * (1 - k * 0.6);
        B[Bone.Chest].rotation.x = 0.15 * swing;
        B[Bone.UArmL].rotation.x = -0.5 * wind;
        break;
      }
      case 'interact': {
        // working motion: repeated short pry/hammer, with the body rocking into each stroke
        const w2 = Math.sin(t * 9);
        const ease = Math.min(1, t / 0.15);
        B[Bone.UArmR].rotation.x = (-1.2 + w2 * 0.35) * ease;
        B[Bone.LArmR].rotation.x = (-0.7 + w2 * 0.2) * ease;
        B[Bone.UArmL].rotation.x = (-0.9 - w2 * 0.2) * ease;
        B[Bone.LArmL].rotation.x = -0.6 * ease;
        B[Bone.Spine].rotation.x = 0.25 * ease + Math.max(0, w2) * 0.06;
        B[Bone.Spine].rotation.y = w2 * 0.06;
        B[0].position.y = 0.95 - 0.05 * ease - Math.max(0, w2) * 0.02;
        B[Bone.LLegL].rotation.x = 0.18 * ease;
        B[Bone.LLegR].rotation.x = 0.12 * ease;
        B[Bone.ULegL].rotation.x = -0.1 * ease;
        B[Bone.Head].rotation.x = 0.2 + this.headPitch * 0.5;
        break;
      }
      case 'carry':
        B[Bone.UArmL].rotation.x = -1.1;
        B[Bone.UArmR].rotation.x = -1.1;
        B[Bone.LArmL].rotation.x = -0.6;
        B[Bone.LArmR].rotation.x = -0.6;
        break;
      case 'aim':
        B[Bone.UArmR].rotation.x = -1.5;
        B[Bone.UArmL].rotation.x = -1.45;
        B[Bone.UArmL].rotation.z = 0.5;
        B[Bone.LArmL].rotation.x = -0.3;
        break;
      case 'dodge': {
        const k = Math.min(1, t / 0.45);
        this.root.rotation.x = 0; // roll is faked with crouch + lean
        B[0].position.y = 0.95 - Math.sin(k * Math.PI) * 0.4;
        B[Bone.Spine].rotation.x = Math.sin(k * Math.PI) * 0.9;
        B[Bone.ULegL].rotation.x = -Math.sin(k * Math.PI) * 1.2;
        B[Bone.ULegR].rotation.x = -Math.sin(k * Math.PI) * 1.0;
        B[Bone.LLegL].rotation.x = Math.sin(k * Math.PI) * 1.6;
        B[Bone.LLegR].rotation.x = Math.sin(k * Math.PI) * 1.6;
        B[Bone.UArmL].rotation.x = -Math.sin(k * Math.PI) * 1.0;
        B[Bone.UArmR].rotation.x = -Math.sin(k * Math.PI) * 1.0;
        break;
      }
      case 'sit':
        B[0].position.y = 0.5;
        B[Bone.ULegL].rotation.x = -1.5;
        B[Bone.ULegR].rotation.x = -1.5;
        B[Bone.LLegL].rotation.x = 1.5;
        B[Bone.LLegR].rotation.x = 1.5;
        B[Bone.UArmL].rotation.x = -0.4;
        B[Bone.UArmR].rotation.x = -0.4;
        break;
      case 'sleep':
      case 'dead':
        B[0].position.y = 0.16;
        B[0].rotation.x = -Math.PI / 2;
        B[Bone.Head].rotation.y = 0.5;
        B[Bone.UArmL].rotation.z = -0.3;
        B[Bone.UArmR].rotation.z = 0.5;
        B[Bone.ULegR].rotation.x = -0.3;
        B[Bone.LLegR].rotation.x = 0.5;
        break;
      default:
        break;
    }
    if (this.flinch > 0) {
      B[Bone.Spine].rotation.x -= this.flinch * 0.35;
      B[Bone.Head].rotation.x -= this.flinch * 0.3;
      B[Bone.UArmL].rotation.z -= this.flinch * 0.4;
      B[Bone.UArmR].rotation.z += this.flinch * 0.4;
    }
  }

  dispose(): void {
    // geometry is cached/shared; skeleton bone texture freed with skeleton
    this.mesh.skeleton.dispose();
    this.root.removeFromParent();
  }
}
