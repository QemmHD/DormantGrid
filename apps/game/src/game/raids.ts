// Raids: telegraphed attacks on Haven. The sim schedules (pressure, reputation,
// difficulty); the client warns hours ahead, spawns the squad if the player is
// home, or resolves it fairly off-screen. Losses are capped — never a wipe.
import { Rng } from '@dg/shared';
import {
  addItem,
  defenseScore,
  getItem,
  raidCompass,
  type RaidPrep,
  finishRaid,
  loadRaidState,
  maybeScheduleRaid,
  raidPhase,
  raidPressure,
  resolveRaidCoarse,
  stockValue,
  storeRaidState,
  type RaidPlan,
} from '@dg/sim';
import { RAID_WARNINGS } from '../content/factions';
import { audio } from '../audio/audio';
import type { Game } from './game';
import { KIND_OF, type EnemyKind, type Enemies } from './enemies';
import { S } from '../ui/strings';

const WALLS = new Set(['wall', 'gate', 'fence', 'barricade']);
const TRAPS = new Set(['spike_strip', 'bear_trap']);
const DEFENSIVE = new Set([...WALLS, ...TRAPS, 'turret']);

/** what the HUD raid card shows */
export interface RaidStatus {
  phase: 'warning' | 'active';
  who: string;
  from: string;
  /** compass bearing the raid comes from (world dir, radians) */
  dir: number;
  /** game hours until arrival (0 once active) */
  hoursLeft: number;
  prep: { wall: boolean; trap: boolean; weapon: boolean };
  early: boolean;
}

/** every sim enemy id spawns as its own client kind (round 5: was 5 look-alikes) */
const KIND: Record<string, EnemyKind> = KIND_OF;

export class Raids {
  private lastHour = -1;
  private phase: 'none' | 'warning' | 'active' = 'none';
  private fighting = false;
  /** staggered spawns not yet in the world; the raid can't be "repelled" before they arrive */
  private pendingSpawns = 0;
  private spawnSession = 0;
  private rng = new Rng(0x4a1d);
  private recoverCheckT = 0;
  /** last resolved raid (checks/telemetry) */
  lastOutcome: { won: boolean; early: boolean; stockLoss: number; lostItems: number; injuries: number } | null = null;
  /** supplies returned by the last completed recovery */
  lastRecovered = 0;

  constructor(private game: Game, private enemies: Enemies) {
    game.tickers.push(() => this.tick());
    game.resetHooks.push(() => {
      this.lastHour = -1;
      this.phase = 'none';
      this.fighting = false;
      this.pendingSpawns = 0;
      this.spawnSession++;
    });
  }

  private tick(): void {
    const g = this.game;
    if (g.mode === 'menu' || !g.save) return;
    const w = g.save.world;
    const h = Math.floor(w.hour);
    // recovery objective (after a lost raid): checked about once a second, independent of the hour gate
    if (this.recoverCheckT-- <= 0) {
      this.recoverCheckT = 30;
      this.checkRecovery();
    }
    // scheduling runs once per game hour; once a raid is announced, check arrival every tick
    // (otherwise a raid due at 8:15 would only arrive when the clock hits 9:00)
    if (h === this.lastHour && !this.fighting && this.phase !== 'warning') return;
    const hourChanged = h !== this.lastHour;
    this.lastHour = h;
    const st = loadRaidState(w);
    if (hourChanged && !st.pending && w.survivors.length > 0 && w.hour > 30) {
      const nodesOnline = w.districts.reduce((s, d) => s + d.nodesOnline.length, 0);
      const pressure = raidPressure({
        reaverRep: w.factions['reavers'] ?? -20,
        custodianRep: w.factions['custodians'] ?? -50,
        stockValue: stockValue(w.townStock),
        population: w.survivors.filter((s) => s.alive).length,
        nodesOnline,
      });
      const raidIndex = Number(w.flags['raidsSurvived'] ?? 0) + Number(w.flags['raidsLost'] ?? 0);
      const plan = maybeScheduleRaid(st, w.hour, this.rng, { pressure, rank: Number(w.flags['rank'] ?? 1), difficulty: w.difficulty, raidIndex, prep: this.prep() });
      if (plan) st.pending = plan;
      storeRaidState(w, st);
    }
    const plan = st.pending;
    const ph = raidPhase(plan, w.hour);
    if (ph !== this.phase) {
      this.phase = ph;
      if (ph === 'warning' && plan) this.warn(plan);
      if (ph === 'active' && plan) this.arrive(plan);
    }
    if (this.fighting && plan && this.pendingSpawns === 0) {
      const left = this.enemies.aliveTagged('raid');
      const timedOut = w.hour > plan.arriveHour + 3;
      if (left === 0 || timedOut) this.resolve(plan, left === 0 && !timedOut);
    }
  }

