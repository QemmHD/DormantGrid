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
const REGISTRY = path.join(REPO, 'assets', 'registry.json');

const MB = 1024 * 1024;

/** category folder -> allowed id prefixes, kind, caps */
export const CATEGORIES = {
  props: { prefixes: ['prop'], kind: 'model', maxTris: 800, maxBytes: 2 * MB, tex: 1024 },
  'building-pieces': { prefixes: ['piece'], kind: 'model', maxTris: 400, maxBytes: 2 * MB, tex: 1024 },
  buildings: { prefixes: ['bldg'], kind: 'model', maxTris: 6000, maxBytes: 6 * MB, tex: 1024 },
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
  const { NodeIO, getBounds, ImageUtils } = await import('@gltf-transform/core');
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
  // world-space bounds of the default scene (skinned meshes use their bind pose)
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let bounds = null;
  if (scene) {
    const b = getBounds(scene);
    if (b.min.every(Number.isFinite) && b.max.every(Number.isFinite)) bounds = { min: b.min, max: b.max };
  }
  // resident texture memory estimate: RGBA8 + mip chain (x1.33)
  let texBytes = 0;
  const texSizes = [];
  for (const t of root.listTextures()) {
    const img = t.getImage();
    const size = img ? ImageUtils.getSize(img, t.getMimeType()) : null;
    if (size) {
      texSizes.push(size);
      texBytes += size[0] * size[1] * 4 * 1.33;
    }
  }
  return {
    tris,
    bones,
    materials: root.listMaterials().length,
    anims: root.listAnimations().length,
    clips: root.listAnimations().map((a) => a.getName().toLowerCase()),
    bounds,
    texMB: texBytes / MB,
    texMax: texSizes.reduce((m, s) => Math.max(m, s[0], s[1]), 0),
  };
}

/** Registry checks: size / units, pivot, long axis, rig + clips. Returns { errs, warns }. */
export function checkAgainstRegistry(info, reg) {
  const errs = [];
  const warns = [];
  if (!reg) return { errs, warns };
  if (info.bounds && reg.size) {
    const size = [0, 1, 2].map((i) => info.bounds.max[i] - info.bounds.min[i]);
    const ratio = size.map((v, i) => v / reg.size[i]);
    const worst = Math.max(...ratio.map((r) => (r > 0 ? Math.max(r, 1 / r) : Infinity)));
    const dims = size.map((v) => v.toFixed(2)).join(' x ');
    const want = reg.size.join(' x ');
    if (worst >= 3) {
      const avg = ratio.reduce((a, b) => a + b, 0) / 3;
      const hint = avg > 50 ? ' (looks like centimeters: scale by 0.01)' : avg < 0.05 ? ' (looks like it was scaled down: check export units)' : '';
      errs.push(`size ${dims} m is far from the expected ${want} m${hint}`);
    } else if (worst > 1.35) warns.push(`size ${dims} m differs from the expected ${want} m by more than 35%`);
    // pivot: base on y=0, centered on x/z
    const h = size[1];
    if (Math.abs(info.bounds.min[1]) > Math.max(0.05, h * 0.03)) warns.push(`pivot is not at the base (min y = ${info.bounds.min[1].toFixed(2)} m); the game re-bases it`);
    const cx = (info.bounds.max[0] + info.bounds.min[0]) / 2;
    const cz = (info.bounds.max[2] + info.bounds.min[2]) / 2;
    if (Math.abs(cx) > size[0] * 0.15 + 0.02 || Math.abs(cz) > size[2] * 0.15 + 0.02) warns.push(`pivot is off-center (${cx.toFixed(2)}, ${cz.toFixed(2)}); the game re-centers it`);
    // long axis: elongated assets must run along Z (front faces +Z)
    const wantLongZ = reg.size[2] > reg.size[0] * 1.4;
    const wantLongX = reg.size[0] > reg.size[2] * 1.4;
    if ((wantLongZ && size[0] > size[2] * 1.2) || (wantLongX && size[2] > size[0] * 1.2)) {
      warns.push('long axis looks rotated 90 degrees: the front should face +Z');
    }
  } else if (!info.bounds) warns.push('could not compute bounds');
  if (reg.bones !== undefined) {
    if (reg.bones > 0 && info.bones === 0) warns.push('not rigged: this slot expects a skinned humanoid');
    if (info.bones > Math.max(reg.bones, 0) && reg.bones > 0) errs.push(`${info.bones} bones; budget is ${reg.bones}`);
  }
  if (reg.clips?.length) {
    const missing = reg.clips.filter((c) => !info.clips.includes(c));
    if (missing.length) warns.push(`missing animation clips: ${missing.join(', ')}`);
  }
  return { errs, warns };
}

