// Third-person over-shoulder orbit camera: collision-aware, eased, with
// trauma-based shake (Nijman) and FOV kicks. Respects reduce-shake.
import * as THREE from 'three';
import type { CollisionWorld } from './collision';

export class ThirdPersonCamera {
  readonly cam: THREE.PerspectiveCamera;
  yaw = Math.PI; // facing -z initially (camera behind looking forward)
  pitch = -0.22;
  distance = 4.4;
  private curDist = 4.4;
  shoulder = 0.55;
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
    this.yaw -= dx * 0.0042;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0034, -1.15, 0.55);
  }

  update(dt: number, target: THREE.Vector3, sprinting: boolean, world: CollisionWorld | null): void {
    this.time += dt;
    this.focus.set(target.x, target.y + 1.55, target.z);
    if (!this.initialized) {
      this.smoothFocus.copy(this.focus);
      this.initialized = true;
    }
    // critically-damped-ish follow (tighter horizontally)
    const kxz = 1 - Math.exp(-dt * 18);
    const ky = 1 - Math.exp(-dt * 9);
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
    const fy = this.smoothFocus.y;
    let want = this.distance + (sprinting ? 0.5 : 0);
    if (world) {
      const tx = fx - dir.x * want, ty = fy - dir.y * want, tz = fz - dir.z * want;
      const hit = world.raycast(fx, fy, fz, tx, ty, tz, 'prop');
      if (hit < 1) want = Math.max(0.6, want * hit - 0.25);
    }
    // pull in fast, ease out slow
    this.curDist += (want - this.curDist) * (want < this.curDist ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 4));
    const d = this.curDist;
    this.cam.position.set(fx - dir.x * d, Math.max(0.3, fy - dir.y * d), fz - dir.z * d);
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
