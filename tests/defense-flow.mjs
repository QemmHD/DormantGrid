// Scripted defense test: traps hurt/pin enemies; raiders tear at placed pieces
// when the player isn't nearby.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 5500 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let ok = true;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) ok = false; };
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 30000 });
// trap: place a bear trap 20 m from Haven and drop a crawler on it
await page.evaluate(() => {
  const g = window.__dg, s = g.layout.spawn;
  const x = Math.round(s.x + 20), z = Math.round(s.z + 20);
  g.save.world.pieces.push({ id: 9001, piece: 'bear_trap', tier: 0, x, y: 0, z, rot: 0, hp: 60 });
  g.base.rebuild(g.save.world.pieces, g.save.world.crops, g.save.world.hour);
  window.__enemies.spawn('crawler', x, z, false, 'test');
  return { x, z };
});
await page.waitForTimeout(2500);
const crawler = await page.evaluate(() => {
  const e = window.__enemies.list.find((x) => x.tag === 'test');
  return e ? { hp: e.hp, state: e.state } : { hp: 0, state: 'dead' };
});
check(crawler.hp < 22, `bear trap damaged the crawler (hp ${crawler.hp.toFixed(0)}/22, ${crawler.state})`);
// raid vs. buildings: wall near Haven, player 40 m away, raider spawned beside the wall
const wallHp = await page.evaluate(() => {
  const g = window.__dg, s = g.layout.spawn;
  g.save.world.pieces.push({ id: 9002, piece: 'wall', tier: 0, x: Math.round(s.x / 4) * 4 + 2, y: 0, z: Math.round(s.z / 4) * 4 + 16, rot: 0, hp: 150 });
  g.base.rebuild(g.save.world.pieces, g.save.world.crops, g.save.world.hour);
  g.player.pos.set(s.x - 40, g.view.surface(s.x - 40, s.z), s.z);
  const w = g.save.world.pieces.find((p) => p.id === 9002);
  window.__enemies.spawn('raider', w.x + 3, w.z, true, 'raid');
  return w.hp;
});
let after = wallHp;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500);
  after = await page.evaluate(() => window.__dg.save.world.pieces.find((p) => p.id === 9002)?.hp ?? -1);
  if (after < wallHp) break;
}
check(after < wallHp, `raider damaged the wall while the player was away (${wallHp} → ${after.toFixed(0)})`);
check(errs.length === 0, `no errors ${errs.slice(0, 2).join(' | ')}`);
await browser.close(); srv.kill(); process.exit(ok ? 0 : 1);
