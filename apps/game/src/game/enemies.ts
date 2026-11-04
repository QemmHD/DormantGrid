// Enemies: Custodian machines (drones, crawlers, guard bots), wildlife (hounds),
// and Ashline raiders. Simple readable state machines with telegraphed attacks,
// full hit feedback, and fairness rules (no spawns in view, none in restored areas).
import * as THREE from 'three';
import { RESTORATION_FX, districtAt, getItem } from '@dg/sim';
import type { RestorationState } from '@dg/shared';
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial } from '../render/materials';
import { CharacterRig, randomLook } from '../render/character';
import { audio } from '../audio/audio';
import type { Game } from './game';

export type EnemyKind = 'drone' | 'crawler' | 'bot' | 'hound' | 'raider';

interface EnemyDef {
  hp: number;
  speed: number;
  damage: number;
  reach: number;
  windup: number;
  cooldown: number;
  sense: number;
  fly: number; // hover height
  machine: boolean;
  loot: { item: string; min: number; max: number; chance?: number }[];
  sfx: 'hitMetal' | 'hitFlesh';
  size: number;
}

const DEFS: Record<EnemyKind, EnemyDef> = {
  drone: { hp: 30, speed: 4.2, damage: 7, reach: 1.8, windup: 0.6, cooldown: 1.6, sense: 24, fly: 2.2, machine: true, loot: [{ item: 'mat.wiring', min: 1, max: 3 }, { item: 'mat.scrap', min: 1, max: 2 }, { item: 'comp.battery', min: 1, max: 1, chance: 0.25 }], sfx: 'hitMetal', size: 0.5 },
  crawler: { hp: 22, speed: 4.8, damage: 6, reach: 1.3, windup: 0.4, cooldown: 1.1, sense: 16, fly: 0, machine: true, loot: [{ item: 'mat.scrap', min: 1, max: 3 }, { item: 'comp.spring', min: 1, max: 1, chance: 0.3 }], sfx: 'hitMetal', size: 0.45 },
  bot: { hp: 110, speed: 1.9, damage: 18, reach: 2.1, windup: 1.0, cooldown: 2.2, sense: 14, fly: 0, machine: true, loot: [{ item: 'mat.scrap', min: 4, max: 7 }, { item: 'comp.circuit', min: 1, max: 1, chance: 0.4 }, { item: 'mat.wiring', min: 2, max: 4 }], sfx: 'hitMetal', size: 1.1 },
  hound: { hp: 34, speed: 5.4, damage: 8, reach: 1.4, windup: 0.35, cooldown: 1.2, sense: 20, fly: 0, machine: false, loot: [{ item: 'food.raw_meat', min: 1, max: 2 }, { item: 'misc.hide', min: 1, max: 1, chance: 0.6 }], sfx: 'hitFlesh', size: 0.6 },
  raider: { hp: 60, speed: 3.6, damage: 12, reach: 1.7, windup: 0.55, cooldown: 1.5, sense: 18, fly: 0, machine: false, loot: [{ item: 'mat.scrap', min: 1, max: 3 }, { item: 'food.canned_beans', min: 1, max: 1, chance: 0.4 }, { item: 'med.bandage', min: 1, max: 1, chance: 0.35 }, { item: 'ammo.arrow', min: 2, max: 4, chance: 0.2 }], sfx: 'hitFlesh', size: 0.9 },
};

type State = 'wander' | 'chase' | 'windup' | 'recover' | 'stagger' | 'dead';

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
}

const geoCache = new Map<EnemyKind, THREE.BufferGeometry>();

