// Review P2 on rendered pixels: is the campfire smoke soft, and not cubes?
// Same frozen frame (game paused, dt = 0), three renders:
//   A  everything                     B  smoke puff layer hidden         C  opaque box-particle pool hidden
// smoke = A−B (what the puff layer adds), boxes = A−C (what the cube pool adds).
// Pass: smoke covers ≥ 0.5% of the frame (it is visible), its edges are soft (≤ 8% of smoke
// pixels sit on a hard edge: Sobel of ΔL > 24/255), and boxes add ≤ 0.05% (no cube smoke).
// Flame billboards are hidden in all three so their per-frame flicker cannot leak into the diff.
// Softness is measured on S1−S0: the same puffs rendered alone over the sky (scene hidden),
// because over the real frame the edges of whatever is BEHIND the smoke leak into A−B.
// Usage: node tools/review/smoke-check.mjs   (apps/game must be built)
// Output: docs/review/smoke.json + docs/review/shots/smoke-{A,B,C}.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const T = { smokeFrac: 0.005, hardEdge: 0.08, boxFrac: 0.0005 };
const port = 6880 + Math.floor(Math.random() * 60);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__dg.camp, null, { timeout: 90000 });
const fire = await page.evaluate(() => {
  const g = window.__dg;
  const f = g.save.world.flags;
  f.onb = 99; g.onbStep = 99; f['open.v'] = 2;
  g.save.world.hour = 13;
  const fl = g.camp.flames[g.camp.flames.length - 1].position; // the cookfire
  const x = fl.x + 7, z = fl.z + 3.5;
  g.player.pos.set(x, g.view.surface(x, z), z);
  g.player.vel.set(0, 0, 0);
  g.camera.yaw = Math.atan2(fl.x - x, fl.z - z);
  g.camera.pitch = 0.12; // a little up: smoke against sky and the camp
  g.camera.syncTargets?.();
  document.querySelector('#ui').style.visibility = 'hidden'; // HUD is not part of the measurement
  return { x: fl.x, y: fl.y, z: fl.z };
});
// let smoke build up in SIM time (SwiftShader runs ~5 fps with dt clamped to 0.05 s)
await page.waitForFunction(() => window.__dg.fx.puffPool.filter((p) => p.alive).length >= 14 && window.__dg.time > 8, null, { timeout: 180000, polling: 500 });
await page.evaluate(() => {
  const g = window.__dg;
  g.setPaused(true);
  g.camp.tongues.visible = false;
});
await page.waitForTimeout(800);
const shot = async (name, setup) => {
  await page.evaluate(setup);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `docs/review/shots/smoke-${name}.png` });
};
await shot('A', () => ((window.__dg.fx.puffs.visible = true), (window.__dg.fx.mesh.visible = true)));
await shot('B', () => ((window.__dg.fx.puffs.visible = false), (window.__dg.fx.mesh.visible = true)));
await shot('C', () => ((window.__dg.fx.puffs.visible = true), (window.__dg.fx.mesh.visible = false)));
// shape-only renders: hide everything but the sky and the puff layer, so the smoke's own
// edges are measured (over the real frame, background edges leak into A−B)
await page.evaluate(() => {
  const g = window.__dg;
  window.__hidden = [];
  g.scene.traverse((o) => {
    if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o !== g.fx.puffs && o.visible && !(o.material && o.material.side === 1 && o.geometry?.type?.includes('Sphere'))) {
      window.__hidden.push(o);
      o.visible = false;
    }
  });
});
await shot('S1', () => (window.__dg.fx.puffs.visible = true));
await shot('S0', () => (window.__dg.fx.puffs.visible = false));
await page.evaluate(() => { for (const o of window.__hidden) o.visible = true; window.__dg.fx.puffs.visible = true; });
const live = await page.evaluate(() => ({ puffsAlive: window.__dg.fx.puffPool.filter((p) => p.alive).length, boxesAlive: window.__dg.fx.pool.filter((p) => p.alive).length }));

const lum = async (f) => {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = new Float32Array(info.width * info.height);
  for (let i = 0; i < L.length; i++) L[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  return { L, w: info.width, h: info.height };
};
const A = await lum('docs/review/shots/smoke-A.png');
const B = await lum('docs/review/shots/smoke-B.png');
const C = await lum('docs/review/shots/smoke-C.png');
const { w, h } = A;
const S1 = await lum('docs/review/shots/smoke-S1.png');
const S0 = await lum('docs/review/shots/smoke-S0.png');
const dS = new Float32Array(w * h);
let smokePx = 0, boxPx = 0, shapePx = 0;
for (let i = 0; i < dS.length; i++) {
  if (Math.abs(A.L[i] - B.L[i]) > 6) smokePx++;
  if (Math.abs(A.L[i] - C.L[i]) > 6) boxPx++;
  dS[i] = S1.L[i] - S0.L[i]; // smoke alone over sky
  if (Math.abs(dS[i]) > 6) shapePx++;
}
// hard edges inside the smoke difference: Sobel magnitude of ΔL
let hard = 0;
for (let y = 1; y < h - 1; y++)
  for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (Math.abs(dS[i]) <= 6) continue;
    const gx = dS[i - w + 1] + 2 * dS[i + 1] + dS[i + w + 1] - dS[i - w - 1] - 2 * dS[i - 1] - dS[i + w - 1];
    const gy = dS[i + w - 1] + 2 * dS[i + w] + dS[i + w + 1] - dS[i - w - 1] - 2 * dS[i - w] - dS[i - w + 1];
    if (Math.hypot(gx, gy) / 4 > 24) hard++;
  }
const smokeFrac = smokePx / (w * h);
const hardEdge = shapePx ? hard / shapePx : 1;
const boxFrac = boxPx / (w * h);
const checks = { smokeVisible: smokeFrac >= T.smokeFrac, smokeSoft: hardEdge <= T.hardEdge, noBoxSmoke: boxFrac <= T.boxFrac, noErrors: errs.length === 0 };
const result = { thresholds: T, fire, live, smokeFrac: +smokeFrac.toFixed(4), shapePx, hardEdgeRatio: +hardEdge.toFixed(4), boxFrac: +boxFrac.toFixed(5), checks, pass: Object.values(checks).every(Boolean), pageErrors: errs.slice(0, 5) };
writeFileSync('docs/review/smoke.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await browser.close();
srv.kill();
process.exit(result.pass ? 0 : 1);
