// Enemies: all eleven types the sim defines, each with its own silhouette, behaviour
// and counter (review P11). Reavers (grunt, scout, brute/sapper, marksman, captain),
// Custodian machines (drone, crawler swarm, shielded guard unit, heavy), wildlife
// (hound pack, boar). Readable state machines with telegraphed attacks, full hit
// feedback, and fairness rules (no spawns in view, none in Haven or restored areas).
import * as THREE from 'three';
import { RESTORATION_FX, XP, districtAt, getItem, getPiece, isNight, type EnemyId } from '@dg/sim';
import type { RestorationState } from '@dg/shared';
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial } from '../render/materials';
import { Bone, CharacterRig, randomLook, type Look } from '../render/character';
import { audio } from '../audio/audio';
import { S } from '../ui/strings';
import type { Game } from './game';

export type EnemyKind = 'raider' | 'scout' | 'brute' | 'sniper' | 'captain' | 'drone' | 'bot' | 'crawler' | 'heavy' | 'hound' | 'boar';
export const ENEMY_KINDS: readonly EnemyKind[] = ['raider', 'scout', 'brute', 'sniper', 'captain', 'drone', 'bot', 'crawler', 'heavy', 'hound', 'boar'];

/** client kind ↔ sim EnemyId (sim data/enemies.ts) */
export const SIM_ID: Record<EnemyKind, EnemyId> = {
  raider: 'raider_grunt',
  scout: 'raider_scout',
  brute: 'raider_brute',
  sniper: 'raider_sniper',
  captain: 'raider_leader',
  drone: 'drone',
  bot: 'guard_bot',
  crawler: 'crawler',
  heavy: 'custodian_heavy',
  hound: 'hound',
  boar: 'boar',
};
export const KIND_OF = Object.fromEntries(Object.entries(SIM_ID).map(([k, v]) => [v, k])) as Record<EnemyId, EnemyKind>;

/** behaviour role: what it does, and what beats it */
export type Role = 'melee' | 'flank' | 'sapper' | 'kite' | 'leader' | 'spotter' | 'swarm' | 'shield' | 'slam' | 'pack' | 'charge';

interface EnemyDef {
  role: Role;
  hp: number;
  speed: number;
  damage: number;
  reach: number;
  windup: number;
  cooldown: number;
  sense: number;
  fly: number; // cruise hover height
  machine: boolean;
  humanoid: boolean;
  loot: { item: string; min: number; max: number; chance?: number }[];
  sfx: 'hitMetal' | 'hitFlesh';
  size: number;
  /** turn rate (rad/s factor); slow turners can be circled */
  turn: number;
  heavy: boolean;
}

const D = (role: Role, o: Partial<EnemyDef> & Pick<EnemyDef, 'hp' | 'speed' | 'damage' | 'loot'>): EnemyDef => ({
  role, reach: 1.7, windup: 0.55, cooldown: 1.5, sense: 18, fly: 0, machine: false, humanoid: false, sfx: 'hitFlesh', size: 0.9, turn: 7, heavy: false, ...o,
});

const DEFS: Record<EnemyKind, EnemyDef> = {
  raider: D('melee', { hp: 60, speed: 3.6, damage: 12, humanoid: true, loot: [{ item: 'mat.scrap', min: 1, max: 3 }, { item: 'food.canned_beans', min: 1, max: 1, chance: 0.4 }, { item: 'med.bandage', min: 1, max: 1, chance: 0.35 }, { item: 'ammo.arrow', min: 2, max: 4, chance: 0.2 }] }),
  scout: D('flank', { hp: 42, speed: 5.0, damage: 9, reach: 1.6, windup: 0.4, cooldown: 1.0, sense: 26, humanoid: true, size: 0.8, loot: [{ item: 'mat.cloth', min: 1, max: 3 }, { item: 'comp.rope', min: 1, max: 1, chance: 0.3 }] }),
  brute: D('sapper', { hp: 150, speed: 2.9, damage: 22, reach: 2.0, windup: 0.9, cooldown: 2.0, sense: 16, humanoid: true, size: 1.15, heavy: true, loot: [{ item: 'mat.scrap', min: 3, max: 6 }, { item: 'comp.fuel', min: 1, max: 1, chance: 0.5 }] }),
  sniper: D('kite', { hp: 48, speed: 3.4, damage: 22, reach: 30, windup: 1.4, cooldown: 2.6, sense: 34, humanoid: true, loot: [{ item: 'ammo.rifle_round', min: 2, max: 5, chance: 0.7 }, { item: 'bp.scrap_rifle', min: 1, max: 1, chance: 0.04 }] }),
  captain: D('leader', { hp: 200, speed: 3.6, damage: 18, reach: 1.9, windup: 0.6, cooldown: 1.3, sense: 24, humanoid: true, size: 1.0, heavy: true, loot: [{ item: 'misc.guild_chit', min: 15, max: 40 }, { item: 'med.first_aid', min: 1, max: 1, chance: 0.4 }, { item: 'bp.scrap_rifle', min: 1, max: 1, chance: 0.2 }] }),
  drone: D('spotter', { hp: 30, speed: 4.6, damage: 7, reach: 10, windup: 0.9, cooldown: 1.8, sense: 26, fly: 3.4, machine: true, sfx: 'hitMetal', size: 0.5, loot: [{ item: 'mat.wiring', min: 1, max: 3 }, { item: 'mat.scrap', min: 1, max: 2 }, { item: 'comp.battery', min: 1, max: 1, chance: 0.25 }] }),
  bot: D('shield', { hp: 140, speed: 1.9, damage: 18, reach: 2.1, windup: 1.0, cooldown: 2.2, sense: 14, machine: true, sfx: 'hitMetal', size: 1.1, turn: 1.6, heavy: true, loot: [{ item: 'mat.scrap', min: 4, max: 7 }, { item: 'comp.circuit', min: 1, max: 1, chance: 0.4 }, { item: 'mat.wiring', min: 2, max: 4 }] }),
  crawler: D('swarm', { hp: 16, speed: 5.0, damage: 5, reach: 1.3, windup: 0.35, cooldown: 1.0, sense: 16, machine: true, sfx: 'hitMetal', size: 0.45, loot: [{ item: 'mat.scrap', min: 1, max: 2 }, { item: 'comp.spring', min: 1, max: 1, chance: 0.2 }] }),
  heavy: D('slam', { hp: 520, speed: 1.6, damage: 32, reach: 4.5, windup: 1.4, cooldown: 2.6, sense: 22, machine: true, sfx: 'hitMetal', size: 1.8, turn: 1.1, heavy: true, loot: [{ item: 'comp.circuit', min: 2, max: 3 }, { item: 'misc.grid_fuse', min: 1, max: 1, chance: 0.6 }, { item: 'bp.turret', min: 1, max: 1, chance: 0.2 }] }),
  hound: D('pack', { hp: 34, speed: 5.4, damage: 8, reach: 1.4, windup: 0.35, cooldown: 1.2, sense: 20, size: 0.6, loot: [{ item: 'food.raw_meat', min: 1, max: 2 }, { item: 'misc.hide', min: 1, max: 1, chance: 0.6 }] }),
  boar: D('charge', { hp: 90, speed: 3.2, damage: 18, reach: 1.6, windup: 0.9, cooldown: 2.0, sense: 16, size: 0.9, turn: 4, loot: [{ item: 'food.raw_meat', min: 3, max: 5 }, { item: 'misc.hide', min: 1, max: 2, chance: 0.9 }] }),
};
export function enemyDef(kind: EnemyKind): Readonly<EnemyDef> {
  return DEFS[kind];
}

type State = 'wander' | 'chase' | 'windup' | 'recover' | 'stagger' | 'flee' | 'charge' | 'dead';

