// Systems reachability: Guild contract delivery, coop/pen morning output into the
// Town Stockpile, survivor talk dialog with job buttons.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const port = 6300 + Math.floor(Math.random() * 90);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let failed = 0;
const check = (ok, m) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${m}`); if (!ok) failed++; };
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 60000 });
await page.waitForTimeout(800);
// contract
const c = await page.evaluate(() => {
  const t = window.__dg.interactProviders; void t;
  const tr = window.__trader;
  const ct = tr.contract();
  if (!ct) return { ok: false };
  const g = window.__dg;
  const before = tr.chits();
  g.save.player.inventory[12] = { id: ct.item, n: ct.count };
  const done = tr.deliverContract();
  return { ok: done, gained: tr.chits() - before, title: ct.title };
});
check(c.ok && c.gained > 0, `Guild contract "${c.title}" delivered for ${c.gained} chits`);
// livestock
const eggs = await page.evaluate(() => {
  const g = window.__dg, w = g.save.world;
  w.pieces.push({ id: 7001, piece: 'coop', tier: 1, x: g.layout.spawn.x + 20, y: 0, z: g.layout.spawn.z + 20, rot: 0, hp: 120 });
  w.flags.livestockDay = -1;
  w.hour = 30.2; // day 1, after dawn
  window.__town.advance(1);
  return w.townStock.filter(Boolean).find((s) => s.id === 'food.egg')?.n ?? 0;
});
check(eggs >= 3, `coop laid ${eggs} eggs into the Town Stockpile at dawn`);
// survivor talk
const talk = await page.evaluate(() => {
  const s = window.__dg.save.world.survivors[0];
  window.__town.onTalk(s);
  const btns = [...document.querySelectorAll('.dialog .tab')].map((b) => b.textContent);
  return btns;
});
check(talk.includes('Farm') && talk.includes('Guard'), `talking to a survivor offers jobs (${talk.join(', ')})`);
await page.click('.dialog .tab:nth-child(2)');
await page.waitForTimeout(300);
const job = await page.evaluate(() => window.__dg.save.world.survivors[0].job);
check(job === 'farm', `job assignment from the talk dialog sticks (${job})`);
check(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await browser.close(); srv.kill();
console.log(failed ? `\n${failed} failed` : '\nsystems flow passed');
process.exit(failed ? 1 : 0);
