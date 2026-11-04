// Atmosphere: sky dome, sun/moon light, hemisphere fill, fog, rain, lightning.
// Light is the hero: ruins read cold blue-gray, restored areas warm amber.
import * as THREE from 'three';

export type Weather = 'clear' | 'overcast' | 'rain' | 'fog' | 'storm';

interface Key {
  h: number;
  top: number;
  horizon: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
}

// Hour keyframes (muted, desaturated).
const KEYS: Key[] = [
  { h: 0, top: 0x060a12, horizon: 0x142030, sun: 0x7f96c0, sunI: 0.42, hemiSky: 0x34466a, hemiGround: 0x14161c, hemiI: 0.95 },
  { h: 4.5, top: 0x080c14, horizon: 0x18242e, sun: 0x7f96c0, sunI: 0.38, hemiSky: 0x34466a, hemiGround: 0x14161c, hemiI: 0.9 },
  { h: 6, top: 0x2c3a52, horizon: 0xc58a62, sun: 0xffb27a, sunI: 0.9, hemiSky: 0x6a7a92, hemiGround: 0x3a3228, hemiI: 0.82 },
  { h: 8, top: 0x4f6e8e, horizon: 0xa9b4b8, sun: 0xfff0d8, sunI: 1.9, hemiSky: 0xa4b4c6, hemiGround: 0x5a5346, hemiI: 1.05 },
  { h: 13, top: 0x4d6f92, horizon: 0xb7c2c6, sun: 0xfff6e8, sunI: 2.25, hemiSky: 0xaebdcf, hemiGround: 0x625a4c, hemiI: 1.1 },
  { h: 17, top: 0x4a6382, horizon: 0xc9a27e, sun: 0xffd1a0, sunI: 1.8, hemiSky: 0xa0abba, hemiGround: 0x5a4c40, hemiI: 1.0 },
  { h: 19, top: 0x26304a, horizon: 0xd0784e, sun: 0xff9a5a, sunI: 0.95, hemiSky: 0x6e6e8a, hemiGround: 0x3a2e28, hemiI: 0.82 },
  { h: 20.5, top: 0x0b111c, horizon: 0x2a2a3a, sun: 0x8a96c0, sunI: 0.4, hemiSky: 0x34466a, hemiGround: 0x14161c, hemiI: 0.9 },
  { h: 24, top: 0x060a12, horizon: 0x142030, sun: 0x7f96c0, sunI: 0.42, hemiSky: 0x34466a, hemiGround: 0x14161c, hemiI: 0.95 },
];

const cA = new THREE.Color();
const cB = new THREE.Color();
const COLD = new THREE.Color(0x8fa3b8);
const WARM = new THREE.Color(0xffc48a);
const GREY = new THREE.Color(0x8a9096);

function lerpKey(hour: number, field: keyof Omit<Key, 'h' | 'sunI' | 'hemiI'>, out: THREE.Color): THREE.Color {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  cA.setHex(a[field]);
  cB.setHex(b[field]);
  return out.copy(cA).lerp(cB, t);
}
function lerpNum(hour: number, field: 'sunI' | 'hemiI'): number {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  return a[field] + (b[field] - a[field]) * t;
}

