// Usage: node tests/shot.mjs "<path?query>" out.png [waitMs] [w] [h] [script.js]
// Serves apps/game/dist via vite preview (must be built) and screenshots.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [, , path = '/', out = 'tests/output/shot.png', wait = '6000', w = '1280', h = '720', scriptFile] = process.argv;
const port = 4173 + Math.floor(Math.random() * 500);
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}${path}`);
await page.waitForTimeout(+wait);
if (scriptFile) {
  const code = readFileSync(scriptFile, 'utf8');
  await page.evaluate(code);
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await browser.close();
srv.kill();
process.exit(0);