function enemyGeo(kind: EnemyKind): THREE.BufferGeometry {
  let g = geoCache.get(kind);
  if (g) return g;
  const b = new MeshBuilder();
  if (kind === 'drone') {
    b.setColor(0x4a5258);
    b.bevelBox(0, 0, 0, 0.32, 0.12, 0.32, 0.05);
    b.setColor(0x2a2e32);
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
      b.box(x * 0.7, 0, z * 0.7, 0.04, 0.03, 0.16);
      b.cylinder(x, 0.05, z, 0.2, 0.2, 0.02, 8);
    }
    b.setColor(0x6a3a2a);
    b.box(0, -0.16, 0, 0.12, 0.05, 0.12);
  } else if (kind === 'crawler') {
    b.setColor(0x3e4448);
    b.bevelBox(0, 0.28, 0, 0.3, 0.14, 0.4, 0.06);
    b.setColor(0x2a2e30);
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
      b.pushTRS(s * 0.38, 0.2, i * 0.25, 0).push(new THREE.Matrix4().makeRotationZ(s * 0.7));
      b.box(0, 0, 0, 0.2, 0.03, 0.03);
      b.pop().pop();
    }
  } else if (kind === 'bot') {
    b.setColor(0x5a6066);
    b.bevelBox(0, 1.35, 0, 0.55, 0.5, 0.4, 0.1);
    b.setColor(0x44494e);
    b.bevelBox(0, 2.0, 0.05, 0.3, 0.2, 0.28, 0.06);
    b.bevelBox(-0.32, 0.45, 0, 0.18, 0.45, 0.22, 0.05);
    b.bevelBox(0.32, 0.45, 0, 0.18, 0.45, 0.22, 0.05);
    b.bevelBox(-0.75, 1.2, 0.1, 0.17, 0.5, 0.17, 0.05);
    b.bevelBox(0.75, 1.2, 0.1, 0.17, 0.5, 0.17, 0.05);
    b.setColor(0xc8a040);
    b.box(0, 1.55, 0.41, 0.4, 0.04, 0.01);
  } else {
    // hound
    b.setColor(0x5a4a3a);
    b.bevelBox(0, 0.55, 0, 0.18, 0.18, 0.45, 0.06);
    b.bevelBox(0, 0.72, 0.5, 0.13, 0.12, 0.17, 0.04);
    b.setColor(0x4a3a2c);
    for (const [x, z] of [[-0.12, -0.3], [0.12, -0.3], [-0.12, 0.3], [0.12, 0.3]]) b.box(x, 0.2, z, 0.05, 0.2, 0.05);
    b.box(0, 0.6, -0.55, 0.03, 0.03, 0.16);
  }
  g = b.toGeometry(true);
  geoCache.set(kind, g);
  return g;
}

const eyeGeo = new THREE.SphereGeometry(0.07, 6, 4);

export class Enemies {
  private list: Enemy[] = [];
  private nextId = 1;
  private spawnT = 4;
  private mat = makeChunkMaterial();
  private eyeMatIdle = new THREE.MeshBasicMaterial({ color: 0xe2574c });
  private eyeMatWarn = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  private tmp = new THREE.Vector3();
  /** seconds since last hostile contact (drives combat music) */
  private sinceCombat = 99;
  enabled = true;
  private tmpP = { x: 0, y: 0, z: 0 };

  constructor(private game: Game) {
    game.tickers.push((dt, simDt) => this.update(simDt));
    game.swingHook = (dmg) => this.playerSwing(dmg);
  }

  get alive(): number {
    let n = 0;
    for (const e of this.list) if (e.state !== 'dead') n++;
    return n;
  }

  spawn(kind: EnemyKind, x: number, z: number, wave = false): void {
    const def = DEFS[kind];
    let obj: THREE.Object3D;
    let rig: CharacterRig | null = null;
    let eye: THREE.Mesh | null = null;
    if (kind === 'raider') {
      rig = new CharacterRig(randomLook(this.nextId * 131 + 7, { mask: true, shirt: 0x5a3a32, accent: 0x8a2f2a, hairStyle: 2 }));
      obj = rig.root;
    } else {
      const m = new THREE.Mesh(enemyGeo(kind), this.mat);
      m.castShadow = true;
      obj = new THREE.Group();
      obj.add(m);
      eye = new THREE.Mesh(eyeGeo, this.eyeMatIdle);
      eye.position.set(0, kind === 'bot' ? 2.02 : kind === 'drone' ? -0.02 : kind === 'crawler' ? 0.32 : 0.75, kind === 'bot' ? 0.33 : kind === 'drone' ? 0.33 : kind === 'crawler' ? 0.4 : 0.68);
      if (!def.machine) eye.scale.setScalar(0.4);
      obj.add(eye);
    }
    const y = this.game.view.surface(x, z) + def.fly;
    obj.position.set(x, y, z);
    obj.scale.setScalar(0.01);
    this.game.scene.add(obj);
    const pos = new THREE.Vector3(x, y, z);
    this.list.push({ id: this.nextId++, kind, def, obj, rig, eye, pos, vel: new THREE.Vector3(), yaw: Math.random() * 6.28, hp: def.hp, state: wave ? 'chase' : 'wander', t: 0, home: pos.clone(), wanderTo: pos.clone(), flash: 0, wave });
    if (def.machine) audio.play('drone', { pos: { x, z }, vol: 0.4 });
  }

