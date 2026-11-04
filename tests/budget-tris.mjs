// Budget gate: main-pass visible triangles and draw calls in the densest districts
// at the iPhone tier (medium), measured with shadows off so the shadow-map pass is
// not double counted. Also reports the with-shadows totals.
// Usage: node tests/budget-tris.mjs [quality=medium]   (apps/game must be built)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const q = process.argv[2] ?? 'medium';
const TRI_BUDGET = 300_000;
const CALL_BUDGET = 150;
const port = 4800 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=${q}`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 60000 });
let failed = 0;
for (const key of ['downtown', 'residential', 'market', 'industrial', 'haven']) {
  await page.evaluate((k) => {
    const g = window.__dg;
    const d = g.layout.districts.find((x) => x.key === k);
    g.player.pos.set(d.cx, g.view.surface(d.cx, d.cz), d.cz);
    g.view.loadAround(d.cx, d.cz);
  }, key);
  await page.waitForTimeout(4000);
  const r = await page.evaluate(async () => {
    const g = window.__dg;
    const i = g.renderer.gl.info.render;
    // wait for real rendered frames, not wall-clock time (SwiftShader can run at ~3 fps)
    const frames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    await frames(3);
    const all = { calls: i.calls, tris: i.triangles };
    g.atm.setShadows(0);
    g.view.setShadows(false);
    await frames(4);
    const main = { calls: i.calls, tris: i.triangles };
    g.atm.setShadows(g.renderer.quality.shadows ? g.renderer.quality.shadowSize : 0);
    g.view.setShadows(g.renderer.quality.shadows);
    return { all, main };
  });
  const ok = r.main.tris <= TRI_BUDGET && r.main.calls <= CALL_BUDGET;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${q} ${key.padEnd(12)} main ${r.main.calls} calls / ${(r.main.tris / 1000).toFixed(0)}k tris   (with shadow pass ${r.all.calls} / ${(r.all.tris / 1000).toFixed(0)}k)`);
}
await browser.close();
srv.kill();
console.log(failed ? `\n${failed} district(s) over budget (${TRI_BUDGET / 1000}k tris / ${CALL_BUDGET} calls)` : '\nall districts within budget');
process.exit(failed ? 1 : 0);
