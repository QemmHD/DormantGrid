#!/usr/bin/env node
// DORMANT GRID asset ingest.
//   npm run assets:ingest            process everything in assets/incoming/
//   npm run assets:ingest -- --dry   validate only, write nothing but REPORT.md
// Env: DG_ASSETS_ROOT overrides the assets/ directory (used by tests).
//
// Validates naming, size, dimensions and license notes, optimizes into
// assets/processed/<category>/, updates assets/manifest.json and writes
// assets/REPORT.md. A bad file is reported and skipped; it never aborts the run.
// Failed assets fall back to the Tier A (procedural) version in game.

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const ASSETS = process.env.DG_ASSETS_ROOT ? path.resolve(process.env.DG_ASSETS_ROOT) : path.join(REPO, 'assets');
const INCOMING = path.join(ASSETS, 'incoming');
const PROCESSED = path.join(ASSETS, 'processed');
const MANIFEST = path.join(ASSETS, 'manifest.json');
const REPORT = path.join(ASSETS, 'REPORT.md');
const ASSETS_MD = path.join(REPO, 'ASSETS.md');
const DRY = process.argv.includes('--dry');

const MB = 1024 * 1024;

/** category folder -> allowed id prefixes, kind, caps */
export const CATEGORIES = {
  props: { prefixes: ['prop'], kind: 'model', maxTris: 800, maxBytes: 2 * MB, tex: 1024 },
  'building-pieces': { prefixes: ['piece'], kind: 'model', maxTris: 400, maxBytes: 2 * MB, tex: 1024 },
  characters: { prefixes: ['char'], kind: 'model', maxTris: 3000, maxBones: 40, maxBytes: 4 * MB, tex: 1024 },
  textures: { prefixes: ['tex', 'atlas'], kind: 'image', maxPx: 1024, minPx: 256, pow2: true, maxBytes: 8 * MB },
  decals: { prefixes: ['decal'], kind: 'image', maxPx: 1024, minPx: 64, pow2: true, alpha: true, maxBytes: 8 * MB },
  'ui-icons': { prefixes: ['icon'], kind: 'image', maxPx: 128, minPx: 64, square: true, alpha: true, maxBytes: 4 * MB },
  'key-art': { prefixes: ['art', 'loading'], kind: 'image', maxPx: 2048, minPx: 512, maxBytes: 12 * MB },
  skyboxes: { prefixes: ['sky'], kind: 'image', maxPx: 2048, minPx: 512, maxBytes: 16 * MB },
  audio: { prefixes: ['sfx', 'amb', 'music', 'ui'], kind: 'audio', maxBytes: 20 * MB },
};

const NAME_RE = /^([a-z]+)\.([a-z0-9]+(?:_[a-z0-9]+)*)_(\d{2})\.([a-z0-9]+)$/;
const EXT = {
  image: ['png', 'jpg', 'jpeg', 'webp'],
  model: ['glb'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'],
};

const relAssets = (p) => path.relative(ASSETS, p).split(path.sep).join('/');

function hasBin(bin) {
  const r = spawnSync(bin, ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function licenseFor(file, id, assetsMd) {
  const side = file + '.license.txt';
  if (existsSync(side)) {
    const txt = (await fs.readFile(side, 'utf8')).trim();
    if (txt.length >= 3) return txt.split('\n')[0].slice(0, 200);
  }
  const line = assetsMd.split('\n').find((l) => l.includes(id));
  if (line) return line.trim().slice(0, 200);
  return null;
}

const ALLOWED_LICENSE = /(cc0|public domain|owner|self[- ]made|created by|mit|cc[- ]by(?![- ]?nc)|apache|ofl|generated)/i;
const BLOCKED_LICENSE = /(non[- ]?commercial|\bnc\b|no derivatives|\bnd\b|all rights reserved|ripped|unknown)/i;

async function processImage(file, spec, outDir, id) {
  const sharp = (await import('sharp')).default;
  const img = sharp(file, { failOn: 'error' });
  const meta = await img.metadata();
  const errs = [];
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) errs.push('could not read image dimensions');
  if (Math.max(w, h) < spec.minPx) errs.push(`too small (${w}x${h}); minimum ${spec.minPx}px on the long edge`);
  if (spec.square && w !== h) errs.push(`must be square, got ${w}x${h}`);
  if (spec.alpha && !meta.hasAlpha) errs.push('needs a transparent background (alpha channel)');
  if (errs.length) return { errs };
  const warns = [];
  let tw = w;
  let th = h;
  const scale = Math.min(1, spec.maxPx / Math.max(w, h));
  tw = Math.max(1, Math.round(w * scale));
  th = Math.max(1, Math.round(h * scale));
  if (spec.pow2) {
    const p2 = (n) => 2 ** Math.round(Math.log2(n));
    const nw = Math.min(spec.maxPx, p2(tw));
    const nh = Math.min(spec.maxPx, p2(th));
    if (nw !== tw || nh !== th) warns.push(`resized to power-of-two ${nw}x${nh}`);
    tw = nw;
    th = nh;
  }
  if (scale < 1) warns.push(`downscaled from ${w}x${h} to ${tw}x${th}`);
  const out = path.join(outDir, id + '.webp');
  if (!DRY) {
    await fs.mkdir(outDir, { recursive: true });
    await sharp(file)
      .resize(tw, th, { fit: spec.square || spec.pow2 ? 'fill' : 'inside' })
      .webp({ quality: spec.alpha ? 90 : 82, alphaQuality: 90, effort: 5 })
      .toFile(out);
  }
  const bytes = DRY ? 0 : (await fs.stat(out)).size;
  return { out, entry: { kind: 'image', w: tw, h: th, bytes }, warns };
}

async function inspectGlb(file) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      const mode = prim.getMode();
      if (mode !== 4) continue; // TRIANGLES only
      tris += Math.floor((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3);
    }
  }
  let bones = 0;
  for (const skin of root.listSkins()) bones = Math.max(bones, skin.listJoints().length);
  return { tris, bones, materials: root.listMaterials().length, anims: root.listAnimations().length };
}

