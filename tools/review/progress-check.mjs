// Review P8 + P12: progression and the campaign, driven through the real UI.
// P8  — XP comes from play (a real held-E salvage, a craft from the Craft screen), a level-up
//       grants a perk point and lights the ★ badge, K opens the Perks screen with all 32 perks
//       (4 tracks × 8), Take learns one, and the effect is measurable (Pack Mule: carry 40 → 55).
// P12 — the whole campaign: at EVERY step the Journal's "Next step" box shows that step's text.
//       Steps the UI owns are done through the UI: talk to Odile (walk up + E), the toll
//       decision (auto-opened dialog), the Grid Core hatch (walk up + E), the core choice +
//       confirm, the ending screen. Other steps (collect, build, reboot…) are advanced by state
//       (their objective logic is covered by packages/sim/test/campaign.test.ts).
//       Then each of the 6 endings is reached from the Journal's "Decide now" button with the
//       reputation that path produces.
// Usage: node tools/review/progress-check.mjs   (apps/game must be built)
// Output: docs/review/progress.json + docs/review/shots/{perks,journal,core,ending}.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const port = 6800 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__story, null, { timeout: 90000 });
await page.evaluate(() => {
  const f = window.__dg.save.world.flags;
  f.onb = 99; window.__dg.onbStep = 99; f['open.v'] = 2; // no tutorial / opening beats in the way
  window.__dg.save.world.hour = 10;
});
const log = [];
const note = (s) => (log.push(s), console.log(s));
const closeAll = async () => {
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => !!document.querySelector('.screen.show'));
    if (!open) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
};
/** stand at (x,z) facing (tx,tz) */
const standAt = (x, z, tx, tz) =>
  page.evaluate(([x, z, tx, tz]) => {
    const g = window.__dg;
    g.view.loadAround(x, z);
    g.player.pos.set(x, g.view.surface(x, z), z);
    g.player.vel.set(0, 0, 0);
    g.camera.yaw = Math.atan2(tx - x, tz - z);
    g.camera.pitch = -0.15;
    g.camera.syncTargets?.();
  }, [x, z, tx, tz]);

