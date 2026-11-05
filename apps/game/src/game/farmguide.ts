// Round 6: the first crop is part of the tutorial. Shows the soonest crop's growth timer on the
// objective card, reminds once when a crop ripens (toast + Town Board line + chime), leads the
// beacon to a ripe plot, and explains seasons in one short card the first time they matter.
import * as THREE from 'three';
import { CROP_MAP, hoursToRipe, seasonOf, type CropEnv } from '@dg/sim';
import type { CropSave } from '@dg/shared';
import { audio } from '../audio/audio';
import type { Game } from './game';
import type { UI } from '../ui/ui';
import { S } from '../ui/strings';

export interface CropStatus {
  plot: number;
  name: string;
  pct: number;
  hours: number;
  text: string;
}

export class FarmGuide {
  private t = 0;
  private best: CropStatus | null = null;

  constructor(private game: Game, private ui: UI) {
    game.tickers.push((dt) => this.update(dt));
  }

  private env(): CropEnv {
    const w = this.game.save.world;
    return { hour: w.hour, weather: 'clear', tended: 0 };
  }

  /** "35% · ripe in 1 d 6 h (about 30 min of play)" for one crop */
  describe(c: CropSave): CropStatus | null {
    const def = CROP_MAP.get(c.crop);
    if (!def) return null;
    const pct = Math.floor(Math.min(1, c.growth) * 100);
    const hrs = hoursToRipe(c, this.env());
    let when: string;
    if (hrs <= 0) when = S.farm.ripe;
    else if (!Number.isFinite(hrs) || hrs > 24 * 28) when = S.farm.stalled;
    else {
      const d = Math.floor(hrs / 24), h = Math.ceil(hrs - d * 24);
      const mins = Math.round(hrs * (this.game.settings.dayMinutes / 24));
      when = S.farm.readyIn(d, h, mins);
    }
    return { plot: c.plot, name: def.name, pct, hours: hrs, text: S.farm.cropLine(S.farm.plural(def.name), pct, when) };
  }

  /** crop line for the objective card: the crop closest to ripe */
  status(): CropStatus | null {
    return this.best;
  }

  /** prompt sub-line when looking at a planted plot */
  promptSub(plot: number): string | null {
    const c = this.game.save.world.crops.find((x) => x.plot === plot && x.crop);
    const st = c ? this.describe(c) : null;
    if (!st) return null;
    return S.farm.promptSub(st.pct, st.text.split(' · ').slice(1).join(' · '));
  }

  /** beacon target: a ripe plot the player has been reminded about */
  ripeTarget(): { pos: THREE.Vector3; label: string; kind: string } | null {
    const b = this.best;
    if (!b || b.hours > 0) return null;
    const p = this.game.base.pos.get(b.plot);
    if (!p) return null;
    return { pos: p.clone().setY(p.y + 1.2), label: S.farm.ripeTarget(S.farm.plural(b.name)), kind: 'farm' };
  }

  /** once per save: what seasons do (called on first planting, or a failed out-of-season one) */
  seasonCard(): void {
    const f = this.game.save.world.flags;
    if (f['seen:seasonCard']) return;
    f['seen:seasonCard'] = true;
    const body = document.createElement('div');
    body.className = 'reboot-card';
    body.setAttribute('data-season-card', '');
    for (const line of S.farm.seasonBody(seasonOf(this.game.save.world.hour))) {
      const p = document.createElement('p');
      p.textContent = line;
      body.append(p);
    }
    const ok = document.createElement('button');
    ok.className = 'btn primary';
    ok.textContent = S.farm.seasonOk;
    ok.addEventListener('click', () => this.ui.closeDialog());
    this.ui.dialog(S.farm.seasonTitle, body, [ok]);
  }

  private update(dt: number): void {
    const g = this.game;
    if (!g.save || g.mode === 'menu') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const w = g.save.world;
    // seasons matter from the first crop the player plants: explain them once (a second after planting)
    if (!w.flags['seen:seasonCard'] && g.mode === 'play' && w.crops.some((c) => c.mine && c.crop)) this.seasonCard();
    let best: CropStatus | null = null;
    for (const c of w.crops) {
      if (!c.crop) continue;
      const st = this.describe(c);
      if (st && (!best || st.hours < best.hours)) best = st;
      // harvest reminder: once per planting, when it ripens
      const key = `ripeTold:${c.plot}`;
      if (c.growth >= 1) {
        if (w.flags[key] !== c.planted) {
          w.flags[key] = c.planted;
          const name = CROP_MAP.get(c.crop)?.name ?? c.crop;
          g.toast(S.farm.reminder(S.farm.plural(name)), 'warm');
          g.bus.emit({ type: 'subtitle', who: S.farm.reminderWho, text: S.farm.reminder(S.farm.plural(name)) });
          audio.play('levelUp', { vol: 0.5 });
          w.flags['harvestReminders'] = Number(w.flags['harvestReminders'] ?? 0) + 1;
        }
      }
    }
    this.best = best;
  }
}
