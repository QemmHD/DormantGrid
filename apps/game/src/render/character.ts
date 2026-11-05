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
  // slight per-face tone variation reads as cloth/skin instead of flat plastic
  const b = new MeshBuilder({ jitter: 0.07 });
  const w = look.build;
  const c = new THREE.Color();
  const shade = (hex: number, k: number) => c.setHex(hex).multiplyScalar(k);
  const jacket = look.shirt;
  const under = new THREE.Color(look.shirt).lerp(new THREE.Color(0x2a2724), 0.55).getHex();
  const seam = new THREE.Color(look.shirt).multiplyScalar(0.62).getHex();
  // oval cross-sections: x = width, z = depth
  const oval = (x: number, y0: number, z: number, r0: number, r1: number, h: number, depth: number, n = 8, caps = true) => {
    b.pushTRS(x, 0, z, 0, 1, 1, depth);
    b.cylinder(0, y0, 0, r0, r1, h, n, caps);
    b.pop();
  };

  // ---------------- hips + legs ----------------
  b.setBone(Bone.Hips).setColor(look.pants);
  oval(0, 0.86, 0, 0.15 * w, 0.165 * w, 0.17, 0.72);
  b.setColor(0x24211e); // belt
  oval(0, 0.99, 0, 0.168 * w, 0.168 * w, 0.045, 0.72, 8, false);
  b.setColor(0x8a7a5a);
  b.box(0, 1.012, 0.122, 0.022, 0.018, 0.006); // buckle
  for (const side of [-1, 1]) {
    const ul = side < 0 ? Bone.ULegL : Bone.ULegR;
    const ll = side < 0 ? Bone.LLegL : Bone.LLegR;
    const x = side * 0.095 * w;
    b.setBone(ul).setColor(look.pants);
    b.cylinder(x, 0.5, 0, 0.062 * w, 0.085 * w, 0.42, 7); // thigh
    b.setColor(shade(look.pants, 0.82));
    b.box(x + side * 0.07 * w, 0.72, 0.01, 0.012, 0.07, 0.045); // cargo pocket
    b.setBone(ll).setColor(look.pants);
    b.cylinder(x, 0.12, 0, 0.05, 0.064, 0.4, 7); // shin
    b.setColor(shade(look.pants, 0.8));
    b.cylinder(x, 0.47, 0.008, 0.067, 0.067, 0.05, 7, false); // knee patch
    // boots: upper + darker sole + toe
    b.setColor(look.shoes);
    b.bevelBox(x, 0.1, 0.012, 0.058, 0.07, 0.075, 0.022);
    b.bevelBox(x, 0.045, 0.055, 0.056, 0.04, 0.085, 0.02);
    b.setColor(0x151311);
    b.box(x, 0.008, 0.035, 0.062, 0.01, 0.112);
  }

  // ---------------- torso: undershirt, jacket with hem, collar, placket, pockets ----------------
  b.setBone(Bone.Spine).setColor(under);
  oval(0, 1.0, 0, 0.158 * w, 0.17 * w, 0.2, 0.68);
  b.setColor(jacket);
  oval(0, 0.93, 0, 0.18 * w, 0.175 * w, 0.27, 0.72, 8, false); // jacket lower body, hem hangs over the belt
  b.setColor(seam);
  oval(0, 0.925, 0, 0.182 * w, 0.182 * w, 0.02, 0.73, 8, false); // hem band
  b.setBone(Bone.Chest).setColor(jacket);
  oval(0, 1.19, 0, 0.175 * w, 0.215 * w, 0.22, 0.66); // chest tapers out to the shoulders
  b.blob(0, 1.38, 0, 0.23 * w, 0.075, 0.13, 0.05, 11); // shoulder yoke
  b.setColor(seam);
  b.box(0, 1.17, 0.142, 0.008, 0.2, 0.006); // front placket / zip
  b.setColor(shade(jacket, 0.85));
  for (const side of [-1, 1]) b.bevelBox(side * 0.085 * w, 1.24, 0.135, 0.045, 0.04, 0.01, 0.008); // chest pockets
  b.setColor(look.accent);
  b.box(side1(w), 1.3, 0.14, 0.012, 0.05, 0.005); // reflective tape / badge
  b.setColor(jacket);
  oval(0, 1.38, 0, 0.085, 0.07, 0.07, 0.95, 8, false); // collar
  if (look.backpack) {
    b.setColor(0x4d4537);
    b.bevelBox(0, 1.22, -0.2, 0.14, 0.19, 0.075, 0.035);
    b.setColor(0x3a342b);
    b.bevelBox(0, 1.13, -0.28, 0.11, 0.06, 0.02, 0.012); // front pocket
    b.setColor(0x6b6450);
    b.pushTRS(0, 1.45, -0.2, 0).push(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    b.cylinder(0, -0.15, 0, 0.055, 0.055, 0.3, 7); // bedroll
    b.pop().pop();
    b.setColor(0x2c2822);
    for (const side of [-1, 1]) b.box(side * 0.1, 1.27, 0.13, 0.018, 0.14, 0.006); // straps over the chest
  }

  // ---------------- head: skull, jaw, nose, brow, eyes, mouth, ears, hair ----------------
  b.setBone(Bone.Head).setColor(look.skin);
  b.cylinder(0, 1.43, 0, 0.045, 0.05, 0.1, 6); // neck
  b.blob(0, 1.62, 0, 0.098, 0.118, 0.106, 0.04, 7); // skull
  b.bevelBox(0, 1.55, 0.03, 0.072, 0.045, 0.07, 0.03); // jaw
  b.setColor(shade(look.skin, 1.06));
  b.pushTRS(0, 1.6, 0.106, 0);
  b.bevelBox(0, 0, 0, 0.016, 0.03, 0.022, 0.008); // nose (catches light)
  b.pop();
  for (const side of [-1, 1]) b.bevelBox(side * 0.1, 1.615, -0.005, 0.014, 0.03, 0.022, 0.008); // ears
  b.setColor(shade(look.skin, 0.55));
  for (const side of [-1, 1]) b.box(side * 0.04, 1.635, 0.098, 0.022, 0.014, 0.004); // eye sockets
  b.setColor(0x15110e);
  for (const side of [-1, 1]) b.box(side * 0.04, 1.634, 0.1, 0.01, 0.009, 0.004); // pupils
  b.setColor(look.hair === 0x9a8a7a ? 0x6a5d50 : look.hair);
  b.box(0, 1.66, 0.098, 0.068, 0.009, 0.008); // brow line
  b.setColor(shade(look.skin, 0.45));
  b.box(0, 1.555, 0.1, 0.026, 0.004, 0.004); // mouth
  if (look.mask) {
    b.setColor(0x8a2f2a);
    b.blob(0, 1.565, 0.035, 0.1, 0.05, 0.09, 0.08, 5);
  } else if (look.hairStyle === 0) {
    b.setColor(look.hair);
    b.blob(0, 1.548, 0.07, 0.07, 0.035, 0.05, 0.12, 9); // beard (bald heads get a beard)
  }
  if (look.hood) {
    b.setColor(jacket);
    b.blob(0, 1.655, -0.045, 0.122, 0.128, 0.118, 0.06, 13); // hood sits behind the face plane
    b.setColor(seam);
    b.pushTRS(0, 1.6, 0.06, 0).push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    b.cylinder(0, -0.02, 0, 0.118, 0.118, 0.04, 9, false); // hood rim framing the face
    b.pop().pop();
  } else if (look.hairStyle === 1) {
    b.setColor(look.hair);
    b.blob(0, 1.69, -0.012, 0.106, 0.07, 0.112, 0.08, 17);
  } else if (look.hairStyle === 2) {
    b.setColor(look.accent === 0xe8a65a ? 0x5a4a38 : look.accent);
    b.blob(0, 1.705, 0, 0.11, 0.05, 0.115, 0.03, 19); // cap crown
    b.bevelBox(0, 1.69, 0.13, 0.085, 0.012, 0.055, 0.008); // brim
  } else if (look.hairStyle === 3) {
    b.setColor(look.hair);
    b.blob(0, 1.69, -0.012, 0.104, 0.065, 0.11, 0.08, 23);
    b.blob(0, 1.7, -0.12, 0.05, 0.05, 0.045, 0.1, 3); // bun
  }

  // ---------------- arms: tapered sleeves, cuffs, hands with thumbs ----------------
  for (const side of [-1, 1]) {
    const ua = side < 0 ? Bone.UArmL : Bone.UArmR;
    const la = side < 0 ? Bone.LArmL : Bone.LArmR;
    const x = side * 0.27 * w;
    b.setBone(ua).setColor(jacket);
    b.blob(x, 1.37, 0, 0.07, 0.06, 0.07, 0.03, 29); // shoulder cap
    b.cylinder(x, 1.11, 0, 0.052, 0.064, 0.28, 7); // upper sleeve
    b.setBone(la).setColor(jacket);
    b.cylinder(x, 0.9, 0, 0.044, 0.054, 0.23, 7); // forearm sleeve
    b.setColor(seam);
    b.cylinder(x, 0.89, 0, 0.049, 0.049, 0.03, 7, false); // cuff
    b.setColor(look.skin);
    b.bevelBox(x, 0.83, 0.008, 0.024, 0.055, 0.04, 0.016); // palm + fingers (mitten)
    b.bevelBox(x - side * 0.022, 0.845, 0.03, 0.01, 0.026, 0.012, 0.006); // thumb
  }
  const g = b.toGeometry(false, true);
  geoCache.set(key, g);
  return g;
}

/** badge on the left chest */
function side1(w: number): number {
  return -0.11 * w;
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

  /** every live rig (contact shadows read this) */
  static readonly all = new Set<CharacterRig>();

  constructor(public look: Look) {
    CharacterRig.all.add(this);
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
    CharacterRig.all.delete(this);
    this.mesh.skeleton.dispose();
    this.root.removeFromParent();
  }
}