async function processModel(file, spec, outDir, id) {
  const info = await inspectGlb(file);
  const errs = [];
  if (info.tris === 0) errs.push('no triangles found');
  if (info.tris > spec.maxTris * 1.5) errs.push(`${info.tris} triangles; budget is ${spec.maxTris}`);
  if (spec.maxBones && info.bones > spec.maxBones) errs.push(`${info.bones} bones; budget is ${spec.maxBones}`);
  if (info.materials > 5) errs.push(`${info.materials} materials; maximum is 5`);
  if (errs.length) return { errs };
  const warns = [];
  if (info.tris > spec.maxTris) warns.push(`${info.tris} triangles is over the ${spec.maxTris} budget; simplified`);
  const out = path.join(outDir, id + '.glb');
  if (!DRY) {
    await fs.mkdir(outDir, { recursive: true });
    const args = [
      'optimize',
      file,
      out,
      '--compress',
      'meshopt',
      '--texture-compress',
      'webp',
      '--texture-size',
      String(spec.tex),
    ];
    if (info.tris > spec.maxTris) {
      args.push('--simplify', 'true', '--simplify-ratio', String(Math.max(0.2, spec.maxTris / info.tris)));
    } else {
      args.push('--simplify', 'false');
    }
    const bin = path.join(REPO, 'node_modules', '.bin', 'gltf-transform');
    execFileSync(bin, args, { stdio: 'pipe' });
  }
  const after = DRY ? info : await inspectGlb(out);
  const bytes = DRY ? 0 : (await fs.stat(out)).size;
  return {
    out,
    entry: { kind: 'model', tris: after.tris, bones: after.bones || undefined, anims: after.anims || undefined, bytes },
    warns,
  };
}

async function processAudio(file, spec, outDir, id, ext, ffmpeg) {
  const loop = /^(amb|music)$/.test(id.split('.')[0]);
  if (ffmpeg) {
    const out = path.join(outDir, id + '.m4a');
    if (!DRY) {
      await fs.mkdir(outDir, { recursive: true });
      const bitrate = id.startsWith('music') ? '128k' : id.startsWith('amb') ? '96k' : '96k';
      const r = spawnSync(
        'ffmpeg',
        ['-y', '-v', 'error', '-i', file, '-vn', '-ac', id.startsWith('sfx') || id.startsWith('ui') ? '1' : '2', '-c:a', 'aac', '-b:a', bitrate, out],
        { stdio: 'pipe' },
      );
      if (r.status !== 0) return { errs: [`ffmpeg failed: ${String(r.stderr).slice(0, 200)}`] };
    }
    const bytes = DRY ? 0 : (await fs.stat(out)).size;
    return { out, entry: { kind: 'audio', loop, bytes }, warns: [] };
  }
  if (ext === 'mp3' || ext === 'm4a' || ext === 'aac') {
    const out = path.join(outDir, `${id}.${ext}`);
    if (!DRY) {
      await fs.mkdir(outDir, { recursive: true });
      await fs.copyFile(file, out);
    }
    const bytes = DRY ? 0 : (await fs.stat(out)).size;
    return { out, entry: { kind: 'audio', loop, bytes }, warns: ['ffmpeg not found; copied without re-encoding'] };
  }
  return { errs: [`.${ext} needs ffmpeg to convert for iOS; install ffmpeg or supply .mp3/.m4a`] };
}

async function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

