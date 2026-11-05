// Survivors: autonomous town simulation (sim core tickTown, hourly) plus
// rendering of near survivors with smooth steering toward their sim targets.
// One model drives near and far, so walking up to someone never pops.
import * as THREE from 'three';
import { Rng, hash2, type SurvivorSave } from '@dg/shared';
import { XP, barkFor, clinicOn, irrigationOn, buildNavGrid, computeNeeds, cropStage, findPath, defenseScore, generateSurvivor, getPiece, survivorCap, survivorTarget, tickTown, townRank, type JobId, type TownEvent } from '@dg/sim';
import type { WorldSave } from '@dg/shared';
import { CharacterRig, randomLook } from '../render/character';
import type { Game } from './game';
import { audio } from '../audio/audio';

const NEAR = 70;
const MAX_RIGS = 14;

interface Near {
  rig: CharacterRig;
  id: number;
  pos: THREE.Vector3;
  yaw: number;
  barkT: number;
  /** nav path waypoints toward the current target */
  path: [number, number][] | null;
  pathIdx: number;
  pathTx: number;
  pathTz: number;
  repathT: number;
}

export class Town {
  private near = new Map<number, Near>();
  private lastHour = -1;
  private rng = new Rng(0x70a1);
  private scanT = 0;
  private boardEvents: TownEvent[] = [];
  private cropSig = '';
  private lastHungerToast = -999;
  private tmpP = { x: 0, y: 0, z: 0 };
  private readonly lookAt = new THREE.Vector3();
  readonly home: { x: number; z: number };

  /** set by main: opens the talk dialog for a survivor */
  onTalk: ((s: SurvivorSave) => void) | null = null;
  readonly stockpile: THREE.Vector3;

  constructor(private game: Game) {
    this.home = { x: game.layout.spawn.x, z: game.layout.spawn.z };
    // the crate stack at the camp doubles as the Town Stockpile
    this.stockpile = new THREE.Vector3(this.home.x - 9.6, game.view.surface(this.home.x - 9.6, this.home.z - 2) + 0.9, this.home.z - 2);
    game.stockpilePos = () => this.stockpile.clone();
    game.interactProviders.push({
      prompt: () => {
        if (game.mode !== 'play') return null;
        const s = this.nearest(2.4);
        if (s) {
          const n = this.near.get(s.id);
          return { text: s.name.split(' ')[0], verb: 'Talk', kind: 'talk', pos: n ? n.pos.clone().setY(n.pos.y + 1.9) : undefined, sub: jobLabel(s.job) };
        }
        if (game.player.pos.distanceTo(this.stockpile) < 2.8) return { text: 'Town Stockpile', verb: 'Open', kind: 'loot', pos: this.stockpile.clone().setY(this.stockpile.y + 0.6), sub: 'survivors eat & build from this' };
        return null;
      },
      handle: (_held, _pressed, tapped) => {
        if (!tapped) return true;
        const s = this.nearest(2.4);
        if (s) {
          const n = this.near.get(s.id);
          if (n) n.yaw = Math.atan2(game.player.pos.x - n.pos.x, game.player.pos.z - n.pos.z);
          const line = barkFor(s, s.hunger < 30 ? 'hungry' : s.mood > 70 ? 'happy' : 'greeting', this.rng);
          if (line) game.bus.emit({ type: 'subtitle', who: s.name.split(' ')[0], text: line });
          this.onTalk?.(s);
        } else {
          game.openStockpile();
          game.save.world.flags['stockpileOpened'] = true;
        }
        return true;
      },
    });
    game.tickers.push((dt, simDt) => this.tick(dt, simDt));
    game.onSleepHook = (hours) => {
      this.advance(hours, false);
      this.lastHour = Math.floor(game.save.world.hour + hours);
    };
  }

