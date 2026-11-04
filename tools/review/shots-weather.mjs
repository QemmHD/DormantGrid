// Review: steady-state weather shots (sky.ts smooths weather with a 4 s sim-time
// constant, too slow to settle under SwiftShader). Sets the smoothed values to
// their targets, then captures. Usage: node tools/review/shots-weather.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 6300 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const T = { rain: [36.2, 1, 0.9, 0.3], fog: [106.7, 0, 0.6, 1], storm: [34.7, 1, 0.9, 0.45] };
for (const [name, q, ctxOpts] of [['iphone', 'medium', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', 'high', { viewport: { width: 1280, height: 720 } }]]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=${q}`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 90000 });
  for (const [w, [hour, wet, cloud, fog]] of Object.entries(T)) {
    await page.evaluate(([hour, wet, cloud, fog]) => {
      const g = window.__dg, L = g.layout, d = L.districts.find((x) => x.key === 'residential');
      g.save.world.flags.onb = 99; g.onbStep = 99;
      g.view.loadAround(d.cx, d.cz);
      g.player.pos.set(d.cx, g.view.surface(d.cx, d.cz), d.cz);
      g.camera.yaw = 2.0; g.camera.pitch = -0.1; g.camera.syncTargets?.();
      g.save.world.hour = hour;
      const a = g.atm; a.wet = wet; a.cloud = cloud; a.fogK = fog;
    }, [hour, wet, cloud, fog]);
    await page.waitForTimeout(5000);
    const info = await page.evaluate(() => ({ weather: window.__dg.save.world.weather, wet: window.__dg.atm.wet, fog: window.__dg.atm.fogK }));
    await page.screenshot({ path: `docs/review/shots/${name}-w-${w}.png` });
    console.log(name, w, JSON.stringify(info));
  }
  await ctx.close();
}
await browser.close(); srv.kill(); process.exit(0);
