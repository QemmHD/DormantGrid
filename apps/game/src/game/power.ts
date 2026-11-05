// Grid power for placed machines (pieces with needsPower): a status light on each
// (cyan = powered, slow red blink = dead), floodlights that light the yard at
// night, turrets that shoot raiders. Only when the sim says the spot has power.
import * as THREE from 'three';
import { getPiece, isNight, removeItem, countItem } from '@dg/sim';
import { audio } from '../audio/audio';
import { S } from '../ui/strings';
import { glowTexture } from '../render/glow';
import type { Game } from './game';
import type { Enemies } from './enemies';

const MAX = 64;
const AMMO = 'ammo.rifle_round';
const TURRET_RANGE = 16;
const TURRET_CD = 1.1;
const TURRET_DMG = 16;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();
const CYAN = new THREE.Color(0x4ff0dc);
const RED = new THREE.Color(0xff4a3a);

export interface PowerStats {
  machines: number;
  powered: number;
  litFloods: number;
  shots: number;
}

export class Power {
  private dots: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private cd = new Map<number, number>();
  private t = 0;
  private time = 0;
  private warned = new Set<string>();
  readonly stats: PowerStats = { machines: 0, powered: 0, litFloods: 0, shots: 0 };

  constructor(private game: Game, private enemies: Enemies) {
    const tex = glowTexture();
    this.dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }), MAX);
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: tex, color: 0xfff2d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, fog: true }), MAX);
    for (const m of [this.dots, this.pools]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      game.scene.add(m);
    }
    game.tickers.push((dt, simDt) => this.tick(dt, simDt));
  }

  private tick(dt: number, simDt: number): void {
    const g = this.game;
    if (!g.save) return;
    this.time += dt;
    const camQ = g.camera.cam.quaternion;
    const night = isNight(g.save.world.hour);
    let n = 0, np = 0;
    let machines = 0, powered = 0, lit = 0;
    for (const p of g.save.world.pieces) {
      const def = getPiece(p.piece);
      if (!def?.needsPower) continue;
      const pos = g.base.pos.get(p.id);
      if (!pos) continue;
      machines++;
      const on = g.poweredAt(pos.x, pos.z);
      if (on) powered++;
      const top = pos.y + (def.size.h) + 0.25;
      if (n < MAX) {
        // status light: steady cyan when powered, slow red blink when dead
        const blink = on ? 1 : 0.35 + 0.65 * Math.max(0, Math.sin(this.time * 3 + p.id));
        q.copy(camQ);
        m4.compose(v.set(pos.x, top, pos.z), q, sc.setScalar(on ? 0.55 : 0.4 * blink + 0.1));
        this.dots.setMatrixAt(n, m4);
        this.dots.setColorAt(n, col.copy(on ? CYAN : RED).multiplyScalar(on ? 1 : blink));
        n++;
      }
      if (p.piece === 'floodlight' && on && np < MAX) {
        // the yard light: a big warm pool in front of the lamp, brighter at night
        const a = (p.rot * Math.PI) / 2;
        m4.compose(v.set(pos.x + Math.sin(a) * 4, pos.y + 0.05, pos.z + Math.cos(a) * 4), q.identity(), sc.setScalar(14));
        this.pools.setMatrixAt(np, m4);
        this.pools.setColorAt(np, col.setScalar(night ? 0.9 : 0.12));
        np++;
        if (night) lit++;
        if (n < MAX) {
          m4.compose(v.set(pos.x, pos.y + def.size.h + 0.05, pos.z), camQ, sc.setScalar(night ? 2.4 : 0.9));
          this.dots.setMatrixAt(n, m4);
          this.dots.setColorAt(n, col.set(0xfff0c0).multiplyScalar(night ? 1 : 0.4));
          n++;
        }
      }
      if (p.piece === 'turret' && simDt > 0) this.turret(p.id, pos, on, simDt);
    }
    this.dots.count = n;
    this.pools.count = np;
    this.dots.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    this.stats.machines = machines;
    this.stats.powered = powered;
    this.stats.litFloods = lit;
    // tell the player once per machine type when it sits dead nearby
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1;
      for (const p of g.save.world.pieces) {
        const def = getPiece(p.piece);
        const pos = def?.needsPower ? g.base.pos.get(p.id) : undefined;
        if (!def || !pos || this.warned.has(p.piece)) continue;
        if (pos.distanceToSquared(g.player.pos) < 5 * 5 && !g.poweredAt(pos.x, pos.z)) {
          this.warned.add(p.piece);
          g.toast(S.power.noPower(def.name), 'bad');
        }
      }
    }
  }

  private turret(id: number, pos: THREE.Vector3, on: boolean, dt: number): void {
    const cd = (this.cd.get(id) ?? 0) - dt;
    this.cd.set(id, cd);
    if (!on || cd > 0) return;
    const e = this.enemies.nearest(pos.x, pos.z, TURRET_RANGE);
    if (!e) return;
    const g = this.game;
    const w = g.save.world;
    const stock = w.townStock;
    const fromStock = countItem(stock, AMMO) > 0;
    if (!fromStock && countItem(g.save.player.inventory, AMMO) <= 0) {
      if (!this.warned.has('ammo')) {
        this.warned.add('ammo');
        g.toast(S.power.noAmmo, 'bad');
      }
      this.cd.set(id, 3);
      return;
    }
    removeItem(fromStock ? stock : g.save.player.inventory, AMMO, 1);
    this.cd.set(id, TURRET_CD);
    this.stats.shots++;
    const my = pos.y + 1.2;
    g.fx.sparks(pos.x, my, pos.z, 6);
    g.fx.sparks(e.pos.x, e.pos.y + 0.8, e.pos.z, 8);
    audio.play('shot', { pos, vol: 0.7 });
    this.enemies.hitFrom(e, TURRET_DMG, pos.x, pos.z);
  }
}
