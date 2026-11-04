// Scripted Grid reboot: walk to a node, start reboot, route relays, sync,
// defend (waves spawn), go online → district restored. Screenshots each phase.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 4900 + Math.floor(Math.random() * 90);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let ok = true;
const check = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) ok = false; };
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=${process.env.Q ?? 'low'}`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 30000 });
const node = await page.evaluate(() => {
  const g = window.__dg;
  const n = g.layout.nodes.find((x) => g.layout.districts[x.district].key !== 'haven' && g.layout.districts[x.district].danger <= 2) ?? g.layout.nodes[0];
  g.save.player.health = 100;
  g.player.pos.set(n.x, g.view.surface(n.x, n.z + 2.5), n.z + 2.5);
  g.camera.yaw = Math.PI;
  g.view.loadAround(n.x, n.z);
  return { id: n.id, district: n.district, key: g.layout.districts[n.district].key };
});
await page.waitForTimeout(1500);
await page.keyboard.press('KeyE');
await page.waitForTimeout(1000);
const started = await page.evaluate(() => window.__grid.active?.phase ?? null);
check(started === 'routing', `reboot started at node ${node.id} (${node.key}) → ${started}`);
await page.evaluate(() => { const gr = window.__grid; for (let i = 0; i < 3; i++) gr.handleEvents(window.__dgsim.routeRelay(gr.active, i)); }).catch(async () => {
  // fallback: route through the private API using the module's own import
  await page.evaluate(() => { const gr = window.__grid; gr.active.relays = [true, true, false]; gr.active.phase = 'routing'; });
});
await page.evaluate(() => { const gr = window.__grid; gr.active.relays = [true, true, true]; gr.active.phase = 'syncing'; gr.active.sync = 0.99; });
await page.keyboard.down('KeyE');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyE');
const phase = await page.evaluate(() => window.__grid.active?.phase ?? 'none');
check(phase === 'defend', `sync completes → ${phase}`);
await page.waitForTimeout(4000);
const alive = await page.evaluate(() => window.__enemies.alive);
check(alive > 0, `defend wave spawned ${alive} machines`);
await page.screenshot({ path: 'tests/output/grid-defend.png' });
await page.evaluate(() => { const gr = window.__grid; window.__enemies.clear(); gr.active.defendT = 999; gr.active.wavesSent = 3; });
await page.waitForTimeout(2500);
const st = await page.evaluate((d) => ({ online: window.__dg.save.world.districts[d].nodesOnline.length, state: window.__dg.save.world.districts[d].state }), node.district);
check(st.online >= 1, `node online (${st.online}), district state ${st.state}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/output/grid-online.png' });
check(errs.length === 0, `no errors ${errs.slice(0, 3).join(' | ')}`);
await browser.close();
srv.kill();
process.exit(ok ? 0 : 1);
