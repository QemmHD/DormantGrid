// Raids: telegraphed attacks on Haven. The sim schedules (pressure, reputation,
// difficulty); the client warns hours ahead, spawns the squad if the player is
// home, or resolves it fairly off-screen. Losses are capped — never a wipe.
import { Rng } from '@dg/shared';
import {
  defenseScore,
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
import type { EnemyKind, Enemies } from './enemies';

const KIND: Record<string, EnemyKind> = {
  raider_grunt: 'raider', raider_scout: 'raider', raider_brute: 'raider', raider_sniper: 'raider', raider_leader: 'raider',
  drone: 'drone', guard_bot: 'bot', crawler: 'crawler', custodian_heavy: 'bot', hound: 'hound', boar: 'hound',
};

export class Raids {
  private lastHour = -1;
  private phase: 'none' | 'warning' | 'active' = 'none';
  private fighting = false;
  /** staggered spawns not yet in the world; the raid can't be "repelled" before they arrive */
  private pendingSpawns = 0;
  private spawnSession = 0;
  private rng = new Rng(0x4a1d);

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
      const plan = maybeScheduleRaid(st, w.hour, this.rng, { pressure, rank: Number(w.flags['rank'] ?? 1), difficulty: w.difficulty });
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
    this.game.toast(`${line} (about ${hrs} h)`, 'bad');
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
    g.toast('They are here. Defend Haven!', 'bad');
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
    if (out.stockLoss > 0) {
      for (const s of w.townStock) if (s) s.n = Math.max(0, Math.floor(s.n * (1 - out.stockLoss)));
      for (let i = 0; i < w.townStock.length; i++) if (w.townStock[i]?.n === 0) w.townStock[i] = null;
    }
    const alive = w.survivors.filter((s) => s.alive && !s.injured);
    for (let i = 0; i < out.injuries && i < alive.length; i++) alive[i].injured = true;
    const st = loadRaidState(w);
    finishRaid(st, w.hour);
    storeRaidState(w, st);
    w.flags['raidsSurvived'] = Number(w.flags['raidsSurvived'] ?? 0) + (out.won ? 1 : 0);
    if (out.won) {
      g.toast(offscreen ? 'Raid at Haven — the guards held.' : 'Raid repelled. Haven holds.', 'warm');
      audio.play('levelUp', { vol: 0.7 });
    } else {
      g.toast(`Raid hit Haven: ${Math.round(out.stockLoss * 100)}% of stores taken${out.injuries ? `, ${out.injuries} hurt` : ''}. Build walls, assign guards.`, 'bad');
    }
    g.bus.emit({ type: 'town' });
    g.persist('raid');
  }
}
