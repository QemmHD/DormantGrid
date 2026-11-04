// Quality capture: renders a fixed set of scenes on an emulated iPhone (touch,
// landscape) and on desktop, writing PNGs to docs/quality/<label>/.
// Usage: node tests/quality-shots.mjs <label> [baseUrl]
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] ?? 'current';
let base = process.argv[3];
let srv = null;
if (!base) {
  const port = 5700 + Math.floor(Math.random() * 90);
  srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
  base = `http://localhost:${port}`;
  await new Promise((r) => setTimeout(r, 2500));
}
const out = `docs/quality/${label}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const iphone = devices['iPhone 14 Pro landscape'] ?? { viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const profiles = [
  { name: 'iphone', ctx: { ...iphone, deviceScaleFactor: 1 } },
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 720 } } },
];

async function waitPlay(page) {
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
}

for (const prof of profiles) {
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const q = prof.name === 'iphone' ? 'medium' : 'high';
  // 1 menu
  await page.goto(`${base}/?quality=${q}`);
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${out}/${prof.name}-01-menu.png` });
  // 2 first moments in play
  await page.goto(`${base}/?autostart&fresh&quality=${q}`);
  await waitPlay(page);
  await page.screenshot({ path: `${out}/${prof.name}-02-start.png` });
  // 3 near an interactable (nearest crate), facing it
  await page.evaluate(() => {
    const g = window.__dg;
    const ids = g.view.propsNear(g.player.pos.x, g.player.pos.z, 60, []);
    const L = g.layout;
    const id = ids.map((i) => L.props[i]).filter((p) => p.kind === 'crate' || p.kind === 'barrel' || p.kind === 'rubble').sort((a, b) => Math.hypot(a.x - g.player.pos.x, a.z - g.player.pos.z) - Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z))[0];
    if (!id) return;
    g.player.pos.set(id.x, g.view.surface(id.x, id.z + 2), id.z + 2);
    g.camera.yaw = Math.PI;
    g.player.yaw = Math.PI;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${prof.name}-03-interact.png` });
  // 4 a downtown street
  await page.evaluate(() => {
    const g = window.__dg;
    const d = g.layout.districts.find((x) => x.key === 'downtown');
    g.player.pos.set(d.cx, g.view.surface(d.cx, d.cz), d.cz);
    g.view.loadAround(d.cx, d.cz);
    g.camera.yaw = 0.7;
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${prof.name}-04-downtown.png` });
  // 5 night at Haven
  await page.evaluate(() => {
    const g = window.__dg;
    const s = g.layout.spawn;
    g.player.pos.set(s.x, g.view.surface(s.x, s.z), s.z);
    g.view.loadAround(s.x, s.z);
    g.save.world.hour = 21.5;
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/${prof.name}-05-night.png` });
  // 6 inventory screen
  await page.evaluate(() => {
    window.__dg.save.world.hour = 10;
    window.__dg.openScreen('inventory');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${prof.name}-06-inventory.png` });
  console.log(`${prof.name}: ${errs.length ? 'errors: ' + errs.slice(0, 2).join(' | ') : 'no page errors'}`);
  await ctx.close();
}
await browser.close();
srv?.kill();
process.exit(0);