let registryCache = null;
async function registry() {
  if (!registryCache) {
    const r = await readJson(REGISTRY, { models: [] });
    registryCache = new Map((r.models ?? []).map((m) => [m.id, m]));
  }
  return registryCache;
}

async function processModel(file, catSpec, outDir, id) {
  const stable = id.replace(/_\d{2}$/, '');
  const reg = (await registry()).get(stable) ?? null;
  // registry entries override the category caps (per-asset iPhone budgets)
  const spec = { ...catSpec, maxTris: reg?.tris ?? catSpec.maxTris, tex: reg?.tex ?? catSpec.tex };
  const info = await inspectGlb(file);
  const errs = [];
  if (info.tris === 0) errs.push('no triangles found');
  if (info.tris > spec.maxTris * 1.5) errs.push(`${info.tris} triangles; budget is ${spec.maxTris}`);
  if (spec.maxBones && info.bones > spec.maxBones) errs.push(`${info.bones} bones; budget is ${spec.maxBones}`);
  if (info.materials > 5) errs.push(`${info.materials} materials; maximum is 5`);
  const rc = checkAgainstRegistry(info, reg);
  errs.push(...rc.errs);
  if (errs.length) return { errs };
  const warns = [...rc.warns];
  if (!reg) warns.push(`"${stable}" is not in assets/registry.json: validated with category caps only, and the game will not use it`);
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
  if (reg?.texMB && after.texMB > reg.texMB * 1.05) warns.push(`textures use ~${after.texMB.toFixed(1)} MB resident; budget is ${reg.texMB} MB`);
  const size = after.bounds ? [0, 1, 2].map((i) => +(after.bounds.max[i] - after.bounds.min[i]).toFixed(3)) : undefined;
  return {
    out,
    entry: {
      kind: 'model',
      stable,
      replaces: reg?.replaces,
      runtime: reg?.runtime,
      tris: after.tris,
      bones: after.bones || undefined,
      anims: after.anims || undefined,
      clips: after.clips.length ? after.clips : undefined,
      size,
      texMB: after.texMB ? +after.texMB.toFixed(2) : undefined,
      bytes,
    },
    warns,
  };
}

/** audio registry: stable IDs, budgets and loudness targets (assets/audio-registry.json) */
const AUDIO_REGISTRY = path.join(REPO, 'assets', 'audio-registry.json');
let audioReg = null;
async function audioSpec(stableId) {
  audioReg ??= await readJson(AUDIO_REGISTRY, { audio: [] });
  return audioReg.audio.find((a) => a.id === stableId) ?? null;
}

function probeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const d = parseFloat(r.stdout);
  return Number.isFinite(d) ? d : null;
}

/** peak (dBFS) via volumedetect */
function probePeak(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
  return m ? parseFloat(m[1]) : null;
}

/** integrated loudness (LUFS) via ebur128 */
function probeLufs(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /I:\s*(-?[\d.]+) LUFS\s*\n\s*Threshold/.exec(r.stderr) ?? [...r.stderr.matchAll(/I:\s*(-?[\d.]+) LUFS/g)].pop();
  return m ? parseFloat(m[1]) : null;
}

