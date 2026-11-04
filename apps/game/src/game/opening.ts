// Opening director: paces the first ten minutes of a NEW game so there is always
// something happening (review finding #14/#15):
//   ~3:52  a survivor shouts a warning (telegraph)
//   ~4:00  one drone scout flies in, in front of the camera, ~24 m out (first threat)
//   ~8:00  a stranger walks in from the road and joins Haven (first arrival)
// The timer is sim time stored in the save (flags 'open.t'), so it survives reloads.
// Old saves and continued games are marked done and never get these beats.
import { Rng } from '@dg/shared';
import { generateSurvivor } from '@dg/sim';
import type { Game } from './game';
import type { Enemies } from './enemies';
import { S } from '../ui/strings';
import { audio } from '../audio/audio';

export const OPENING = { warnAt: 232, threatAt: 240, arrivalAt: 480 } as const;

export class Opening {
  constructor(private game: Game, private enemies: Enemies) {
    game.tickers.push((_dt, simDt) => this.tick(simDt));
  }

  private tick(simDt: number): void {
    const g = this.game;
    if (!g.save || g.mode !== 'play' || simDt <= 0) return;
    const f = g.save.world.flags;
    if (f['open.v'] === undefined) {
      // only a fresh game gets the scripted opening
      const fresh = g.save.world.hour < 9 && g.save.world.survivors.length <= 3 && f['onb'] !== undefined && Number(f['onb']) < 4;
      f['open.v'] = fresh ? 1 : 2;
      f['open.t'] = 0;
    }
    if (f['open.v'] !== 1) return;
    const t = Number(f['open.t'] ?? 0) + simDt;
    f['open.t'] = t;
    if (t >= OPENING.warnAt && !f['open.warned']) {
      f['open.warned'] = true;
      const who = g.save.world.survivors[0]?.name ?? S.opening.someone;
      g.bus.emit({ type: 'subtitle', who, text: S.opening.droneWarn });
      g.toast(S.opening.droneToast, 'bad');
      audio.play('drone', { vol: 0.6 });
    }
    if (t >= OPENING.threatAt && !f['open.threat']) {
      f['open.threat'] = true;
      // in front of the camera, slightly off-center, so the player sees it come in
      const yaw = g.camera.yaw + 0.5;
      const x = g.player.pos.x + Math.sin(yaw) * 24, z = g.player.pos.z + Math.cos(yaw) * 24;
      this.enemies.spawn('drone', x, z, true, 'opening');
      audio.play('alarm', { vol: 0.5 });
    }
    if (t >= OPENING.arrivalAt && !f['open.arrival']) {
      f['open.arrival'] = true;
      const w = g.save.world;
      const home = g.layout.spawn;
      const id = w.survivors.reduce((m, s) => Math.max(m, s.id), 0) + 1;
      const a = new Rng(w.seed ^ 0x0a77).range(0, Math.PI * 2);
      const s = generateSurvivor(new Rng(w.seed ^ 0xa771), id, home.x + Math.cos(a) * 26, home.z + Math.sin(a) * 26);
      s.mood = Math.max(s.mood, 55);
      w.survivors.push(s);
      g.toast(S.opening.arrivalToast.replace('{name}', s.name), 'warm');
      g.bus.emit({ type: 'subtitle', who: s.name, text: S.opening.arrivalLine });
      audio.play('levelUp', { vol: 0.45 });
    }
    if (f['open.threat'] && f['open.arrival']) f['open.v'] = 2;
  }
}