// ------------------------------------------------------------------ P8
const p8 = {};
{
  const xp0 = await page.evaluate(() => window.__dg.save.player.xp);
  // real salvage: walk up to the nearest small prop and hold E
  const prop = await page.evaluate(() => {
    const g = window.__dg, p = g.player.pos;
    const ok = ['crate', 'pallet', 'chair', 'trashbag', 'tire', 'box', 'barrel', 'bucket', 'bush', 'fence'];
    const near = [];
    g.view.propsNear(p.x, p.z, 45, near); // only props that exist in loaded chunks (the camp clears some)
    let best = null;
    for (const id of near) {
      const q = g.layout.props[id];
      if (!ok.includes(q.kind) || g.view.removedProps.has(q.id) || q.building >= 0) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > 6 && (!best || d < best.d)) best = { id: q.id, x: q.x, z: q.z, kind: q.kind, d };
    }
    return best;
  });
  const dir = Math.atan2(prop.x - 0, prop.z - 0);
  await standAt(prop.x - Math.sin(dir) * 1.6, prop.z - Math.cos(dir) * 1.6, prop.x, prop.z);
  await page.waitForTimeout(800);
  p8.target = await page.evaluate(() => window.__dg.describeTarget()?.name ?? null);
  await page.keyboard.down('KeyE');
  await page.waitForFunction((id) => window.__dg.view.removedProps.has(id), prop.id, { timeout: 30000 }).catch(() => {});
  await page.keyboard.up('KeyE');
  const xp1 = await page.evaluate(() => window.__dg.save.player.xp);
  p8.salvage = { prop: prop.kind, target: p8.target, xpBefore: xp0, xpAfter: xp1, ok: xp1 > xp0 };
  note(`P8 salvage ${prop.kind}: XP ${xp0} → ${xp1}`);

  // craft from the Craft screen; put XP one short of the level so the craft levels up
  await page.evaluate(() => {
    const g = window.__dg;
    g.save.player.xp = 99; // level 2 at 100
    g.save.player.inventory[0] = { id: 'mat.scrap', n: 20 };
    g.save.player.inventory[1] = { id: 'mat.timber', n: 10 };
  });
  await page.keyboard.press('KeyC');
  await page.waitForSelector('.screen.show .li', { timeout: 20000 });
  const crafted = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.screen.show .li .btn.primary')][0];
    b?.click();
    return !!b;
  });
  await page.waitForTimeout(500);
  await closeAll();
  const after = await page.evaluate(() => ({ xp: window.__dg.save.player.xp, pts: window.__dg.save.player.perkPoints, badge: document.querySelector('[data-action="perks"] .badge')?.textContent ?? '' }));
  p8.levelUp = { crafted, ...after, ok: crafted && after.pts === 1 && after.badge === '1' };
  note(`P8 craft → XP ${after.xp}, perk points ${after.pts}, ★ badge "${after.badge}"`);

  // K opens the perk screen; count perks over the 4 track tabs; take two
  await page.keyboard.press('KeyK');
  await page.waitForSelector('.screen.show .li.perk', { timeout: 20000 });
  const count = await page.evaluate(async () => {
    let n = 0;
    const tabs = [...document.querySelectorAll('.screen.show .tabs .tab')];
    for (const t of tabs) {
      t.click();
      await new Promise((r) => setTimeout(r, 60));
      n += document.querySelectorAll('.screen.show .li.perk').length;
    }
    tabs[0].click();
    return { tabs: tabs.length, perks: n };
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/review/shots/perks.png' });
  const carry0 = await page.evaluate(() => window.__dg.carryWeight().max);
  await page.click('[data-perk="perk.scavenger.light_fingers"]');
  await page.waitForTimeout(200);
  const lockedNoPoints = await page.evaluate(() => document.querySelector('[data-perk="perk.scavenger.pack_mule"]')?.disabled ?? null);
  await page.evaluate(() => (window.__dg.save.player.perkPoints += 1, window.__dg.onPerkPoint?.()));
  await page.waitForTimeout(200);
  await page.click('[data-perk="perk.scavenger.pack_mule"]');
  await page.waitForTimeout(200);
  const res = await page.evaluate(() => ({ perks: [...window.__dg.save.player.perks], pts: window.__dg.save.player.perkPoints, carry: window.__dg.carryWeight().max }));
  await page.screenshot({ path: 'docs/review/shots/perks-taken.png' });
  await closeAll();
  p8.screen = { ...count, ok: count.tabs === 4 && count.perks === 32 };
  p8.take = { ...res, carryBefore: carry0, tier2DisabledWithoutPoint: lockedNoPoints, ok: res.perks.includes('perk.scavenger.light_fingers') && res.perks.includes('perk.scavenger.pack_mule') && res.carry === carry0 + 15 && lockedNoPoints === true };
  note(`P8 perk screen: ${count.tabs} tabs, ${count.perks} perks; took 2 → carry ${carry0} → ${res.carry}`);
}
p8.pass = p8.salvage.ok && p8.levelUp.ok && p8.screen.ok && p8.take.ok;

// ------------------------------------------------------------------ P12
const journalNext = async () => {
  await page.keyboard.press('KeyJ');
  await page.waitForSelector('.screen.show [data-next]', { timeout: 20000 });
  const t = await page.evaluate(() => document.querySelector('.screen.show [data-next]')?.textContent ?? '');
  await closeAll();
  return t;
};
const state = () =>
  page.evaluate(() => {
    const w = window.__dg.save.world, s = window.__story.info();
    return { next: s.next, decide: s.decide, flags: { toll: w.flags['choice:toll'] ?? null, core: w.flags['choice:core'] ?? null, ending: w.flags['ending'] ?? null } };
  });
const steps = [];
const uiDone = [];
for (let guard = 0; guard < 60; guard++) {
  const st = await state();
  if (!st.next) break;
  const shown = await journalNext();
  const step = { quest: st.next.id, index: st.next.index, type: st.next.type, text: st.next.text, shownInJournal: shown.includes(st.next.text), via: 'state' };
  if (st.next.type === 'talk' && st.next.text.includes('Odile')) {
    const t = await page.evaluate(() => ({ x: window.__dg.layout.spawn.x + 8.6, z: window.__dg.layout.spawn.z - 1.6 }));
    await standAt(t.x, t.z - 1.5, t.x, t.z);
    await page.waitForTimeout(600);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    await closeAll();
    const ok = await page.evaluate(() => window.__dg.save.world.flags['talk:guild_factor'] === true);
    step.via = `UI: walked up to Odile, pressed E (talk flag ${ok})`;
    uiDone.push('talk:guild_factor');
  } else if (st.next.type === 'choice' && st.next.text.includes('Reavers')) {
    // the decision dialog opens by itself once the step is active and nothing else is open
    const auto = await page.waitForSelector('.screen.show [data-choice="fight"]', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!auto) {
      await page.keyboard.press('KeyJ');
      await page.click('[data-decide="toll"]');
      await page.waitForSelector('.screen.show [data-choice="fight"]', { timeout: 3000 });
    }
    await page.screenshot({ path: 'docs/review/shots/toll.png' });
    await page.click('[data-choice="fight"]');
    await page.waitForTimeout(500);
    step.via = auto ? 'UI: toll dialog opened by itself → "Refuse and fight"' : 'UI: Journal → Decide now → fight';
    uiDone.push('choice:toll');
  } else if (st.next.type === 'talk' && st.next.text.includes('Grid Core')) {
    const c = await page.evaluate(() => ({ x: window.__story.corePos.x, z: window.__story.corePos.z }));
    await standAt(c.x, c.z - 2.6, c.x, c.z);
    await page.waitForTimeout(1200);
    const vis = await page.evaluate(() => window.__story.hatch.visible);
    await page.screenshot({ path: 'docs/review/shots/core-hatch.png' });
    await page.keyboard.press('KeyE');
    const opened = await page.waitForSelector('.screen.show [data-choice="commons"]', { timeout: 6000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/review/shots/core.png' });
    step.via = `UI: hatch visible=${vis}, walked up, pressed E → core choice ${opened ? 'opened' : 'DID NOT open'}`;
    uiDone.push('talk:grid_core');
    if (opened) {
      await page.click('[data-choice="commons"]');
      await page.waitForSelector('[data-confirm="commons"]', { timeout: 3000 });
      await page.click('[data-confirm="commons"]');
      const end = await page.waitForSelector('[data-ending]', { timeout: 6000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'docs/review/shots/ending.png' });
      uiDone.push(end ? 'choice:core → ending screen' : 'choice:core (no ending screen!)');
      await closeAll();
    }
  } else {
    // objective logic is unit-tested; here only move the pointer
    await page.evaluate(([id, index]) => (window.__dg.save.world.quests[id] = index + 1), [st.next.id, st.next.index]);
  }
  await page.evaluate(() => window.__dg.pokeQuests());
  await page.waitForTimeout(250);
  steps.push(step);
}
const mainEnding = (await state()).flags.ending;
note(`P12 campaign: ${steps.length} steps, shown in Journal: ${steps.filter((s) => s.shownInJournal).length}; UI steps: ${uiDone.join(', ')}; ending ${mainEnding}`);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.screenshot({ path: 'docs/review/shots/journal.png' });
const journalEndings = await page.evaluate(() => document.querySelectorAll('.screen.show [data-ending-row]').length);
await closeAll();

// every ending, from the Journal's "Decide now", with the reputation its faction path produces
const PATHS = [
  ['end.commons', 'commons', { hearth: 70 }],
  ['end.fracture', 'commons', { hearth: 30 }],
  ['end.guild', 'guild', { guild: 40 }],
  ['end.reavers', 'reavers', { reavers: 35 }],
  ['end.sleep', 'sleep', {}],
  ['end.custodian', 'custodian', { custodians: 5 }],
];
const endings = [];
for (const [want, choice, rep] of PATHS) {
  await page.evaluate((rep) => {
    const w = window.__dg.save.world;
    delete w.flags['choice:core']; delete w.flags['ending'];
    w.quests['q.core'] = 2; w.flags['talk:grid_core'] = true;
    w.factions = { hearth: 20, reavers: 0, guild: 0, custodians: -50, ...rep };
  }, rep);
  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-decide="core"]', { timeout: 5000 });
  await page.click('[data-decide="core"]');
  await page.waitForSelector(`.screen.show [data-choice="${choice}"]`, { timeout: 3000 });
  const preview = await page.evaluate((c) => document.querySelector(`.screen.show [data-choice="${c}"] small`)?.textContent, choice);
  await page.click(`[data-choice="${choice}"]`);
  await page.click(`[data-confirm="${choice}"]`);
  const shown = await page.waitForSelector(`[data-ending="${want}"]`, { timeout: 6000 }).then(() => true).catch(() => false);
  const got = await page.evaluate(() => window.__dg.save.world.flags['ending']);
  endings.push({ want, choice, rep, preview, got, endingScreen: shown, ok: got === want && shown });
  note(`P12 ending ${want}: choice ${choice} → ${got} (screen ${shown}); preview "${preview}"`);
  await closeAll();
}
const p12 = {
  steps,
  uiSteps: uiDone,
  journalEndingRows: journalEndings,
  mainEnding,
  endings,
  pass:
    steps.length >= 25 &&
    steps.every((s) => s.shownInJournal) &&
    ['talk:guild_factor', 'choice:toll', 'talk:grid_core', 'choice:core → ending screen'].every((k) => uiDone.includes(k)) &&
    journalEndings === 6 &&
    endings.every((e) => e.ok) &&
    new Set(endings.map((e) => e.got)).size === 6,
};
const result = { p8, p12: { ...p12, steps: steps.map((s) => `${s.shownInJournal ? '✓' : '✗'} ${s.quest}#${s.index} ${s.type}: ${s.via}`) }, pageErrors: errs.slice(0, 8), pass: p8.pass && p12.pass && errs.length === 0 };
writeFileSync('docs/review/progress.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ p8: p8.pass, p12: p12.pass, errors: errs.length, pass: result.pass }));
await browser.close();
srv.kill();
process.exit(result.pass ? 0 : 1);