async function processAudio(file, spec, outDir, id, ext, ffmpeg) {
  const stableId = id.replace(/_\d{2}$/, '');
  const reg = await audioSpec(stableId);
  if (!reg) return { errs: [`unknown audio ID "${stableId}" — add it to assets/audio-registry.json first (see docs/asset-requests/audio-*.md)`] };
  if (!ffmpeg) {
    if (ext === 'mp3' || ext === 'm4a' || ext === 'aac') {
      const out = path.join(outDir, `${id}.${ext}`);
      if (!DRY) {
        await fs.mkdir(outDir, { recursive: true });
        await fs.copyFile(file, out);
      }
      return { out, entry: { kind: 'audio', audioId: stableId, runtime: reg.runtime, loop: reg.loop, bytes: DRY ? 0 : (await fs.stat(out)).size }, warns: ['ffmpeg not found: copied without loudness normalisation or budget checks'] };
    }
    return { errs: [`.${ext} needs ffmpeg to convert for iOS; install ffmpeg or supply .mp3/.m4a`] };
  }
  // duration budget (±10%)
  const dur = probeDuration(file);
  if (dur === null) return { errs: ['could not read duration (corrupt file?)'] };
  const [dMin, dMax] = reg.duration;
  if (dur < dMin * 0.9 || dur > dMax * 1.1) return { errs: [`duration ${dur.toFixed(2)} s outside ${dMin}–${dMax} s for ${stableId}`] };
  // loudness: short sounds peak-normalised, longer ones to an EBU R128 integrated target
  const L = reg.loudness ?? { mode: 'peak', dbfs: -3 };
  let filter;
  if (L.mode === 'peak') {
    const peak = probePeak(file);
    if (peak === null) return { errs: ['could not measure peak level'] };
    filter = `volume=${(L.dbfs - peak).toFixed(2)}dB`;
  } else filter = `loudnorm=I=${L.target}:TP=-1.5:LRA=11`;
  const mono = reg.kind === 'sfx' || reg.kind === 'ui' || reg.kind === 'vo';
  const bitrate = reg.kind === 'music' ? '128k' : mono ? '80k' : '96k';
  const out = path.join(outDir, id + '.m4a');
  const encode = (af) => spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vn', '-af', af, '-ac', mono ? '1' : '2', '-ar', '44100', '-c:a', 'aac', '-b:a', bitrate, out], { stdio: 'pipe' });
  if (!DRY) {
    await fs.mkdir(outDir, { recursive: true });
    const r = encode(filter);
    if (r.status !== 0) return { errs: [`ffmpeg failed: ${String(r.stderr).slice(0, 200)}`] };
    // AAC can overshoot short transients by a few dB: measure the decoded file and correct once
    if (L.mode === 'peak') {
      const got = probePeak(out);
      const peak = probePeak(file);
      if (got !== null && peak !== null && got > L.dbfs + 1) {
        const r2 = encode(`volume=${(L.dbfs - peak - (got - L.dbfs)).toFixed(2)}dB`);
        if (r2.status !== 0) return { errs: [`ffmpeg failed: ${String(r2.stderr).slice(0, 200)}`] };
      }
    }
  }
  const bytes = DRY ? 0 : (await fs.stat(out)).size;
  if (!DRY && bytes > reg.maxKB * 1024) {
    await fs.rm(out, { force: true });
    return { errs: [`encoded size ${(bytes / 1024).toFixed(0)} KB over the ${reg.maxKB} KB budget for ${stableId} (trim it)`] };
  }
  const measured = DRY ? null : L.mode === 'peak' ? { peakDb: probePeak(out) } : { lufs: probeLufs(out) };
  return { out, entry: { kind: 'audio', audioId: stableId, runtime: reg.runtime, loop: reg.loop, duration: +dur.toFixed(2), bytes, loudness: measured ?? undefined }, warns: [] };
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
