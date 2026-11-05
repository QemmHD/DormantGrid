// Audio pipeline flow (round 5): file-driven sounds by stable ID with synth fallback.
//   1. generate test tones into a temp assets root (assets/incoming/audio/)
//   2. ingest: registry IDs only, duration + size budgets, loudness normalised (peak / LUFS)
//   3. build the game against that root; files land in dist/models/processed/audio
//   4. in the browser: a sound with a shipped file plays from the file, one without uses the synth
// These are synthetic test tones in a temp folder — they are never shipped and do not count for P13.
// Usage: node tests/audio-flow.mjs
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

let ok = true;
const check = (c, msg) => {
  console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!c) ok = false;
};
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-audio-'));
const assets = path.join(tmp, 'assets');
const inc = path.join(assets, 'incoming', 'audio');
await fs.mkdir(inc, { recursive: true });
const tone = async (name, args) => {
  const f = path.join(inc, name);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args, f]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  await fs.writeFile(f + '.license.txt', 'owner-created');
};
// quiet 0.3 s knock (peak ≈ -38 dBFS) → should come out peak-normalised to -6 dBFS (headroom for AAC overshoot)
await tone('sfx.hit_wood_01.wav', ['-f', 'lavfi', '-i', 'sine=frequency=180:duration=0.3', '-af', 'volume=-20dB,afade=t=out:st=0.05:d=0.25']);
// quiet 25 s ambience bed (≈ -45 LUFS) → loudnorm to the registry target (-26 LUFS)
await tone('amb.dormant_01.wav', ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=25:amplitude=0.01', '-ac', '2']);
// rejects: too long for its budget, and an ID that is not in the registry
await tone('sfx.hit_wood_02.wav', ['-f', 'lavfi', '-i', 'sine=frequency=200:duration=5']);
await tone('sfx.made_up_thing_01.wav', ['-f', 'lavfi', '-i', 'sine=frequency=300:duration=0.3']);

process.env.DG_ASSETS_ROOT = assets;
const { ingest } = await import('../tools/ingest.mjs');
const res = await ingest();
const failed = Object.fromEntries(res.failed.map((f) => [path.basename(f.file ?? f.source ?? f.path ?? ''), f.reason ?? f.errs ?? f.msg ?? JSON.stringify(f)]));
check(res.ok.length === 2, `ingest accepted 2 files (${res.ok.map((o) => o.id).join(', ')})`);
check(res.failed.length === 2, `ingest rejected 2 files: ${JSON.stringify(failed)}`);
const man = JSON.parse(await fs.readFile(path.join(assets, 'manifest.json'), 'utf8'));
const hit = man.assets['sfx.hit_wood_01'], amb = man.assets['amb.dormant_01'];
check(hit?.runtime?.sfx === 'hitWood' && /\.m4a$/.test(hit.path), `sfx.hit_wood_01 → AAC, runtime sfx "${hit?.runtime?.sfx}"`);
check(hit && Math.abs(hit.loudness.peakDb - -6) <= 1.5, `short sound peak-normalised to -6 dBFS after encoding (measured ${hit?.loudness?.peakDb} dBFS)`);
check(amb && Math.abs(amb.loudness.lufs - -26) <= 2, `ambience loudness-normalised to -26 LUFS (measured ${amb?.loudness?.lufs} LUFS)`);
check(hit && hit.bytes <= 60 * 1024, `size within budget (${((hit?.bytes ?? 0) / 1024).toFixed(1)} KB ≤ 60 KB)`);

const outDir = path.join(tmp, 'dist');
const b = spawnSync(process.execPath, ['../../node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: 'apps/game', env: { ...process.env, DG_ASSETS_ROOT: assets }, stdio: 'pipe' });
check(b.status === 0, 'game builds against the temp assets root');
const copied = await fs.readdir(path.join(outDir, 'models', 'processed', 'audio')).catch(() => []);
check(copied.includes('sfx.hit_wood_01.m4a') && copied.includes('amb.dormant_01.m4a'), 'build copied the audio into dist/models/processed/audio');
const sw = await fs.readFile(path.join(outDir, 'sw.js'), 'utf8').catch(() => '');
check(!/hit_wood_01\.m4a/.test(sw), 'audio files are not precached (fetched on first use)');

const port = 5850 + Math.floor(Math.random() * 100);
const srv = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--outDir', outDir], { cwd: 'apps/game', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
try {
  await page.goto(`http://localhost:${port}/?autostart&fresh&quality=low`);
  await page.waitForFunction(() => window.__dg?.mode === 'play' && window.__audio?.files.loaded, null, { timeout: 90000 });
  await page.mouse.click(480, 300); // first tap unlocks audio
  await page.waitForFunction(() => window.__audio?.ready, null, { timeout: 15000 });
  // decode happens after unlock; give it a moment, then play both
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const a = window.__audio;
    a.play('hitWood');
    const withFile = a.stats.last;
    a.play('hitMetal');
    const withoutFile = a.stats.last;
    return { withFile, withoutFile, sfxMapped: [...a.files.sfx.keys()], amb: [...a.files.amb.keys()] };
  });
  check(r.withFile === 'file', `hitWood plays the recorded file (${r.withFile})`);
  check(r.withoutFile === 'synth', `hitMetal (no file) falls back to the synth (${r.withoutFile})`);
  check(r.amb.includes('dormant'), `ambience bed "dormant" registered (${r.amb.join(', ')})`);
  check(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
} finally {
  await browser.close();
  srv.kill();
  await fs.rm(tmp, { recursive: true, force: true });
}
console.log(ok ? 'audio flow passed' : 'audio flow FAILED');
process.exit(ok ? 0 : 1);
