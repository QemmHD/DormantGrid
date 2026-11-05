// Review P15: restoration payoff, measured. Same street, same hour, same camera:
// dormant vs after every downtown node comes online.
// Pass (thresholds): litLamps before 0 and after ≥ 6, decor ≥ 10, walkers ≥ 2,
// hazards cleared ≥ 5, and ≥ 12% of screen pixels change luminance by > 25/255.
// Usage: node tools/review/restore-check.mjs   (apps/game must be built)
// Output: docs/review/restore.json + docs/review/shots/restore-{before,after}.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const T = { lamps: 6, decor: 10, walkers: 2, cleared: 5, pixelFrac: 0.12 };
const port = 6700 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__restore, null, { timeout: 90000 });
const HOUR = Number(process.env.HOUR ?? 22.5);
const place = (hour) =>
  page.evaluate((hour) => {
    const g = window.__dg, L = g.layout, d = L.districts.find((x) => x.key === 'downtown');
    g.save.world.flags.onb = 99; g.onbStep = 99;
    let best = null;
    for (let dz = -60; dz <= 60; dz += 4)
      for (let dx = -60; dx <= 60; dx += 4) {
        const x = d.cx + dx, z = d.cz + dz;
        if (L.tiles[Math.floor(z / 4) * 304 + Math.floor(x / 4)] !== 1) continue;
        const dist = Math.hypot(dx, dz);
        if (!best || dist < best.dist) best = { x, z, dist };
      }
    g.view.loadAround(best.x, best.z);
    g.player.pos.set(best.x, g.view.surface(best.x, best.z), best.z);
    g.player.vel.set(0, 0, 0);
    g.camera.yaw = 0.7; g.camera.pitch = -0.1; g.camera.syncTargets?.();
    g.save.world.hour = hour;
    return best;
  }, hour);
const measure = () =>
  page.evaluate(() => {
    const g = window.__dg, s = window.__restore.stats, p = g.player.pos;
    const hazards = g.layout.props.filter((q) => ['rubble', 'debris', 'cone', 'barrier', 'trashbag', 'tire'].includes(q.kind) && q.building < 0 && Math.hypot(q.x - p.x, q.z - p.z) < 60 && !g.view.removedProps.has(q.id)).length;
    const di = g.layout.districts.findIndex((x) => x.key === 'downtown');
    return { ...s, hazardsVisibleWithin60m: hazards, downtownState: g.save.world.districts[di].state, nodesOnline: g.save.world.districts[di].nodesOnline.length };
  });
await place(HOUR);
await page.waitForTimeout(6000);
const before = await measure();
await page.screenshot({ path: 'docs/review/shots/restore-before.png', timeout: 120000 }); // slow software GPU: wait, don't fail
// reboot every downtown node (same path a teammate's reboot takes: remoteOnline → restorationFor)
await page.evaluate(() => {
  const g = window.__dg, i = g.layout.districts.findIndex((d) => d.key === 'downtown');
  g.save.world.districts[i].nodesOnline = g.layout.nodes.filter((n) => n.district === i).map((n) => n.id);
  window.__grid.remoteOnline(0, i);
});
await place(HOUR);
await page.waitForTimeout(7000);
const after = await measure();
await page.screenshot({ path: 'docs/review/shots/restore-after.png', timeout: 120000 });

// pixel difference (luminance), ignoring nothing: HUD is identical in both frames
const raw = async (f) => (await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
const A = await raw('docs/review/shots/restore-before.png');
const B = await raw('docs/review/shots/restore-after.png');
let changed = 0;
const n = A.info.width * A.info.height;
for (let i = 0; i < n; i++) {
  const la = 0.2126 * A.data[i * 3] + 0.7152 * A.data[i * 3 + 1] + 0.0722 * A.data[i * 3 + 2];
  const lb = 0.2126 * B.data[i * 3] + 0.7152 * B.data[i * 3 + 1] + 0.0722 * B.data[i * 3 + 2];
  if (Math.abs(la - lb) > 25) changed++;
}
const pixelFrac = changed / n;
const checks = {
  lampsBeforeZero: before.litLamps === 0,
  lamps: after.litLamps >= T.lamps,
  decor: after.decor >= T.decor,
  walkers: after.walkers >= T.walkers,
  cleared: after.cleared >= T.cleared,
  pixels: pixelFrac >= T.pixelFrac,
  noErrors: errs.length === 0,
};
const result = { hour: HOUR, thresholds: T, before, after, pixelFrac: +pixelFrac.toFixed(3), checks, pass: Object.values(checks).every(Boolean), pageErrors: errs.slice(0, 5) };
writeFileSync('docs/review/restore.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await browser.close();
srv.kill();
process.exit(result.pass ? 0 : 1);