  /** Spawn a wave of machines around a point (node defense). */
  wave(cx: number, cz: number, count: number, danger: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 22 + Math.random() * 8;
      const kind: EnemyKind = danger >= 3 && i % 4 === 0 ? 'bot' : i % 2 === 0 ? 'drone' : 'crawler';
      setTimeout(() => this.spawn(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, true), i * 350);
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
    // don't spawn inside buildings
    let blocked = false;
    g.collision.query(x - 1, z - 1, x + 1, z + 1, (c) => {
      if (c.maxY > 0.6) blocked = true;
    });
    if (blocked) return;
    const roll = Math.random();
    const kind: EnemyKind =
      sd.key === 'outskirts' ? (roll < 0.7 ? 'hound' : 'raider') : roll < 0.35 ? 'drone' : roll < 0.6 ? 'crawler' : roll < 0.8 ? 'raider' : sd.danger >= 2 ? 'bot' : 'drone';
    const n = kind === 'hound' ? 2 + Math.floor(Math.random() * 2) : 1;
    for (let i = 0; i < n; i++) this.spawn(kind, x + i * 1.5, z + i);
  }

  private update(dt: number): void {
    const g = this.game;
    if (dt <= 0) return;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 6 + Math.random() * 6;
      this.ambientSpawn();
    }
    const pp = g.player.pos;
    let nearestMachine = 99;
    let engaged = 0;
    for (const e of this.list) {
      e.t += dt;
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
      if (dist > 80) {
        e.state = 'dead';
        e.t = 0;
        continue;
      }
      const playerAlive = g.mode === 'play' || g.mode === 'build';
      const sense = e.def.sense * (g.atm.daylight < 0.3 ? 0.75 : 1);
      switch (e.state) {
        case 'wander': {
          if ((dist < sense && playerAlive) || (e.wave && playerAlive)) {
            e.state = 'chase';
            e.t = 0;
            if (e.kind === 'drone') this.alert(e);
            audio.play(e.def.machine ? 'node' : 'hurt', { pos: e.pos, pitch: e.def.machine ? 0.6 : 0.5, vol: 0.5 });
            break;
          }
          if (e.pos.distanceTo(e.wanderTo) < 1 || e.t > 6) {
            e.wanderTo.set(e.home.x + (Math.random() - 0.5) * 16, 0, e.home.z + (Math.random() - 0.5) * 16);
            e.t = 0;
          }
          this.steer(e, e.wanderTo.x, e.wanderTo.z, e.def.speed * 0.35, dt);
          break;
        }
        case 'chase':
          engaged++;
          if (!playerAlive || dist > sense * 2.2) {
            e.wave = false;
            e.state = 'wander';
            e.home.copy(e.pos);
            break;
          }
          if (dist < e.def.reach) {
            e.state = 'windup';
            e.t = 0;
            if (e.eye) e.eye.material = this.eyeMatWarn;
            e.rig?.setState('attack');
            if (e.rig) e.rig.attackDur = e.def.windup * 1.4;
          } else this.steer(e, pp.x, pp.z, e.def.speed, dt);
          break;
        case 'windup':
          engaged++;
          e.yaw = Math.atan2(dx, dz);
          if (e.t >= e.def.windup) {
            // resolve: dodge i-frames and range check keep it fair
            if (dist < e.def.reach + 0.4 && !g.player.dodging && playerAlive) {
              g.hurt(e.def.damage, e.def.machine ? 'blunt' : e.kind === 'hound' ? 'bite' : 'cut', e.kind);
              g.player.vel.x += (dx / Math.max(0.1, dist)) * 4;
              g.player.vel.z += (dz / Math.max(0.1, dist)) * 4;
            } else audio.play('swing', { pos: e.pos, vol: 0.4, pitch: 0.7 });
            e.state = 'recover';
            e.t = 0;
            if (e.eye) e.eye.material = this.eyeMatIdle;
          }
          break;
        case 'recover':
          engaged++;
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
            e.state = 'chase';
            e.t = 0;
          }
          break;
      }
      // collide with world + separate
      const tmp = this.tmpP;
      tmp.x = e.pos.x;
      tmp.y = e.pos.y - e.def.fly;
      tmp.z = e.pos.z;
      if (!e.def.fly) g.collision.resolve(tmp, e.def.size * 0.6, 1.6, 0.45);
      e.pos.x = tmp.x;
      e.pos.z = tmp.z;
      const ground = g.view.surface(e.pos.x, e.pos.z);
      e.pos.y = ground + e.def.fly + (e.def.fly ? Math.sin(e.t * 3 + e.id) * 0.15 : 0);
      e.obj.position.copy(e.pos);
      e.obj.rotation.y = e.yaw;
      if (e.kind === 'drone') e.obj.rotation.z = Math.sin(e.t * 2) * 0.1;
      if (e.flash > 0) {
        e.flash -= dt;
        e.obj.position.x += (Math.random() - 0.5) * 0.08;
      }
      if (e.rig) {
        e.rig.speed = e.state === 'chase' ? e.def.speed : e.state === 'wander' ? e.def.speed * 0.35 : 0;
        if (e.state === 'chase' || e.state === 'wander') e.rig.setState('idle');
        e.rig.update(dt);
      }
    }
    // cleanup
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.state === 'dead' && (e.obj.scale.x < 0.05 || e.t > 1.5)) {
        if (e.rig) e.rig.dispose();
        else e.obj.removeFromParent();
        this.list.splice(i, 1);
      }
    }
    this.sinceCombat = engaged > 0 ? 0 : this.sinceCombat + dt;
    g.combatLevel += ((this.sinceCombat < 4 ? 1 : 0) - g.combatLevel) * Math.min(1, dt * 0.8);
    g.machineProximity = Math.max(0, 1 - nearestMachine / 30);
  }

  private steer(e: Enemy, tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - e.pos.x, dz = tz - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const ty = Math.atan2(dx, dz);
    let dy = ty - e.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.yaw += dy * Math.min(1, dt * 7);
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
      // generous cone (aim assist)
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (d < bd && dot > 0.2 && Math.abs(e.pos.y - pp.y) < 3) {
        bd = d;
        best = e;
      }
    }
    if (!best) {
      // soft aim assist: snap toward the nearest enemy in a wider arc
      return false;
    }
    const e = best;
    e.hp -= damage;
    e.flash = 0.15;
    const dir = this.tmp.set(e.pos.x - pp.x, 0, e.pos.z - pp.z).normalize();
    e.vel.copy(dir).multiplyScalar(e.kind === 'bot' ? 2 : 6);
    e.state = 'stagger';
    e.t = 0;
    if (e.eye) e.eye.material = this.eyeMatIdle;
    e.rig?.hit(1);
    const hy = e.pos.y + (e.def.fly ? 0 : 1);
    audio.play(e.def.sfx, { pos: e.pos });
    if (e.def.machine) g.fx.sparks(e.pos.x, hy, e.pos.z, 10);
    else {
      g.fx.debris(e.pos.x, hy, e.pos.z, 'flesh', 0.15, 4);
      g.fx.decal(e.pos.x, g.view.surface(e.pos.x, e.pos.z), e.pos.z, 0x4a1210, 0.7);
    }
    g.hitstop = 0.05;
    g.camera.addTrauma(0.22);
    g.camera.kickFov(3);
    if (e.hp <= 0) this.kill(e);
    return true;
  }

  private kill(e: Enemy): void {
    const g = this.game;
    e.state = 'dead';
    e.t = 0;
    const p = e.pos.clone();
    g.fx.debris(p.x, p.y + 0.4, p.z, e.def.machine ? 'metal' : 'flesh', e.kind === 'bot' ? 1 : 0.5);
    if (e.def.machine) g.fx.sparks(p.x, p.y + 0.5, p.z, 16);
    audio.play(e.kind === 'bot' ? 'breakBig' : 'break', { pos: p });
    g.hitstop = e.kind === 'bot' ? 0.09 : 0.06;
    g.camera.addTrauma(e.kind === 'bot' ? 0.5 : 0.3);
    const loot = e.def.loot.filter((l) => l.chance === undefined || Math.random() < l.chance).map((l) => ({ item: l.item, n: l.min + Math.floor(Math.random() * (l.max - l.min + 1)) }));
    g.grant(loot.filter((l) => getItem(l.item)), p.setY(p.y + 0.6));
    const f = g.save.world.flags;
    f[`killed:${e.kind}`] = Number(f[`killed:${e.kind}`] ?? 0) + 1;
  }

  clear(): void {
    for (const e of this.list) {
      if (e.rig) e.rig.dispose();
      else e.obj.removeFromParent();
    }
    this.list = [];
  }
}