  /** Preparation Haven has right now (sizes the early raids; drives the HUD checklist). */
  prep(): RaidPrep {
    const w = this.game.save.world;
    let walls = 0, traps = 0, turrets = 0;
    for (const p of w.pieces) {
      if (WALLS.has(p.piece)) walls++;
      else if (TRAPS.has(p.piece)) traps++;
      else if (p.piece === 'turret') turrets++;
    }
    const guards = w.survivors.filter((s) => s.alive && s.job === 'guard').length;
    const eq = this.game.save.player.equipped;
    return { walls, traps, turrets, guards, weapon: !!(eq && getItem(eq)?.weapon) };
  }

  /** HUD: the announced or ongoing raid, or null. */
  status(): RaidStatus | null {
    const g = this.game;
    if (!g.save) return null;
    const w = g.save.world;
    const plan = loadRaidState(w).pending;
    const ph = raidPhase(plan, w.hour);
    if (!plan || ph === 'none') return null;
    const p = this.prep();
    return {
      phase: ph,
      who: S.raid.factions[plan.faction] ?? plan.faction,
      from: S.raid.compass[raidCompass(plan.dir)],
      dir: plan.dir,
      hoursLeft: Math.max(0, plan.arriveHour - w.hour),
      prep: { wall: p.walls > 0, trap: p.traps > 0, weapon: p.weapon },
      early: !!plan.early,
    };
  }

  /** after a lost raid: the recovery objective, or null */
  recovery(): { title: string; text: string } | null {
    const w = this.game.save?.world;
    if (!w || w.flags['raid.recover'] === undefined) return null;
    return { title: S.raid.recoverTitle, text: S.raid.recoverText(0) };
  }

  private defensiveCount(): number {
    return this.game.save.world.pieces.filter((p) => DEFENSIVE.has(p.piece)).length;
  }

  /** recovery done once a new defensive piece stands: half the lost supplies come back */
  private checkRecovery(): void {
    const w = this.game.save.world;
    const base = w.flags['raid.recover'];
    if (base === undefined) return;
    if (this.defensiveCount() <= Number(base)) return;
    let back = 0;
    try {
      const lost = JSON.parse(String(w.flags['raid.recoverItems'] ?? '[]')) as [string, number][];
      for (const [id, n] of lost) {
        const k = Math.ceil(n / 2);
        back += k - addItem(w.townStock, id, k);
      }
    } catch {
      /* corrupt flag: just clear it */
    }
    delete w.flags['raid.recover'];
    delete w.flags['raid.recoverItems'];
    this.lastRecovered = back;
    this.game.toast(S.raid.recovered(back), 'warm');
    audio.play('levelUp', { vol: 0.6 });
    this.game.bus.emit({ type: 'town' });
    this.game.pokeQuests();
    this.game.persist('raid-recovered');
  }

  /** Debug/test: schedule a small raid arriving almost immediately. */
  force(): void {
    const w = this.game.save.world;
    const st = loadRaidState(w);
    st.pending = { id: st.nextId++, faction: 'reavers', warnHour: w.hour, arriveHour: w.hour + 0.05, dir: 0.5, units: [{ enemy: 'raider_grunt', count: 3 }], strength: 30, goal: 'stores' };
    storeRaidState(w, st);
    this.lastHour = -1;
  }

