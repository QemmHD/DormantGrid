// Review: acceptance checks for docs/review/PLAN.md. Each check prints PASS/FAIL with the
// measured value. Runtime evidence comes from the review scripts; re-run them first:
//   node tools/review/session.mjs 10 && node tools/review/controls2.mjs && node tests/budget-tris.mjs
// Usage: node tools/review/accept.mjs [id ...]
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const J = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const src = (p) => readFileSync(p, 'utf8');
const grepCount = (pattern, dir, flags = 'rniE') => {
  try {
    return Number(execSync(`grep -${flags} "${pattern}" ${dir} --include=*.ts | grep -v "\\.test\\." | wc -l`, { encoding: 'utf8' }).trim());
  } catch {
    return 0;
  }
};
const session = J('docs/review/session.json');
const c2 = J('docs/review/controls2.json');
const content = J('docs/review/content.json');
const restore = J('docs/review/restore.json');

const checks = {
  'P1-tutorial-scrap': () => {
    const t = session?.milestones?.craft;
    return [t !== undefined && t <= 90, `first craft at ${t ?? 'never'} s (target ≤ 90 s; run session.mjs 10)`];
  },
  'P2-smoke': () => {
    const fx = src('apps/game/src/render/fx.ts');
    const body = fx.slice(fx.indexOf('  smoke('), fx.indexOf('\n  }', fx.indexOf('  smoke(')));
    const opaque = /this\.spawn\(1,/.test(body);
    return [!opaque, opaque ? 'smoke() still spawns into the opaque box pool (pool 1)' : 'smoke uses a non-box pool'];
  },
  'P3-targeting': () => {
    const a = c2?.ahead2m;
    const r = a ? a.wrong / a.tests : 1;
    return [!!a && r <= 0.05, `wrong target ${a?.wrong}/${a?.tests} = ${(r * 100).toFixed(0)}% (target ≤ 5%)`];
  },
  'P4-camera-wall': () => {
    const s = c2?.summary?.wallSpin;
    const r = s ? s.framesBehindWall / s.framesTotal : 1;
    return [!!s && r <= 0.02, `camera behind wall ${s?.framesBehindWall}/${s?.framesTotal} frames = ${(r * 100).toFixed(1)}% (target ≤ 2%)`];
  },
  'P5-threat-timing': () => {
    const t = session?.milestones?.threat;
    return [t !== undefined && t <= 600, `first threat at ${t ?? 'never'} s (target ≤ 600 s in a 30-min session)`];
  },
  'P6-new-survivor': () => {
    const t = session?.milestones?.newSurvivor;
    return [t !== undefined && t <= 900, `first new survivor at ${t ?? 'never'} s (target ≤ 900 s)`];
  },
  'P7-first-build': () => {
    const t = session?.milestones?.build;
    return [t !== undefined && t <= 420, `first piece placed at ${t ?? 'never'} s (target ≤ 420 s)`];
  },
  'P8-perks-reachable': () => {
    const n = grepCount('PERKS|canTakePerk', 'apps/game/src');
    return [n > 0, `client references to perks: ${n} (target > 0, plus a UI screen)`];
  },
  'P9-power-gating': () => {
    const n = grepCount('needsPower', 'apps/game/src') + grepCount('needsPower', 'packages/sim/src/systems');
    return [n > 0, `needsPower checks outside data: ${n} (target > 0)`];
  },
  'P10-irrigation': () => {
    const t = src('apps/game/src/game/town.ts');
    const ok = /irrigation/.test(t);
    return [ok, ok ? 'town ctx passes irrigation' : 'town.ts ctx() does not pass irrigation'];
  },
  'P11-enemy-variety': () => {
    const m = src('apps/game/src/game/enemies.ts').match(/export type EnemyKind = ([^;]+);/)?.[1] ?? '';
    const n = (m.match(/'/g) ?? []).length / 2;
    return [n >= 9, `client enemy kinds: ${n} (target ≥ 9 of the 11 sim types)`];
  },
  'P12-endings-reachable': () => {
    // case-sensitive; uses outside content/campaign.ts (where it is defined)
    const n = grepCount('\\bENDINGS\\b', 'apps/game/src', 'rnE') - grepCount('export const ENDINGS', 'apps/game/src', 'rnE');
    return [n > 0, `references to ENDINGS outside its definition: ${n} (target > 0)`];
  },
  'P13-recorded-audio': () => {
    const n = content?.audio?.recordedAudioFiles ?? 0;
    return [n >= 10, `recorded audio files: ${n} (target ≥ 10 ambience/SFX beds; run content.mjs)`];
  },
  'P15-restoration-payoff': () => {
    if (!restore) return [false, 'run node tools/review/restore-check.mjs first'];
    const a = restore.after, b = restore.before;
    return [restore.pass, `lamps ${b.litLamps}→${a.litLamps}, decor ${a.decor}, walkers ${a.walkers}, hazards near player ${b.hazardsVisibleWithin60m}→${a.hazardsVisibleWithin60m}, pixels changed ${(restore.pixelFrac * 100).toFixed(1)}% (thresholds: lamps 0→≥${restore.thresholds.lamps}, decor ≥${restore.thresholds.decor}, walkers ≥${restore.thresholds.walkers}, cleared ≥${restore.thresholds.cleared}, pixels ≥${restore.thresholds.pixelFrac * 100}%)`];
  },
  'P14-tri-budget': () => {
    try {
      const out = execSync('node tests/budget-tris.mjs', { encoding: 'utf8', timeout: 400000 });
      return [/all districts within budget/.test(out), out.split('\n').filter((l) => /downtown/.test(l))[0] ?? ''];
    } catch (e) {
      return [false, String(e.stdout ?? e).split('\n').find((l) => /FAIL/.test(l)) ?? 'budget-tris failed'];
    }
  },
};

const want = process.argv.slice(2);
let fails = 0;
for (const [id, fn] of Object.entries(checks)) {
  if (want.length && !want.includes(id)) continue;
  if (id === 'P14-tri-budget' && !want.includes(id)) continue; // slow; run explicitly
  let ok = false, msg = '';
  try {
    [ok, msg] = fn();
  } catch (e) {
    msg = `error: ${e.message}`;
  }
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${msg}`);
}
console.log(`\n${fails} failing`);
