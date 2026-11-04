// GLB ingest test: generates small GLB files, runs the real ingest against a temp
// assets root, and checks validation, optimization, manifest entries and report.
// Usage: node tests/ingest-glb.mjs
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failed++;
};

/** Axis-aligned box GLB: size [w,h,d], base at y = yBase, centered at (cx, cz). */
async function boxGlb(file, [w, h, d], { yBase = 0, cx = 0, cz = 0, rig = 0 } = {}) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = yBase, y1 = yBase + h, z0 = cz - d / 2, z1 = cz + d / 2;
  const P = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(P.flat())).setBuffer(buf);
  const ind = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buf);
  const mat = doc.createMaterial('paint').setBaseColorFactor([0.6, 0.5, 0.4, 1]);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(ind).setMaterial(mat);
  const mesh = doc.createMesh('box').addPrimitive(prim);
  const node = doc.createNode('box').setMesh(mesh);
  const scene = doc.createScene('scene').addChild(node);
  if (rig) {
    const joints = [];
    let parent = null;
    for (let i = 0; i < rig; i++) {
      const j = doc.createNode(`j${i}`).setTranslation([0, i === 0 ? 0 : h / rig, 0]);
      (parent ?? scene).addChild(j);
      joints.push(j);
      parent = j;
    }
    const n = P.length;
    prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(n * 4)).setBuffer(buf));
    const wts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) wts[i * 4] = 1;
    prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(wts).setBuffer(buf));
    const ibm = new Float32Array(rig * 16);
    for (let i = 0; i < rig; i++) ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -(i * h) / rig, 0, 1], i * 16);
    const skin = doc.createSkin('rig').setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
    for (const j of joints) skin.addJoint(j);
    node.setSkin(skin);
  }
  doc.getRoot().setDefaultScene(scene);
  await new NodeIO().write(file, doc);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-ingest-'));
const inc = (cat) => path.join(root, 'incoming', cat);
await fs.mkdir(inc('props'), { recursive: true });
await fs.mkdir(inc('characters'), { recursive: true });
await fs.mkdir(inc('buildings'), { recursive: true });
const lic = (f) => fs.writeFile(f + '.license.txt', 'owner-created');

// 1. correct crate
await boxGlb(path.join(inc('props'), 'prop.crate_wood_01.glb'), [0.72, 0.7, 0.72]);
await lic(path.join(inc('props'), 'prop.crate_wood_01.glb'));
// 2. exported in centimeters
await boxGlb(path.join(inc('props'), 'prop.crate_wood_02.glb'), [72, 70, 72]);
await lic(path.join(inc('props'), 'prop.crate_wood_02.glb'));
// 3. pivot at the middle + off-center
await boxGlb(path.join(inc('props'), 'prop.barrel_steel_01.glb'), [0.6, 0.9, 0.6], { yBase: -0.45, cx: 0.4 });
await lic(path.join(inc('props'), 'prop.barrel_steel_01.glb'));
// 4. car rotated 90 degrees (long axis on X)
await boxGlb(path.join(inc('props'), 'prop.car_sedan_01.glb'), [4.3, 1.45, 1.8]);
await lic(path.join(inc('props'), 'prop.car_sedan_01.glb'));
// 5. not in the registry
await boxGlb(path.join(inc('props'), 'prop.mystery_01.glb'), [1, 1, 1]);
await lic(path.join(inc('props'), 'prop.mystery_01.glb'));
// 6. no license
await boxGlb(path.join(inc('props'), 'prop.bench_01.glb'), [1.8, 0.9, 0.6]);
// 7. rigid robot (bones expected 0) — fine
await boxGlb(path.join(inc('characters'), 'char.robot_sentinel_01.glb'), [1.2, 2.3, 1.0]);
await lic(path.join(inc('characters'), 'char.robot_sentinel_01.glb'));
// 8. unrigged player (expects a skinned humanoid + clips)
await boxGlb(path.join(inc('characters'), 'char.player_01.glb'), [0.6, 1.8, 0.4]);
await lic(path.join(inc('characters'), 'char.player_01.glb'));
// 9. rigged survivor, no clips
await boxGlb(path.join(inc('characters'), 'char.survivor_01.glb'), [0.6, 1.75, 0.4], { rig: 4 });
await lic(path.join(inc('characters'), 'char.survivor_01.glb'));
// 10. building in the new buildings/ category
await boxGlb(path.join(inc('buildings'), 'bldg.clinic_01.glb'), [14, 8, 12]);
await lic(path.join(inc('buildings'), 'bldg.clinic_01.glb'));

process.env.DG_ASSETS_ROOT = root;
const { ingest } = await import('../tools/ingest.mjs');
const res = await ingest();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const report = await fs.readFile(path.join(root, 'REPORT.md'), 'utf8');
const failedFor = (id) => res.failed.find((f) => f.file.includes(id))?.reason ?? '';
const warnsFor = (id) => res.warned.filter((w) => w.id === id).map((w) => w.w).join(' | ');

const crate = manifest.assets['prop.crate_wood_01'];
check(!!crate && crate.kind === 'model' && crate.stable === 'prop.crate_wood' && crate.replaces?.prop === 'crate', 'good crate ingested with stable id + replaces');
check(crate && Math.abs(crate.size[0] - 0.72) < 0.01 && Math.abs(crate.size[1] - 0.7) < 0.01, `crate size recorded (${crate?.size})`);
check(crate && (await fs.stat(path.join(root, crate.path))).size > 0, 'crate optimized GLB written');
check(!warnsFor('prop.crate_wood_01'), `good crate has no warnings (${warnsFor('prop.crate_wood_01') || 'none'})`);
check(/centimeters/.test(failedFor('prop.crate_wood_02')) && !manifest.assets['prop.crate_wood_02'], `cm-scale crate rejected (${failedFor('prop.crate_wood_02')})`);
check(/not at the base/.test(warnsFor('prop.barrel_steel_01')) && /off-center/.test(warnsFor('prop.barrel_steel_01')), 'barrel pivot warnings');
check(/rotated 90/.test(warnsFor('prop.car_sedan_01')), 'rotated car warned');
check(/not in assets\/registry\.json/.test(warnsFor('prop.mystery_01')) && !!manifest.assets['prop.mystery_01'], 'unregistered model warned, still processed');
check(/license/.test(failedFor('prop.bench_01')), 'unlicensed model rejected');
check(!!manifest.assets['char.robot_sentinel_01'] && !warnsFor('char.robot_sentinel_01'), `rigid robot accepted cleanly (${warnsFor('char.robot_sentinel_01') || 'no warnings'})`);
check(/not rigged/.test(warnsFor('char.player_01')) && /missing animation clips/.test(warnsFor('char.player_01')), 'unrigged player warned (rig + clips)');
check(manifest.assets['char.survivor_01']?.bones === 4 && /missing animation clips: idle/.test(warnsFor('char.survivor_01')), 'rigged survivor keeps bones, warns missing clips');
check(!!manifest.assets['bldg.clinic_01'] && manifest.assets['bldg.clinic_01'].path.startsWith('processed/buildings/'), 'building category works');
check(/## Failed/.test(report) && /## Warnings/.test(report), 'REPORT.md lists failures and warnings');
await fs.rm(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : '\ningest GLB test passed');
process.exit(failed ? 1 : 0);
