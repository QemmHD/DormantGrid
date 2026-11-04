// Review: scripted first-session bot. Plays the real game (real input actions: walk
// by holding W toward a target, hold E to salvage, real crafting/build calls) for
// the first 30 minutes of SIM time and logs milestones, idle gaps and options.
//
// Speed trick (harness only, no game code changes): rendering is disabled in the
// page and performance.now()/requestAnimationFrame advance a fake 50 ms per frame,
// so the sim (dt clamp 0.05 s, game.ts:1750) runs faster than real time. All times
// below are SIM seconds (game.time). setTimeout-based effects run on real time.
// Usage: node tools/review/session.mjs [simMinutes=30]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SIM_MIN = Number(process.argv[2] ?? 30);
const port = 6400 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`); // high = prop density 1 (low hides 45% of small props); rendering is disabled below
await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 90000 });

const result = await page.evaluate(async (SIM_MIN) => {
  const g = window.__dg;
  // ---- harness: fast sim ----
  const origRaf = window.requestAnimationFrame.bind(window);
  let fakeT = performance.now();
  performance.now = () => fakeT;
  window.requestAnimationFrame = (cb) => origRaf(() => { fakeT += 50; cb(fakeT); });
  g.renderer.render = () => {};
  const frames = (n) => new Promise((res) => { let k = n; const f = () => (--k <= 0 ? res() : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); });
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const tap = async (code) => { key(code, true); await frames(2); key(code, false); await frames(2); };
  const T = () => g.time;
  const t0 = T();
  const now = () => +(T() - t0).toFixed(1);
  const log = [];
  const ms = {};
  const mark = (k, detail = '') => { if (ms[k] === undefined) { ms[k] = now(); log.push(`${now()}s FIRST ${k} ${detail}`); } };
  const note = (s) => log.push(`${now()}s ${s}`);
  const inv = () => g.save.player.inventory.reduce((a, s) => a + (s ? s.n : 0), 0);
  const count = (id) => g.save.player.inventory.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
  const P = () => g.player.pos;
  const activity = []; // [start, end, kind] — what the bot was doing
  let actStart = 0, actKind = 'start';
  const act = (k) => { if (k !== actKind) { activity.push([actStart, now(), actKind]); actStart = now(); actKind = k; } };
  const timeline = [];
  const walked = []; // [straight-line m, sim s]
  const hpStart = g.save.player.health;
  let lastQuest = JSON.stringify(g.save.world.quests);
  let lastBp = g.save.world.blueprints.length;
  let lastSurv = g.save.world.survivors.length;
  let lastPieces = g.save.world.pieces.length;
  const watch = () => {
    const w = g.save.world;
    const q = JSON.stringify(w.quests);
    if (q !== lastQuest) { lastQuest = q; note(`quest progress ${q}`); mark('reward', 'quest step'); }
    if (w.blueprints.length > lastBp) { lastBp = w.blueprints.length; mark('reward', 'blueprint'); note('blueprint gained'); }
    if (w.survivors.length > lastSurv) { lastSurv = w.survivors.length; mark('newSurvivor', `survivors ${lastSurv}`); }
    if (w.pieces.length > lastPieces) { lastPieces = w.pieces.length; mark('build', w.pieces[w.pieces.length - 1].piece); }
    const en = window.__enemies?.list?.filter((e) => e.state !== 'dead' && Math.hypot(e.pos.x - P().x, e.pos.z - P().z) < 30) ?? [];
    if (en.length) mark('threat', `${en[0].kind} at ${Math.hypot(en[0].pos.x - P().x, en[0].pos.z - P().z).toFixed(0)} m`);
    if (g.save.player.health < hpStart - 1) mark('damaged');
  };
  const sample = () => {
    const w = g.save.world;
    timeline.push({ t: now(), onb: g.onbStep, obj: (g.objectives().find((o) => !o.done) ?? {}).text ?? '', inv: inv(), pieces: w.pieces.length, hour: +w.hour.toFixed(2) });
  };
  // ---- movement: steer camera toward target and hold W ----
  async function walkTo(x, z, stop = 1.8, maxS = 40) {
    act('walk');
    const start = T();
    let lastD = 1e9, stuckT = T();
    key('KeyW', true);
    while (T() - start < maxS) {
      const dx = x - P().x, dz = z - P().z, d = Math.hypot(dx, dz);
      if (d < stop) break;
      g.camera.yaw = Math.atan2(dx, dz); g.camera.syncTargets?.();
      if (d < lastD - 0.3) { lastD = d; stuckT = T(); }
      else if (T() - stuckT > 1.5) { // sidestep around obstacles
        key('KeyW', false); key('KeyA', true); await frames(14); key('KeyA', false); key('KeyW', true); stuckT = T();
      }
      await frames(3); watch();
    }
    key('KeyW', false);
    await frames(4);
    return Math.hypot(x - P().x, z - P().z) < stop + 0.5;
  }
  // ---- salvage the nearest prop of given kinds the player can break now ----
  async function salvageNearest(kinds, maxDist = 80) {
    const L = g.layout;
    const cands = L.props.filter((p) => kinds.includes(p.kind) && p.building < 0 && !g.view.removedProps.has(p.id) && Math.hypot(p.x - P().x, p.z - P().z) < maxDist)
      .sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z));
    for (const p of cands.slice(0, 4)) {
      const dist0 = Math.hypot(p.x - P().x, p.z - P().z), tw = T();
      if (!(await walkTo(p.x, p.z, 1.6))) { note(`could not reach ${p.kind} ${dist0.toFixed(0)} m away`); continue; }
      walked.push([dist0, T() - tw]);
      g.camera.yaw = Math.atan2(p.x - P().x, p.z - P().z); g.camera.syncTargets?.();
      await frames(6);
      const t = g.describeTarget();
      if (!t || t.blocked) { note(`cannot salvage ${p.kind}: ${t?.blocked ?? 'no target'}`); continue; }
      act('salvage');
      const before = inv();
      key('KeyE', true);
      const s = T();
      while (!g.view.removedProps.has(p.id) && T() - s < 15) { await frames(4); watch(); }
      key('KeyE', false);
      await frames(30); // magnet pickups
      if (g.view.removedProps.has(p.id)) { mark('gather', p.kind); note(`salvaged ${p.kind} (+${inv() - before} items) in ${(T() - s).toFixed(1)} s`); return true; }
    }
    return false;
  }
  async function salvagePiece() {
    // nearest building wall: walk to a facade and hold E on it
    const L = g.layout;
    const bs = L.buildings.filter((b) => Math.hypot(b.x - P().x, b.z - P().z) < 120).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z));
    for (const b of bs.slice(0, 4)) {
      const ry = b.rot * Math.PI / 2, hd = (b.rot & 1 ? b.w : b.d) / 2;
      const fx = b.x + Math.sin(ry) * (hd + 1.2) + Math.cos(ry) * 2.5, fz = b.z + Math.cos(ry) * (hd + 1.2) - Math.sin(ry) * 2.5;
      if (!(await walkTo(fx, fz, 0.8))) continue;
      g.camera.yaw = ry + Math.PI; g.camera.syncTargets?.();
      await frames(8);
      const t = g.describeTarget();
      if (!t || t.kind !== 'break' || t.blocked) { note(`facade target: ${t ? `${t.kind} ${t.name} ${t.blocked ?? ''}` : 'none'}`); continue; }
      act('deconstruct');
      key('KeyE', true);
      const s = T();
      const before = inv();
      while (inv() === before && T() - s < 15) { await frames(4); watch(); }
      key('KeyE', false);
      await frames(20);
      if (inv() > before) { mark('deconstruct', t.name); note(`deconstructed ${t.name} in ${(T() - s).toFixed(1)} s`); return true; }
    }
    return false;
  }
  async function craft(id) {
    const ok = g.craft(id, 1);
    if (ok) { mark('craft', id); note(`crafted ${id}`); }
    return ok;
  }
  async function place(piece) {
    act('build');
    g.startBuild(piece, 0);
    await frames(6);
    for (let i = 0; i < 6; i++) {
      key('Enter', true); await frames(2); key('Enter', false); await frames(6);
      if (g.save.world.pieces.some((p) => p.piece === piece && !p.__seen)) break;
      g.camera.yaw += 0.6; g.camera.syncTargets?.(); await frames(4);
    }
    const ok = g.save.world.pieces.filter((p) => p.piece === piece).length;
    g.stopBuild?.();
    await frames(4);
    return ok;
  }
  // an informed player hunting scrap by hand: these yield mat.scrap without tools (data/loot.ts)
  const scrapByHand = ['barrel', 'sign', 'bench', 'mailbox', 'rubble', 'shelf', 'debris', 'tire'];
  const scrapKinds = ['crate', 'barrel', 'trashbag', 'tire', 'pallet', 'debris', 'cone', 'sign', 'mailbox', 'bench', 'chair', 'table', 'shelf', 'rubble', 'weeds', 'bush'];
  async function gatherUntil(pred, label, maxS = 300, kinds = scrapKinds) {
    act('grind:' + label);
    const s = T();
    while (!pred() && T() - s < maxS && now() < SIM_MIN * 60) {
      const ok = await salvageNearest(kinds, 90);
      if (!ok) await salvagePiece();
    }
    note(`gathered for ${label} for ${(T() - s).toFixed(0)} s (${pred() ? 'done' : 'gave up'})`);
    return pred();
  }

  // ================= the session =================
  sample();
  // 1 move + look
  act('tutorial'); key('KeyW', true); await frames(20); key('KeyW', false); mark('move');
  g.input.lookX += 60; await frames(10);
  // 2 break the nearest crate
  await salvageNearest(['crate'], 120);
  sample();
  // 3 inventory
  await tap('Tab'); await frames(10); g.openScreen(null); await frames(5);
  // 4 crowbar
  if (!(await craft('r.tool.crowbar'))) { await gatherUntil(() => count('mat.scrap') >= 6, 'crowbar scrap', 300, scrapByHand); await craft('r.tool.crowbar'); }
  await tap('Digit1'); await tap('Digit2'); await tap('Digit3');
  sample();
  // 5 deconstruct a building piece
  await salvagePiece();
  sample();
  // 6 shelter: foundation, 3 walls, roof, bed (gather what is missing)
  const s0 = g.layout.spawn;
  await walkTo(s0.x + 8, s0.z + 8, 1.0);
  for (const [piece, need] of [['foundation', 8], ['wall', 6], ['wall', 6], ['wall', 6], ['roof', 6], ['bed', 4]]) {
    if (count('mat.scrap') < need) await gatherUntil(() => count('mat.scrap') >= need + 2, `${piece} scrap`, 240, scrapByHand);
    await walkTo(s0.x + 8, s0.z + 8, 1.5);
    const n = await place(piece);
    note(`place ${piece}: now ${n}`);
    sample();
    if (now() > SIM_MIN * 60) break;
  }
  // 7 eat
  await tap('Digit2'); await tap('Digit1');
  // 8 talk to a survivor
  const sv = g.save.world.survivors[0];
  if (sv) { await walkTo(sv.x, sv.z, 1.6); await frames(6); const t = g.describeTarget(); if (t?.kind === 'talk') { await tap('KeyE'); mark('survivorTalk', t.name); g.openScreen(null); } }
  sample();
  // 9 free play until the time limit: follow objectives by salvaging, crafting what is newly possible,
  //   then head for the nearest district node (where threats live)
  const nodes = g.layout.nodes.slice().sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z));
  let phase = 'salvage';
  while (now() < SIM_MIN * 60) {
    if (phase === 'salvage') {
      await gatherUntil(() => false, 'free salvage', 180);
      phase = 'explore';
    } else {
      act('explore');
      const n = nodes[0];
      await walkTo(n.x, n.z, 6, 240);
      note(`reached node ${n.id} (district ${g.layout.districts[n.district].key})`);
      mark('reachedNode');
      act('node');
      key('KeyE', true); await frames(60); key('KeyE', false);
      phase = 'salvage';
    }
    sample();
    watch();
  }
  act('end');
  sample();
  // options available at the end (for "decisions")
  const end = {
    onbStep: g.onbStep,
    objectives: g.objectives().map((o) => `${o.done ? '[x]' : '[ ]'} ${o.title}: ${o.text}`),
    inventory: g.save.player.inventory.filter(Boolean).map((s) => `${s.id}x${s.n}`),
    pieces: g.save.world.pieces.map((p) => p.piece),
    survivors: g.save.world.survivors.length,
    hour: g.save.world.hour,
    health: g.save.player.health,
  };
  const wd = walked.reduce((a, w) => a + w[0], 0), wt = walked.reduce((a, w) => a + w[1], 0);
  return { milestones: ms, log, activity, timeline, end, walking: { trips: walked.length, straightLineMeters: +wd.toFixed(0), simSeconds: +wt.toFixed(0), efficiency: +(wd / 3.4 / Math.max(1, wt)).toFixed(2) } };
}, SIM_MIN);

result.pageErrors = errs;
// idle / grind gaps over 60 s
result.gapsOver60s = result.activity.filter(([a, b, k]) => b - a > 60).map(([a, b, k]) => ({ from: a, to: b, seconds: +(b - a).toFixed(0), doing: k }));
writeFileSync('docs/review/session.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ milestones: result.milestones, gaps: result.gapsOver60s, walking: result.walking, end: result.end }, null, 2));
console.log(result.log.join('\n'));
await browser.close();
srv.kill();
process.exit(0);
