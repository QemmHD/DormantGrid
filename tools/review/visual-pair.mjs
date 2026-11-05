// Review round 4, item 4: identical camera setups on any build, for before/after pairs.
// Views: flames (cookfire at dusk), ground (downtown street, noon), sign from the camp
// side and from the road side, contact shadow (player at noon, high quality).
// Usage: node tools/review/visual-pair.mjs <buildRoot> <label>
//   buildRoot: a checkout whose apps/game/dist is built (e.g. a git worktree of main)
//   writes docs/review/shots/pair-<label>-<view>.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const label = process.argv[3] ?? 'after';
const out = resolve('docs/review/shots');
mkdirSync(out, { recursive: true });
const port = 7000 + Math.floor(Math.random() * 90);
const vite = resolve('node_modules/vite/bin/vite.js');
const srv = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], { cwd: join(root, 'apps/game'), stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__dg.camp, null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__dg, f = g.save.world.flags;
  f.onb = 99; g.onbStep = 99; f['open.v'] = 2;
  document.querySelector('#ui').style.visibility = 'hidden';
});
/** run a setup in the page (it may call window.__place), wait for sim time to advance, shoot */
const view = async (name, setup, arg = null, waitSim = 2.5) => {
  await page.evaluate(setup, arg);
  await page.evaluate(() => (window.__t0 = window.__dg.time));
  await page.waitForFunction((w) => window.__dg.time - window.__t0 > w, waitSim, { timeout: 120000, polling: 250 });
  await page.screenshot({ path: `${out}/pair-${label}-${name}.png` });
  console.log(label, name);
};
await page.evaluate(() => {
  window.__place = (x, z, yaw, pitch, hour) => {
    const g = window.__dg;
    g.view.loadAround(x, z);
    g.player.pos.set(x, g.view.surface(x, z), z);
    g.player.vel.set(0, 0, 0);
    g.camera.yaw = yaw;
    g.camera.pitch = pitch;
    g.camera.syncTargets?.();
    g.save.world.hour = hour;
  };
});
// 1 flames: cookfire at dusk, 4 m away
await view('flames', () => {
  const g = window.__dg, fl = g.camp.flames[g.camp.flames.length - 1].position;
  const x = fl.x + 3.2, z = fl.z + 2.2;
  window.__place(x, z, Math.atan2(fl.x - x, fl.z - z), -0.12, 19.6);
}, null, 3);
// 2 ground: downtown street at noon, looking down the road
await view('ground', () => {
  const g = window.__dg, L = g.layout, d = L.districts.find((q) => q.key === 'downtown');
  let best = null;
  for (let dz = -60; dz <= 60; dz += 4)
    for (let dx = -60; dx <= 60; dx += 4) {
      const x = d.cx + dx, z = d.cz + dz;
      if (L.tiles[Math.floor(z / 4) * 304 + Math.floor(x / 4)] !== 1) continue;
      const dist = Math.hypot(dx, dz);
      if (!best || dist < best.dist) best = { x, z, dist };
    }
  window.__place(best.x, best.z, 0.7, -0.32, 12);
}, null, 3);
// 3 sign from the camp side, 4 from the road side (the sign stands at camp-local (2, 7))
const sx = await page.evaluate(() => ({ x: window.__dg.layout.spawn.x + 2, z: window.__dg.layout.spawn.z + 7 }));
await view('sign-camp', ({ x, z }) => window.__place(x - 0.6, z - 5.5, Math.atan2(0.6, 5.5), 0.02, 11), sx);
await view('sign-road', ({ x, z }) => window.__place(x + 0.6, z + 5.5, Math.atan2(-0.6, -5.5), 0.02, 11), sx);
// 5 contact shadow: player in the open at noon, camera low and close
await view('contact', () => {
  const g = window.__dg, s = g.layout.spawn;
  window.__place(s.x - 6, s.z - 2, 2.3, -0.35, 12.5);
}, null, 2);
await browser.close();
srv.kill();