  /** Seed the first survivors on a new game. */
  seed(): void {
    const w = this.game.save.world;
    if (w.survivors.length) return;
    const r = new Rng(hash2(w.seed, 0x5eed));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      w.survivors.push(generateSurvivor(r, i + 1, this.home.x + Math.cos(a) * 6, this.home.z + Math.sin(a) * 6));
    }
    // a little food in the town stock so day one is not a famine
    // enough for the first two days; after that the town needs farms, scavengers or your donations
    w.townStock[0] = { id: 'food.canned_beans', n: 14 };
    w.townStock[1] = { id: 'food.crackers', n: 8 };
    w.townStock[2] = { id: 'drink.clean_water', n: 12 };
    w.townStock[3] = { id: 'seed.potato', n: 6 };
    w.townStock[4] = { id: 'mat.timber', n: 20 };
  }

  private nav: Uint8Array | null = null;
  private navAt = -1;
  /** Coarse 2 m nav grid; rebuilt only when the set of removed props changes. */
  private navGrid(): Uint8Array {
    const removed = this.game.view.removedProps.size;
    if (!this.nav || removed !== this.navAt) {
      this.nav = buildNavGrid(this.game.layout, this.game.view.removedProps);
      this.navAt = removed;
    }
    return this.nav;
  }

  rankInfo(): { rank: number; points: number; next: number | null } {
    return rankOf(this.game.save.world);
  }

  private ctx() {
    const w = this.game.save.world;
    const rank = rankOf(w).rank;
    const restored = w.districts.filter((d) => d.state >= 2).length;
    const keys = this.game.layout.districts.map((d) => d.key);
    // Grid water reaches the plots once a Waterworks pump syncs; a Powered hospital opens the clinic
    // perks: Heart of Haven (+mood while you are in town), Green Thumb (crop growth)
    const inTown = Math.hypot(this.game.player.pos.x - this.home.x, this.game.player.pos.z - this.home.z) < 60;
    const mood = restored * 2 + (inTown ? this.game.pk('townMood') : 0);
    return { difficulty: w.difficulty, home: this.home, rank, cap: survivorCap(rank), moodBonus: mood, irrigation: irrigationOn(w, keys), clinic: clinicOn(w, keys), growthBonus: this.game.pk('growth'), repairBonus: this.game.pk('repair'), crewBonus: inTown ? this.game.pk('crewSpeed') : 0, guardBonus: inTown ? this.game.pk('guardDamage') : 0 };
  }

  /**
   * Run the town sim over `hours`.
   * - live catch-up (rewind=true): those hours have ALREADY passed on the world clock, so step over
   *   [now-hours, now] without moving the clock (tickTown itself advances world.hour).
   * - sleep (rewind=false): step forward from now; the caller then sets the final hour.
   */
  advance(hours: number, rewind = true): void {
    const w = this.game.save.world;
    if (hours <= 0) return;
    const now = w.hour;
    if (rewind) w.hour = now - hours;
    const ev = tickTown(w, hours, this.ctx());
    if (rewind) w.hour = now;
    this.react(ev);
  }

  /** Coops and pens produce into the Town Stockpile at dawn (needs feed/organic in stock for pens). */
  private livestock(): void {
    const w = this.game.save.world;
    const day = Math.floor(w.hour / 24);
    if (Number(w.flags['livestockDay'] ?? -1) === day || w.hour % 24 < 6) return;
    w.flags['livestockDay'] = day;
    const coops = w.pieces.filter((p) => p.piece === 'coop').length;
    const pens = w.pieces.filter((p) => p.piece === 'pen').length;
    if (!coops && !pens) return;
    const add = (id: string, n: number) => {
      let left = n;
      for (const s of w.townStock) if (s && s.id === id) {
        s.n += left;
        left = 0;
        break;
      }
      if (left) {
        const i = w.townStock.findIndex((s) => !s);
        if (i >= 0) w.townStock[i] = { id, n: left };
      }
    };
    if (coops) add('food.egg', coops * 3);
    if (pens) add('food.milk', pens * 2);
    this.game.toast(`Morning chores: ${coops ? `${coops * 3} eggs` : ''}${coops && pens ? ' and ' : ''}${pens ? `${pens * 2} milk` : ''} into the Town Stockpile.`, 'warm');
  }

  private react(ev: TownEvent[]): void {
    this.livestock();
    let starving = 0;
    for (const e of ev) {
      this.boardEvents.push(e);
      if (this.boardEvents.length > 60) this.boardEvents.shift();
      if (e.type === 'starving') {
        starving++;
        continue;
      }
      if (e.type === 'arrival' || e.type === 'death' || e.type === 'injury' || e.type === 'blueprint') {
        this.game.toast(e.text, e.type === 'arrival' || e.type === 'blueprint' ? 'warm' : 'bad');
        if (e.type === 'arrival') {
          audio.play('levelUp', { vol: 0.4 });
          this.game.award(XP.arrival);
        }
      }
    }
    // one clear message instead of one per survivor
    if (starving && this.game.time - this.lastHungerToast > 90) {
      this.lastHungerToast = this.game.time;
      this.game.toast(`${starving === 1 ? 'A survivor is' : `${starving} survivors are`} going hungry. Put food in the Town Stockpile or build farm plots.`, 'bad');
    }
    if (ev.length) this.game.bus.emit({ type: 'town' });
    const w = this.game.save.world;
    let sig = '';
    for (const c of w.crops) sig += `${c.plot}:${c.crop}:${cropStage(c.growth)};`;
    if (sig !== this.cropSig) {
      this.cropSig = sig;
      this.game.base.rebuild(w.pieces, w.crops, w.hour);
    }
    this.game.save.world.flags['rank'] = rankOf(this.game.save.world).rank;
  }

  get events(): readonly TownEvent[] {
    return this.boardEvents;
  }

  needs() {
    return computeNeeds(this.game.save.world);
  }

  assign(id: number, job: string): void {
    const s = this.game.save.world.survivors.find((x) => x.id === id);
    if (!s) return;
    s.job = job as JobId;
    audio.play('click');
    this.game.toast(`${s.name.split(' ')[0]} will ${jobVerb(job)}.`, 'warm');
    this.game.bus.emit({ type: 'town' });
  }

  private tick(dt: number, simDt: number): void {
    const g = this.game;
    if (g.mode === 'menu' || !g.save) return;
    const w = g.save.world;
    // hourly sim steps (game time)
    const h = Math.floor(w.hour);
    if (this.lastHour < 0) this.lastHour = h;
    if (h > this.lastHour) {
      const steps = Math.min(48, h - this.lastHour);
      this.lastHour = h;
      this.advance(steps);
    } else if (h < this.lastHour) this.lastHour = h; // loaded an older save
    // who is near?
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      this.syncNear();
    }
    // steer near survivors toward their sim targets
    const px = g.player.pos.x, pz = g.player.pos.z;
    for (const n of this.near.values()) {
      const s = w.survivors.find((x) => x.id === n.id);
      if (!s) continue;
      const tgt = survivorTarget(s, w, (s.job as JobId) ?? 'auto', w.hour, this.home);
      // follow a nav-grid path; straight line only for short hops or when no path exists
      n.repathT -= dt;
      const farGoal = Math.hypot(tgt.x - n.pos.x, tgt.z - n.pos.z);
      if (farGoal > 4 && (!n.path || n.repathT <= 0 || Math.hypot(tgt.x - n.pathTx, tgt.z - n.pathTz) > 3)) {
        n.path = findPath(this.navGrid(), n.pos.x, n.pos.z, tgt.x, tgt.z, 6000);
        n.pathIdx = 0;
        n.pathTx = tgt.x;
        n.pathTz = tgt.z;
        n.repathT = 6 + Math.random() * 3;
      } else if (farGoal <= 4) n.path = null;
      let gx = tgt.x, gz = tgt.z;
      if (n.path) {
        while (n.pathIdx < n.path.length - 1 && Math.hypot(n.path[n.pathIdx][0] - n.pos.x, n.path[n.pathIdx][1] - n.pos.z) < 1.2) n.pathIdx++;
        gx = n.path[n.pathIdx][0];
        gz = n.path[n.pathIdx][1];
      }
      const dx = gx - n.pos.x, dz = gz - n.pos.z;
      const d = Math.max(Math.hypot(dx, dz), farGoal > 0.6 && n.path ? 0.61 : 0);
      const speed = d > 6 ? 3.2 : 1.4;
      let moving = false;
      if (d > 0.6 && simDt > 0) {
        const step = Math.min(d, speed * simDt);
        n.pos.x += (dx / d) * step;
        n.pos.z += (dz / d) * step;
        const ty = Math.atan2(dx, dz);
        let dy = ty - n.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        n.yaw += dy * Math.min(1, simDt * 6);
        moving = true;
      }
      // keep out of walls
      const tmp = this.tmpP;
      tmp.x = n.pos.x;
      tmp.y = n.pos.y;
      tmp.z = n.pos.z;
      g.collision.resolve(tmp, 0.34, 1.7, 0.45);
      n.pos.x = tmp.x;
      n.pos.z = tmp.z;
      n.pos.y = g.view.surface(n.pos.x, n.pos.z);
      // keep sim position in sync so far/near agree (no pops)
      s.x = n.pos.x;
      s.z = n.pos.z;
      n.rig.speed = moving ? speed : 0;
      const pose = moving ? 'move' : tgt.pose === 'sleep' || tgt.pose === 'lie' ? 'sleep' : tgt.pose === 'sit' ? 'sit' : tgt.pose === 'work' ? 'interact' : 'idle';
      n.rig.setState(pose === 'move' ? 'idle' : (pose as 'idle'));
      if (s.injured && !moving) n.rig.setState('sit');
      n.rig.root.position.copy(n.pos);
      n.rig.root.rotation.y = n.yaw;
      n.rig.lookTarget = Math.hypot(px - n.pos.x, pz - n.pos.z) < 7 && g.mode === 'play' ? this.lookAt.copy(g.player.pos) : null;
      n.rig.update(simDt);
      // barks when the player walks up
      n.barkT -= dt;
      const pd = Math.hypot(px - n.pos.x, pz - n.pos.z);
      if (pd < 3.2 && n.barkT <= 0 && g.mode === 'play') {
        n.barkT = 40 + Math.random() * 40;
        const sit = s.hunger < 30 ? 'hungry' : s.rest < 25 ? 'tired' : s.injured ? 'injured' : s.mood > 70 ? 'happy' : moving ? 'working' : 'greeting';
        const line = barkFor(s, sit, this.rng);
        if (line) g.bus.emit({ type: 'subtitle', who: s.name.split(' ')[0], text: line });
        // face the player briefly
        n.yaw = Math.atan2(px - n.pos.x, pz - n.pos.z);
      }
    }
    g.entityCount = 1 + this.near.size;
  }

  private syncNear(): void {
    const g = this.game;
    const w = g.save.world;
    const px = g.player.pos.x, pz = g.player.pos.z;
    const want = new Set<number>();
    const sorted = w.survivors
      .filter((s) => s.alive)
      .map((s) => ({ s, d: Math.hypot(s.x - px, s.z - pz) }))
      .filter((x) => x.d < NEAR)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_RIGS);
    for (const { s } of sorted) {
      const tgt = survivorTarget(s, w, (s.job as JobId) ?? 'auto', w.hour, this.home);
      if (tgt.away) continue;
      want.add(s.id);
      if (!this.near.has(s.id)) this.spawnRig(s);
    }
    for (const [id, n] of this.near) {
      if (!want.has(id)) {
        n.rig.dispose();
        this.near.delete(id);
      }
    }
  }

  private spawnRig(s: SurvivorSave): void {
    const look = randomLook(s.seed, { backpack: (s.seed & 3) === 0 });
    const rig = new CharacterRig(look);
    this.game.scene.add(rig.root);
    const pos = new THREE.Vector3(s.x, this.game.view.surface(s.x, s.z), s.z);
    rig.root.position.copy(pos);
    // fade-in: scale up from 0 over a few frames so nothing pops
    rig.root.scale.setScalar(0.01);
    const grow = () => {
      rig.root.scale.multiplyScalar(1.35);
      if (rig.root.scale.x < 1) requestAnimationFrame(grow);
      else rig.root.scale.setScalar(1);
    };
    requestAnimationFrame(grow);
    this.near.set(s.id, { rig, id: s.id, pos, yaw: 0, barkT: 5 + Math.random() * 10, path: null, pathIdx: 0, pathTx: 0, pathTz: 0, repathT: 0 });
  }

  reset(): void {
    for (const n of this.near.values()) n.rig.dispose();
    this.near.clear();
    this.lastHour = -1;
  }

  /** survivor nearest to the player within r meters, in front of the camera (never behind the player) */
  nearest(r: number): SurvivorSave | null {
    const g = this.game;
    let best: SurvivorSave | null = null;
    let bd = r;
    const fx = Math.sin(g.camera.yaw), fz = Math.cos(g.camera.yaw);
    for (const n of this.near.values()) {
      const dx = n.pos.x - g.player.pos.x, dz = n.pos.z - g.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6 && (dx * fx + dz * fz) / d < 0.34) continue; // > 70° off the look direction
      if (d < bd) {
        bd = d;
        best = g.save.world.survivors.find((s) => s.id === n.id) ?? null;
      }
    }
    return best;
  }
}

export function rankOf(w: WorldSave): { rank: number; points: number; next: number | null } {
  const population = w.survivors.filter((s) => s.alive).length;
  const restoredDistricts = w.districts.filter((d, i) => i > 0 && d.state >= 2).length;
  let infrastructure = 0;
  for (const p of w.pieces) if (getPiece(p.piece)?.station) infrastructure++;
  return townRank({ population, restoredDistricts, infrastructure, defense: defenseScore(w) });
}

export function jobLabel(job: string): string {
  const m: Record<string, string> = { auto: 'Decides for themselves', farm: 'Farming', gather: 'Gathering', guard: 'On guard', build: 'Building', haul: 'Hauling', cook: 'Cooking', heal: 'Healing', scavenge: 'Scavenging', companion: 'With you', idle: 'Resting' };
  return m[job] ?? job;
}

function jobVerb(job: string): string {
  const m: Record<string, string> = {
    auto: 'decide for themselves', farm: 'tend the farms', gather: 'gather materials', guard: 'keep watch', build: 'work on construction',
    haul: 'haul supplies', cook: 'run the kitchen', heal: 'look after the sick', scavenge: 'go on scavenging runs',
  };
  return m[job] ?? job;
}
