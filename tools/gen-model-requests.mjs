#!/usr/bin/env node
// Generates docs/asset-requests/models-top30.md from assets/registry.json so the
// request sheet, ingest validation and runtime replacement never drift apart.
// Usage: node tools/gen-model-requests.mjs   (also run by `npm run assets:docs`)
import { readFileSync, writeFileSync } from 'node:fs';

const reg = JSON.parse(readFileSync('assets/registry.json', 'utf8'));
const models = [...reg.models].sort((a, b) => a.priority - b.priority);
const CAT_DIR = { props: 'props', characters: 'characters', buildings: 'buildings' };
const STYLE =
  'Style: DORMANT GRID, a stylized post-collapse town. Muted, gritty, NOT photoreal. Chunky simplified shapes with bevelled edges, low-poly friendly forms, desaturated colors with strong light/dark contrast, flat even lighting (no baked shadows or highlights). The only glow color is Grid cyan-teal #39E6D0 and only on power hardware. No text, no logos, no brands, no real-world trademarks, no watermark.';
const dims = (s) => `${s[0]} m wide (X) x ${s[1]} m tall (Y) x ${s[2]} m deep (Z)`;
// rigid, boxy things a Blender script can build well
const SCRIPTABLE = new Set(['prop.crate_wood', 'prop.barrel_steel', 'prop.barrier_jersey', 'prop.cone_traffic', 'prop.container_shipping', 'prop.dumpster', 'prop.bench', 'prop.sign_street', 'prop.streetlight', 'bldg.grid_node', 'bldg.warehouse', 'bldg.pumphouse']);

const sheetPrompt = (m) => {
  const what = m.category === 'characters' ? (m.bones > 0 ? 'character turnaround sheet' : 'robot model sheet') : m.category === 'buildings' ? 'building elevation sheet' : 'prop model sheet';
  const views =
    m.category === 'characters'
      ? 'front, left side, back and 3/4 views, full body, neutral A-pose with arms 30 degrees from the body, feet slightly apart'
      : m.category === 'buildings'
        ? 'front elevation, side elevation, back elevation and a 3/4 aerial view, all orthographic'
        : 'front, side, top and 3/4 views, all orthographic';
  return [
    `Create a clean ${what} for a 3D artist to model from.`,
    `Subject: ${m.brief}`,
    `Real-world size: ${dims(m.size)}. Keep these proportions exactly in every view.`,
    `Views: ${views}, on a plain light-grey background, evenly spaced, same scale in every view, with a thin 1 m scale bar.`,
    m.category === 'characters' && m.bones > 0 ? 'Clothing regions should be clearly separated flat color areas (good for texture baking and recoloring). Hands open, no props in hands.' : 'Show material breaks clearly (paint, metal, wood, glass) as flat color areas.',
    `Design for a low-poly game model of about ${m.tris} triangles: big readable shapes, no thin fiddly details, no fur or foliage cards.`,
    STYLE,
  ].join(' ');
};

const scriptPrompt = (m) =>
  [
    `Write a single Python script for Blender 4.x that builds this game asset from primitives and exports it as GLB:`,
    `${m.brief}`,
    `Exact size: ${dims(m.size)}; 1 Blender unit = 1 m. Model it so the FRONT faces +Y in Blender (it becomes +Z in glTF) and the base sits on Z=0 centered on the origin.`,
    `Use bevelled cubes/cylinders (bevel 0.02-0.05 m), at most 5 materials with flat base colors (Principled BSDF base color only, no textures), apply all transforms and modifiers, merge into ONE mesh object, triangulate, keep it under ${m.tris} triangles (print the triangle count at the end).`,
    `Delete the default cube/camera/light first. Export with bpy.ops.export_scene.gltf(filepath='//${m.id}_01.glb', export_format='GLB', export_yup=True, export_apply=True, export_cameras=False, export_lights=False).`,
    'Colors: muted and desaturated; Grid hardware may use #39E6D0 as an emissive accent only.',
  ].join(' ');

