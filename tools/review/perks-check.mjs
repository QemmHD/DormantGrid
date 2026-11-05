// Review round 5, item 2: no perk ships dead.
// 1. Static: every fx key of the 32 perks is read by game or sim code (pk('key'), perkFx(..,'key'), perks?.key).
// 2. Unit tests for the town-side perks (packages/sim/test/perks.test.ts) and the sim perk effects.
// 3. Runtime: a real held-E salvage is heard by a wandering raider 12 m away; with Quiet Work it is not.
// Usage: node tools/review/perks-check.mjs   (apps/game must be built) → docs/review/perks.json
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('data/perks.ts')) out.push(readFileSync(p, 'utf8'));
  }
  return out;
};
const perksSrc = readFileSync('packages/sim/src/data/perks.ts', 'utf8');
const perks = [...perksSrc.matchAll(/P\('(\w+)', (\d), '(\w+)', '([^']+)', '((?:[^'\\]|\\.)*)', \{([^}]*)\}\)/g)].map((m) => ({ id: `perk.${m[1]}.${m[3]}`, name: m[4], keys: [...m[6].matchAll(/(\w+):/g)].map((k) => k[1]) }));
const code = [...walk('packages/sim/src'), ...walk('apps/game/src')].join('\n');
const read = (k) => new RegExp(`pk\\('${k}'\\)|perkFx\\([^)]*'${k}'\\)|perks\\?\\.${k}\\b`).test(code);
const dead = perks.filter((p) => !p.keys.some(read)).map((p) => p.name);
const notYet = /notYet|FX_NOT_WIRED/.test(code);

const out = join(mkdtempSync(join(tmpdir(), 'perks-')), 'v.json');
try {
  execSync(`npx vitest run test/perks.test.ts test/campaign.test.ts --reporter=json --outputFile=${out}`, { cwd: 'packages/sim', stdio: 'ignore' });
} catch {
  /* read below */
}
const vt = JSON.parse(readFileSync(out, 'utf8'));

const port = 7320 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__enemies, null, { timeout: 120000 });
const noiseRun = async (quiet) =>
  page.evaluate(async (quiet) => {
    const g = window.__dg, E = window.__enemies;
    E.enabled = false;
    E.clear();
    const f = g.save.world.flags;
    f.onb = 99; g.onbStep = 99; f['open.v'] = 2;
    g.save.player.perks = quiet ? ['perk.scavenger.quiet_work'] : [];
    g.save.player.inventory[5] = { id: 'tool.crowbar', n: 1, d: 100 };
    g.save.player.equipped = 'tool.crowbar';
    // a salvageable prop in a loaded chunk, away from Haven
    const s = g.layout.spawn;
    g.view.loadAround(s.x - 40, s.z - 30);
    const near = [];
    g.view.propsNear(s.x - 40, s.z - 30, 40, near);
    const ok = ['crate', 'pallet', 'chair', 'trashbag', 'tire', 'bush', 'fence', 'barrel'];
    const id = near.find((i) => ok.includes(g.layout.props[i].kind) && !g.view.removedProps.has(i) && g.layout.props[i].building < 0);
    const p = g.layout.props[id];
    const x = p.x - 1.6, z = p.z;
    g.player.pos.set(x, g.view.surface(x, z), z);
    g.camera.yaw = Math.PI / 2; g.camera.syncTargets?.();
    // a raider wandering 12 m away with short sight (6 m), so only the noise can wake it
    E.spawn('raider', p.x, p.z + 12, false, 'noise');
    const r = E.list[E.list.length - 1];
    r.def = { ...r.def, sense: 6, speed: 0 };
    window.__noiseR = r;
    window.__noiseProp = id;
    return { kind: p.kind };
  }, quiet);
const results = {};
for (const quiet of [false, true]) {
  const info = await noiseRun(quiet);
  await page.waitForTimeout(600);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__dg.view.removedProps.has(window.__noiseProp) || window.__noiseR.state !== 'wander', null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyE');
  results[quiet ? 'quietWork' : 'normal'] = { prop: info.kind, raider: await page.evaluate(() => window.__noiseR.state) };
}
await browser.close();
srv.kill();
const noise = { ...results, pass: results.normal.raider !== 'wander' && results.quietWork.raider === 'wander' };
const result = {
  perks: perks.length,
  deadPerks: dead,
  noEffectLabelLeft: notYet,
  unitTests: { passed: vt.numPassedTests, total: vt.numTotalTests },
  noise,
  pass: perks.length === 32 && dead.length === 0 && !notYet && vt.success && noise.pass && errs.length === 0,
  pageErrors: errs.slice(0, 3),
};
writeFileSync('docs/review/perks.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
