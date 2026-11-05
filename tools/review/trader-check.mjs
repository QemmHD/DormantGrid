// Review round 6, item 5: the trader is introduced early.
//   1. minute 0: Odile's coin is on the minimap (she stands by the bus shelter next to the fire)
//   2. once the tutorial reaches crafting, a survivor mentions her by name (Town line + toast);
//      her coin pulses until the first visit
//   3. walking up to her (real W input from spawn): she calls out once within 14 m
//   4. E opens the trade dialog with a free welcome trade; taking it grants food, a bandage and chits;
//      first contact is stamped in minutes of play (must be < 15)
//   5. fallback: with the tutorial stalled early, the mention still comes by minute 4
// The bot-measured minute of first contact over a full fresh run comes from tools/review/pacing.mjs.
// Usage: node tools/review/trader-check.mjs  (apps/game built) → docs/review/trader.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const port = 7780 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const res = { steps: [] };
const step = (k, ok, detail) => {
  res.steps.push({ k, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k} ${JSON.stringify(detail)}`);
};
const errs = [];
async function fresh() {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__trader && window.__sim, null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__dg;
    const origRaf = window.requestAnimationFrame.bind(window);
    let fakeT = performance.now();
    performance.now = () => fakeT;
    window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
    window.__frames = (n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
    window.__key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
    window.__subs = [];
    g.bus.on('subtitle', (e) => window.__subs.push({ who: e.who, text: e.text }));
  });
  return page;
}

const page = await fresh();
const r = await page.evaluate(async () => {
  const g = window.__dg, W = g.save.world, sim = window.__sim, trader = window.__trader, frames = window.__frames, key = window.__key;
  const out = {};
  await frames(20);
  out.atStart = { onMap: !!g.traderOnMap, call: g.traderOnMap?.call ?? null, minute: +((g.save.playtime + g.playtime) / 60).toFixed(1), fromSpawn: +Math.hypot(trader.pos.x - g.layout.spawn.x, trader.pos.z - g.layout.spawn.z).toFixed(1) };
  // tutorial reaches "craft" (step 6/18)
  g.onbStep = 5; W.flags.onb = 5;
  await frames(40);
  const survivors = W.survivors.map((s) => s.name);
  const m = window.__subs.find((s) => /Odile/.test(s.text));
  out.mention = { by: m?.who ?? null, bySurvivor: !!m && survivors.includes(m.who), text: m?.text ?? '', toast: [...document.querySelectorAll('.toast')].some((t) => /Odile/.test(t.textContent)), pulsing: g.traderOnMap?.call === true, at: W.flags['trader:mentioned'] };
  // walk to her from the spawn with W
  g.placePlayer(g.layout.spawn.x - 6, g.layout.spawn.z + 1);
  await frames(10);
  const P = () => g.player.pos;
  key('KeyW', true);
  for (let i = 0; i < 400 && P().distanceTo(trader.pos) > 1.9; i++) {
    g.camera.yaw = Math.atan2(trader.pos.x - P().x, trader.pos.z - P().z); g.camera.syncTargets?.();
    await frames(2);
  }
  key('KeyW', false);
  await frames(10);
  out.callout = window.__subs.filter((s) => s.who === 'Odile' && /on the house/.test(s.text)).length;
  out.prompt = document.querySelector('.prompt')?.textContent ?? '';
  key('KeyE', true); await frames(2); key('KeyE', false); await frames(20);
  const box = document.querySelector('[data-welcome-trade]');
  out.dialog = { open: !!document.querySelector('.screen.show'), welcome: box?.textContent ?? '' };
  const before = { beans: sim.countItem(g.save.player.inventory, 'food.canned_beans'), chits: sim.countItem(g.save.player.inventory, 'misc.guild_chit'), band: sim.countItem(g.save.player.inventory, 'med.bandage') };
  box?.querySelector('button')?.click();
  await frames(10);
  const after = { beans: sim.countItem(g.save.player.inventory, 'food.canned_beans'), chits: sim.countItem(g.save.player.inventory, 'misc.guild_chit'), band: sim.countItem(g.save.player.inventory, 'med.bandage') };
  out.gift = { before, after, gone: !document.querySelector('[data-welcome-trade]') };
  out.metMinute = W.flags['trader:met'];
  window.__key('Escape', true); await frames(2); window.__key('Escape', false); await frames(10);
  out.afterMet = { call: g.traderOnMap?.call ?? null, paused: g.paused };
  return out;
});
await page.close();
step('minute 0: Odile on the minimap, next to the fire', r.atStart.onMap && r.atStart.fromSpawn < 12, r.atStart);
step('a survivor mentions her once the tutorial reaches crafting', r.mention.bySurvivor && /First trade is free/.test(r.mention.text) && r.mention.toast, r.mention);
step('her coin pulses until the first visit', r.mention.pulsing && r.afterMet.call === false, { before: r.mention.pulsing, after: r.afterMet.call });
step('she calls out once when you come near', r.callout === 1, { callouts: r.callout });
step('E opens trade with a free welcome trade', r.dialog.open && /Welcome trade/.test(r.dialog.welcome) && /Trade/.test(r.prompt), { prompt: r.prompt, welcome: r.dialog.welcome });
step('taking it grants food, a bandage and chits (once)', r.gift.after.beans === r.gift.before.beans + 2 && r.gift.after.band === r.gift.before.band + 1 && r.gift.after.chits === r.gift.before.chits + 6 && r.gift.gone, r.gift);
step('first contact stamped before minute 15', typeof r.metMinute === 'number' && r.metMinute < 15, { minute: r.metMinute });

// fallback: tutorial stalled at step 2 → mention by minute 4
const p2 = await fresh();
const f = await p2.evaluate(async () => {
  const g = window.__dg, frames = window.__frames;
  g.onbStep = 1; g.save.world.flags.onb = 1;
  await frames(20);
  const early = !!g.save.world.flags['trader:mentioned'];
  g.playtime = 241;
  await frames(40);
  return { early, at: g.save.world.flags['trader:mentioned'] };
});
await p2.close();
step('fallback: stalled tutorial still hears about her by minute 4', !f.early && typeof f.at === 'number' && f.at <= 4.2, f);

await browser.close();
srv.kill();
const pass = res.steps.every((s) => s.ok) && errs.length === 0;
writeFileSync('docs/review/trader.json', JSON.stringify({ ...res, pageErrors: errs.slice(0, 3), pass }, null, 2) + '\n');
console.log(pass ? 'trader check passed' : `trader check FAILED ${errs.slice(0, 2).join(' | ')}`);
process.exit(pass ? 0 : 1);
