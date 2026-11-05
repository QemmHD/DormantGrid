// Review item 5: does the "Check your pack" tutorial step (ONBOARDING[4], trigger
// openedInventory) work for a human? Real-time Chromium, real input, no fast-sim tricks.
// Cases: touch tap on the pack icon (iPhone 13 landscape emulation), Tab, I, and a pack
// opened early (during step 3, as the review bot did) which must still count.
// Usage: node tools/review/pack-step.mjs   (apps/game must be built) → docs/review/pack-step.json
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const port = 6960 + Math.floor(Math.random() * 30);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const BEFORE = ['moved', 'looked', 'brokeProp', 'pickedUp']; // steps 0-3, completed the way play completes them
const res = {};
for (const mode of ['touch-tap', 'Tab', 'KeyI', 'early-open']) {
  const ctx = mode === 'touch-tap' ? await browser.newContext({ ...devices['iPhone 13 landscape'] }) : await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play', null, { timeout: 120000 });
  const n = mode === 'early-open' ? 3 : 4;
  await page.evaluate((list) => { for (const t of list) window.__dg.trigger(t); }, BEFORE.slice(0, n));
  await page.waitForTimeout(400);
  const card = await page.evaluate(() => document.querySelector('.objective')?.textContent ?? '');
  if (mode === 'touch-tap') await page.tap('[data-action="inventory"]');
  else await page.keyboard.press(mode === 'early-open' ? 'Tab' : mode);
  await page.waitForFunction(() => window.__dg.screenProbe?.() === 'inventory', null, { timeout: 15000 }).catch(() => {});
  const opened = await page.evaluate(() => window.__dg.screenProbe?.());
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  if (mode === 'early-open') {
    await page.evaluate(() => window.__dg.trigger('pickedUp')); // now the pack step becomes active
    await page.waitForTimeout(1500);
  }
  const step = await page.evaluate(() => window.__dg.onbStep);
  res[mode] = { stepBefore: n, cardText: card.slice(0, 90), opened, stepAfter: step, pass: step === 5, pageErrors: errs.length };
  console.log(mode, JSON.stringify(res[mode]));
  await ctx.close();
}
const pass = Object.values(res).every((r) => r.pass);
writeFileSync('docs/review/pack-step.json', JSON.stringify({ cases: res, pass }, null, 2) + '\n');
await browser.close();
srv.kill();
process.exit(pass ? 0 : 1);