export async function ingest() {
  const manifest = await readJson(MANIFEST, { version: 1, assets: {} });
  manifest.assets ??= {};
  const assetsMd = existsSync(ASSETS_MD) ? await fs.readFile(ASSETS_MD, 'utf8') : '';
  const ffmpeg = hasBin('ffmpeg');
  const ok = [];
  const failed = [];
  const warned = [];

  for (const [cat, spec] of Object.entries(CATEGORIES)) {
    const dir = path.join(INCOMING, cat);
    const files = (await walk(dir)).filter(
      (f) => !f.endsWith('.license.txt') && !path.basename(f).startsWith('.') && !/readme\.md$/i.test(f),
    );
    for (const file of files) {
      const base = path.basename(file);
      const fail = (msg) => failed.push({ file: relAssets(file), reason: msg });
      try {
        const m = NAME_RE.exec(base);
        if (!m) {
          fail(`bad name. Use <prefix>.<name>_<nn>.<ext>, e.g. ${spec.prefixes[0]}.chair_wood_01, lowercase`);
          continue;
        }
        const [, prefix, , , extRaw] = m;
        const ext = extRaw.toLowerCase();
        const id = base.slice(0, base.length - ext.length - 1);
        if (!spec.prefixes.includes(prefix)) {
          fail(`prefix "${prefix}" not allowed in ${cat}/ (use ${spec.prefixes.join(', ')})`);
          continue;
        }
        if (!EXT[spec.kind].includes(ext)) {
          fail(`.${ext} not accepted for ${cat}; use ${EXT[spec.kind].join(', ')}`);
          continue;
        }
        const stat = await fs.stat(file);
        if (stat.size > spec.maxBytes) {
          fail(`file is ${(stat.size / MB).toFixed(1)} MB; limit ${(spec.maxBytes / MB).toFixed(0)} MB`);
          continue;
        }
        const license = await licenseFor(file, id, assetsMd);
        if (!license) {
          fail(`no license note. Add ${base}.license.txt (e.g. "owner-created") or a line with ${id} in ASSETS.md`);
          continue;
        }
        if (BLOCKED_LICENSE.test(license) || !ALLOWED_LICENSE.test(license)) {
          fail(`license "${license}" is not allowed (CC0, owner-created, or permissive only)`);
          continue;
        }
        const outDir = path.join(PROCESSED, cat);
        let res;
        if (spec.kind === 'image') res = await processImage(file, spec, outDir, id);
        else if (spec.kind === 'model') res = await processModel(file, spec, outDir, id);
        else res = await processAudio(file, spec, outDir, id, ext, ffmpeg);
        if (res.errs?.length) {
          fail(res.errs.join('; '));
          continue;
        }
        const entry = { path: relAssets(res.out), ...res.entry, license, source: relAssets(file) };
        for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];
        if (!DRY) manifest.assets[id] = entry;
        ok.push({ id, entry });
        for (const w of res.warns ?? []) warned.push({ id, w });
      } catch (err) {
        fail(`unexpected error: ${String(err?.message ?? err).split('\n')[0].slice(0, 240)}`);
        // remove any half-written output so a broken file never ships
        for (const ext of ['webp', 'glb', 'm4a', 'mp3', 'aac']) {
          const p = path.join(PROCESSED, cat, path.basename(file).replace(/\.[a-z0-9]+$/i, '') + '.' + ext);
          if (!DRY && existsSync(p) && !ok.some((o) => o.entry.path === relAssets(p))) await fs.rm(p, { force: true });
        }
      }
    }
  }

  // drop manifest entries whose processed file has disappeared
  for (const [id, e] of Object.entries(manifest.assets)) {
    if (!existsSync(path.join(ASSETS, e.path))) delete manifest.assets[id];
  }

  if (!DRY) {
    manifest.version = 1;
    manifest.generatedAt = new Date().toISOString();
    const sorted = Object.fromEntries(Object.entries(manifest.assets).sort(([a], [b]) => a.localeCompare(b)));
    manifest.assets = sorted;
    await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  }

  const lines = [
    '# Asset ingest report',
    '',
    `Run: ${new Date().toISOString()}${DRY ? ' (dry run)' : ''}`,
    `Processed: ${ok.length}. Failed: ${failed.length}. Warnings: ${warned.length}.`,
    '',
    'Failed assets keep using the built-in (Tier A) version in game. Nothing crashes.',
    '',
  ];
  if (failed.length) {
    lines.push('## Failed', '', '| File | Reason |', '|---|---|');
    for (const f of failed) lines.push(`| \`${f.file}\` | ${f.reason.replace(/\|/g, '/')} |`);
    lines.push('');
  }
  if (warned.length) {
    lines.push('## Warnings', '');
    for (const w of warned) lines.push(`- \`${w.id}\`: ${w.w}`);
    lines.push('');
  }
  if (ok.length) {
    lines.push('## Processed', '', '| ID | Kind | Size | Details |', '|---|---|---|---|');
    for (const { id, entry } of ok) {
      const det = entry.kind === 'image' ? `${entry.w}x${entry.h}` : entry.kind === 'model' ? `${entry.tris} tris` : entry.loop ? 'loop' : 'one-shot';
      lines.push(`| \`${id}\` | ${entry.kind} | ${(entry.bytes / 1024).toFixed(0)} KB | ${det} |`);
    }
    lines.push('');
  }
  await fs.writeFile(REPORT, lines.join('\n'));
  console.log(`assets:ingest  processed ${ok.length}, failed ${failed.length}, warnings ${warned.length}. See ${REPORT}`);
  return { ok, failed, warned };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ingest().catch((err) => {
    console.error('assets:ingest failed to run:', err);
    process.exitCode = 1;
  });
}