interface Enemy {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  obj: THREE.Object3D;
  rig: CharacterRig | null;
  eye: THREE.Mesh | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  state: State;
  t: number;
  home: THREE.Vector3;
  wanderTo: THREE.Vector3;
  flash: number;
  wave: boolean;
  tag: string;
  targetPiece: number;
  pieceScanT: number;
  trapT: number;
  /** role scratch: orbit angle (drone), flank side (scout), charge dir (boar) */
  side: number;
  aux: number;
  dirX: number;
  dirZ: number;
  /** current hover height (drones dip to fire) */
  alt: number;
  /** captain aura time left (buffed raiders) */
  buff: number;
  /** stunned (boar after a missed charge): takes double damage */
  stun: number;
  /** seconds without progress toward a building target */
  stuckT: number;
  /** heard a noise: keeps investigating this long even without seeing the player */
  alertT: number;
  /** sniper laser / heavy slam ring / sapper charge fx */
  tele: THREE.Object3D | null;
  /** stats for the review check */
  stats: { maxLateral: number; minAlt: number; maxSpeed: number; fired: number; firedNoLos: number; blocked: number; planted: number; orbit: number };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Tier B (GLB) replacements for rigid enemies; procedural geometry is the fallback. */
const modelOverride = new Map<EnemyKind, { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }>();
export function setEnemyModel(kind: EnemyKind, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]): void {
  modelOverride.set(kind, { geo, mat });
}

function cached(key: string, build: (b: MeshBuilder) => void): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (g) return g;
  const b = new MeshBuilder();
  build(b);
  g = b.toGeometry(true);
  geoCache.set(key, g);
  return g;
}

/** body geometry for non-humanoids */
function enemyGeo(kind: EnemyKind): THREE.BufferGeometry {
  return cached(`body:${kind}`, (b) => {
    if (kind === 'drone') {
      // quad-rotor: flat X frame, four rotor discs, sensor pod
      b.setColor(0x4a5258);
      b.bevelBox(0, 0, 0, 0.32, 0.12, 0.32, 0.05);
      b.setColor(0x2a2e32);
      for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
        b.box(x * 0.6, 0, z * 0.6, 0.05, 0.03, 0.05);
        b.cylinder(x, 0.06, z, 0.28, 0.28, 0.02, 10);
      }
      b.setColor(0x6a3a2a);
      b.box(0, -0.18, 0.05, 0.13, 0.07, 0.13);
    } else if (kind === 'crawler') {
      // low spider: flat shell, six splayed legs
      b.setColor(0x3e4448);
      b.bevelBox(0, 0.26, 0, 0.32, 0.12, 0.42, 0.06);
      b.setColor(0x2a2e30);
      for (let i = -1; i <= 1; i++)
        for (const s of [-1, 1]) {
          b.pushTRS(s * 0.42, 0.2, i * 0.27, 0).push(new THREE.Matrix4().makeRotationZ(s * 0.7));
          b.box(0, 0, 0, 0.24, 0.03, 0.03);
          b.pop().pop();
        }
    } else if (kind === 'bot') {
      // guard unit: biped with a tall riot shield on the front
      b.setColor(0x5a6066);
      b.bevelBox(0, 1.35, 0, 0.55, 0.5, 0.4, 0.1);
      b.setColor(0x44494e);
      b.bevelBox(0, 2.0, 0.05, 0.3, 0.2, 0.28, 0.06);
      b.bevelBox(-0.32, 0.45, 0, 0.18, 0.45, 0.22, 0.05);
      b.bevelBox(0.32, 0.45, 0, 0.18, 0.45, 0.22, 0.05);
      b.bevelBox(0.75, 1.2, 0.1, 0.17, 0.5, 0.17, 0.05);
      // shield: 1.2 m wide, 1.7 m tall, out front
      b.setColor(0x3a4046);
      b.bevelBox(-0.1, 1.15, 0.72, 0.62, 0.86, 0.06, 0.04);
      b.setColor(0xc8a040);
      b.box(-0.1, 1.55, 0.79, 0.56, 0.05, 0.01);
      b.box(-0.1, 0.75, 0.79, 0.56, 0.05, 0.01);
    } else if (kind === 'heavy') {
      // custodian heavy: wide hunched four-legged frame, big forearms, back core housing
      b.setColor(0x4e545a);
      b.bevelBox(0, 1.9, -0.1, 1.0, 0.55, 0.75, 0.14);
      b.setColor(0x3e4348);
      b.bevelBox(0, 2.55, 0.45, 0.42, 0.28, 0.38, 0.08);
      for (const [x, z] of [[-0.75, -0.6], [0.75, -0.6], [-0.85, 0.45], [0.85, 0.45]]) b.bevelBox(x, 0.7, z, 0.2, 0.7, 0.22, 0.06);
      b.setColor(0x5a6066);
      b.bevelBox(-1.3, 1.5, 0.55, 0.32, 0.85, 0.32, 0.08);
      b.bevelBox(1.3, 1.5, 0.55, 0.32, 0.85, 0.32, 0.08);
      b.setColor(0x2a2e32);
      b.bevelBox(0, 2.0, -0.9, 0.38, 0.3, 0.12, 0.05);
      b.setColor(0xc8a040);
      b.box(0, 2.42, 0.72, 0.5, 0.05, 0.01);
    } else if (kind === 'boar') {
      // boar: deep body, high shoulder hump, low head, tusks, short legs
      b.setColor(0x4a3a2e);
      b.bevelBox(0, 0.62, -0.05, 0.32, 0.3, 0.62, 0.12);
      b.bevelBox(0, 0.9, 0.25, 0.28, 0.18, 0.3, 0.1);
      b.setColor(0x3e3026);
      b.bevelBox(0, 0.55, 0.78, 0.2, 0.2, 0.24, 0.08);
      b.setColor(0x2e2620);
      b.box(0, 0.5, 1.05, 0.11, 0.09, 0.06);
      b.setColor(0xe8e0cc);
      b.box(-0.14, 0.52, 0.98, 0.03, 0.09, 0.03);
      b.box(0.14, 0.52, 0.98, 0.03, 0.09, 0.03);
      b.setColor(0x34281f);
      for (const [x, z] of [[-0.18, -0.45], [0.18, -0.45], [-0.18, 0.4], [0.18, 0.4]]) b.box(x, 0.18, z, 0.07, 0.18, 0.07);
      b.box(0, 0.75, -0.7, 0.03, 0.03, 0.12);
    } else {
      // hound: lean quadruped, raised head, tail
      b.setColor(0x5a4a3a);
      b.bevelBox(0, 0.55, 0, 0.18, 0.18, 0.45, 0.06);
      b.bevelBox(0, 0.72, 0.5, 0.13, 0.12, 0.17, 0.04);
      b.setColor(0x4a3a2c);
      for (const [x, z] of [[-0.12, -0.3], [0.12, -0.3], [-0.12, 0.3], [0.12, 0.3]]) b.box(x, 0.2, z, 0.05, 0.2, 0.05);
      b.box(0, 0.6, -0.55, 0.03, 0.03, 0.16);
    }
  });
}

