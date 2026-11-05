// Review round 5, item 4: real-play pacing. A bot plays the campaign through gameplay
// (walk, hold E to salvage, craft, place pieces with the build ghost, sleep in a bed,
// plant/harvest, talk/trade with Odile, reboot a node: route relays, hold to sync, defend)
// — no quest state is set directly. It follows the Journal's "next step" (Story.info()).
// Logs SIM-time timestamps for the PLAN.md pacing table.
// Speed: rendering off, performance.now/rAF faked at 50 ms per frame (same as session.mjs).
// Usage: node tools/review/pacing.mjs [simMinutes=150] [outFile=docs/review/pacing.json]
// PACING_DIST=/abs/dir serves a frozen copy of the build (so rebuilding during a long run is safe).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SIM_MIN = Number(process.argv[2] ?? 150);
const port = 7420 + Math.floor(Math.random() * 60);
const OUT = process.argv[3] ?? 'docs/review/pacing.json';
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', ...(process.env.PACING_DIST ? ['--outDir', process.env.PACING_DIST] : [])], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=high`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__story && window.__trader, null, { timeout: 120000 });

const result = await page.evaluate(async (SIM_MIN) => {
  const g = window.__dg, story = window.__story, trader = window.__trader, grid = window.__grid, sim = window.__sim;
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
  const END = SIM_MIN * 60;
  const log = [];
  const ms = {};
  const mark = (k, detail = '') => { if (ms[k] === undefined) { ms[k] = now(); log.push(`${now()}s FIRST ${k} ${detail}`); } };
  const note = (s) => { log.push(`${now()}s ${s}`); if (log.length > 600) log.splice(100, 1); };
  const P = () => g.player.pos;
  const W = () => g.save.world;
  const count = (id) => g.save.player.inventory.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
  const day0 = Math.floor(W().hour / 24);
  let deaths = 0, wasDead = false, raidsSeen = 0;
  const stepSince = {};
  // ---- milestones from game state (never set by the bot) ----
  const watch = async () => {
    const w = W();
    if (g.mode === 'dead' && !wasDead) { deaths++; wasDead = true; note('died'); }
    // read the recap like a player, then get back up (round 6: no auto-respawn)
    if (g.mode === 'dead') { await frames(20); document.querySelector('.death .btn.primary')?.click(); await frames(4); }
    if (g.mode !== 'dead') wasDead = false;
    if (g.save.player.perks.length) mark('firstPerk', g.save.player.perks[0]);
    if (w.districts.some((d) => d.nodesOnline.length)) mark('firstReboot');
    if (w.flags['talk:guild_factor']) mark('firstFactionContact', 'Odile (Meridian Guild)');
    if (w.flags['trader:mentioned']) mark('traderMentioned', `game stamp min ${w.flags['trader:mentioned']}`);
    if (w.flags['trader:met']) mark('firstTraderContact', `game stamp min ${w.flags['trader:met']}`);
    if (w.crops.some((c) => c.crop)) mark('firstCropPlanted');
    if (Number(w.flags['harvestReminders'] ?? 0) > 0) mark('harvestReminder');
    if (Number(w.flags['raidsLost'] ?? 0) > 0) mark('firstRaidLost');
    if (Number(w.flags['raidsSurvived'] ?? 0) > 0) mark('firstRaidRepelled');
    if (Number(w.flags['harvested'] ?? 0) > 0) mark('firstHarvest', 'player harvest');
    const crops = new Set(sim.CROPS.flatMap((c) => [c.produce, ...(c.yields ?? []).map((y) => y.item)]).filter(Boolean));
    if (w.townStock.some((x) => x && crops.has(x.id))) mark('firstHarvest', 'survivors harvested into the town stock');
    // raids: log every outcome
    const rs = Number(w.flags['raidsSurvived'] ?? 0), rl = Number(w.flags['raidsLost'] ?? 0);
    if (rs + rl !== raidsSeen) { note(`raid resolved: survived ${rs}, lost ${rl}`); raidsSeen = rs + rl; }
    if (Number(w.flags['nights'] ?? 0) > 0 || Math.floor((w.hour - 6) / 24) > day0) mark('firstNightSurvived', `nights slept ${w.flags['nights'] ?? 0}`);
    if ((w.quests['q.first_neighbors'] ?? 0) >= 3) mark('endOfAct1');
    const n = story.info().next;
    const key2 = n ? `${n.id}#${n.index}` : 'done';
    if (stepSince.key !== key2) { if (stepSince.key) note(`step done: ${stepSince.key} (${(now() - stepSince.t).toFixed(0)} s)`); stepSince.key = key2; stepSince.t = now(); stepSince.text = n?.text; }
    // take a perk the way a player would: K, tap the first Take, close
    if (g.save.player.perkPoints > 0 && g.mode === 'play') {
      await tap('KeyK');
      await frames(4);
      const b = document.querySelector('.screen.show button[data-perk].primary');
      if (b) { b.click(); note(`took perk ${b.getAttribute('data-perk')}`); }
      await frames(3);
      g.openScreen(null); // close like the X button (Escape with nothing open would pause)
    }
    // never leave the game paused or a screen/dialog open
    if (g.paused || document.querySelector('.screen.show')) {
      g.openScreen(null);
      document.querySelectorAll('.screen.show .btn.ghost').forEach((x) => x.click());
      g.setPaused(false);
      g.input.uiBlocking = false;
    }
    // eat / drink when low
    const p = g.save.player;
    if (p.hunger < 35 || p.thirst < 35) {
      const i = p.inventory.findIndex((s) => s && (s.id.startsWith('food.') && p.hunger < 35 || s.id.startsWith('drink.') && p.thirst < 35) && !s.id.includes('raw') && !s.id.includes('dirty'));
      if (i >= 0) g.useSlot(i);
    }
  };
  const fight = async () => {
    // swing at anything close (the attack action, as the touch button sends it)
    const en = (window.__enemies?.list ?? []).filter((e) => e.state !== 'dead' && Math.hypot(e.pos.x - P().x, e.pos.z - P().z) < 3);
    if (!en.length) return false;
    g.player.yaw = Math.atan2(en[0].pos.x - P().x, en[0].pos.z - P().z);
    g.camera.yaw = g.player.yaw; g.camera.syncTargets?.();
    g.input.press('attack'); await frames(2); g.input.release('attack'); await frames(10);
    return true;
  };
  // ---- movement: follow the game's nav-grid path (a person walks around buildings) ----
  let nav = null, navRemoved = -1;
  const navGrid = () => {
    if (!nav || navRemoved !== g.view.removedProps.size) {
      nav = sim.buildNavGrid(g.layout, g.view.removedProps);
      navRemoved = g.view.removedProps.size;
    }
    return nav;
  };
  async function walkTo(x, z, stop = 1.8, maxS = 0) {
    const d0 = Math.hypot(x - P().x, z - P().z);
    if (d0 > 12) {
      const path = sim.findPath(navGrid(), P().x, P().z, x, z, 150000);
      if (path && path.length > 1) {
        const start = T();
        const limit = maxS || 20 + (d0 / 3.4) * 2.5;
        for (let i = 1; i < path.length && T() - start < limit && now() < END; i++) {
          const [wx, wz] = path[i];
          if (i < path.length - 1 && Math.hypot(wx - P().x, wz - P().z) < 2) continue;
          await walkStraight(wx, wz, i === path.length - 1 ? stop : 1.6, 30);
          if (g.mode === 'dead') break;
        }
        return Math.hypot(x - P().x, z - P().z) < stop + 0.5;
      }
    }
    return walkStraight(x, z, stop, maxS);
  }
  async function walkStraight(x, z, stop = 1.8, maxS = 0) {
    const start = T();
    const d0 = Math.hypot(x - P().x, z - P().z);
    const limit = maxS || 8 + (d0 / 3.4) * 1.8;
    let lastD = 1e9, stuckT = T(), side = 0;
    key('KeyW', true);
    while (T() - start < limit && now() < END) {
      if (g.mode === 'dead') { key('KeyW', false); await frames(20); await watch(); key('KeyW', true); continue; }
      const dx = x - P().x, dz = z - P().z, d = Math.hypot(dx, dz);
      if (d < stop) break;
      if (await fight()) { key('KeyW', true); continue; }
      g.camera.yaw = Math.atan2(dx, dz); g.camera.syncTargets?.();
      if (d < lastD - 0.3) { lastD = d; stuckT = T(); }
      else if (T() - stuckT > 1.0) {
        const k = side++ % 2 ? 'KeyD' : 'KeyA';
        key('KeyW', false); key(k, true); await frames(12 + 6 * (side % 3)); key(k, false); key('KeyW', true); stuckT = T();
      }
      await frames(3);
      if (Math.random() < 0.05) await watch();
    }
    key('KeyW', false);
    await frames(4);
    return Math.hypot(x - P().x, z - P().z) < stop + 0.5;
  }
  async function salvageNearest(kinds, maxDist = 90) {
    const L = g.layout;
    const cands = L.props.filter((p) => kinds.includes(p.kind) && p.building < 0 && !g.view.removedProps.has(p.id) && Math.hypot(p.x - P().x, p.z - P().z) < maxDist)
      .sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z));
    for (const p of cands.slice(0, 4)) {
      if (!(await walkTo(p.x, p.z, 1.6))) continue;
      g.camera.yaw = Math.atan2(p.x - P().x, p.z - P().z); g.camera.syncTargets?.();
      await frames(6);
      const t = g.describeTarget();
      if (!t || t.blocked) continue;
      key('KeyE', true);
      const s = T();
      while (!g.view.removedProps.has(p.id) && T() - s < 15) { await frames(4); }
      key('KeyE', false);
      await frames(30);
      if (g.view.removedProps.has(p.id)) return true;
    }
    return false;
  }
  async function salvagePiece() {
    const L = g.layout;
    const bs = L.buildings.filter((b) => Math.hypot(b.x - P().x, b.z - P().z) < 120).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z));
    for (const b of bs.slice(0, 4)) {
      const ry = (b.rot * Math.PI) / 2, hd = (b.rot & 1 ? b.w : b.d) / 2;
      const fx = b.x + Math.sin(ry) * (hd + 1.2) + Math.cos(ry) * 2.5, fz = b.z + Math.cos(ry) * (hd + 1.2) - Math.sin(ry) * 2.5;
      if (!(await walkTo(fx, fz, 0.8))) continue;
      g.camera.yaw = ry + Math.PI; g.camera.syncTargets?.();
      await frames(8);
      const t = g.describeTarget();
      if (!t || t.kind !== 'break' || t.blocked) continue;
      const before = g.save.player.inventory.reduce((a, s) => a + (s ? s.n : 0), 0);
      key('KeyE', true);
      const s = T();
      while (g.save.player.inventory.reduce((a, s2) => a + (s2 ? s2.n : 0), 0) === before && T() - s < 15) await frames(4);
      key('KeyE', false);
      await frames(20);
      return true;
    }
    return false;
  }
  const KINDS = {
    'mat.scrap': ['barrel', 'sign', 'mailbox', 'car', 'van', 'dumpster', 'bench', 'rubble', 'debris', 'tire', 'shelf'],
    'mat.timber': ['pallet', 'crate', 'fence', 'chair', 'table', 'bench', 'shelf', 'bush'],
    any: ['crate', 'barrel', 'trashbag', 'tire', 'pallet', 'debris', 'cone', 'sign', 'mailbox', 'bench', 'chair', 'table', 'shelf', 'rubble', 'bush', 'car', 'van'],
  };
  // which prop kinds yield `id` and can be broken with the tool in hand (the game's own salvage table)
  const toolTier = () => (g.save.player.equipped === 'tool.crowbar' ? 'crowbar' : 'hands');
  const kindsFor = (id) => Object.entries(sim.PROP_SALVAGE).filter(([, d]) => sim.toolCanBreak(toolTier(), d.tool) && (id === 'any' || d.yields.some((y) => y.item === id))).map(([k]) => k);
  async function gather(id, n, maxS = 300) {
    const s = T();
    while (count(id) < n && T() - s < maxS && now() < END) {
      const kinds = kindsFor(id);
      if (!(await salvageNearest(kinds.length ? kinds : KINDS.any))) await salvagePiece();
      await watch();
    }
    return count(id) >= n;
  }
  async function equipCrowbar() {
    if (!count('tool.crowbar')) return;
    const q = g.save.player.quick;
    let i = q.indexOf('tool.crowbar');
    if (i < 0) { i = 3; q[3] = 'tool.crowbar'; }
    if (g.save.player.equipped !== 'tool.crowbar') g.selectQuick(i);
    await frames(3);
  }
  // ---- crafting + building ----
  const RECIPE = (out) => [...(window.__recipes ?? [])].find((r) => r.out === out);
  async function craftItem(out) {
    const id = `r.${out}`;
    for (let k = 0; k < 4; k++) {
      if (g.craft(id, 1)) return true;
      await gather('mat.scrap', count('mat.scrap') + 4, 120);
      await gather('mat.timber', count('mat.timber') + 2, 120);
    }
    void RECIPE;
    return false;
  }
  const site = { x: g.layout.spawn.x + 8, z: g.layout.spawn.z + 8 };
  let lastReason = '';
  async function place(piece, tier = 0) {
    const before = W().pieces.filter((p) => p.piece === piece).length;
    for (let attempt = 0; attempt < 3; attempt++) {
      await walkTo(site.x + attempt * 4, site.z + (attempt % 2) * 4, 1.5);
      g.startBuild(piece, tier);
      await frames(6);
      for (let i = 0; i < 8; i++) {
        await frames(3);
        const reason = g.build?.reason;
        lastReason = reason ?? 'ok';
        if (reason === 'materials' || reason === 'cost') { g.stopBuild?.(); return false; }
        key('Enter', true); await frames(2); key('Enter', false); await frames(6);
        if (W().pieces.filter((p) => p.piece === piece).length > before) { g.stopBuild?.(); await frames(3); return true; }
        g.camera.yaw += 0.8; g.camera.syncTargets?.(); await frames(4);
      }
      g.stopBuild?.();
      await frames(4);
    }
    return false;
  }
  async function build(piece, need) {
    // gather exactly what the piece costs (game data), place it, repeat
    const def = sim.getPiece(piece);
    const cost = def?.fromItem ? [] : def?.costs?.[0] ?? [];
    for (let k = 0; k < 10 && now() < END; k++) {
      const have = W().pieces.filter((p) => (piece === 'wall' ? ['wall', 'doorway', 'window'] : [piece]).includes(p.piece)).length;
      if (have >= need) return true;
      for (const c of cost) if (count(c.item) < c.count) {
        const t1 = now();
        await gather(c.item, c.count, 240);
        note(`gathered ${c.item} ${count(c.item)}/${c.count} for ${piece} in ${(now() - t1).toFixed(0)} s`);
      }
      const t2 = now();
      const ok = await place(piece, 0);
      note(`place ${piece} ${ok ? 'ok' : `failed (${g.build?.reason ?? lastReason})`} in ${(now() - t2).toFixed(0)} s`);
    }
    return false;
  }
  // ---- sleep: in a bed, at night ----
  async function sleepNight() {
    const bed = W().pieces.find((p) => p.piece === 'bed');
    if (!bed) return build('bed', 1);
    const h = W().hour % 24;
    if (!(h >= 19 || h < 5) && g.save.player.sleep > 60) {
      // stay useful until dark
      await gather('mat.scrap', count('mat.scrap') + 6, 120);
      return false;
    }
    await walkTo(bed.x, bed.z, 1.6);
    g.camera.yaw = Math.atan2(bed.x - P().x, bed.z - P().z); g.camera.syncTargets?.();
    await frames(6);
    const n0 = Number(W().flags['nights'] ?? 0);
    await tap('KeyE');
    for (let i = 0; i < 80 && Number(W().flags['nights'] ?? 0) === n0; i++) await frames(10);
    note(`slept: nights ${W().flags['nights']}`);
    return true;
  }
  // ---- farming ----
  async function tendPlots() {
    for (const p of W().pieces.filter((x) => x.piece === 'farm_plot')) {
      await walkTo(p.x, p.z, 1.6);
      g.camera.yaw = Math.atan2(p.x - P().x, p.z - P().z); g.camera.syncTargets?.();
      await frames(6);
      await tap('KeyE');
      await frames(10);
    }
  }
  // ---- Odile: talk, sell, buy ----
  async function trade(buy) {
    const s = g.layout.spawn;
    await walkTo(s.x + 8.6, s.z - 3.2, 1.2);
    g.camera.yaw = Math.atan2(s.x + 8.6 - P().x, s.z - 1.6 - P().z); g.camera.syncTargets?.();
    await frames(6);
    await tap('KeyE');
    await frames(10);
    // the free welcome trade on the first visit
    const gift = document.querySelector('[data-welcome-trade] button');
    if (gift) { gift.click(); note('took the welcome trade'); await frames(4); }
    g.openScreen(null);
    // sell scrap/timber surplus for chits, then buy
    // sell what Odile actually pays for (wiring, glass, components, tapes…), keep food, meds and tools
    for (const r of trader.rows()) if (r.kind === 'sell' && r.price > 0 && !/^(food|drink|med|tool|wpn|seed)\./.test(r.item)) trader.trade(r, r.have);
    if (buy) {
      const row = trader.rows().find((r) => r.kind === 'buy' && r.item === buy);
      if (row && trader.chits() >= row.price) { trader.trade(row, 1); note(`bought ${buy} for ${row.price} chits`); return true; }
    }
    return false;
  }
  // ---- reboot the nearest offline node of a district ----
  async function reboot(districtKey) {
    const L = g.layout, di = L.districts.findIndex((d) => d.key === districtKey);
    const node = L.nodes.filter((n) => n.district === di && !W().districts[di].nodesOnline.includes(n.id)).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z))[0];
    if (!node) return true;
    await walkTo(node.x, node.z, 2.4, 400);
    g.camera.yaw = Math.atan2(node.x - P().x, node.z - P().z); g.camera.syncTargets?.();
    await frames(6);
    if (!grid.active) await tap('KeyE');
    await frames(10);
    const view = grid.activeView;
    if (!grid.active || !view) { note('reboot did not start'); return false; }
    note(`reboot started at node ${node.id}`);
    for (let i = 0; i < view.relays.length; i++) {
      if (grid.active?.relays[i]) continue;
      const r = view.relays[i];
      await walkTo(r.x, r.z, 1.4, 120);
      g.camera.yaw = Math.atan2(r.x - P().x, r.z - P().z); g.camera.syncTargets?.();
      await frames(4);
      key('KeyE', true);
      for (let k = 0; k < 80 && grid.active && !grid.active.relays[i]; k++) { await frames(2); }
      key('KeyE', false);
      await frames(4);
    }
    await walkTo(node.x, node.z, 2.4, 120);
    g.camera.yaw = Math.atan2(node.x - P().x, node.z - P().z); g.camera.syncTargets?.();
    // hold to sync, then defend: fight anything close, stay at the node
    const s = T();
    key('KeyE', true);
    while (grid.active && T() - s < 240 && now() < END) {
      if (grid.active.phase === 'defend') {
        key('KeyE', false);
        if (!(await fight())) {
          if (Math.hypot(node.x - P().x, node.z - P().z) > 6) await walkTo(node.x, node.z, 3, 20);
          await frames(6);
        }
      } else await frames(4);
      if (g.mode === 'dead') { note('died during reboot'); key('KeyE', false); await frames(40); break; }
      await watch();
    }
    key('KeyE', false);
    const ok = W().districts[di].nodesOnline.includes(node.id);
    note(`reboot ${ok ? 'online' : 'failed'} (${(T() - s).toFixed(0)} s)`);
    return ok;
  }
  // ================= the run =================
  await walkTo(P().x + 5, P().z + 5, 1);
  g.input.lookX += 60;
  let guard = 0;
  let lastT = -1, frozen = 0;
  while (now() < END && guard++ < 4000) {
    await frames(10); // let the game's 1.5 s quest tick catch up; never spin in zero game time
    if (guard % 50 === 0) note(`loop ${guard} t=${now()} next=${story.info().next?.id ?? '-'}#${story.info().next?.index ?? ''} mode=${g.mode}`);
    if (now() === lastT) {
      if (++frozen >= 3) {
        note(`FROZEN diag ${JSON.stringify({ paused: g.paused, mode: g.mode, hitstop: g.hitstop, last: g.last, fake: performance.now(), screen: document.querySelector('.screen.show')?.className ?? null, uiBlocking: g.input.uiBlocking, err: g.perf?.report?.().slice?.(0, 600) })}`);
        break;
      }
    } else frozen = 0;
    lastT = now();
    await watch();
    if (g.mode === 'dead') { await frames(40); continue; }
    // a raid is announced hours ahead: a player goes home and defends (the town fights alone otherwise)
    const pend = (() => { try { return JSON.parse(String(W().flags['raid.pending'] ?? 'null')); } catch { return null; } })();
    if (pend && W().hour >= pend.warnHour - 0.5) {
      note(`raid warning (${pend.faction}, ${pend.units.map((u) => `${u.count} ${u.enemy}`).join(', ')}): going home to defend`);
      const s0 = g.layout.spawn;
      await walkTo(s0.x, s0.z, 4, 600);
      const t1 = now();
      while (now() - t1 < 900 && now() < END && W().flags['raid.pending']) {
        if (g.mode === 'dead') { await frames(40); continue; }
        const en = (window.__enemies?.list ?? []).filter((e) => e.state !== 'dead' && Math.hypot(e.pos.x - s0.x, e.pos.z - s0.z) < 40).sort((a, b) => Math.hypot(a.pos.x - P().x, a.pos.z - P().z) - Math.hypot(b.pos.x - P().x, b.pos.z - P().z));
        if (en.length && Math.hypot(en[0].pos.x - P().x, en[0].pos.z - P().z) > 2.5) await walkTo(en[0].pos.x, en[0].pos.z, 2.2, 8);
        else if (!(await fight())) await frames(20);
        await watch();
      }
      note(`raid over after ${(now() - t1).toFixed(0)} s at Haven`);
      continue;
    }
    // badly hurt: go home, heal, rest
    if (g.save.player.health < 35 && g.mode === 'play') {
      note(`hurt (${g.save.player.health.toFixed(0)} hp): retreating to Haven`);
      const i = g.save.player.inventory.findIndex((x) => x && x.id.startsWith('med.'));
      if (i >= 0) g.useSlot(i);
      await walkTo(g.layout.spawn.x, g.layout.spawn.z, 4, 300);
      for (let k = 0; k < 40 && g.save.player.health < 60; k++) await frames(30);
    }
    const info = story.info();
    const n = info.next;
    if (!n) { note('campaign: no next step'); break; }
    // a night bed when it is dark and tired: real players sleep
    const h = W().hour % 24;
    if ((h >= 21 || h < 4) && W().pieces.some((p) => p.piece === 'bed')) await sleepNight();
    // keep crops going once there are plots and seeds
    if (W().pieces.some((p) => p.piece === 'farm_plot') && guard % 6 === 0) await tendPlots();
    // a survivor mentioned Odile: go and say hello, like a player following the hint
    if (W().flags['trader:mentioned'] && !W().flags['trader:met']) await trade(null);
    const o = n.type;
    const text = n.text;
    if (n.id === 'q.first_light' && n.index === 0) await gather('mat.scrap', 6);
    else if (n.id === 'q.first_light' && n.index === 1) await gather('mat.timber', 6);
    else if (o === 'build') {
      const m = { 'q.first_light': ['campfire', 1], 'q.roof_over#0': ['foundation', 4], 'q.roof_over#1': ['wall', 6], 'q.roof_over#2': ['roof', 4], 'q.first_neighbors#0': ['farm_plot', 2] };
      const [piece, need] = m[`${n.id}#${n.index}`] ?? m[n.id] ?? ['foundation', 1];
      if (n.id === 'q.first_neighbors' && !W().pieces.some((p) => p.piece === 'workbench1')) await build('workbench1', 1);
      await build(piece, need);
    } else if (o === 'craft') {
      await craftItem('tool.crowbar');
      await equipCrowbar();
    } else if (o === 'survive') {
      if (!W().pieces.some((p) => p.piece === 'bed')) await build('bed', 1);
      await sleepNight();
    } else if (o === 'reach') {
      const d = g.layout.districts.find((x) => text.includes('Residential') ? x.key === 'residential' : text.includes('Waterworks') ? x.key === 'waterworks' : text.includes('Hospital') ? x.key === 'hospital' : x.key === 'downtown');
      await walkTo(d.cx, d.cz, 12, 600);
      await walkTo(g.layout.spawn.x, g.layout.spawn.z, 6, 600);
    } else if (o === 'population') {
      // more beds attract survivors; otherwise keep busy near Haven
      const beds = W().pieces.filter((p) => p.piece === 'bed').length;
      if (beds < W().survivors.filter((x) => x.alive).length + 2) await build('bed', beds + 1);
      else await gather('mat.scrap', count('mat.scrap') + 8, 150);
    } else if (o === 'collect' && text.includes('fuse')) {
      if (!(await trade('misc.grid_fuse'))) await gather('mat.scrap', count('mat.scrap') + 20, 240);
    } else if (o === 'reboot') {
      await reboot(text.includes('Waterworks') ? 'waterworks' : text.includes('Rail') ? 'rail' : text.includes('Industrial') ? 'industrial' : text.includes('hospital') ? 'hospital' : 'downtown');
      await walkTo(g.layout.spawn.x, g.layout.spawn.z, 6, 600);
    } else if (o === 'talk' && text.includes('Odile')) await trade(null);
    else if (o === 'rep') {
      // trade with Odile and deliver her contracts
      await gather('mat.scrap', count('mat.scrap') + 12, 200);
      await trade(null);
    } else if (o === 'choice') {
      // decide from the Journal like a player would
      const k = info.decide;
      if (k) { story.decide(k); await frames(4); document.querySelector('.screen.show [data-choice="fight"], .screen.show [data-choice]')?.click(); }
      await frames(10);
    } else if (o === 'rank') await build('workbench1', W().pieces.filter((p) => p.piece === 'workbench1').length + 1);
    else await gather('mat.scrap', count('mat.scrap') + 6, 120);
  }
  note(`run ended: t=${now()} guard=${guard} next=${story.info().next?.id ?? 'none'}`);
  const w = W();
  return {
    simSeconds: now(),
    simMinutesTarget: SIM_MIN,
    day: Math.floor(w.hour / 24) - day0 + 1,
    milestones: ms,
    deaths,
    deathLog: g.deathLog,
    steps: log.filter((l) => l.includes('step done')),
    quests: w.quests,
    log: log.slice(-80),
  };
}, SIM_MIN);
result.pageErrors = errs.slice(0, 5);
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ simSeconds: result.simSeconds, day: result.day, milestones: result.milestones, deaths: result.deaths }, null, 2));
await browser.close();
srv.kill();
