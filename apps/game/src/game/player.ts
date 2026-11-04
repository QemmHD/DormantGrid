// Kinematic third-person character controller with coyote time, jump buffer,
// dodge, acceleration curves and camera-relative movement.
import * as THREE from 'three';
import type { CollisionWorld } from './collision';
import { CharacterRig } from '../render/character';

export interface MoveIntent {
  x: number; // right
  y: number; // forward
  mag: number;
  sprint: boolean;
  jump: boolean;
  dodge: boolean;
  camYaw: number;
}

export class PlayerController {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = Math.PI;
  grounded = true;
  radius = 0.36;
  height = 1.75;
  stepHeight = 0.45;
  walkSpeed = 3.4;
  runSpeed = 6.0;
  /** multiplier from limp/encumbrance */
  speedMul = 1;
  canSprint = true;
  private coyote = 0;
  private jumpBuf = 0;
  private dodgeT = 0;
  private dodgeDir = new THREE.Vector3();
  dodgeCooldown = 0;
  locked = false; // e.g. while in a menu or attacking heavy
  /** ground height fn (terrain) */
  terrain: (x: number, z: number) => number = () => 0;
  /** world bounds */
  bounds = { min: 2, max: 1214 };
  /** last fall speed on landing (for feedback) */
  landImpact = 0;
  onLand: ((speed: number) => void) | null = null;
  onStep: ((run: boolean) => void) | null = null;
  private stepPhase = 0;

  constructor(readonly rig: CharacterRig) {}

  get dodging(): boolean {
    return this.dodgeT > 0;
  }

  startDodge(intent: MoveIntent): boolean {
    if (this.dodgeCooldown > 0 || !this.grounded) return false;
    const f = new THREE.Vector3(Math.sin(intent.camYaw), 0, Math.cos(intent.camYaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    this.dodgeDir.set(0, 0, 0).addScaledVector(f, intent.y).addScaledVector(r, intent.x);
    if (this.dodgeDir.lengthSq() < 0.01) this.dodgeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    this.dodgeDir.normalize();
    this.dodgeT = 0.42;
    this.dodgeCooldown = 0.7;
    this.rig.setState('dodge');
    return true;
  }

  update(dt: number, intent: MoveIntent, world: CollisionWorld | null): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    const f = new THREE.Vector3(Math.sin(intent.camYaw), 0, Math.cos(intent.camYaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3().addScaledVector(f, intent.y).addScaledVector(r, intent.x);
    const sprint = intent.sprint && this.canSprint && intent.mag > 0.5;
    const speed = (sprint ? this.runSpeed : this.walkSpeed) * this.speedMul * (this.locked ? 0 : 1);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed * Math.min(1, intent.mag * 1.15));

    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const k = Math.max(0, this.dodgeT / 0.42);
      want.copy(this.dodgeDir).multiplyScalar(9.5 * (0.35 + k * 0.9));
      this.vel.x = want.x;
      this.vel.z = want.z;
      this.yaw = Math.atan2(-this.dodgeDir.x, -this.dodgeDir.z) + Math.PI;
    } else {
      const accel = this.grounded ? (want.lengthSq() > 0.01 ? 14 : 18) : 4;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (want.x - this.vel.x) * k;
      this.vel.z += (want.z - this.vel.z) * k;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 0.2 && want.lengthSq() > 0.01) {
        const targetYaw = Math.atan2(this.vel.x, this.vel.z);
        let d = targetYaw - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 12);
      }
    }

    // jump with coyote time + buffer
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    this.jumpBuf = intent.jump ? 0.15 : Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.locked) {
      this.vel.y = 5.6;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
    }
    this.vel.y -= 16 * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.x = Math.min(this.bounds.max, Math.max(this.bounds.min, this.pos.x));
    this.pos.z = Math.min(this.bounds.max, Math.max(this.bounds.min, this.pos.z));

    let ground = this.terrain(this.pos.x, this.pos.z);
    if (world) {
      const res = world.resolve(this.pos, this.radius, this.height, this.stepHeight);
      if (res.ground > ground) ground = res.ground;
      if (this.pos.y + this.height > res.ceiling && this.vel.y > 0) this.vel.y = 0;
    }
    const wasGrounded = this.grounded;
    if (this.pos.y <= ground + 0.02 && this.vel.y <= 0) {
      if (!wasGrounded && this.vel.y < -4) {
        this.landImpact = -this.vel.y;
        this.onLand?.(-this.vel.y);
      }
      // smooth step-up
      if (ground - this.pos.y > 0.05 && ground - prevY < this.stepHeight + 0.05) this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 20);
      else this.pos.y = ground;
      if (this.pos.y < ground - 0.3) this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.25) {
      this.grounded = false;
    } else if (this.vel.y <= 0) {
      // snap down small drops (stairs/curbs)
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    }

    // rig
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.rig.speed = this.grounded ? hs : hs * 0.4;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    if (this.grounded && hs > 0.5) {
      this.stepPhase += dt * (2.2 + hs * 1.25);
      if (this.stepPhase > Math.PI) {
        this.stepPhase -= Math.PI;
        this.onStep?.(hs > 4.5);
      }
    }
  }
}
