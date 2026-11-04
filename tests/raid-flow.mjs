// Scripted raid: force a raid at Haven, verify warning → arrival (spawns) → resolution.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 5300 + Math.floor(Math.random() * 90);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let ok = true;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) ok = false; };
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 30000 });
await page.evaluate(() => { window.__dg.settings.dayMinutes = 2; window.__raids.force(); });
let spawned = 0;
for (let i = 0; i < 30 && spawned === 0; i++) { await page.waitForTimeout(500); spawned = await page.evaluate(() => window.__enemies.aliveTagged('raid')); }
check(spawned > 0, `raid squad spawned (${spawned})`);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tests/output/raid.png' });
await page.evaluate(() => { window.__enemies.clear(); });
await page.waitForTimeout(2000);
const flag = await page.evaluate(() => window.__dg.save.world.flags['raidsSurvived'] ?? 0);
check(flag >= 1, `raid resolved as repelled (raidsSurvived=${flag})`);
check(errs.length === 0, `no errors ${errs.slice(0, 2).join(' | ')}`);
await browser.close(); srv.kill(); process.exit(ok ? 0 : 1);
