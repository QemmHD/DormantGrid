// Playwright smoke test (gate 2): load → enter world → move → interact (salvage)
// → save → reload → restore. Zero console errors allowed.
// Usage: node tests/smoke.mjs [baseUrl]   (default: builds are served via vite preview)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const external = process.argv[2];
let srv = null;
let base = external;
if (!external) {
  const port = 4600 + Math.floor(Math.random() * 300);
  srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
  base = `http://localhost:${port}`;
  await new Promise((r) => setTimeout(r, 2500));
}

const results = [];
const fail = (m) => {
  results.push(`FAIL ${m}`);
  console.error(`FAIL ${m}`);
};
const pass = (m) => {
  results.push(`ok   ${m}`);
  console.log(`ok   ${m}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|Failed to load resource.*\/api\//.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto(`${base}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg && window.__dg.mode === 'play', null, { timeout: 30000 });
  pass('loads and enters the world');

  // move forward for 1.2 s
  const p0 = await page.evaluate(() => ({ x: window.__dg.player.pos.x, z: window.__dg.player.pos.z }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ x: window.__dg.player.pos.x, z: window.__dg.player.pos.z }));
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  if (moved > 1.5) pass(`player moves (${moved.toFixed(1)} m)`);
  else fail(`player did not move (${moved.toFixed(2)} m)`);

  // teleport next to the nearest hand-breakable prop and hold interact until it breaks
  const info = await page.evaluate(() => {
    const g = window.__dg;
    const L = g.layout;
    const hand = new Set(['crate', 'rubble', 'barrel', 'bush', 'trashbag', 'pallet', 'tire', 'debris', 'chair']);
    let best = null;
    let bd = 1e9;
    const loaded = g.view.propsNear(g.player.pos.x, g.player.pos.z, 90, []);
    for (const id of loaded) {
      const p = L.props[id];
      if (!hand.has(p.kind) || p.building >= 0 || g.view.removedProps.has(p.id)) continue;
      const d = Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return null;
    // stand 1.4 m south of it, facing it
    g.player.pos.set(best.x, g.view.surface(best.x, best.z + 1.4), best.z + 1.4);
    g.camera.yaw = Math.PI;
    g.view.loadAround(best.x, best.z);
    const count = g.save.player.inventory.reduce((s, x) => s + (x ? x.n : 0), 0);
    return { id: best.id, kind: best.kind, count };
  });
  if (!info) fail('no breakable prop found');
  else {
    await page.waitForTimeout(1500);
    const tgt = await page.evaluate(() => { const t = window.__dg.target; return t ? t.kind + ':' + (t.id ?? '') : 'none'; });
    console.log('target', tgt, 'want', info.id);
    await page.keyboard.down('KeyE');
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      if (await page.evaluate((id) => window.__dg.view.removedProps.has(id), info.id)) break;
    }
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(2600); // flyers land
    const after = await page.evaluate((id) => {
      const g = window.__dg;
      return { gone: g.view.removedProps.has(id), count: g.save.player.inventory.reduce((s, x) => s + (x ? x.n : 0), 0) };
    }, info.id);
    if (after.gone) pass(`salvaged a ${info.kind}`);
    else fail(`could not salvage ${info.kind}`);
    if (after.count > info.count) pass(`inventory grew ${info.count} → ${after.count}`);
    else fail(`inventory did not grow (${info.count} → ${after.count})`);
  }

  // clock sanity: time must advance at the configured rate, never run away (regression: town catch-up loop)
  const clk = await page.evaluate(() => {
    const g = window.__dg;
    g.settings.dayMinutes = 1; // 24 game hours per real minute
    g.save.world.hour = 7.9; // cross an hour boundary during the window
    return { h0: g.save.world.hour, t0: performance.now() };
  });
  await page.waitForTimeout(6000);
  const clk2 = await page.evaluate(() => ({ h1: window.__dg.save.world.hour, t1: performance.now() }));
  const dh = clk2.h1 - clk.h0;
  const maxH = ((clk2.t1 - clk.t0) / 1000) * 0.4 * 1.2 + 0.05;
  if (dh > 0 && dh <= maxH) pass(`clock advances at the configured rate (${dh.toFixed(2)} h in ${((clk2.t1 - clk.t0) / 1000).toFixed(1)} s, max ${maxH.toFixed(2)})`);
  else fail(`clock ran ${dh.toFixed(2)} h in ${((clk2.t1 - clk.t0) / 1000).toFixed(1)} s (max ${maxH.toFixed(2)})`);
  await page.evaluate(() => {
    window.__dg.settings.dayMinutes = 24;
  });

  // open and close inventory via the hotkey
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(500);
  const invOpen = await page.evaluate(() => !!document.querySelector('.screen[data-screen="inventory"]'));
  if (invOpen) pass('inventory screen opens');
  else fail('inventory screen did not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // save → reload → restore
  const before = await page.evaluate(() => {
    const g = window.__dg;
    g.persist('manual');
    return { count: g.save.player.inventory.reduce((s, x) => s + (x ? x.n : 0), 0), removed: g.view.removedProps.size, rev: g.save.rev };
  });
  await page.waitForTimeout(1500);
  await page.goto(`${base}/?autostart&quality=low`);
  await page.waitForFunction(() => window.__dg && window.__dg.mode === 'play', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const restored = await page.evaluate(() => {
    const g = window.__dg;
    return { count: g.save.player.inventory.reduce((s, x) => s + (x ? x.n : 0), 0), removed: g.view.removedProps.size };
  });
  if (restored.count === before.count && restored.removed >= before.removed) pass(`save restored after reload (items ${restored.count}, removed props ${restored.removed})`);
  else fail(`restore mismatch: before ${JSON.stringify(before)} after ${JSON.stringify(restored)}`);

  // budgets (deterministic counters, software GL)
  const counters = await page.evaluate(() => {
    const g = window.__dg;
    const s = g.renderer.stats();
    return { calls: s.calls, tris: s.tris, chunks: g.view.chunkCount, colliders: g.collision.count, buildMs: g.view.lastBuildMs };
  });
  console.log('counters', JSON.stringify(counters));
  if (counters.calls <= 250) pass(`draw calls ${counters.calls} ≤ 250`);
  else fail(`draw calls ${counters.calls} > 250`);
  await page.screenshot({ path: 'tests/output/smoke-final.png' });
} catch (e) {
  fail(`exception: ${e.message}`);
}

if (errors.length) fail(`console errors:\n  ${errors.slice(0, 10).join('\n  ')}`);
else pass('zero console errors');

await browser.close();
srv?.kill();
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nsmoke passed');
process.exit(failed ? 1 : 0);
