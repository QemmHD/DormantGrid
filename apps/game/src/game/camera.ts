// Third-person over-shoulder orbit camera: collision-aware, eased, with
// trauma-based shake (Nijman) and FOV kicks. Respects reduce-shake.
import * as THREE from 'three';
import type { CollisionWorld } from './collision';

export class ThirdPersonCamera {
  readonly cam: THREE.PerspectiveCamera;
  yaw = Math.PI; // facing -z initially (camera behind looking forward)
  pitch = -0.3;
  distance = 5;
  /** zoom limits */
  minDist = 2.4;
  maxDist = 8;
  private curDist = 5;
  /** look targets; actual yaw/pitch ease toward them (≈30 ms) to remove touch jitter */
  private tYaw = Math.PI;
  private tPitch = -0.3;
  /** fraction 0..1: how close the camera is to the player (for fading the player mesh) */
  closeness = 0;
  /** subtle head-bob driver set by the game (0 when still) */
  bob = 0;
  private bobPhase = 0;
  shoulder = 0.7;
  private trauma = 0;
  private fovKick = 0;
  private baseFov = 62;
  reduceShake = false;
  private focus = new THREE.Vector3();
  private smoothFocus = new THREE.Vector3();
  private initialized = false;
  private tmp = new THREE.Vector3();
  private time = 0;
  /** for cinematic overrides */
  override: { pos: THREE.Vector3; look: THREE.Vector3; t: number } | null = null;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 1200);
  }

  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t * (this.reduceShake ? 0.25 : 1));
  }
  kickFov(deg: number): void {
    this.fovKick = Math.max(this.fovKick, deg);
  }

  look(dx: number, dy: number): void {
    this.tYaw -= dx * 0.0042;
    this.tPitch = THREE.MathUtils.clamp(this.tPitch - dy * 0.0042, -1.1, 0.5);
  }

  zoomBy(d: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + d, this.minDist, this.maxDist);
  }

  /** Snap look targets to the current orientation (after code sets yaw/pitch directly). */
  syncTargets(): void {
    this.tYaw = this.yaw;
    this.tPitch = this.pitch;
  }

  private lastYaw = Math.PI;
  private lastPitch = -0.3;

  update(dt: number, target: THREE.Vector3, sprinting: boolean, world: CollisionWorld | null): void {
    this.time += dt;
    // external code may set yaw/pitch directly (intro, teleports); follow it
    if (this.yaw !== this.lastYaw) this.tYaw += this.yaw - this.lastYaw;
    if (this.pitch !== this.lastPitch) this.tPitch = this.pitch;
    const kl = 1 - Math.exp(-dt * 32);
    this.yaw += (this.tYaw - this.yaw) * kl;
    this.pitch += (this.tPitch - this.pitch) * kl;
    this.lastYaw = this.yaw;
    this.lastPitch = this.pitch;
    this.bobPhase += dt * (6 + this.bob * 5);
    this.focus.set(target.x, target.y + 1.55, target.z);
    if (!this.initialized) {
      this.smoothFocus.copy(this.focus);
      this.initialized = true;
    }
    // critically-damped-ish follow (tighter horizontally)
    const kxz = 1 - Math.exp(-dt * 14);
    const ky = 1 - Math.exp(-dt * 8);
    this.smoothFocus.x += (this.focus.x - this.smoothFocus.x) * kxz;
    this.smoothFocus.z += (this.focus.z - this.smoothFocus.z) * kxz;
    this.smoothFocus.y += (this.focus.y - this.smoothFocus.y) * ky;

    const cp = Math.cos(this.pitch);
    const dir = this.tmp.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // shoulder offset to the right of view
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    const fx = this.smoothFocus.x + rx * this.shoulder;
    const fz = this.smoothFocus.z + rz * this.shoulder;
    // very subtle head-bob/sway while moving (scaled down further with reduce-shake)
    const bobK = this.bob * (this.reduceShake ? 0.3 : 1);
    const fy = this.smoothFocus.y + Math.sin(this.bobPhase * 2) * 0.03 * bobK;
    let want = this.distance + (sprinting ? 0.5 : 0);
    if (world) {
      // thick ray: center + 4 offsets approximates a sphere so the lens never pokes through walls
      let hit = 1;
      const ux = -rz * 0.22, uz = rx * 0.22;
      const offs = [[0, 0, 0], [rx * 0.25, 0, rz * 0.25], [-rx * 0.25, 0, -rz * 0.25], [0, 0.25, 0], [ux * 0, -0.2, 0]];
      for (const [ox, oy, oz] of offs) {
        const tx = fx - dir.x * want + ox, ty = fy - dir.y * want + oy, tz = fz - dir.z * want + oz;
        hit = Math.min(hit, world.raycast(fx + ox * 0.3, fy + oy * 0.3, fz + oz * 0.3, tx, ty, tz, 'nocam'));
      }
      void uz;
      if (hit < 1) want = Math.max(0.9, want * hit - 0.3);
    }
    // pull in fast, ease out slow
    this.curDist += (want - this.curDist) * (want < this.curDist ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 4));
    const d = this.curDist;
    this.closeness = THREE.MathUtils.clamp(1 - (d - 0.9) / 1.1, 0, 1);
    const sway = Math.sin(this.bobPhase) * 0.02 * bobK;
    this.cam.position.set(fx - dir.x * d + rx * sway, Math.max(0.3, fy - dir.y * d), fz - dir.z * d + rz * sway);
    this.cam.lookAt(fx, fy, fz);

    if (this.override) {
      this.override.t = Math.min(1, this.override.t + dt * 0.8);
      const e = this.override.t * this.override.t * (3 - 2 * this.override.t);
      this.cam.position.lerp(this.override.pos, e);
      const lookAt = this.tmp.set(fx, fy, fz).lerp(this.override.look, e);
      this.cam.lookAt(lookAt);
    }

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.time * 38;
      this.cam.rotation.z += (Math.sin(t * 1.1) * 0.5 + Math.sin(t * 2.3) * 0.5) * 0.05 * s;
      this.cam.rotateX((Math.sin(t * 1.7 + 3) * 0.5 + Math.sin(t * 3.1) * 0.5) * 0.03 * s);
      this.cam.rotateY((Math.sin(t * 1.3 + 7) * 0.5 + Math.sin(t * 2.9) * 0.5) * 0.03 * s);
    }
    // FOV
    this.fovKick = Math.max(0, this.fovKick - dt * 22);
    const fov = this.baseFov + (sprinting ? 5 : 0) + this.fovKick;
    if (Math.abs(this.cam.fov - fov) > 0.05) {
      this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 8);
      this.cam.updateProjectionMatrix();
    }
  }

  /** forward vector on XZ plane */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}
