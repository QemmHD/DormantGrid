// Game orchestrator (temporary Phase 1 version: engine + controller on a test lot).
import * as THREE from 'three';
import { Renderer, type QualityTier } from '../core/renderer';
import { PerfOverlay } from '../core/perf';
import { Input } from '../input/input';
import { Atmosphere } from '../render/sky';
import { ThirdPersonCamera } from './camera';
import { PlayerController } from './player';
import { CollisionWorld } from './collision';
import { CharacterRig, randomLook } from '../render/character';
import { audio } from '../audio/audio';
import { MeshBuilder } from '../render/geo';
import { makeChunkMaterial } from '../render/materials';

export class Game {
  renderer!: Renderer;
  scene = new THREE.Scene();
  camera!: ThirdPersonCamera;
  atm!: Atmosphere;
  input!: Input;
  player!: PlayerController;
  world = new CollisionWorld();
  perf!: PerfOverlay;
  hour = 9;
  time = 0;
  private last = performance.now();

  async boot(progress: (p: number) => void): Promise<void> {
    const tier = (localStorage.getItem('dg.tier') as QualityTier) || (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high');
    this.renderer = new Renderer(document.getElementById('view')!, tier);
    this.perf = new PerfOverlay(this.renderer);
    this.camera = new ThirdPersonCamera(innerWidth / innerHeight);
    this.atm = new Atmosphere(this.scene, this.renderer.quality.shadows ? this.renderer.quality.shadowSize : 0);
    this.input = new Input(this.renderer.canvas);
    progress(0.3);
    const rig = new CharacterRig(randomLook(7, { backpack: true, hairStyle: 1 }));
    this.scene.add(rig.root);
    this.player = new PlayerController(rig);
    this.player.pos.set(600, 0, 600);
    this.buildTestLot();
    progress(1);
    const unlock = () => audio.unlock();
    window.addEventListener('touchend', unlock, { once: false });
    window.addEventListener('mousedown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    requestAnimationFrame(this.frame);
  }

  private buildTestLot(): void {
    const b = new MeshBuilder({ groundAO: true });
    b.setColor(0x5b5a4c);
    b.quad([500, 0, 700], [700, 0, 700], [700, 0, 500], [500, 0, 500]);
    b.setColor(0x8a7a66);
    for (let i = 0; i < 6; i++) {
      const x = 590 + i * 9, z = 580;
      b.bevelBox(x, 2, z, 3, 2, 3, 0.15);
      this.world.add({ minX: x - 3, maxX: x + 3, minY: 0, maxY: 4, minZ: z - 3, maxZ: z + 3, tag: 'building', ref: i });
    }
    const m = new THREE.Mesh(b.toGeometry(true), makeChunkMaterial());
    m.receiveShadow = true;
    m.castShadow = true;
    this.scene.add(m);
  }

  private frame = (): void => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.input.update();
    this.camera.look(this.input.lookX, this.input.lookY);
    this.player.update(
      dt,
      {
        x: this.input.moveX,
        y: this.input.moveY,
        mag: this.input.moveMag,
        sprint: this.input.sprinting,
        jump: this.input.wasPressed('jump'),
        dodge: this.input.wasPressed('dodge'),
        camYaw: this.camera.yaw,
      },
      this.world,
    );
    if (this.input.wasPressed('dodge')) this.player.startDodge({ x: this.input.moveX, y: this.input.moveY, mag: 1, sprint: false, jump: false, dodge: true, camYaw: this.camera.yaw });
    this.player.rig.update(dt);
    this.camera.update(dt, this.player.pos, this.input.sprinting && this.input.moveMag > 0.5, this.world);
    this.atm.update(dt, this.hour, 'clear', 0.4, this.player.pos, this.camera.cam.position, this.renderer.quality.fogFar, this.time);
    this.renderer.syncSize(this.camera.cam);
    this.renderer.render(this.scene, this.camera.cam);
    const ms = performance.now() - now;
    this.renderer.adapt(ms, now);
    this.perf.frame(ms, now, { chunks: 0, chunkBuildMs: 0, entities: 1, colliders: this.world.count });
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };
}
