// Review: acceptance checks for docs/review/PLAN.md. Each check prints PASS/FAIL with the
// measured value. Runtime evidence comes from the review scripts; re-run them first:
//   node tools/review/session.mjs 10 && node tools/review/controls2.mjs && node tests/budget-tris.mjs
// Usage: node tools/review/accept.mjs [id ...]
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const restore = J('docs/review/restore.json');
const smoke = J('docs/review/smoke.json');
const progress = J('docs/review/progress.json');
const enemies = J('docs/review/enemies.json');
// unit tests that back P9/P10 (run here, so the result is always current)
const vitest = (file) => {
  const out = join(mkdtempSync(join(tmpdir(), 'accept-')), 'v.json');
  try {
    execSync(`npx vitest run ${file} --reporter=json --outputFile=${out}`, { cwd: 'packages/sim', stdio: 'ignore' });
  } catch {
    /* failures are read from the report */
  }
  const j = J(out);
  return j ? { pass: j.success, passed: j.numPassedTests, total: j.numTotalTests } : { pass: false, passed: 0, total: 0 };
};
const tests = { power: vitest('test/power.test.ts') };

const checks = {
  'P1-tutorial-scrap': () => {
    const t = session?.milestones?.craft;
    return [t !== undefined && t <= 90, `first craft at ${t ?? 'never'} s (target ≤ 90 s; run session.mjs 10)`];
  },
  'P2-smoke': () => {
    // rendered pixels (tools/review/smoke-check.mjs), not source code
    if (!smoke) return [false, 'run node tools/review/smoke-check.mjs first'];
    return [smoke.pass, `smoke covers ${(smoke.smokeFrac * 100).toFixed(2)}% of the frame (≥ ${smoke.thresholds.smokeFrac * 100}%), hard-edge pixels ${(smoke.hardEdgeRatio * 100).toFixed(1)}% (≤ ${smoke.thresholds.hardEdge * 100}%), box pool adds ${(smoke.boxFrac * 100).toFixed(3)}% (≤ ${smoke.thresholds.boxFrac * 100}%)`];
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
    if (!progress) return [false, 'run node tools/review/progress-check.mjs first'];
    const p = progress.p8;
    return [p.pass, `real salvage XP ${p.salvage.xpBefore}→${p.salvage.xpAfter}; craft level-up → ${p.levelUp.pts} perk point, ★ badge "${p.levelUp.badge}"; Perks screen ${p.screen.tabs} tracks × ${p.screen.perks} perks; Take → ${p.take.perks.length} learned, carry ${p.take.carryBefore}→${p.take.carry}`];
  },
  'P9-power-gating': () => {
    const t = tests?.power;
    const gate = grepCount('needsPower', 'apps/game/src');
    const ok = !!t && t.pass && gate > 0;
    return [ok, `${t ? `${t.passed}/${t.total} power+water unit tests pass` : 'run vitest power.test.ts'}; client needsPower gates: ${gate} (stations, turrets, floodlights via sim districtPowered)`];
  },
  'P10-irrigation': () => {
    const tw = src('apps/game/src/game/town.ts');
    const ok = /irrigation: irrigationOn\(/.test(tw) && !!tests?.power?.pass;
    return [ok, ok ? 'town ctx passes irrigation = irrigationOn(world); unit test: irrigated crop water ≥ 0.85 and grows faster than a dry one' : 'town.ts ctx() does not pass irrigation'];
  },
  'P11-enemy-variety': () => {
    // measured (tools/review/enemies-check.mjs): silhouettes at 30 m, behaviour + counter per kind, escalation
    const m = src('apps/game/src/game/enemies.ts').match(/export type EnemyKind = ([^;]+);/)?.[1] ?? '';
    const n = (m.match(/'/g) ?? []).length / 2;
    if (!enemies) return [false, `client enemy kinds: ${n}; run node tools/review/enemies-check.mjs`];
    const ok = Object.values(enemies.behaviour).filter((b) => b.pass).length;
    const w = enemies.silhouettes.worstPairs[0];
    return [enemies.pass && n >= 11, `client kinds ${n}/11; behaviour+counter ${ok}/11; silhouettes at 30 m: smallest ${Math.min(...Object.values(enemies.silhouettes.px))} px, most similar pair ${w[0]}/${w[1]} IoU ${w[2]} (≤ ${enemies.thresholds.maxIoU}); escalation tier 0 → 4: ${enemies.escalation.tier0.length} → ${enemies.escalation.tier4.length} kinds`];
  },
  'P12-endings-reachable': () => {
    if (!progress) return [false, 'run node tools/review/progress-check.mjs first'];
    const p = progress.p12;
    const shown = p.steps.filter((x) => x.startsWith('✓')).length;
    return [p.pass, `campaign walked: ${p.steps.length} steps, next step shown in Journal at ${shown}/${p.steps.length}; via UI: ${p.uiSteps.join(', ')}; endings reached through the UI: ${p.endings.filter((e) => e.ok).length}/6 (${p.endings.map((e) => e.got).join(', ')})`];
  },
  'P13-recorded-audio': () => {
    // only real recorded files that ship (assets/manifest.json) AND that the game plays (runtime not pending)
    const man = J('assets/manifest.json') ?? { assets: {} };
    const reg = J('assets/audio-registry.json') ?? { audio: [] };
    const used = Object.values(man.assets ?? {}).filter((e) => e.kind === 'audio' && e.runtime && !e.runtime.pending && existsSync(join('assets', e.path))).length;
    const wired = reg.audio.filter((a) => !a.runtime.pending).length;
    return [used >= 10, `recorded audio files shipped and played: ${used} (target ≥ 10). Pipeline ready: ${reg.audio.length} IDs, ${wired} with a runtime hook; files needed are listed in docs/asset-requests/audio-sfx.md and audio-music.md`];
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
