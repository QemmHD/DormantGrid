// Review round 6, item 3: deaths are fair and readable.
//   A. killed by an enemy 150 m out: recap names the killer, where, one tip; gear kept (weapon stays
//      equipped, bandages, fuse), the haul drops in a satchel; E gets you up at Haven; the satchel is
//      the beacon/minimap target until picked up
//   B. bleed-out after a hound bite names the hound and gives the bandage tip; starvation says so
//   C. Haven safe zone: an ambient raider never reaches a player standing in Haven and backs off;
//      outside the ring the same raider attacks (control); ambient spawns never land near Haven
// Usage: node tools/review/death-check.mjs  (apps/game built) → docs/review/death.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const port = 7700 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__guide && window.__sim && window.__enemies, null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__dg;
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  performance.now = () => fakeT;
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  g.renderer.render = () => {};
  window.__frames = (n) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  window.__key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const W = g.save.world;
  W.flags.onb = 99; g.onbStep = 99; W.flags['open.v'] = 2;
  W.hour = Math.floor(W.hour / 24) * 24 + 13; // midday
});
const res = { steps: [] };
const step = (k, ok, detail) => {
  res.steps.push({ k, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k} ${JSON.stringify(detail)}`);
};

// ---------- A ----------
const a = await page.evaluate(async () => {
  const g = window.__dg, sim = window.__sim, W = g.save.world, s = g.layout.spawn, frames = window.__frames;
  const inv = g.save.player.inventory;
  for (let i = 0; i < inv.length; i++) inv[i] = null;
  sim.addItem(inv, 'wpn.pipe', 1);
  sim.addItem(inv, 'med.bandage', 3);
  sim.addItem(inv, 'misc.grid_fuse', 1);
  sim.addItem(inv, 'mat.scrap', 18);
  sim.addItem(inv, 'mat.cloth', 6);
  sim.addItem(inv, 'food.canned_beans', 2);
  g.save.player.quick = ['food.canned_beans', null, null, null];
  g.save.player.equipped = 'wpn.pipe';
  // 150 m east of Haven
  const di = g.layout.districts.findIndex((d) => d.key === 'downtown');
  g.placePlayer(s.x + 150, s.z);
  await frames(10);
  const at = { x: g.player.pos.x, z: g.player.pos.z };
  g.hurt(500, 'cut', 'raider'); // the real damage path a Reaver Grunt's hit takes
  await frames(10);
  const recap = document.querySelector('[data-death-recap]');
  const text = recap?.textContent ?? '';
  const tips = recap?.querySelectorAll('.tip').length ?? 0;
  const ids = g.save.player.inventory.filter(Boolean).map((x) => `${x.id}×${x.n}`);
  const pile = W.drops.find((d) => Math.hypot(d.x - at.x, d.z - at.z) < 2.5);
  const out = {
    dead: g.mode === 'dead',
    text,
    tips,
    kept: ids,
    equipped: g.save.player.equipped,
    satchel: pile ? pile.items.map((x) => `${x.id}×${x.n}`) : [],
    log: g.deathLog.at(-1),
    di,
  };
  // E gets you up
  window.__key('KeyE', true); await frames(2); window.__key('KeyE', false); await frames(20);
  out.afterE = { mode: g.mode, fromHaven: Math.round(Math.hypot(g.player.pos.x - s.x, g.player.pos.z - s.z)) };
  await frames(30);
  out.beacon = window.__guide.beaconTarget.label;
  out.minimap = g.objectiveOnMap?.label ?? null;
  // walk back (teleport next to it) and pick it up
  g.placePlayer(at.x + 0.9, at.z + 0.9);
  g.camera.yaw = Math.atan2(-0.9, -0.9); g.camera.syncTargets?.();
  await frames(10);
  out.pickPrompt = document.querySelector('.prompt')?.textContent ?? '';
  for (let i = 0; i < 80 && W.drops.some((d) => Math.hypot(d.x - at.x, d.z - at.z) < 2.5 && d.items.length); i++) {
    window.__key('KeyE', true); await frames(2); window.__key('KeyE', false); await frames(6);
  }
  await frames(30);
  out.pickedUp = sim.countItem(g.save.player.inventory, 'mat.scrap');
  out.beaconAfter = window.__guide.beaconTarget.label;
  return out;
});
await page.screenshot({ path: 'docs/review/shots/death-recap.png' }).catch(() => {});
step('recap names the killer and where', a.dead && /Killed by a Reaver Grunt/.test(a.text) && /m from Haven/.test(a.text), { text: a.text.slice(0, 160) });
step('recap gives exactly one tip', a.tips === 1, { tips: a.tips });
step('gear kept: weapon equipped, bandages, fuse, quick-bar food', a.kept.some((x) => x.startsWith('wpn.pipe')) && a.equipped === 'wpn.pipe' && a.kept.some((x) => x.startsWith('med.bandage')) && a.kept.some((x) => x.startsWith('misc.grid_fuse')) && a.kept.some((x) => x.startsWith('food.canned_beans')), { kept: a.kept, equipped: a.equipped });
step('haul dropped in a satchel where you fell', a.satchel.some((x) => x.startsWith('mat.scrap')) && a.satchel.some((x) => x.startsWith('mat.cloth')), { satchel: a.satchel });
step('E gets you up at Haven', a.afterE.mode === 'play' && a.afterE.fromHaven < 20, a.afterE);
step('satchel is the beacon + minimap target', a.beacon === 'Your satchel' && a.minimap === 'Your satchel', { beacon: a.beacon, minimap: a.minimap });
step('picking it up clears the marker', a.pickedUp >= 18 && a.beaconAfter !== 'Your satchel', { scrap: a.pickedUp, beacon: a.beaconAfter, prompt: a.pickPrompt });
step('death is logged (cause, place)', a.log && a.log.cause === 'raider' && a.log.fromHaven >= 140, a.log);

// ---------- B ----------
const b = await page.evaluate(async () => {
  const g = window.__dg, frames = window.__frames, p = g.save.player;
  const out = {};
  // bleed-out after a hound bite
  g.hurt(5, 'bite', 'hound');
  p.conditions = [{ id: 'bleeding', t: 3 }];
  p.health = 0.2;
  for (let i = 0; i < 60 && g.mode !== 'dead'; i++) await frames(5);
  out.bleed = document.querySelector('[data-death-recap]')?.textContent ?? '';
  document.querySelector('.death .btn.primary')?.click();
  await frames(20);
  // starvation
  p.hunger = 0; p.thirst = 60; p.conditions = []; p.health = 0.2;
  for (let i = 0; i < 60 && g.mode !== 'dead'; i++) await frames(5);
  out.starve = document.querySelector('[data-death-recap]')?.textContent ?? '';
  document.querySelector('.death .btn.primary')?.click();
  await frames(20);
  p.hunger = 80; p.health = 100;
  out.causes = g.deathLog.map((d) => d.cause);
  return out;
});
step('bleed-out names the hound and gives the bandage tip', /Bled out after a Feral Hound/.test(b.bleed) && /Rag Bandage/.test(b.bleed), { text: b.bleed.slice(0, 160) });
step('starvation recap', /Starved/.test(b.starve) && /cooked meals/.test(b.starve), { text: b.starve.slice(0, 120) });

// ---------- C ----------
const c = await page.evaluate(async () => {
  const g = window.__dg, E = window.__enemies, frames = window.__frames, s = g.layout.spawn, p = g.save.player;
  const out = {};
  const run = async (px, pz, ex, ez) => {
    for (const e of E.list) if (e.state !== 'dead') E.die?.(e);
    await frames(4);
    g.placePlayer(px, pz);
    p.health = 100;
    await frames(10);
    E.spawn('raider', ex, ez); // ambient (untagged) raider
    const e = E.list.at(-1);
    let minD = 1e9;
    const hp0 = p.health;
    for (let i = 0; i < 300; i++) {
      await frames(1);
      minD = Math.min(minD, Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z));
    }
    return { minD: +minD.toFixed(1), hpLost: Math.round(hp0 - p.health), state: e.state, endFromHaven: Math.round(Math.hypot(e.pos.x - s.x, e.pos.z - s.z)) };
  };
  // player in Haven, raider 8 m away (inside the ring, as if it wandered in)
  out.inHaven = await run(s.x + 4, s.z, s.x + 12, s.z);
  // control: same raider 8 m from a player standing 150 m out (Old Downtown)
  out.outside = await run(s.x + 150, s.z, s.x + 158, s.z);
  // ambient spawns near Haven's edge never land within 78 m
  for (const e of E.list) if (e.state !== 'dead') E.die?.(e);
  const seen = new Set(E.list);
  let near = 0, n = 0, tries = 0;
  const byOffset = {};
  for (const off of [85, 100, 115, -100, 0]) {
    g.placePlayer(s.x + off, s.z + (off === 0 ? 100 : 0));
    await frames(5);
    let k = 0;
    for (let i = 0; i < 240; i++) {
      // face every way in turn: spawns land behind the camera, some of them toward Haven
      g.camera.yaw = (i % 8) * (Math.PI / 4);
      tries++;
      E.ambientSpawn();
      for (const e of E.list) {
        if (seen.has(e)) continue;
        seen.add(e);
        n++; k++;
        if (Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 78) near++;
        E.die?.(e);
      }
      if (i % 40 === 0) await frames(2);
    }
    byOffset[off] = k;
  }
  out.spawns = { n, near, tries, byOffset };
  p.health = 100;
  return out;
});
step('Haven safe zone: ambient raider never reaches you, backs off', c.inHaven.minD > 3 && c.inHaven.hpLost === 0, c.inHaven);
step('control: outside the ring the same raider attacks', c.outside.hpLost > 0 || c.outside.minD < 2.5, c.outside);
step('ambient spawns never land within 78 m of Haven', c.spawns.n > 0 && c.spawns.near === 0, c.spawns);

await browser.close();
srv.kill();
const pass = res.steps.every((s) => s.ok) && errs.length === 0;
writeFileSync('docs/review/death.json', JSON.stringify({ ...res, pageErrors: errs.slice(0, 3), pass }, null, 2) + '\n');
console.log(pass ? 'death check passed' : `death check FAILED ${errs.slice(0, 2).join(' | ')}`);
process.exit(pass ? 0 : 1);
