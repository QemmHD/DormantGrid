import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Bone, CharacterRig, randomLook } from './character';

function rig(): CharacterRig {
  const r = new CharacterRig(randomLook(3));
  r.root.updateMatrixWorld(true);
  return r;
}
const step = (r: CharacterRig, secs: number, dt = 1 / 60) => {
  for (let t = 0; t < secs; t += dt) r.update(dt);
};

describe('CharacterRig animation polish', () => {
  it('head turns toward a look target on its right (+x), clamped and smoothed', () => {
    const r = rig();
    r.lookTarget = new THREE.Vector3(4, 1.6, 2);
    r.update(1 / 60);
    const first = r.bones[Bone.Head].rotation.y;
    step(r, 1.5);
    const settled = r.bones[Bone.Head].rotation.y + r.bones[Bone.Chest].rotation.y;
    expect(Math.abs(first)).toBeLessThan(0.15); // no snap on the first frame
    expect(settled).toBeGreaterThan(0.6);
    expect(settled).toBeLessThan(1.2);
  });

  it('head gives up on targets directly behind instead of twisting around', () => {
    const r = rig();
    r.lookTarget = new THREE.Vector3(0.2, 1.6, -5);
    step(r, 1.5);
    expect(Math.abs(r.bones[Bone.Head].rotation.y)).toBeLessThan(0.35);
  });

  it('blends idle → walk instead of snapping the legs to full stride', () => {
    const r = rig();
    step(r, 0.5);
    r.speed = 1.6;
    r.update(1 / 60);
    const legs1 = Math.abs(r.bones[Bone.ULegL].rotation.x);
    step(r, 1.0);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      r.update(1 / 60);
      peak = Math.max(peak, Math.abs(r.bones[Bone.ULegL].rotation.x));
    }
    expect(legs1).toBeLessThan(0.1);
    expect(peak).toBeGreaterThan(0.35);
  });

  it('idle shifts weight: hips drift side to side over a few seconds', () => {
    const r = rig();
    let min = 1, max = -1;
    for (let i = 0; i < 60 * 16; i++) {
      r.update(1 / 60);
      const x = r.bones[Bone.Hips].position.x;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    expect(max - min).toBeGreaterThan(0.04);
    expect(max - min).toBeLessThan(0.12);
  });

  it('running pumps the elbows harder than walking', () => {
    const elbowAt = (speed: number) => {
      const r = rig();
      r.speed = speed;
      step(r, 1.5);
      let m = 0;
      for (let i = 0; i < 60; i++) {
        r.update(1 / 60);
        m = Math.max(m, -r.bones[Bone.LArmL].rotation.x);
      }
      return m;
    };
    expect(elbowAt(6.5)).toBeGreaterThan(elbowAt(1.6) + 0.5);
  });
});