/** gear on humanoid Reavers: what makes each readable by shape from 30 m */
function gear(kind: EnemyKind, rig: CharacterRig, mat: THREE.Material): void {
  const add = (parent: THREE.Object3D, key: string, build: (b: MeshBuilder) => void, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(cached(`gear:${key}`, build), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    parent.add(m);
  };
  const chest = rig.bones[Bone.Chest];
  const head = rig.bones[Bone.Head];
  if (kind === 'raider') {
    // pipe club in hand, spiked shoulder pad
    add(rig.hand, 'pipe', (b) => (b.setColor(0x6a6e72), b.cylinder(0, -0.1, 0, 0.045, 0.045, 0.9, 6)), 0, 0, 0, 0.3);
    add(chest, 'pauldron', (b) => (b.setColor(0x5a4e44), b.bevelBox(0.26, 0.28, 0, 0.14, 0.06, 0.14, 0.03), b.setColor(0x8a8a86), b.cylinder(0.3, 0.33, 0, 0.04, 0, 0.18, 4)));
  } else if (kind === 'scout') {
    // long spear held upright, cape
    add(rig.hand, 'spear', (b) => (b.setColor(0x6a5038), b.cylinder(0, -0.9, 0, 0.025, 0.025, 2.3, 5), b.setColor(0xb0b4b8), b.cylinder(0, 1.4, 0, 0.05, 0, 0.3, 4)), 0, 0, 0, 0.12);
    add(chest, 'cape', (b) => (b.setColor(0x4a3a30), b.box(0, -0.25, -0.2, 0.26, 0.42, 0.015)), 0, 0, 0, -0.18);
  } else if (kind === 'brute') {
    // demolition barrel strapped on the back (it plants charges on buildings)
    add(chest, 'barrel', (b) => (b.setColor(0x8a2f2a), b.cylinder(0, -0.05, -0.38, 0.24, 0.24, 0.62, 10), b.setColor(0xc8a040), b.cylinder(0, 0.12, -0.38, 0.245, 0.245, 0.07, 10), b.setColor(0x2a2a2a), b.cylinder(0, 0.27, -0.38, 0.03, 0.03, 0.18, 4)));
  } else if (kind === 'sniper') {
    // long rifle across the back, wide-brimmed hat
    add(chest, 'rifle', (b) => (b.setColor(0x3a3530), b.box(0, 0, -0.2, 0.035, 0.75, 0.035), b.setColor(0x6a4a32), b.box(0, -0.5, -0.2, 0.05, 0.16, 0.05)), 0, 0.1, 0, 0, 0.7);
    add(head, 'hat', (b) => (b.setColor(0x4a3e30), b.cylinder(0, 0.2, 0, 0.36, 0.36, 0.03, 12), b.cylinder(0, 0.23, 0, 0.16, 0.18, 0.14, 10)));
  } else if (kind === 'captain') {
    // banner pole with a red flag high above the head
    add(chest, 'banner', (b) => (b.setColor(0x3a2e24), b.cylinder(0, 0.6, -0.24, 0.03, 0.03, 1.9, 5), b.setColor(0x9a2a24), b.box(0.32, 1.35, -0.24, 0.3, 0.22, 0.01), b.setColor(0xe8d8b0), b.box(0.32, 1.35, -0.25, 0.08, 0.08, 0.005)));
  }
}

const LOOKS: Partial<Record<EnemyKind, Partial<Look>>> = {
  raider: { mask: true, shirt: 0x5a3a32, accent: 0x8a2f2a, hairStyle: 2 },
  scout: { mask: true, hood: true, shirt: 0x4a4a3a, accent: 0x6a5a3a, build: 0.86, height: 0.97 },
  brute: { mask: true, shirt: 0x6a3a2a, accent: 0x8a2f2a, build: 1.3, height: 1.06, hairStyle: 0 },
  sniper: { mask: false, shirt: 0x4e4a3e, accent: 0x8a2f2a, build: 0.92, hairStyle: 0 },
  captain: { mask: false, shirt: 0x7a2a24, accent: 0xc8a040, build: 1.12, height: 1.05, hairStyle: 1 },
};
const SCALE: Partial<Record<EnemyKind, number>> = { brute: 1.22, captain: 1.08, scout: 0.95 };

const eyeGeo = new THREE.SphereGeometry(0.07, 6, 4);
const ringGeo = (() => {
  const g = new THREE.RingGeometry(0.92, 1, 40);
  g.rotateX(-Math.PI / 2);
  return g;
})();

const REAVERS: ReadonlySet<EnemyKind> = new Set(['raider', 'scout', 'brute', 'sniper', 'captain']);

/** radius around Haven's centre that ambient enemies keep out of (raids and node waves excepted) */
export const HAVEN_SAFE_R = 48;

export class Enemies {
  list: Enemy[] = [];
  private nextId = 1;
  private spawnT = 4;
  private mat = makeChunkMaterial();
  private gearMat = makeChunkMaterial();
  private eyeMatIdle = new THREE.MeshBasicMaterial({ color: 0xe2574c });
  private eyeMatWarn = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  private coreMat = new THREE.MeshBasicMaterial({ color: 0x5ff0e0 });
  private laserMat = new THREE.LineBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85 });
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  private tmp = new THREE.Vector3();
  /** seconds since last hostile contact (drives combat music) */
  private sinceCombat = 99;
  enabled = true;
  private tmpP = { x: 0, y: 0, z: 0 };
  private readonly lookAt = new THREE.Vector3();
  private projGeo: THREE.BufferGeometry;
  private projMat = new THREE.MeshBasicMaterial({ color: 0xe8d8b0 });
  private projs: { mesh: THREE.Mesh; vel: THREE.Vector3; dmg: number; life: number }[] = [];
  /** light hounds will not enter at night: camp fires (static) + powered floodlights */
  private lights: { x: number; z: number; r: number }[] = [];
  private lightT = 0;

  /** Fire a projectile from the player along the camera (with gentle aim assist). */
  private fire(dmg: number, range: number, weapon: string): void {
    const g = this.game;
    const p = g.player.pos;
    let dir = new THREE.Vector3(Math.sin(g.camera.yaw), Math.sin(g.camera.pitch) * 0.5 + 0.02, Math.cos(g.camera.yaw)).normalize();
    // aim assist: snap toward the best enemy within a 25° cone
    let best: Enemy | null = null;
    let bestDot = Math.cos(0.44);
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const to = this.tmp.set(e.pos.x - p.x, e.pos.y + (e.def.fly ? 0 : 1.0) - (p.y + 1.4), e.pos.z - p.z);
      const d = to.length();
      if (d > range) continue;
      const dot = to.normalize().dot(dir);
      if (dot > bestDot) {
        bestDot = dot;
        best = e;
      }
    }
    if (best) dir = new THREE.Vector3(best.pos.x - p.x, best.pos.y + (best.def.fly ? 0 : 1.0) - (p.y + 1.4), best.pos.z - p.z).normalize();
    g.player.yaw = Math.atan2(dir.x, dir.z);
    const m = new THREE.Mesh(this.projGeo, this.projMat);
    m.position.set(p.x + dir.x * 0.6, p.y + 1.4, p.z + dir.z * 0.6);
    m.lookAt(m.position.clone().add(dir));
    g.scene.add(m);
    const speed = weapon.includes('rifle') ? 80 : weapon.includes('nail') ? 45 : 32;
    this.projs.push({ mesh: m, vel: dir.multiplyScalar(speed), dmg, life: range / speed + 0.1 });
    audio.play(weapon.includes('rifle') || weapon.includes('nail') ? 'shot' : 'bow', { vol: 0.8 });
    g.camera.addTrauma(weapon.includes('rifle') ? 0.25 : 0.08);
    g.camera.kickFov(weapon.includes('rifle') ? 3 : 1);
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.life -= dt;
      pr.vel.y -= 4 * dt;
      pr.mesh.position.addScaledVector(pr.vel, dt);
      const pos = pr.mesh.position;
      let hit: Enemy | null = null;
      for (const e of this.list) {
        if (e.state === 'dead') continue;
        const cy = e.pos.y + (e.def.fly ? 0 : 0.9);
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.def.size * 0.8 + 0.3 && Math.abs(cy - pos.y) < 1.1) {
          hit = e;
          break;
        }
      }
      const ground = this.game.view.surface(pos.x, pos.z);
      if (hit) this.damage(hit, pr.dmg, this.tmp.copy(pr.vel).setY(0).normalize());
      if (hit || pr.life <= 0 || pos.y < ground) {
        if (!hit) this.game.fx.dust(pos.x, Math.max(ground, pos.y), pos.z, 2);
        pr.mesh.removeFromParent();
        this.projs.splice(i, 1);
      }
    }
  }

  constructor(private game: Game) {
    game.tickers.push((dt, simDt) => this.update(simDt));
    game.swingHook = (dmg) => this.playerSwing(dmg);
    game.fireHook = (dmg, range, weapon) => this.fire(dmg, range, weapon);
    game.noiseHook = (x, z, r) => this.noise(x, z, r);
    const pg = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4);
    pg.rotateX(Math.PI / 2);
    this.projGeo = pg;
  }

  aliveTagged(tag: string): number {
    let n = 0;
    for (const e of this.list) if (e.state !== 'dead' && e.tag === tag) n++;
    return n;
  }

  get alive(): number {
    let n = 0;
    for (const e of this.list) if (e.state !== 'dead') n++;
    return n;
  }

  spawn(kind: EnemyKind, x: number, z: number, wave = false, tag = ''): void {
    const def = DEFS[kind];
    if (!def) return;
    let obj: THREE.Object3D;
    let rig: CharacterRig | null = null;
    let eye: THREE.Mesh | null = null;
    if (def.humanoid) {
      rig = new CharacterRig(randomLook(this.nextId * 131 + 7, LOOKS[kind] ?? {}));
      rig.root.scale.setScalar(SCALE[kind] ?? 1);
      gear(kind, rig, this.gearMat);
      obj = new THREE.Group();
      obj.add(rig.root);
    } else {
      const ov = modelOverride.get(kind);
      const m = new THREE.Mesh(ov?.geo ?? enemyGeo(kind), ov?.mat ?? this.mat);
      m.castShadow = true;
      obj = new THREE.Group();
      obj.add(m);
      eye = new THREE.Mesh(eyeGeo, this.eyeMatIdle);
      const EYE: Partial<Record<EnemyKind, [number, number]>> = { bot: [2.02, 0.33], drone: [-0.02, 0.33], crawler: [0.32, 0.4], heavy: [2.6, 0.82], boar: [0.68, 0.98], hound: [0.75, 0.68] };
      const [ey, ez] = EYE[kind] ?? [0.75, 0.68];
      eye.position.set(0, ey, ez);
      if (!def.machine) eye.scale.setScalar(0.4);
      if (kind === 'heavy') eye.scale.setScalar(1.6);
      obj.add(eye);
      if (kind === 'heavy') {
        // the weak point: a glowing core on its back (double damage from behind)
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.08), this.coreMat);
        core.position.set(0, 2.0, -1.04);
        obj.add(core);
      }
    }
    const y = this.game.view.surface(x, z) + def.fly;
    obj.position.set(x, y, z);
    obj.scale.setScalar(0.01);
    this.game.scene.add(obj);
    const pos = new THREE.Vector3(x, y, z);
    const id = this.nextId++;
    this.list.push({
      id, kind, def, obj, rig, eye, pos, vel: new THREE.Vector3(), yaw: Math.random() * 6.28, hp: def.hp, state: wave ? 'chase' : 'wander', t: 0,
      home: pos.clone(), wanderTo: pos.clone(), flash: 0, wave, tag, targetPiece: -1, pieceScanT: 0, trapT: 0,
      side: id % 2 ? 1 : -1, aux: Math.random() * 6.28, dirX: 0, dirZ: 0, alt: def.fly, buff: 0, stun: 0, stuckT: 0, alertT: 0, tele: null,
      stats: { maxLateral: 0, minAlt: 99, maxSpeed: 0, fired: 0, firedNoLos: 0, blocked: 0, planted: 0, orbit: 0 },
    });
    if (def.machine) audio.play('drone', { pos: { x, z }, vol: 0.4 });
  }

  /** Spawn a wave of machines around a point (node defense); heavier kinds with danger. */
  wave(cx: number, cz: number, count: number, danger: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 22 + Math.random() * 8;
      const kind: EnemyKind = danger >= 3 && i === 0 ? 'heavy' : danger >= 2 && i % 4 === 1 ? 'bot' : i % 2 === 0 ? 'drone' : 'crawler';
      setTimeout(() => this.spawn(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, true), i * 350);
    }
  }

  /** Ambient spawn table by district and threat tier (district danger + town rank). */
  static ambientKind(district: string, tier: number, roll: number): { kind: EnemyKind; n: number } {
    const pick = (t: [EnemyKind, number, number, number?][]): { kind: EnemyKind; n: number } => {
      // [kind, weight, minTier, pack size]
      const ok = t.filter((x) => tier >= x[2]);
      const total = ok.reduce((s, x) => s + x[1], 0);
      let r = roll * total;
      for (const x of ok) if ((r -= x[1]) <= 0) return { kind: x[0], n: x[3] ?? 1 };
      const l = ok[ok.length - 1];
      return { kind: l[0], n: l[3] ?? 1 };
    };
    switch (district) {
      case 'outskirts':
        return pick([['hound', 5, 0, 3], ['boar', 3, 0], ['raider', 2, 1], ['scout', 1, 2]]);
      case 'residential':
        return pick([['raider', 4, 0], ['hound', 2, 0, 2], ['scout', 3, 1], ['sniper', 1, 3]]);
      case 'market':
        return pick([['raider', 4, 0], ['scout', 3, 0], ['sniper', 2, 2], ['brute', 1, 3]]);
      case 'rail':
        return pick([['raider', 3, 0], ['scout', 2, 0], ['brute', 2, 1], ['sniper', 2, 2], ['captain', 1, 3]]);
      case 'industrial':
        return pick([['crawler', 4, 0, 4], ['drone', 3, 0], ['bot', 2, 1], ['heavy', 1, 3]]);
      case 'downtown':
        return pick([['drone', 4, 0], ['crawler', 3, 0, 4], ['bot', 2, 2], ['heavy', 1, 4]]);
      case 'hospital':
        return pick([['drone', 3, 0], ['crawler', 3, 0, 3], ['raider', 2, 0], ['bot', 1, 2]]);
      case 'waterworks':
        return pick([['drone', 3, 0], ['hound', 2, 0, 2], ['crawler', 3, 0, 3], ['bot', 1, 2]]);
      default:
        return pick([['drone', 3, 0], ['crawler', 3, 0, 3], ['raider', 2, 0]]);
    }
  }

  private ambientSpawn(): void {
    const g = this.game;
    if (!this.enabled || g.mode !== 'play') return;
    const p = g.player.pos;
    const d = districtAt(g.layout, p.x, p.z);
    const st = (g.save.world.districts[d.index]?.state ?? 0) as RestorationState;
    const hostile = RESTORATION_FX[st].hostile * (d.key === 'haven' ? 0 : 1);
    const night = g.atm.daylight < 0.3 ? 1.6 : 1;
    const cap = Math.round((2 + d.danger) * hostile * night);
    if (this.alive >= cap || hostile <= 0.01) return;
    // spawn behind the player, out of view, never in Haven
    const camYaw = g.camera.yaw + Math.PI + (Math.random() - 0.5) * 1.6;
    const r = 30 + Math.random() * 12;
    const x = p.x + Math.sin(camYaw) * r, z = p.z + Math.cos(camYaw) * r;
    if (x < 10 || z < 10 || x > 1206 || z > 1206) return;
    const sd = districtAt(g.layout, x, z);
    if (sd.key === 'haven' || g.view.surface(x, z) < -0.2) return;
    // never spawn near the Haven safe zone
    if (Math.hypot(x - g.layout.spawn.x, z - g.layout.spawn.z) < HAVEN_SAFE_R + 30) return;
    // don't spawn inside buildings
    let blocked = false;
    g.collision.query(x - 1, z - 1, x + 1, z + 1, (c) => {
      if (c.maxY > 0.6) blocked = true;
    });
    if (blocked) return;
    const tier = Math.min(4, sd.danger + Math.floor(Number(g.save.world.flags['rank'] ?? 1) / 3));
    const { kind, n } = Enemies.ambientKind(sd.key, tier, Math.random());
    const count = kind === 'crawler' ? n + Math.floor(Math.random() * 2) : n;
    for (let i = 0; i < count; i++) this.spawn(kind, x + (i % 3) * 1.5, z + Math.floor(i / 3) * 1.5);
  }

  private refreshLights(): void {
    const g = this.game;
    this.lights.length = 0;
    for (const f of g.camp?.firePositions?.() ?? []) this.lights.push({ x: f.x, z: f.z, r: 9 });
    for (const p of g.save.world.pieces) if (p.piece === 'floodlight' && g.poweredAt(p.x, p.z)) this.lights.push({ x: p.x, z: p.z, r: 10 * (1 + g.pk('floodRange')) });
  }

  /** nearest light the point is inside (hounds), or null */
  private inLight(x: number, z: number, pad = 0): { x: number; z: number; r: number } | null {
    for (const l of this.lights) if (Math.hypot(x - l.x, z - l.z) < l.r + pad) return l;
    return null;
  }

  private firstSight(e: Enemy): void {
    const f = this.game.save.world.flags;
    const key = `seen:${e.kind}`;
    if (f[key]) return;
    f[key] = true;
    const info = S.enemy[e.kind];
    if (info) this.game.toast(S.enemyNew(info.name, info.counter), 'bad');
  }

  private update(dt: number): void {
    const g = this.game;
    if (dt <= 0) return;
    this.updateProjectiles(dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 6 + Math.random() * 6;
      this.ambientSpawn();
    }
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 2;
      this.refreshLights();
    }
    const night = isNight(g.save.world.hour);
    const pp = g.player.pos;
    let nearestMachine = 99;
    let engaged = 0;
    // captain aura: Reavers near a live captain move and hit harder
    for (const c of this.list) {
      if (c.kind !== 'captain' || c.state === 'dead') continue;
      for (const e of this.list) if (e !== c && REAVERS.has(e.kind) && e.state !== 'dead' && e.pos.distanceToSquared(c.pos) < 12 * 12) e.buff = 0.6;
    }
    for (const e of this.list) {
      e.t += dt;
      e.buff = Math.max(0, e.buff - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.alertT = Math.max(0, e.alertT - dt);
      if (e.obj.scale.x < 1 && e.state !== 'dead') e.obj.scale.setScalar(Math.min(1, e.obj.scale.x + dt * 3));
      const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      if (e.def.machine) nearestMachine = Math.min(nearestMachine, dist);
      if (e.state === 'dead') {
        e.obj.scale.multiplyScalar(1 - dt * 3);
        e.obj.position.y -= dt * 0.8;
        continue;
      }
      // despawn far ambient enemies
      if (dist > 80 && e.tag !== 'raid') {
        this.die(e);
        continue;
      }
      const playerAlive = g.mode === 'play' || g.mode === 'build';
      const speed = e.def.speed * (e.buff > 0 ? 1.2 : 1);
      // Haven safe zone (round 6): ambient enemies never press into Haven. With the player inside
      // the ring they give up the chase; one that strays inside backs off. Raids and node waves still come.
      if (e.tag === '' && !e.wave && (e.state === 'chase' || e.state === 'wander' || e.state === 'windup' || e.state === 'recover')) {
        const hs = g.layout.spawn;
        const playerSafe = Math.hypot(pp.x - hs.x, pp.z - hs.z) < HAVEN_SAFE_R;
        const selfIn = Math.hypot(e.pos.x - hs.x, e.pos.z - hs.z) < HAVEN_SAFE_R + 6;
        if (selfIn || (playerSafe && e.state !== 'wander')) {
          e.state = 'flee';
          e.t = 0;
        }
      }
      // Shadow perk: enemies notice you later
      const sense = e.def.sense * (g.atm.daylight < 0.3 ? 0.75 : 1) * (1 - Math.min(0.6, g.pk('stealth')));
      const x0 = e.pos.x, z0 = e.pos.z;
      switch (e.state) {
        case 'wander': {
          const inHaven = !e.wave && e.tag === '' && Math.hypot(pp.x - g.layout.spawn.x, pp.z - g.layout.spawn.z) < HAVEN_SAFE_R;
          if ((dist < sense && playerAlive && !inHaven) || (e.wave && playerAlive)) {
            e.state = 'chase';
            e.t = 0;
            this.firstSight(e);
            if (e.kind === 'drone') this.alert(e);
            audio.play(e.def.machine ? 'node' : 'hurt', { pos: e.pos, pitch: e.def.machine ? 0.6 : 0.5, vol: 0.5 });
            break;
          }
          if (e.pos.distanceTo(e.wanderTo) < 1 || e.t > 6) {
            e.wanderTo.set(e.home.x + (Math.random() - 0.5) * 16, 0, e.home.z + (Math.random() - 0.5) * 16);
            e.t = 0;
          }
          this.steer(e, e.wanderTo.x, e.wanderTo.z, speed * 0.35, dt);
          break;
        }
        case 'flee': {
          // morale break / retreat: run straight away from the player
          this.steer(e, e.pos.x - dx, e.pos.z - dz, speed * 1.05, dt);
          if (e.t > 5) {
            e.state = dist < sense ? 'chase' : 'wander';
            e.t = 0;
            e.home.copy(e.pos);
          }
          break;
        }
        case 'charge': {
          // boar: straight line along the locked direction; a wall or tree stuns it
          const v = 11;
          e.pos.x += e.dirX * v * dt;
          e.pos.z += e.dirZ * v * dt;
          e.yaw = Math.atan2(e.dirX, e.dirZ);
          if (e.t % 0.15 < dt) g.fx.dust(e.pos.x, e.pos.y + 0.1, e.pos.z, 2);
          if (dist < 1.6 && !g.player.dodging && playerAlive) {
            g.hurt(e.def.damage * 1.4, 'blunt', e.kind);
            g.player.vel.x += e.dirX * 9;
            g.player.vel.z += e.dirZ * 9;
            g.camera.addTrauma(0.45);
            e.state = 'recover';
            e.t = 0;
          } else if (e.t > 1.4) {
            e.state = 'recover';
            e.t = 0;
          }
          break;
        }
        case 'chase':
          engaged++;
          if (this.chase(e, dist, dx, dz, sense, speed, playerAlive, night, dt)) break;
          break;
        case 'windup':
          engaged++;
          this.windup(e, dist, dx, dz, playerAlive, dt);
          break;
        case 'recover':
          engaged++;
          if (e.kind === 'drone') e.alt = Math.min(e.def.fly, e.alt + dt * 1.6);
          if (e.t >= e.def.cooldown) {
            e.state = 'chase';
            e.t = 0;
          }
          break;
        case 'stagger':
          engaged++;
          e.pos.addScaledVector(e.vel, dt);
          e.vel.multiplyScalar(1 - dt * 6);
          if (e.t > 0.45) {
            // scouts retreat when hurt
            e.state = e.kind === 'scout' && e.hp < e.def.hp * 0.4 ? 'flee' : 'chase';
            e.t = 0;
          }
          break;
      }
      if (e.tele && e.state !== 'windup') this.clearTele(e);
      // collide with world + separate
      const tmp = this.tmpP;
      tmp.x = e.pos.x;
      tmp.y = e.pos.y - e.alt;
      tmp.z = e.pos.z;
      if (!e.def.fly) g.collision.resolve(tmp, e.def.size * 0.6, 1.6, 0.45);
      e.pos.x = tmp.x;
      e.pos.z = tmp.z;
      const moved = Math.hypot(e.pos.x - x0, e.pos.z - z0) / dt;
      e.stats.maxSpeed = Math.max(e.stats.maxSpeed, moved);
      if (e.state === 'chase' && e.targetPiece >= 0) e.stuckT = moved < speed * 0.25 ? e.stuckT + dt : 0;
      // hounds never end a step inside firelight / floodlight at night
      if (e.def.role === 'pack' && night && this.inLight(e.pos.x, e.pos.z, 0.3)) {
        e.pos.x = x0;
        e.pos.z = z0;
        const l = this.inLight(x0, z0, 0.3);
        if (l) {
          const ax = x0 - l.x, az = x0 === l.x && z0 === l.z ? 1 : z0 - l.z;
          const ad = Math.hypot(ax, az) || 1;
          e.pos.x += (ax / ad) * e.def.speed * dt;
          e.pos.z += (az / ad) * e.def.speed * dt;
        }
      }
      if (e.state === 'charge' && e.t > 0.15 && moved < 4) {
        // ran into something solid: stunned, takes double damage
        e.state = 'stagger';
        e.t = -2;
        e.stun = 2.5;
        e.vel.set(0, 0, 0);
        e.stats.blocked++;
        audio.play('hitWood', { pos: e.pos, pitch: 0.6 });
        g.camera.addTrauma(0.15);
      }
      const ground = g.view.surface(e.pos.x, e.pos.z);
      e.pos.y = ground + e.alt + (e.def.fly ? Math.sin(e.t * 3 + e.id) * 0.12 : 0);
      if (e.def.fly) e.stats.minAlt = Math.min(e.stats.minAlt, e.alt);
      if (!e.def.fly) this.checkTraps(e, dt);
      e.obj.position.copy(e.pos);
      e.obj.rotation.y = e.yaw;
      if (e.kind === 'drone') e.obj.rotation.z = Math.sin(e.t * 2) * 0.1;
      if (e.flash > 0) {
        e.flash -= dt;
        e.obj.position.x += (Math.random() - 0.5) * 0.08;
      }
      if (e.rig) {
        e.rig.speed = e.state === 'chase' || e.state === 'flee' ? speed : e.state === 'wander' ? speed * 0.35 : 0;
        if (e.state === 'chase' || e.state === 'wander' || e.state === 'flee') e.rig.setState('idle');
        e.rig.lookTarget = e.state === 'wander' ? null : this.lookAt.copy(g.player.pos);
        e.rig.update(dt);
      }
    }
    // cleanup
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.state === 'dead' && (e.obj.scale.x < 0.05 || e.t > 1.5)) {
        this.clearTele(e);
        if (e.rig) e.rig.dispose();
        e.obj.removeFromParent();
        this.list.splice(i, 1);
      }
    }
    this.sinceCombat = engaged > 0 ? 0 : this.sinceCombat + dt;
    g.combatLevel += ((this.sinceCombat < 4 ? 1 : 0) - g.combatLevel) * Math.min(1, dt * 0.8);
    g.machineProximity = Math.max(0, 1 - nearestMachine / 30);
  }

  /** Role behaviour while chasing. */
  private chase(e: Enemy, dist: number, dx: number, dz: number, sense: number, speed: number, playerAlive: boolean, night: boolean, dt: number): boolean {
    const g = this.game;
    const pp = g.player.pos;
    // raids (and sappers always) go for buildings when the player is not close
    if ((e.tag === 'raid' && dist > 18) || (e.def.role === 'sapper' && dist > 3.5)) {
      e.pieceScanT -= dt;
      if (e.pieceScanT <= 0) {
        e.pieceScanT = 1;
        e.targetPiece = this.nearestPiece(e);
      }
      const tp = e.targetPiece >= 0 ? g.base.pos.get(e.targetPiece) : undefined;
      if (tp) {
        // distance to the piece's footprint, not its centre: a 4 m wall is hit anywhere along it
        const pc = g.save.world.pieces.find((q) => q.id === e.targetPiece);
        let pd = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z);
        const pdef = pc ? getPiece(pc.piece) : undefined;
        if (pc && pdef) {
          const odd = pc.rot % 2 === 1;
          const hw = (odd ? pdef.size.d : pdef.size.w) / 2, hd = (odd ? pdef.size.w : pdef.size.d) / 2;
          pd = Math.hypot(Math.max(Math.abs(tp.x - e.pos.x) - hw, 0), Math.max(Math.abs(tp.z - e.pos.z) - hd, 0)) + 0.6;
        }
        if (pd < 2.2 || (pd < 5 && e.stuckT > 1.2)) {
          // close enough, or pinned against props/rubble next to it: plant / swing anyway
          e.stuckT = 0;
          this.startWindup(e);
        } else {
          this.steer(e, tp.x, tp.z, speed, dt);
        }
        return true;
      }
    } else e.targetPiece = -1;
    if (!playerAlive || (dist > sense * 2.2 && e.alertT <= 0)) {
      e.wave = false;
      e.state = 'wander';
      e.home.copy(e.pos);
      return true;
    }
    switch (e.def.role) {
      case 'flank': {
        // approach from the side: aim at a point beside the player until close
        if (dist > 5) {
          const nx = dx / dist, nz = dz / dist;
          const off = Math.min(7, dist * 0.5);
          const tx = pp.x - nx * 2 + -nz * off * e.side, tz = pp.z - nz * 2 + nx * off * e.side;
          this.steer(e, tx, tz, speed, dt);
          if (e.dirX === 0 && e.dirZ === 0) {
            e.dirX = nx;
            e.dirZ = nz;
          }
          const lateral = Math.abs((e.pos.x - pp.x) * -e.dirZ + (e.pos.z - pp.z) * e.dirX);
          e.stats.maxLateral = Math.max(e.stats.maxLateral, lateral);
          return true;
        }
        break;
      }
      case 'kite': {
        // keep 14-24 m, back off when rushed, fire only with a clear line
        if (dist < 13) this.steer(e, e.pos.x - dx, e.pos.z - dz, speed * 0.85, dt);
        else if (dist > 24) this.steer(e, pp.x, pp.z, speed, dt);
        else {
          e.yaw = Math.atan2(dx, dz);
          if (e.t > e.def.cooldown * 0.5 && this.los(e)) this.startWindup(e);
        }
        return true;
      }
      case 'spotter': {
        // orbit at range and height; dip to fire (that is when melee can reach it)
        e.aux += dt * 0.9;
        e.stats.orbit += dt * 0.9;
        e.alt = Math.min(e.def.fly, e.alt + dt * 1.5);
        const r = 8;
        this.steer(e, pp.x + Math.cos(e.aux) * r, pp.z + Math.sin(e.aux) * r, speed, dt);
        e.yaw = Math.atan2(dx, dz);
        if (dist < e.def.reach && e.t > 1.2) this.startWindup(e);
        return true;
      }
      case 'pack': {
        // hounds will not step into firelight or a powered floodlight at night
        if (night) {
          const l = this.inLight(pp.x, pp.z, 1.5);
          if (l) {
            const ax = e.pos.x - l.x, az = e.pos.z - l.z;
            const ad = Math.hypot(ax, az) || 1;
            const edge = l.r + 2;
            const a = Math.atan2(az, ax) + dt * 0.6 * e.side;
            this.steer(e, l.x + Math.cos(a) * edge, l.z + Math.sin(a) * edge, speed * (ad < edge ? 1.2 : 0.6), dt);
            return true;
          }
        }
        // circle in from behind the player
        if (dist > 3.5) {
          const behind = g.player.yaw + Math.PI + 0.5 * e.side;
          this.steer(e, pp.x + Math.sin(behind) * 2, pp.z + Math.cos(behind) * 2, speed, dt);
          return true;
        }
        break;
      }
      case 'charge': {
        if (dist < 14 && dist > 3 && e.t > 0.6 && this.los(e)) {
          this.startWindup(e);
          return true;
        }
        break;
      }
      case 'shield':
      case 'slam': {
        // slow turners: the player can get round the shield / to the back core
        if (dist < e.def.reach) {
          this.startWindup(e);
          return true;
        }
        this.steer(e, pp.x, pp.z, speed, dt);
        return true;
      }
      default:
        break;
    }
    if (dist < e.def.reach) this.startWindup(e);
    else this.steer(e, pp.x, pp.z, speed, dt);
    return true;
  }

  private startWindup(e: Enemy): void {
    const g = this.game;
    e.state = 'windup';
    e.t = 0;
    if (e.eye) e.eye.material = this.eyeMatWarn;
    if (e.rig) {
      e.rig.setState('attack');
      e.rig.attackDur = e.def.windup * 1.4;
    }
    const pp = g.player.pos;
    if (e.def.role === 'charge') {
      const d = Math.hypot(pp.x - e.pos.x, pp.z - e.pos.z) || 1;
      e.dirX = (pp.x - e.pos.x) / d;
      e.dirZ = (pp.z - e.pos.z) / d;
      audio.play('hurt', { pos: e.pos, pitch: 0.35, vol: 0.6 });
    } else if (e.def.role === 'kite') {
      // red laser line from the rifle to the player
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(geo, this.laserMat);
      line.frustumCulled = false;
      g.scene.add(line);
      e.tele = line;
    } else if (e.def.role === 'slam') {
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.position.copy(e.pos).setY(g.view.surface(e.pos.x, e.pos.z) + 0.06);
      ring.scale.setScalar(0.5);
      g.scene.add(ring);
      e.tele = ring;
      audio.play('alarm', { pos: e.pos, pitch: 0.5, vol: 0.5 });
    } else if (e.def.role === 'sapper' && e.targetPiece >= 0) {
      audio.play('alarm', { pos: e.pos, pitch: 1.4, vol: 0.35 });
    }
  }

  private windup(e: Enemy, dist: number, dx: number, dz: number, playerAlive: boolean, dt: number): void {
    const g = this.game;
    const pp = g.player.pos;
    const role = e.def.role;
    if (e.targetPiece < 0 && role !== 'charge') {
      // slow turners keep turning slowly while winding up
      let dy = Math.atan2(dx, dz) - e.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, dt * e.def.turn);
    }
    const windup = role === 'sapper' && e.targetPiece >= 0 ? 2.2 : e.def.windup;
    // telegraphs
    if (role === 'kite' && e.tele) {
      const a = (e.tele as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute;
      const hy = e.pos.y + 1.45 * (SCALE[e.kind] ?? 1);
      a.setXYZ(0, e.pos.x, hy, e.pos.z);
      a.setXYZ(1, pp.x, pp.y + 1.2, pp.z);
      a.needsUpdate = true;
      this.laserMat.opacity = 0.35 + 0.6 * (e.t / windup);
    } else if (role === 'slam' && e.tele) {
      e.tele.scale.setScalar(0.5 + (e.def.reach - 0.5) * Math.min(1, e.t / windup));
    } else if (role === 'spotter') {
      e.alt = Math.max(1.5, e.alt - dt * 3);
    } else if (role === 'sapper' && e.targetPiece >= 0 && e.t % 0.3 < dt) {
      g.fx.sparks(e.pos.x, e.pos.y + 0.5, e.pos.z, 4);
    } else if (role === 'charge' && e.t % 0.2 < dt) {
      g.fx.dust(e.pos.x, e.pos.y + 0.1, e.pos.z, 3);
    }
    if (e.t < windup) return;
    const dmg = e.def.damage * (e.buff > 0 ? 1.25 : 1);
    if (e.targetPiece >= 0) {
      if (role === 'sapper') {
        // demolition charge: heavy damage to the target and anything within 4 m
        const tp = g.base.pos.get(e.targetPiece);
        g.damagePiece(e.targetPiece, 140);
        if (tp) {
          for (const p of g.save.world.pieces) if (p.id !== e.targetPiece && Math.hypot(p.x - tp.x, p.z - tp.z) < 4) g.damagePiece(p.id, 50);
          g.fx.glowBurst(tp.x, tp.y + 0.8, tp.z, 30, 0xff8a3a);
          g.fx.debris(tp.x, tp.y + 0.6, tp.z, 'stone', 1, 14);
        }
        audio.play('breakBig', { pos: e.pos });
        g.camera.addTrauma(0.35);
        e.stats.planted++;
        e.state = 'recover';
        e.t = -1.5;
      } else {
        g.damagePiece(e.targetPiece, dmg * 2);
        e.state = 'recover';
        e.t = 0;
      }
      if (e.eye) e.eye.material = this.eyeMatIdle;
      return;
    }
    switch (role) {
      case 'charge':
        e.state = 'charge';
        e.t = 0;
        audio.play('hurt', { pos: e.pos, pitch: 0.3, vol: 0.8 });
        return;
      case 'kite': {
        const clear = this.los(e);
        e.stats.fired++;
        if (!clear) e.stats.firedNoLos++;
        audio.play('shot', { pos: e.pos, vol: 0.9 });
        if (clear && !g.player.dodging && playerAlive && dist < e.def.reach) g.hurt(dmg, 'shot', e.kind);
        break;
      }
      case 'spotter':
        g.fx.sparks(e.pos.x, e.pos.y, e.pos.z, 6, 0x9ff0ff);
        audio.play('shot', { pos: e.pos, vol: 0.5, pitch: 1.8 });
        if (dist < e.def.reach && !g.player.dodging && playerAlive) g.hurt(dmg, 'shot', e.kind);
        break;
      case 'slam':
        g.fx.dust(e.pos.x, e.pos.y + 0.1, e.pos.z, 14);
        g.camera.addTrauma(0.5);
        audio.play('breakBig', { pos: e.pos, pitch: 0.6 });
        if (dist < e.def.reach && !g.player.dodging && playerAlive) {
          g.hurt(dmg, 'blunt', e.kind);
          g.player.vel.x += (-dx / Math.max(0.1, dist)) * 7;
          g.player.vel.z += (-dz / Math.max(0.1, dist)) * 7;
        }
        break;
      default:
        // resolve: dodge i-frames and range check keep it fair
        if (dist < e.def.reach + 0.4 && !g.player.dodging && playerAlive) {
          g.hurt(dmg, e.def.machine ? 'blunt' : e.kind === 'hound' || e.kind === 'boar' ? 'bite' : 'cut', e.kind);
          g.player.vel.x += (dx / Math.max(0.1, dist)) * 4;
          g.player.vel.z += (dz / Math.max(0.1, dist)) * 4;
        } else audio.play('swing', { pos: e.pos, vol: 0.4, pitch: 0.7 });
    }
    e.state = 'recover';
    e.t = 0;
    if (e.eye) e.eye.material = this.eyeMatIdle;
  }

  /** clear line from the enemy's head to the player's chest */
  private los(e: Enemy): boolean {
    const g = this.game, pp = g.player.pos;
    return g.collision.raycast(e.pos.x, e.pos.y + 1.5, e.pos.z, pp.x, pp.y + 1.2, pp.z, 'npc') >= 1;
  }

  private clearTele(e: Enemy): void {
    if (!e.tele) return;
    e.tele.removeFromParent();
    if (e.tele instanceof THREE.Line) e.tele.geometry.dispose();
    e.tele = null;
  }

  private steer(e: Enemy, tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - e.pos.x, dz = tz - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const ty = Math.atan2(dx, dz);
    let dy = ty - e.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.yaw += dy * Math.min(1, dt * e.def.turn);
    // separation from other enemies
    let sx = 0, sz = 0;
    for (const o of this.list) {
      if (o === e || o.state === 'dead') continue;
      const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.4 && od > 0.01) {
        sx += (ox / od) * (1.4 - od);
        sz += (oz / od) * (1.4 - od);
      }
    }
    e.pos.x += (Math.sin(e.yaw) * speed + sx * 2) * dt;
    e.pos.z += (Math.cos(e.yaw) * speed + sz * 2) * dt;
  }

  private nearestPiece(e: Enemy): number {
    const g = this.game;
    let best = -1;
    let bd = 70;
    for (const p of g.save.world.pieces) {
      const def = getPiece(p.piece);
      if (!def?.solid) continue;
      const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  }

  /** Traps and defenses placed by the player act on ground enemies. */
  private checkTraps(e: Enemy, dt: number): void {
    const g = this.game;
    e.trapT = Math.max(0, e.trapT - dt);
    for (const p of g.save.world.pieces) {
      if (p.piece !== 'bear_trap' && p.piece !== 'spike_strip' && p.piece !== 'barricade') continue;
      const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
      if (p.piece === 'bear_trap' && d < 0.9 && e.trapT <= 0) {
        e.trapT = 6;
        e.state = 'stagger';
        // pinned ~3 s; fast runners (scouts) and chargers (boars) twice as long
        e.t = e.kind === 'scout' || e.kind === 'boar' ? -5.5 : -2.5;
        if (e.kind === 'boar') e.stun = 3;
        e.vel.set(0, 0, 0);
        this.hurtQuiet(e, 25);
        audio.play('hitMetal', { pos: e.pos, pitch: 0.7 });
        g.fx.sparks(e.pos.x, e.pos.y + 0.3, e.pos.z, 8);
        p.hp -= 10;
      } else if (p.piece === 'spike_strip' && d < 1.1) {
        // crawlers are shredded by spikes
        this.hurtQuiet(e, 14 * dt * (e.kind === 'crawler' ? 3 : 1));
        e.pos.x -= Math.sin(e.yaw) * e.def.speed * 0.5 * dt;
        e.pos.z -= Math.cos(e.yaw) * e.def.speed * 0.5 * dt;
      } else if (p.piece === 'barricade' && d < 1.4) {
        this.hurtQuiet(e, 10 * dt);
        const k = (1.4 - d) / Math.max(0.1, d);
        e.pos.x += (e.pos.x - p.x) * k;
        e.pos.z += (e.pos.z - p.z) * k;
      }
    }
  }

  private hurtQuiet(e: Enemy, dmg: number): void {
    e.hp -= dmg;
    e.flash = Math.max(e.flash, 0.08);
    if (e.hp <= 0 && e.state !== 'dead') this.kill(e);
  }

  /** A noise (salvaging): wandering enemies within r come for the player. */
  noise(x: number, z: number, r: number): number {
    let n = 0;
    for (const e of this.list) {
      if (e.state !== 'wander' || Math.hypot(e.pos.x - x, e.pos.z - z) > r) continue;
      e.state = 'chase';
      e.t = 0;
      e.alertT = 8;
      this.firstSight(e);
      n++;
    }
    return n;
  }

  /** Drones call for help: nearby enemies join the chase. */
  private alert(src: Enemy): void {
    for (const e of this.list) if (e !== src && e.state === 'wander' && e.pos.distanceTo(src.pos) < 30) e.state = 'chase';
    audio.play('alarm', { pos: src.pos, vol: 0.5 });
  }

  /** Player melee resolution. Returns true when an enemy was hit. */
  private playerSwing(damage: number): boolean {
    const g = this.game;
    const pp = g.player.pos;
    const fx = Math.sin(g.player.yaw), fz = Math.cos(g.player.yaw);
    let best: Enemy | null = null;
    let bd = 3.0;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const dx = e.pos.x - pp.x, dz = e.pos.z - pp.z;
      const d = Math.hypot(dx, dz);
      // generous cone (aim assist); hovering drones are out of reach unless they dip to fire
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (d < bd && dot > 0.2 && e.pos.y - pp.y < 2.4 && e.pos.y - pp.y > -2) {
        bd = d;
        best = e;
      }
    }
    if (!best) return false;
    // Takedown perk: a hit on an enemy that has not noticed you yet
    const sneak = best.state === 'wander' && !best.wave ? Math.max(1, g.pk('sneakMult')) : 1;
    this.damage(best, damage * sneak, this.tmp.set(best.pos.x - pp.x, 0, best.pos.z - pp.z).normalize());
    // wide swings cut through a crawler swarm
    if (best.kind === 'crawler') {
      const bx = best.pos.x, bz = best.pos.z;
      for (const o of this.list) if (o !== best && o.kind === 'crawler' && o.state !== 'dead' && Math.hypot(o.pos.x - bx, o.pos.z - bz) < 1.8) this.damage(o, damage * 0.7, this.tmp.set(o.pos.x - pp.x, 0, o.pos.z - pp.z).normalize());
    }
    return true;
  }

  /** nearest live enemy within r of (x,z), or null (turrets) */
  nearest(x: number, z: number, r: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = r;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** damage from a non-player source (turrets) */
  hitFrom(e: Enemy, damage: number, fromX: number, fromZ: number): void {
    if (e.state === 'dead') return;
    this.damage(e, damage, this.tmp.set(e.pos.x - fromX, 0, e.pos.z - fromZ).normalize());
  }

  /** damage multiplier from where the hit lands (dir = attacker → enemy) */
  hitMult(e: Enemy, dir: THREE.Vector3): number {
    // facing · (enemy → attacker): > 0 means the hit comes from the front
    const front = -(Math.sin(e.yaw) * dir.x + Math.cos(e.yaw) * dir.z);
    let m = 1;
    if (e.kind === 'bot' && front > 0.5) m = 0.25; // riot shield
    if (e.kind === 'heavy') m = front > 0.3 ? 0.5 : front < -0.3 ? 2 : 1; // armoured front, back core
    if (e.stun > 0) m *= 2; // stunned boar
    return m;
  }

  private damage(e: Enemy, damage: number, dir: THREE.Vector3): void {
    const g = this.game;
    const mult = this.hitMult(e, dir);
    e.hp -= damage * mult;
    e.flash = 0.15;
    const blocked = mult < 0.6;
    const hy = e.pos.y + (e.def.fly ? 0 : 1);
    if (blocked) {
      // glancing off the shield / armour: no stagger, clear "clank"
      audio.play('hitMetal', { pos: e.pos, pitch: 1.5 });
      g.fx.sparks(e.pos.x, hy, e.pos.z, 6, 0xffffff);
      g.bus.emit({ type: 'float', text: S.enemyBlocked, x: e.pos.x, y: hy + 0.6, z: e.pos.z, color: 0xc8c8c8 });
      g.hitstop = 0.03;
    } else {
      e.vel.copy(dir).multiplyScalar(e.def.heavy ? 2 : 6);
      if (e.state !== 'charge' && !(e.kind === 'heavy' && e.state === 'windup')) {
        e.state = 'stagger';
        e.t = Math.min(e.t, 0);
      }
      if (e.eye) e.eye.material = this.eyeMatIdle;
      e.rig?.hit(1);
      audio.play(e.def.sfx, { pos: e.pos });
      if (e.def.machine) g.fx.sparks(e.pos.x, hy, e.pos.z, mult > 1.5 ? 18 : 10, mult > 1.5 ? 0x5ff0e0 : 0xffc070);
      else {
        g.fx.debris(e.pos.x, hy, e.pos.z, 'flesh', 0.15, 4);
        g.fx.decal(e.pos.x, g.view.surface(e.pos.x, e.pos.z), e.pos.z, 0x4a1210, 0.7);
      }
      g.hitstop = 0.05;
      g.camera.addTrauma(0.22);
      g.camera.kickFov(3);
    }
    if (e.hp <= 0) this.kill(e);
  }

  private die(e: Enemy): void {
    e.state = 'dead';
    e.t = 0;
    this.clearTele(e);
  }

  private kill(e: Enemy): void {
    const g = this.game;
    this.die(e);
    const p = e.pos.clone();
    g.fx.debris(p.x, p.y + 0.4, p.z, e.def.machine ? 'metal' : 'flesh', e.def.heavy ? 1 : 0.5);
    if (e.def.machine) g.fx.sparks(p.x, p.y + 0.5, p.z, 16);
    audio.play(e.def.heavy ? 'breakBig' : 'break', { pos: p });
    g.hitstop = e.def.heavy ? 0.09 : 0.06;
    g.camera.addTrauma(e.def.heavy ? 0.5 : 0.3);
    const loot = e.def.loot.filter((l) => l.chance === undefined || Math.random() < l.chance).map((l) => ({ item: l.item, n: l.min + Math.floor(Math.random() * (l.max - l.min + 1)) }));
    g.grant(loot.filter((l) => getItem(l.item)), p.setY(p.y + 0.6));
    const f = g.save.world.flags;
    f[`killed:${e.kind}`] = Number(f[`killed:${e.kind}`] ?? 0) + 1;
    g.award(e.def.heavy ? XP.killHeavy : XP.kill);
    // a fallen captain breaks the raiders around it
    if (e.kind === 'captain') {
      for (const o of this.list) if (o !== e && REAVERS.has(o.kind) && o.state !== 'dead' && o.pos.distanceToSquared(e.pos) < 18 * 18) {
        o.state = 'flee';
        o.t = 0;
      }
      g.toast(S.enemyRout, 'warm');
    }
  }

  clear(): void {
    for (const e of this.list) {
      this.clearTele(e);
      if (e.rig) e.rig.dispose();
      e.obj.removeFromParent();
    }
    this.list = [];
  }
}
