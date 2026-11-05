// Review round 4: screenshots of the new progression UI in a mid-campaign state
// (Act III, toll decided, Haven powered by Market Row, Waterworks pump online).
// Usage: node tools/review/ui-shots.mjs  → docs/review/shots/ui-{journal,ledger,perks,toll}.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const port = 7100 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__story, null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__dg, w = g.save.world;
  w.flags.onb = 99; g.onbStep = 99; w.flags['open.v'] = 2;
  for (const id of ['q.first_light', 'q.roof_over', 'q.first_neighbors', 'q.first_node', 'q.guild_contact', 'q.water']) w.quests[id] = 9;
  const keys = g.layout.districts.map((d) => d.key);
  const di = (k) => keys.indexOf(k);
  w.districts[di('market')] = { state: 2, nodesOnline: g.layout.nodes.filter((n) => n.district === di('market')).map((n) => n.id) };
  w.districts[di('waterworks')] = { state: 1, nodesOnline: [g.layout.nodes.find((n) => n.district === di('waterworks')).id] };
  w.districts[di('downtown')] = { state: 1, nodesOnline: [g.layout.nodes.find((n) => n.district === di('downtown')).id] };
  w.factions = { hearth: 60, reavers: 0, guild: 22, custodians: -35 };
  g.save.player.xp = 1280;
  g.save.player.perkPoints = 2;
  g.save.player.perks = ['perk.scavenger.light_fingers', 'perk.scavenger.pack_mule', 'perk.fighter.second_wind'];
  g.pokeQuests();
});
// the toll decision opens by itself
await page.waitForSelector('.screen.show [data-choice="fight"]', { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/review/shots/ui-toll.png' });
await page.click('[data-choice="fight"]');
await page.waitForTimeout(1500);
for (const [k, name] of [['KeyJ', 'journal'], ['KeyL', 'ledger'], ['KeyK', 'perks']]) {
  await page.keyboard.press(k);
  await page.waitForSelector('.screen.show', { timeout: 20000 });
  await page.waitForTimeout(700);
  if (name === 'journal') await page.evaluate(() => document.querySelector('.screen.show [data-next]')?.closest('.body, .screen-body, .panel')?.scrollTo?.(0, 0));
  await page.screenshot({ path: `docs/review/shots/ui-${name}.png` });
  if (name === 'journal') {
    await page.evaluate(() => document.querySelector('.screen.show .endings')?.scrollIntoView());
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/review/shots/ui-journal-endings.png' });
  }
  if (name === 'ledger') {
    await page.evaluate(() => document.querySelector('.screen.show [data-grid-chain]')?.scrollIntoView());
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/review/shots/ui-ledger-grid.png' });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
await browser.close();
srv.kill();