export class Atmosphere {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.8);
  readonly fog: THREE.Fog;
  readonly sky: THREE.Mesh;
  private skyU = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color(0x1a1d20) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uNight: { value: 0 },
    uCloud: { value: 0 },
    uTime: { value: 0 },
  };
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainCount = 900;
  /** 0 = night, 1 = full day */
  daylight = 1;
  /** smoothed weather values */
  private wet = 0;
  private cloud = 0;
  private fogK = 0;
  private flash = 0;
  private nextFlash = 5;
  onLightning: (() => void) | null = null;
  readonly sunDir = new THREE.Vector3();
  private moonDir = new THREE.Vector3();

  constructor(private scene: THREE.Scene, shadowSize: number) {
    this.fog = new THREE.Fog(0x9aa4aa, 40, 260);
    scene.fog = this.fog;
    scene.add(this.hemi);
    this.sun.castShadow = shadowSize > 0;
    this.sun.shadow.mapSize.set(shadowSize || 512, shadowSize || 512);
    const sc = this.sun.shadow.camera;
    sc.left = -38;
    sc.right = 38;
    sc.top = 38;
    sc.bottom = -38;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    const skyGeo = new THREE.SphereGeometry(900, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform float uNight; uniform float uCloud; uniform float uTime;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
          col = mix(col, uGround, smoothstep(0.0, -0.18, h));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25) * (1.0 - uCloud*0.85);
          // moon opposite the sun at night
          float md = max(dot(d, -uSunDir), 0.0);
          col += vec3(0.75,0.82,0.95) * pow(md, 1600.0) * 3.0 * uNight;
          // stars
          if (h > 0.0) {
            vec3 sp = floor(d * 420.0);
            float s = hash(sp);
            col += vec3(0.9,0.92,1.0) * step(0.9975, s) * uNight * (1.0-uCloud) * smoothstep(0.0,0.25,h) * (0.6+0.4*sin(uTime*2.0+s*50.0));
          }
          // cheap cloud banding
          float band = sin(d.x*7.0 + uTime*0.01) * sin(d.z*5.0 - uTime*0.013) * 0.5 + 0.5;
          col = mix(col, mix(uHorizon, vec3(dot(uHorizon, vec3(0.33))), 0.5) * 0.95, uCloud * smoothstep(0.02, 0.4, h) * (0.55 + 0.45*band));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // Rain streaks around the camera
    this.rainPos = new Float32Array(this.rainCount * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({ color: 0xaab8c4, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    for (let i = 0; i < this.rainCount; i++) this.resetDrop(i, 0, 0, 0, true);
    scene.add(this.rain);
  }

  private resetDrop(i: number, cx: number, cy: number, cz: number, anyY: boolean): void {
    const x = cx + (Math.random() - 0.5) * 40;
    const z = cz + (Math.random() - 0.5) * 40;
    const y = cy + (anyY ? Math.random() * 22 : 22) - 4;
    const p = this.rainPos;
    p[i * 6] = x;
    p[i * 6 + 1] = y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.08;
    p[i * 6 + 4] = y - 0.7;
    p[i * 6 + 5] = z + 0.04;
  }

  /**
   * @param hour game hour (0..24 wraps)
   * @param weather current weather
   * @param warmth 0 cold ruin .. 1 warm restored (local district)
   */
  update(dt: number, hour: number, weather: Weather, warmth: number, focus: THREE.Vector3, camPos: THREE.Vector3, fogFar: number, time: number): void {
    const h = ((hour % 24) + 24) % 24;
    // sun path: rises ~6, sets ~19.5
    const dayT = (h - 6) / 13.5; // 0..1 across the day
    const ang = dayT * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.8, Math.max(-0.4, elev), 0.45).normalize();
    const isDay = elev > -0.05;
    this.daylight = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);

    // weather smoothing
    const tgtWet = weather === 'rain' ? 1 : weather === 'storm' ? 1 : 0;
    const tgtCloud = weather === 'clear' ? 0.05 : weather === 'fog' ? 0.6 : weather === 'overcast' ? 0.7 : 0.9;
    const tgtFog = weather === 'fog' ? 1 : weather === 'storm' ? 0.45 : weather === 'rain' ? 0.3 : weather === 'overcast' ? 0.12 : 0;
    const k = Math.min(1, dt * 0.25);
    this.wet += (tgtWet - this.wet) * k;
    this.cloud += (tgtCloud - this.cloud) * k;
    this.fogK += (tgtFog - this.fogK) * k;

    const top = lerpKey(h, 'top', this.skyU.uTop.value);
    const hor = lerpKey(h, 'horizon', this.skyU.uHorizon.value);
    // overcast desaturates toward grey
    cA.copy(GREY).multiplyScalar(0.25 + this.daylight * 0.75);
    top.lerp(cA, this.cloud * 0.6);
    hor.lerp(cA, this.cloud * 0.5);
    this.skyU.uSunDir.value.copy(this.sunDir);
    lerpKey(h, 'sun', this.skyU.uSunCol.value);
    this.skyU.uNight.value = 1 - this.daylight;
    this.skyU.uCloud.value = this.cloud;
    this.skyU.uTime.value = time;
    this.sky.position.copy(camPos);

    // lights
    const sunI = lerpNum(h, 'sunI') * (1 - this.cloud * 0.55);
    lerpKey(h, 'sun', this.sun.color);
    // grade: cold in ruins, warm in restored
    this.sun.color.lerp(warmth > 0.5 ? WARM : COLD, Math.abs(warmth - 0.5) * 0.5);
    this.sun.intensity = sunI * 1.45;
    lerpKey(h, 'hemiSky', this.hemi.color);
    this.hemi.color.lerp(warmth > 0.5 ? WARM : COLD, Math.abs(warmth - 0.5) * 0.35);
    lerpKey(h, 'hemiGround', this.hemi.groundColor);
    this.hemi.intensity = lerpNum(h, "hemiI") * 3.1 * (1 + this.cloud * 0.15);

    // the shadow-casting light follows the focus point; at night it is the moon
    const L = isDay ? this.sunDir : this.moonDir.set(-this.sunDir.x, Math.max(0.35, -this.sunDir.y), this.sunDir.z).normalize();
    // snap shadow camera to texel grid to avoid shimmering
    const texel = 76 / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.position.set(fx + L.x * 70, focus.y + L.y * 70, fz + L.z * 70);
    this.sun.target.position.set(fx, focus.y, fz);

    // fog
    this.fog.color.copy(hor).lerp(top, 0.15);
    const far = fogFar * (1 - this.fogK * 0.62);
    this.fog.far = far;
    this.fog.near = Math.max(8, far * (0.18 - this.fogK * 0.12));

    // rain
    this.rain.visible = this.wet > 0.05;
    if (this.rain.visible) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.32 * this.wet;
      const p = this.rainPos;
      const fall = dt * 24;
      for (let i = 0; i < this.rainCount; i++) {
        p[i * 6 + 1] -= fall;
        p[i * 6 + 4] -= fall;
        if (p[i * 6 + 4] < camPos.y - 8 || Math.abs(p[i * 6] - camPos.x) > 22 || Math.abs(p[i * 6 + 2] - camPos.z) > 22) this.resetDrop(i, camPos.x, camPos.y, camPos.z, false);
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // lightning
    if (weather === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = 6 + Math.random() * 14;
        this.onLightning?.();
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3);
      const f = this.flash * (0.6 + 0.4 * Math.sin(time * 60));
      this.hemi.intensity += f * 2.2;
      this.skyU.uTop.value.addScalar(f * 0.4);
    }
  }

  get wetness(): number {
    return this.wet;
  }

  setShadows(size: number): void {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }
}
