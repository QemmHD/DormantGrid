// Review round 5, item 3: Town Rank bar on the HUD and in the Journal, readable at iPhone size.
// iPhone SE and iPhone 13 (landscape emulation): the HUD bar is on screen, text ≥ 11 CSS px,
// lists the next 3 unlocks, overlaps no other HUD control; it updates when rank points change;
// the Journal shows the rank card and 3 unlocks.
// Usage: node tools/review/rank-check.mjs   (apps/game must be built) → docs/review/rank.json
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const port = 7360 + Math.floor(Math.random() * 40);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
mkdirSync('docs/review/shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const res = {};
for (const dev of ['iPhone SE', 'iPhone 13']) {
  const ctx = await browser.newContext({ ...devices[`${dev} landscape`] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__dg;
    g.save.world.flags.onb = 99;
    g.onbStep = 99;
    g.save.world.flags['open.v'] = 2;
  });
  await page.waitForTimeout(2500);
  const measure = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-rankbar]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const fonts = [...el.querySelectorAll('b, small, .rnext')].map((x) => parseFloat(getComputedStyle(x).fontSize));
      const ov = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const others = [...document.querySelectorAll('.topbar .icon-btn, .minimap, .meters, .quick > *, .actions > *, .clock')].filter((x) => !el.contains(x) && x.getBoundingClientRect().width > 0);
      const hits = others.filter((o) => ov(r, o.getBoundingClientRect())).map((o) => o.className);
      return {
        text: el.textContent,
        box: [r.left, r.top, r.right, r.bottom].map(Math.round),
        onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 0,
        visible: getComputedStyle(el.closest('.objective')).opacity !== '0',
        minFont: Math.min(...fonts),
        overlaps: hits,
        fill: el.querySelector('.rbar i').style.width,
      };
    });
  const before = await measure();
  await page.screenshot({ path: `docs/review/shots/rank-hud-${dev.replace(' ', '')}.png` });
  // raise rank points: three residents (+30) and a workbench (+6)
  await page.evaluate(() => {
    const g = window.__dg, w = g.save.world;
    for (let i = 0; i < 3; i++) w.survivors.push({ ...(w.survivors[0] ?? {}), id: 900 + i, name: `Test ${i}`, alive: true, x: g.layout.spawn.x, z: g.layout.spawn.z, job: 'auto' });
    w.pieces.push({ id: 9301, piece: 'workbench1', tier: 1, x: g.layout.spawn.x + 6, y: 0, z: g.layout.spawn.z + 6, rot: 0, hp: 150 });
  });
  await page.waitForTimeout(2500);
  const after = await measure();
  // Journal
  await page.evaluate(() => window.__dg.openScreen('journal'));
  await page.waitForSelector('[data-rank-journal]', { timeout: 15000 });
  await page.waitForTimeout(500);
  const journal = await page.evaluate(() => ({
    card: document.querySelector('[data-rank-journal]')?.textContent ?? '',
    unlocks: document.querySelectorAll('.rank-unlocks .li').length,
    minFont: Math.min(...[...document.querySelectorAll('[data-rank-journal] b, [data-rank-journal] small, .rank-unlocks b, .rank-unlocks small')].map((x) => parseFloat(getComputedStyle(x).fontSize))),
  }));
  await page.screenshot({ path: `docs/review/shots/rank-journal-${dev.replace(' ', '')}.png` });
  const nNext = (before?.text.match(/Next: (.*)$/)?.[1] ?? '').split(' · ').filter(Boolean).length;
  res[dev] = {
    before,
    after,
    journal,
    nextListed: nNext,
    pass: !!before && before.onScreen && before.visible && before.minFont >= 11 && before.overlaps.length === 0 && nNext === 3 && after.fill !== before.fill && journal.unlocks === 3 && journal.minFont >= 11 && errs.length === 0,
    pageErrors: errs.slice(0, 3),
  };
  console.log(dev, JSON.stringify({ pass: res[dev].pass, text: before?.text, box: before?.box, minFont: before?.minFont, overlaps: before?.overlaps, fill: `${before?.fill} → ${after?.fill}`, journalUnlocks: journal.unlocks }));
  await ctx.close();
}
await browser.close();
srv.kill();
const pass = Object.values(res).every((r) => r.pass);
writeFileSync('docs/review/rank.json', JSON.stringify({ devices: res, pass }, null, 2) + '\n');
process.exit(pass ? 0 : 1);
