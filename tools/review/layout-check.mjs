// Review round 6, item 7: iPhone landscape layout — no overlapping HUD controls.
// iPhone SE 3rd gen (no notch), iPhone 13 (notch) and iPhone 15 Pro Max (Dynamic Island), landscape, as a
// Home Screen PWA (full-screen viewport 667×375 / 844×390 / 932×430), Playwright device emulation (DPR, touch). Safe areas are emulated by setting the game's --safe-* CSS
// variables to the iOS landscape insets (Chromium has no env(safe-area-inset-*)):
//   SE 0/0/0, 13: left/right 47 bottom 21, 15 Pro Max: left/right 59 bottom 21.
// States: plain HUD after the tutorial, and a raid warning (objective card at its tallest: raid card,
// checklist, crop line). For each: every HUD control on screen and inside the safe area; no two
// controls overlap (action buttons, quick slots, top bar, minimap, meters, clock, objective card);
// nothing tappable sits in the left-thumb stick zone; touch targets ≥ 44 CSS px.
// NOT a real-device test: no iPhone was used. Usage: node tools/review/layout-check.mjs → docs/review/layout.json
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const port = 7820 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// Home Screen PWA = full screen (no Safari toolbars), so the viewport is the whole landscape screen
const PHONES = [
  { name: 'iPhone SE', dev: 'iPhone SE (3rd gen) landscape', viewport: { width: 667, height: 375 }, inset: { l: 0, r: 0, t: 0, b: 0 } },
  { name: 'iPhone 13', dev: 'iPhone 13 landscape', viewport: { width: 844, height: 390 }, inset: { l: 47, r: 47, t: 0, b: 21 } },
  { name: 'iPhone 15 Pro Max', dev: 'iPhone 15 Pro Max landscape', viewport: { width: 932, height: 430 }, inset: { l: 59, r: 59, t: 0, b: 21 } },
];
const out = {};
let allPass = true;
for (const ph of PHONES) {
  const ctx = await browser.newContext({ ...devices[ph.dev], viewport: ph.viewport, screen: ph.viewport });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low&touch`);
  await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__raids && window.__guide, null, { timeout: 120000 });
  await page.addStyleTag({ content: `:root { --safe-l: ${ph.inset.l}px !important; --safe-r: ${ph.inset.r}px !important; --safe-t: ${ph.inset.t}px !important; --safe-b: ${ph.inset.b}px !important; }` });
  await page.evaluate(() => {
    const g = window.__dg;
    document.documentElement.classList.add('touch');
    g.save.world.flags.onb = 99; g.onbStep = 99; g.save.world.flags['open.v'] = 2;
  });
  await page.waitForTimeout(2500);
  const measure = (state) =>
    page.evaluate(({ inset, state }) => {
      const W = innerWidth, H = innerHeight;
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
      };
      const items = [];
      const add = (name, el, tappable = true) => { if (el && vis(el)) items.push({ name, el, tappable }); };
      document.querySelectorAll('.actions .act').forEach((el) => add(`act.${[...el.classList].find((c) => c !== 'act' && c !== 'down' && c !== 'ready') ?? '?'}`, el));
      document.querySelectorAll('.quick .slot').forEach((el, i) => add(`slot${i + 1}`, el));
      document.querySelectorAll('.topbar > *').forEach((el, i) => add(`top${i + 1}`, el));
      add('minimap', document.querySelector('.minimap'));
      add('meters', document.querySelector('.meters'), false);
      add('clock', document.querySelector('.clock'), false);
      add('objective', document.querySelector('.objective'), false);
      document.querySelectorAll('.objective .obtn').forEach((el, i) => add(`objbtn${i + 1}`, el));
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const ov = (a, b) => a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
      const overlaps = [];
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i], B = items[j];
          if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
          if (ov(box(A.el), box(B.el))) overlaps.push(`${A.name} × ${B.name}`);
        }
      const offscreen = items.filter((it) => { const b = box(it.el); return b.l < inset.l - 1 || b.r > W - inset.r + 1 || b.t < inset.t - 1 || b.b > H - inset.b + 1; }).map((it) => it.name);
      // left-thumb stick zone: the floating stick's base (62 px radius) + 24 px margin, centred on the thumb
      // rest that tests/feel.mjs drags from (18% across the safe width, 70% down)
      const cx = inset.l + (W - inset.l - inset.r) * 0.18, cy = H * 0.7, R = 62 + 24;
      const zone = { l: Math.max(inset.l, cx - R), r: cx + R, t: cy - R, b: Math.min(H - inset.b, cy + R) };
      const inZone = items.filter((it) => it.tappable && ov(box(it.el), zone)).map((it) => it.name);
      // the objective card's text must pass stick drags through where it overlaps the zone
      const obj = document.querySelector('.objective');
      const objBlocks = obj && vis(obj) && ov(box(obj), zone) && getComputedStyle(obj).pointerEvents !== 'none';
      const small = items.filter((it) => it.tappable).filter((it) => { const b = box(it.el); return Math.min(b.w, b.h) < 44; }).map((it) => `${it.name} ${Math.round(Math.min(box(it.el).w, box(it.el).h))}px`);
      return { state, W, H, overlaps, offscreen, inZone, objectiveBlocksStick: !!objBlocks, small, boxes: Object.fromEntries(items.map((it) => [it.name, Object.values(box(it.el)).slice(0, 4).map(Math.round)])) };
    }, { inset: ph.inset, state });
  const plain = await measure('plain');
  await page.screenshot({ path: `docs/review/shots/layout-${ph.name.replace(/ /g, '')}.png` });
  // raid warning + crop line: the tallest objective card
  await page.evaluate(() => {
    const g = window.__dg, W = g.save.world, sim = window.__sim;
    const st = sim.loadRaidState(W);
    st.pending = { id: 99, faction: 'reavers', warnHour: W.hour, arriveHour: W.hour + 4, dir: 0.5, units: [{ enemy: 'raider_grunt', count: 2 }], strength: 24, goal: 'stores', early: true };
    sim.storeRaidState(W, st);
    const s = g.layout.spawn;
    W.pieces.push({ id: 99401, piece: 'farm_plot', tier: 0, x: s.x + 8, y: 0, z: s.z + 14, rot: 0, hp: 60 });
    W.crops.push({ plot: 99401, crop: 'carrot', planted: W.hour, growth: 0.3, water: 1, nutrients: 1, mine: true });
  });
  await page.waitForTimeout(2500);
  const raid = await measure('raid warning');
  await page.screenshot({ path: `docs/review/shots/layout-${ph.name.replace(/ /g, '')}-raid.png` });
  const ok = (m) => m.overlaps.length === 0 && m.offscreen.length === 0 && m.inZone.length === 0 && !m.objectiveBlocksStick && m.small.length === 0;
  const pass = ok(plain) && ok(raid) && errs.length === 0;
  allPass &&= pass;
  out[ph.name] = { inset: ph.inset, plain, raid, pass, pageErrors: errs.slice(0, 3) };
  for (const m of [plain, raid]) console.log(`${ok(m) ? 'ok  ' : 'FAIL'} ${ph.name} ${m.W}×${m.H} ${m.state}: overlaps ${JSON.stringify(m.overlaps)} offscreen ${JSON.stringify(m.offscreen)} stickZone ${JSON.stringify(m.inZone)}${m.objectiveBlocksStick ? ' objective-blocks-stick' : ''} small ${JSON.stringify(m.small)}`);
  await ctx.close();
}
await browser.close();
srv.kill();
writeFileSync('docs/review/layout.json', JSON.stringify({ devices: out, pass: allPass, note: 'Playwright device emulation with emulated safe-area insets; not a real iPhone.' }, null, 2) + '\n');
console.log(allPass ? 'layout check passed' : 'layout check FAILED');
process.exit(allPass ? 0 : 1);