  private warn(plan: RaidPlan): void {
    const key = plan.faction === 'reavers' ? 'ashline' : plan.faction === 'custodians' ? 'custodians' : 'wildlife';
    const lines = RAID_WARNINGS[key];
    const line = lines[Math.floor(this.rng.next() * lines.length)];
    const hrs = Math.max(1, Math.round(plan.arriveHour - this.game.save.world.hour));
    this.game.toast(S.raid.warnToast(line, S.raid.compass[raidCompass(plan.dir)], hrs), 'bad');
    this.game.bus.emit({ type: 'subtitle', who: 'Town Board', text: `Raid warning: ${line}` });
    audio.play('alarm', { vol: 0.8 });
  }

  private arrive(plan: RaidPlan): void {
    const g = this.game;
    const home = g.layout.spawn;
    const dist = Math.hypot(g.player.pos.x - home.x, g.player.pos.z - home.z);
    if (dist > 160) {
      // player away: resolve fairly off-screen
      this.resolve(plan, false, true);
      return;
    }
    this.fighting = true;
    audio.play('alarm', { vol: 1 });
    g.toast(S.raid.arrive, 'bad');
    let i = 0;
    for (const u of plan.units) {
      const kind = KIND[u.enemy] ?? 'raider';
      for (let k = 0; k < Math.min(u.count, 8); k++) {
        const a = plan.dir + (this.rng.next() - 0.5) * 0.8;
        const r = 45 + this.rng.next() * 15;
        const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
        this.pendingSpawns++;
        const session = this.spawnSession;
        setTimeout(() => {
          if (session !== this.spawnSession) return; // world reset meanwhile
          this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
          if (this.fighting) this.enemies.spawn(kind, Math.min(1200, Math.max(16, x)), Math.min(1200, Math.max(16, z)), true, 'raid');
        }, i++ * 400);
      }
    }
  }

  private resolve(plan: RaidPlan, playerWon: boolean, offscreen = false): void {
    const g = this.game;
    const w = g.save.world;
    this.fighting = false;
    const out = playerWon ? { won: true, stockLoss: 0, injuries: 0, structureDamage: 0 } : resolveRaidCoarse(plan, defenseScore(w) + (offscreen ? 0 : 10), this.rng);
    const lost = new Map<string, number>();
    if (out.stockLoss > 0) {
      for (const s of w.townStock) {
        if (!s) continue;
        const keep = Math.max(0, Math.floor(s.n * (1 - out.stockLoss)));
        if (s.n > keep) lost.set(s.id, (lost.get(s.id) ?? 0) + s.n - keep);
        s.n = keep;
      }
      for (let i = 0; i < w.townStock.length; i++) if (w.townStock[i]?.n === 0) w.townStock[i] = null;
    }
    const alive = w.survivors.filter((s) => s.alive && !s.injured);
    for (let i = 0; i < out.injuries && i < alive.length; i++) alive[i].injured = true;
    this.lastOutcome = { won: out.won, early: !!plan.early, stockLoss: out.stockLoss, lostItems: [...lost.values()].reduce((a, b) => a + b, 0), injuries: out.injuries };
    const st = loadRaidState(w);
    finishRaid(st, w.hour, !out.won);
    if (!out.won) {
      // soft failure: a recovery objective that gives part of the loss back
      w.flags['raid.recover'] = this.defensiveCount();
      w.flags['raid.recoverItems'] = JSON.stringify([...lost].slice(0, 24));
    }
    storeRaidState(w, st);
    w.flags['raidsSurvived'] = Number(w.flags['raidsSurvived'] ?? 0) + (out.won ? 1 : 0);
    w.flags['raidsLost'] = Number(w.flags['raidsLost'] ?? 0) + (out.won ? 0 : 1);
    if (out.won) {
      g.toast(offscreen ? S.raid.wonAway : S.raid.won, 'warm');
      audio.play('levelUp', { vol: 0.7 });
    } else {
      const pct = Math.round(out.stockLoss * 100);
      g.toast(plan.early ? S.raid.lostSoft(pct) : S.raid.lost(pct, out.injuries), 'bad');
      g.bus.emit({ type: 'subtitle', who: 'Town Board', text: S.raid.graceNote });
    }
    g.bus.emit({ type: 'town' });
    g.persist('raid');
  }
}
