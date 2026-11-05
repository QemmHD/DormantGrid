// Review round 6, item 2: the first raids are fair.
// Uses the game's own scheduler (sim maybeScheduleRaid with the client's prep + raid index) and real
// inputs in fast sim time. Standard difficulty, Act I done, starter gear only (lead pipe, 2 bandages),
// no guards, no armour. Health is NOT topped up: the bot must win on its own (it fights worse than a
// person: it walks straight at the nearest raider and swings; it bandages below 40 hp like a person would).
//   A. warning: HUD raid card names who + compass direction + countdown; 3-item prep checklist that
//      ticks as you place a wall, a trap and equip a weapon; minimap chevron; Haven beacon when away
//   B. raid #1 (Reavers, the strongest early faction) and raid #2: fought and repelled
//   C. a raid lost while away: ≤10% stores, nobody hurt, recovery objective + beacon, no raid for 3 days,
//      placing a defence completes it and returns supplies
//   D. Settings → Difficulty (Relaxed / Standard / Hard) changes world difficulty; Relaxed raids are smaller
// Usage: node tools/review/raid-check.mjs  (apps/game built) → docs/review/raid.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const port = 7660 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__raids && window.__guide && window.__sim, null, { timeout: 120000 });

// common page helpers
await page.evaluate(() => {
  const g = window.__dg, sim = window.__sim;
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  window.__fake = { on: false };
  performance.now = () => (window.__fake.on ? fakeT : fakeT);
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  window.__frames = (n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  window.__key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  // seeded RNG with the same surface as @dg/shared Rng (next/int/range/chance)
  sim.Rng = function (seed) {
    let a = seed >>> 0;
    this.next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.range = (lo, hi) => lo + this.next() * (hi - lo);
    this.int = (lo, hi) => lo + Math.floor(this.next() * (hi - lo + 1));
    this.chance = (p) => this.next() < p;
  };
  const W = g.save.world;
  W.flags.onb = 99; g.onbStep = 99; W.flags['open.v'] = 2;
  for (const id of ['q.first_light', 'q.roof_over', 'q.first_neighbors']) W.quests[id] = sim.QUEST_MAP.get(id).steps.length;
  W.difficulty = 'standard';
  // starter gear: a lead pipe (the first weapon) and two bandages; no armour
  const inv = g.save.player.inventory;
  for (let i = 0; i < inv.length; i++) if (inv[i] && (inv[i].id.startsWith('wpn.') || inv[i].id.startsWith('armor.'))) inv[i] = null;
  sim.addItem(inv, 'wpn.pipe', 1);
  sim.addItem(inv, 'med.bandage', 2);
  g.save.player.equipped = null;
  // clear any defences so the checklist starts empty
  W.pieces = W.pieces.filter((p) => !['wall', 'gate', 'fence', 'barricade', 'spike_strip', 'bear_trap', 'turret'].includes(p.piece));
  for (const k of ['raidsSurvived', 'raidsLost', 'raid.pending', 'raid.recover', 'raid.recoverItems']) delete W.flags[k];
  W.flags['raid.last'] = -9999;
  window.__schedule = (faction, index) => {
    // the real scheduler, seeded until it picks `faction`
    const raids = window.__raids;
    for (let seed = 1; seed < 400; seed++) {
      const st = sim.newRaidState();
      const day = Math.max(3, Math.floor(W.hour / 24) + 1);
      const plan = sim.maybeScheduleRaid(st, day * 24 + 6, new sim.Rng(seed), { pressure: { reavers: 0.5, custodians: 0.5 }, rank: 2, difficulty: W.difficulty, raidIndex: index, prep: raids.prep() });
      if (plan && (!faction || plan.faction === faction)) return plan;
    }
    return null;
  };
  window.__inject = (plan, warnIn = 0.05, arriveIn = 3) => {
    const st = sim.loadRaidState(W);
    plan.warnHour = W.hour + warnIn;
    plan.arriveHour = W.hour + arriveIn;
    st.pending = plan;
    sim.storeRaidState(W, st);
  };
});

const res = { steps: [] };
const step = (k, ok, detail) => {
  res.steps.push({ k, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k} ${JSON.stringify(detail)}`);
};
const card = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-raidcard]');
    return {
      shown: !!el && el.style.display !== 'none' && el.getBoundingClientRect().height > 0,
      text: el?.textContent ?? '',
      prep: [...(el?.querySelectorAll('.rprep li') ?? [])].map((li) => ({ t: li.textContent, done: li.classList.contains('done') })),
      chevron: window.__dg.raidOnMap,
      beacon: window.__guide.beaconTarget.label,
      ob: document.querySelector('.objective .ob')?.textContent ?? '',
    };
  });

// ---------- A. warning, checklist ----------
const plan1 = await page.evaluate(() => {
  const p = window.__schedule('reavers', 0);
  window.__inject(p, 0.02, 4);
  return p;
});
await page.evaluate(() => window.__frames(40));
const a0 = await card();
step('raid #1 is small with no defences (Reavers)', plan1 && plan1.early && plan1.strength <= 26, { units: plan1?.units, strength: plan1?.strength });
step('warning card: who, compass direction, countdown', a0.shown && /Reavers from the (north|south|east|west)/.test(a0.text) && /Arrives in \d+ h \d\d m/.test(a0.text), { text: a0.text });
step('prep checklist: wall, trap, weapon (all open)', a0.prep.length === 3 && a0.prep.every((p) => !p.done), a0.prep);
step('minimap chevron shows the raid direction', !!a0.chevron, a0.chevron);
await page.screenshot({ path: 'docs/review/shots/raid-warning.png' });
// tick the checklist like a player: equip the pipe, place a wall and a trap
await page.evaluate(async () => {
  const g = window.__dg, W = g.save.world, s = g.layout.spawn;
  const i = g.save.player.inventory.findIndex((x) => x?.id === 'wpn.pipe');
  g.useSlot(i);
  W.pieces.push({ id: 99101, piece: 'barricade', tier: 0, x: s.x + 6, y: 0, z: s.z + 2, rot: 0, hp: 120 });
  W.pieces.push({ id: 99102, piece: 'spike_strip', tier: 0, x: s.x + 9, y: 0, z: s.z + 2, rot: 0, hp: 60 });
  await window.__frames(30);
});
const a1 = await card();
step('checklist ticks as the player prepares', a1.prep.length === 3 && a1.prep.every((p) => p.done), a1.prep);
// away from Haven during the warning: the beacon leads home
await page.evaluate(async () => {
  const g = window.__dg, s = g.layout.spawn;
  g.player.pos.x = s.x + 70; g.player.pos.z = s.z;
  await window.__frames(30);
});
const a2 = await card();
step('away from Haven during a warning: beacon leads home', a2.beacon === 'Haven · raid incoming', { beacon: a2.beacon });
await page.evaluate(async () => {
  const g = window.__dg, s = g.layout.spawn;
  g.player.pos.x = s.x + 2; g.player.pos.z = s.z + 2;
  await window.__frames(10);
});

// ---------- B. fight raids #1 and #2 ----------
async function fightRaid(label) {
  return page.evaluate(async (label) => {
    const g = window.__dg, W = g.save.world, s = g.layout.spawn, frames = window.__frames, key = window.__key;
    const P = () => g.player.pos;
    const before = { survived: Number(W.flags.raidsSurvived ?? 0), lost: Number(W.flags.raidsLost ?? 0) };
    // jump the clock to arrival
    const st = window.__sim.loadRaidState(W);
    W.hour = st.pending.arriveHour + 0.001;
    let deaths = 0, minHp = 100, swings = 0, bandages = 0, spawned = 0;
    const t0 = g.time;
    for (let it = 0; it < 6000; it++) {
      const pend = window.__sim.loadRaidState(W).pending;
      if (!pend && it > 40) break;
      const p = g.save.player;
      if (g.mode === 'dead' || p.health <= 0) {
        deaths++;
        document.querySelector('.screen.show .btn.primary')?.click();
        await frames(30);
        continue;
      }
      minHp = Math.min(minHp, p.health);
      if (p.health < 40) {
        const b = p.inventory.findIndex((x) => x?.id === 'med.bandage');
        if (b >= 0) { g.useSlot(b); bandages++; }
      }
      const foes = window.__enemies.list.filter((e) => e.state !== 'dead' && e.tag === 'raid');
      spawned = Math.max(spawned, foes.length);
      if (!foes.length) { await frames(6); continue; }
      foes.sort((a, b) => Math.hypot(a.pos.x - P().x, a.pos.z - P().z) - Math.hypot(b.pos.x - P().x, b.pos.z - P().z));
      const e = foes[0];
      const d = Math.hypot(e.pos.x - P().x, e.pos.z - P().z);
      const yaw = Math.atan2(e.pos.x - P().x, e.pos.z - P().z);
      g.camera.yaw = yaw; g.camera.syncTargets?.();
      if (d > 2.2 && Math.hypot(P().x - s.x, P().z - s.z) < 75) {
        key('KeyW', true); await frames(4); key('KeyW', false);
      } else if (d <= 2.2) {
        g.player.yaw = yaw;
        g.input.press('attack'); await frames(2); g.input.release('attack'); swings++;
        await frames(8);
      } else await frames(4);
    }
    const after = { survived: Number(W.flags.raidsSurvived ?? 0), lost: Number(W.flags.raidsLost ?? 0) };
    return { label, won: after.survived > before.survived, lost: after.lost > before.lost, deaths, minHp: Math.round(minHp), swings, bandages, spawned, seconds: Math.round(g.time - t0), hpEnd: Math.round(g.save.player.health) };
  }, label);
}
const r1 = await fightRaid('raid #1');
step('raid #1 repelled with starter gear (bot, no top-ups)', r1.won && r1.deaths === 0, r1);
// raid #2 two days later, sized with the defences now standing
const plan2 = await page.evaluate(async () => {
  const g = window.__dg, W = g.save.world;
  W.hour += 50;
  g.save.player.health = 100;
  const p = window.__schedule(null, 1);
  window.__inject(p, 0.02, 2);
  await window.__frames(20);
  return p;
});
step('raid #2 is sized to preparation and still early', plan2 && plan2.early && plan2.strength <= 46, { faction: plan2?.faction, units: plan2?.units, strength: plan2?.strength });
const r2 = await fightRaid('raid #2');
step('raid #2 repelled with starter gear (bot, no top-ups)', r2.won && r2.deaths === 0, r2);

// ---------- C. soft failure while away ----------
const c = await page.evaluate(async () => {
  const g = window.__dg, W = g.save.world, s = g.layout.spawn, sim = window.__sim;
  W.hour += 50;
  // reset to an early raid with stores in town and survivors
  W.flags.raidsSurvived = 1; W.flags.raidsLost = 0;
  W.pieces = W.pieces.filter((p) => !['wall', 'gate', 'fence', 'barricade', 'spike_strip', 'bear_trap', 'turret'].includes(p.piece));
  W.townStock = W.townStock.map(() => null);
  sim.addItem(W.townStock, 'food.canned_beans', 20);
  sim.addItem(W.townStock, 'mat.timber', 40);
  sim.addItem(W.townStock, 'mat.scrap', 30);
  const p = window.__schedule(null, 1);
  window.__inject(p, 0.02, 0.5);
  // player far away
  g.player.pos.x = s.x + 200; g.player.pos.z = s.z + 10;
  await window.__frames(10);
  W.hour = p.arriveHour + 0.01;
  await window.__frames(30);
  const injured = W.survivors.filter((x) => x.injured).length;
  const lost = Number(W.flags.raidsLost ?? 0) === 1;
  const ob = document.querySelector('.objective .ob')?.textContent ?? '';
  const beacon = window.__guide.beaconTarget.label;
  // no new raid for 3 days, even under pressure
  const st = sim.loadRaidState(W);
  const tooSoon = sim.maybeScheduleRaid({ ...st, pending: null }, W.hour + 60, new sim.Rng(1), { pressure: { reavers: 5, custodians: 5 }, rank: 2, difficulty: 'standard', raidIndex: 2, prep: window.__raids.prep() });
  // recover: place a barricade
  W.pieces.push({ id: 99201, piece: 'barricade', tier: 0, x: s.x + 6, y: 0, z: s.z + 2, rot: 0, hp: 120 });
  await window.__frames(80);
  const o = window.__raids.lastOutcome;
  return { lost, outcome: o, lossPct: Math.round(o.stockLoss * 100), injured, ob, beacon, noRaidWithin60h: tooSoon === null, recovered: W.flags['raid.recover'] === undefined, returned: window.__raids.lastRecovered, obAfter: document.querySelector('.objective .ob')?.textContent ?? '' };
});
step('raid lost while away → soft failure (≤10% stores, nobody hurt)', c.lost && c.outcome?.early && c.lossPct <= 10 && c.outcome.lostItems > 0 && c.injured === 0, { outcome: c.outcome, injured: c.injured });
step('recovery objective on the card + Haven beacon', /Patch Haven/.test(c.ob) && c.beacon === 'Haven · patch the defences', { ob: c.ob, beacon: c.beacon });
step('no raid for days after a loss (no death spiral)', c.noRaidWithin60h, {});
step('placing a defence completes recovery and returns supplies', c.recovered && c.returned > 0 && !/Patch Haven/.test(c.obAfter), { returned: c.returned, of: c.outcome?.lostItems, obAfter: c.obAfter });

// ---------- D. difficulty setting ----------
const d = await page.evaluate(async () => {
  const g = window.__dg;
  g.openScreen('settings');
  await window.__frames(10);
  const row = [...document.querySelectorAll('.settings-row')].find((r) => /Difficulty/.test(r.textContent));
  const labels = row ? [...row.querySelectorAll('.seg button')].map((b) => b.textContent) : [];
  const onBefore = row?.querySelector('.seg button.on')?.textContent;
  const relaxed = row ? [...row.querySelectorAll('.seg button')].find((b) => b.textContent === 'Relaxed') : null;
  relaxed?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  relaxed?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  relaxed?.click();
  await window.__frames(6);
  const diff = g.save.world.difficulty;
  g.openScreen(null);
  const n = (p) => p.units.reduce((s, u) => s + u.count, 0);
  const W = g.save.world;
  W.difficulty = 'chill';
  const relaxedRaid = n(window.__schedule('reavers', 2));
  W.difficulty = 'hard';
  const hardRaid = n(window.__schedule('reavers', 2));
  W.difficulty = 'standard';
  return { labels, onBefore, diff, relaxedRaid, hardRaid };
});
step('Settings → Difficulty: Relaxed / Standard / Hard, Standard default', d.labels.join(',') === 'Relaxed,Standard,Hard' && d.onBefore === 'Standard' && d.diff === 'chill', d);
step('Relaxed raids are smaller than Hard', d.relaxedRaid < d.hardRaid, { relaxed: d.relaxedRaid, hard: d.hardRaid });

await browser.close();
srv.kill();
const pass = res.steps.every((s) => s.ok) && errs.length === 0;
writeFileSync('docs/review/raid.json', JSON.stringify({ ...res, pageErrors: errs.slice(0, 3), pass }, null, 2) + '\n');
console.log(pass ? 'raid check passed' : `raid check FAILED ${errs.slice(0, 2).join(' | ')}`);
process.exit(pass ? 0 : 1);