const out = [];
out.push('# Top 30 models: request sheet (generated)');
out.push('');
out.push('> Generated from `assets/registry.json` by `tools/gen-model-requests.mjs`. Edit the registry, not this file.');
out.push('');
out.push('## Read this first (honest notes)');
out.push('');
out.push('- **ChatGPT cannot output a finished, rigged GLB.** It *can* produce two useful things, so every entry has two prompts:');
out.push('  1. **Reference sheet prompt** (image). Feed the image to an image-to-3D tool (for example Meshy, Tripo, Rodin or Hunyuan3D) or model it by hand in Blender.');
out.push('  2. **Blender script prompt**, only for simple rigid shapes. ChatGPT writes a Python script; you run it in Blender (Scripting tab, Run) and it exports the GLB directly.');
out.push('- **Characters need a rig** to animate: auto-rig the mesh (Mixamo or AccuRIG), then add the listed clips. The game\'s procedural animation can\'t drive an imported skeleton yet, so rigged characters are **validated but not used in game yet** (`runtime: pending`).');
out.push('- **Buildings are validated but not drawn yet** (`runtime: pending`). The game\'s buildings are destructible piece by piece and their footprints vary, so a single GLB can\'t replace them without more work. Props and the robot enemy are **live**: drop them in and they replace the procedural versions.');
out.push('- **Procedural fallback always stays.** A missing, broken or over-budget model is reported in `assets/REPORT.md` and the game keeps the built-in version.');
out.push('');
out.push('## Rules for every model');
out.push('');
out.push('- GLB, 1 unit = 1 m, **Y up, front faces +Z** (the glTF standard), pivot at the **center of the base** (characters: between the feet).');
out.push('- Apply all transforms. No cameras or lights. At most 5 materials. Textures at most the listed size (power of two).');
out.push('- File name: `<ID>_01.glb` (variants `_02`, `_03`...). Folder: `assets/incoming/<folder>/`. Add `<file>.license.txt` containing `owner-created` (or the real license).');
out.push('- Run `npm run assets:ingest`, then read `assets/REPORT.md`. Ingest checks the size against the table (±35% ok, 3x off = rejected as wrong units), the pivot, a 90° rotation, triangles, bones, clips, and texture memory.');
out.push('- **iPhone budgets:** triangles are per instance; "typical visible" shows how many draw at once, so a prop\'s real cost is tris × visible. Texture MB is resident GPU memory (RGBA + mips). The whole game must stay under 150 MB of textures and 300k visible triangles. Prop budgets here are set so a full swap stays near today\'s procedural cost; after adding models, run `node tests/budget-tris.mjs` (fails over 300k).');
out.push('');
out.push('## Summary');
out.push('');
out.push('| # | ID | Folder | Size W×H×D (m) | Tris | Texture | Tex MB | Rig / clips | Typical visible | In game |');
out.push('|---|---|---|---|---|---|---|---|---|---|');
models.forEach((m, i) => {
  const rig = m.category === 'characters' ? (m.bones > 0 ? `≤${m.bones} bones; ${(m.clips ?? []).join(', ')}` : 'rigid (no bones)') : '—';
  out.push(`| ${i + 1} | \`${m.id}\` | ${CAT_DIR[m.category]}/ | ${m.size.join(' × ')} | ${m.tris} | ${m.tex} px | ${m.texMB} | ${rig} | ${m.typicalVisible ?? 1} | ${m.runtime === 'live' ? '**live**' : 'pending'} |`);
});
out.push('');
const totalTex = models.reduce((a, m) => a + m.texMB, 0);
out.push(`If every model shipped at its texture budget at once: ${totalTex.toFixed(1)} MB resident (budget 150 MB).`);
out.push('');
let group = '';
models.forEach((m, i) => {
  const g = m.category === 'buildings' ? 'Key buildings' : m.category === 'characters' ? 'Characters' : 'Props';
  if (g !== group) {
    group = g;
    out.push(`## ${g}`);
    out.push('');
  }
  out.push(`### ${i + 1}. \`${m.id}\``);
  out.push('');
  out.push(`- **What:** ${m.brief}`);
  out.push(`- **Size:** ${dims(m.size)}`);
  out.push(`- **Budget:** ≤ ${m.tris} triangles, texture ≤ ${m.tex} px (${m.texMB} MB resident)${m.category === 'characters' && m.bones > 0 ? `, ≤ ${m.bones} bones, clips: ${(m.clips ?? []).join(', ')}` : ''}`);
  out.push(`- **File:** \`assets/incoming/${CAT_DIR[m.category]}/${m.id}_01.glb\` + \`${m.id}_01.glb.license.txt\``);
  out.push(`- **Replaces:** ${Object.entries(m.replaces).map(([k, v]) => `${k} \`${v}\``).join(', ')}; in game: ${m.runtime === 'live' ? '**live**' : 'pending (validated only)'}`);
  out.push('');
  out.push('Reference sheet prompt (paste into ChatGPT):');
  out.push('');
  out.push('```');
  out.push(sheetPrompt(m));
  out.push('```');
  out.push('');
  if (SCRIPTABLE.has(m.id)) {
    out.push('Blender script prompt (paste into ChatGPT, run the script in Blender):');
    out.push('');
    out.push('```');
    out.push(scriptPrompt(m));
    out.push('```');
    out.push('');
  }
});
writeFileSync('docs/asset-requests/models-top30.md', out.join('\n'));
console.log(`wrote docs/asset-requests/models-top30.md (${models.length} models)`);
