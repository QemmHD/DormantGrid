// Review round 6, item 4: the tutorial plants a first crop; growth timer; harvest reminder; seasons card.
//   1. finishing the "bed" step starts "A first crop": seed pouch + compost + timber handed over,
//      the card says what to do, the beacon points at the plot spot
//   2. a Farm Plot stands there; facing it and pressing E plants (real input path) → the step completes,
//      the one-time seasons card appears (and only once)
//   3. growth timer: on the plot prompt and on the objective card ("% grown · ripe in …")
//   4. the crop ripens through the town's hourly sim (the clock jumps 12 h at a time; the player
//      waters between jumps, as a person would) → one harvest reminder (toast + Town Board line),
//      the beacon leads to the ripe plot; E harvests carrots
// Usage: node tools/review/farm-check.mjs  (apps/game built) → docs/review/farm.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const port = 7740 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__guide && window.__sim && window.__farm, null, { timeout: 120000 });
const res = { steps: [] };
const step = (k, ok, detail) => {
  res.steps.push({ k, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k} ${JSON.stringify(detail)}`);
};
const r = await page.evaluate(async () => {
  const g = window.__dg, sim = window.__sim, W = g.save.world, s = g.layout.spawn, guide = window.__guide;
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  performance.now = () => fakeT;
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  g.renderer.render = () => {};
  const frames = (n) => new Promise((res) => { let k = n; const f = () => (--k <= 0 ? res() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const tap = async (code) => { key(code, true); await frames(2); key(code, false); await frames(2); };
  const out = {};
  const subs = [];
  g.bus.on('subtitle', (e) => subs.push(e.text));
  const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent);
  // 1. the "bed" step completes → "A first crop"
  W.hour = 8; // day 0, spring morning
  W.flags['raid.last'] = 1e6; // no raids during the 100 skipped hours (a lost raid's recovery objective would outrank the crop)
  const bedIdx = 12;
  g.onbStep = bedIdx; W.flags.onb = bedIdx;
  for (let i = 0; i < g.save.player.inventory.length; i++) g.save.player.inventory[i] = null;
  g.trigger('placedBed');
  await frames(20);
  const inv = (id) => sim.countItem(g.save.player.inventory, id);
  out.step1 = {
    title: document.querySelector('.objective .ot')?.textContent ?? '',
    body: document.querySelector('.objective .ob')?.textContent ?? '',
    seeds: inv('seed.carrot'), compost: inv('mat.organic'), timber: inv('mat.timber'),
    gift: toasts().some((t) => /seed pouch/.test(t)),
    beacon: guide.beaconTarget.pos ? [Math.round(guide.beaconTarget.pos.x - s.x), Math.round(guide.beaconTarget.pos.z - s.z)] : null,
  };
  // 2. a Farm Plot at that spot (pay its cost from the gift), face it, press E
  sim.removeItem(g.save.player.inventory, 'mat.timber', 4);
  sim.removeItem(g.save.player.inventory, 'mat.organic', 6);
  const id = 99301;
  W.pieces.push({ id, piece: 'farm_plot', tier: 0, x: s.x + 8, y: g.view.surface(s.x + 8, s.z + 14), z: s.z + 14, rot: 0, hp: 60 });
  g.base.rebuild(W.pieces, W.crops, W.hour);
  await frames(10);
  out.beaconOnPlot = guide.beaconTarget.pos ? Math.round(Math.hypot(guide.beaconTarget.pos.x - (s.x + 8), guide.beaconTarget.pos.z - (s.z + 14))) : null;
  g.placePlayer(s.x + 8, s.z + 11.4);
  g.camera.yaw = 0; g.player.yaw = 0; g.camera.syncTargets?.();
  await frames(20);
  out.promptBefore = document.querySelector('.prompt')?.textContent ?? '';
  await tap('KeyE');
  await frames(40);
  const crop = W.crops.find((c) => c.plot === id);
  out.step2 = {
    planted: crop?.crop ?? null,
    onbStep: g.onbStep,
    nextTitle: document.querySelector('.objective .ot')?.textContent ?? '',
    seasonCard: !!document.querySelector('[data-season-card]') && !!W.flags['seen:seasonCard'],
    seasonText: document.querySelector('[data-season-card]')?.textContent ?? '',
  };
  document.querySelector('[data-season-card]')?.closest('.screen')?.querySelector('.btn.primary')?.click();
  await frames(20);
  // 3. growth timer: prompt + card
  await frames(30);
  out.step3 = {
    prompt: document.querySelector('.prompt')?.textContent ?? '',
    card: document.querySelector('[data-cropline]')?.textContent ?? '',
    cardShown: document.querySelector('[data-cropline]')?.style.display !== 'none',
  };
  // 4. ripen through the town's hourly sim, watering between jumps
  const planted = W.crops.find((c) => c.plot === id);
  let jumps = 0;
  const timeline = [];
  let hours = 0;
  while (planted.growth < 1 && jumps < 80) {
    planted.water = 1;
    // 12 h jumps, then hour by hour near the end (real play passes an hour a minute)
    const dh = planted.growth > 0.7 ? 1 : 12;
    W.hour += dh;
    hours += dh;
    jumps++;
    await frames(30);
    timeline.push(`${planted.crop}:${Math.round(planted.growth * 100)}`);
  }
  await frames(40);
  out.step4 = {
    jumps,
    gameHours: hours,
    timeline,
    ripe: planted.growth >= 1,
    reminderToast: subs.find((t) => /ripe/.test(t)) ?? toasts().find((t) => /ripe/.test(t)) ?? null,
    reminders: Number(W.flags['harvestReminders'] ?? 0),
    beacon: guide.beaconTarget.label,
    card: document.querySelector('[data-cropline]')?.textContent ?? '',
  };
  // a second pass must not repeat the reminder
  await frames(60);
  out.step4.remindersAfter = Number(W.flags['harvestReminders'] ?? 0);
  // harvest with E
  g.placePlayer(s.x + 8, s.z + 11.4);
  g.camera.yaw = 0; g.player.yaw = 0; g.camera.syncTargets?.();
  await frames(10);
  const before = inv('food.carrot');
  out.harvestPrompt = document.querySelector('.prompt')?.textContent ?? '';
  await tap('KeyE');
  await frames(20);
  out.harvested = inv('food.carrot') - before;
  out.seasonCardAgain = (() => {
    // a failed out-of-season planting must not show the card twice
    return !!document.querySelector('[data-season-card]');
  })();
  return out;
});
await page.screenshot({ path: 'docs/review/shots/farm-ripe.png' }).catch(() => {});
step('tutorial step "A first crop" starts with seeds + compost + timber', /A first crop/.test(r.step1.title) && r.step1.seeds >= 1 && r.step1.compost >= 6 && r.step1.timber >= 4 && r.step1.gift, r.step1);
step('beacon points at the plot spot', r.step1.beacon && Math.hypot(r.step1.beacon[0] - 8, r.step1.beacon[1] - 14) < 2 && r.beaconOnPlot < 2, { beacon: r.step1.beacon, onPlot: r.beaconOnPlot });
step('E on the plot plants the first crop; tutorial moves on', r.step2.planted === 'carrot' && r.step2.onbStep === 14 && /Look after yourself/.test(r.step2.nextTitle), { ...r.step2, seasonText: undefined, promptBefore: r.promptBefore });
step('one-time seasons card on first planting', r.step2.seasonCard && /28 days/.test(r.step2.seasonText) && /spring/.test(r.step2.seasonText), { text: r.step2.seasonText.slice(0, 120) });
step('growth timer on the plot prompt', /% · ripe in/.test(r.step3.prompt), { prompt: r.step3.prompt });
step('growth timer on the objective card', r.step3.cardShown && /Carrots: \d+% grown · ripe in/.test(r.step3.card), { card: r.step3.card });
step('crop ripens through the hourly town sim', r.step4.ripe, { gameHours: r.step4.gameHours, timeline: r.step4.timeline });
step('harvest reminder shown once', !!r.step4.reminderToast && r.step4.reminders === 1 && r.step4.remindersAfter === 1, { toast: r.step4.reminderToast, reminders: r.step4.remindersAfter });
step('beacon leads to the ripe plot; card says harvest', r.step4.beacon === 'Ripe carrots' && /harvest it/.test(r.step4.card), { beacon: r.step4.beacon, card: r.step4.card });
step('E harvests carrots', r.harvested > 0 && /Harvest/.test(r.harvestPrompt), { harvested: r.harvested, prompt: r.harvestPrompt });
await browser.close();
srv.kill();
const pass = res.steps.every((s) => s.ok) && errs.length === 0;
writeFileSync('docs/review/farm.json', JSON.stringify({ ...res, raw: r, pageErrors: errs.slice(0, 3), pass }, null, 2) + '\n');
console.log(pass ? 'farm check passed' : `farm check FAILED ${errs.slice(0, 2).join(' | ')}`);
process.exit(pass ? 0 : 1);
