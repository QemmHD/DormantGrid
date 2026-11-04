// Renderer abstraction. Owns the WebGL2 renderer, adaptive resolution, quality
// tiers and GL context-loss handling. Game code never touches the canvas size.
import * as THREE from 'three';
import { errors } from './errors';

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  shadows: boolean;
  shadowSize: number;
  maxDpr: number;
  detailRadius: number; // streaming cells with full detail
  lodRadius: number; // streaming cells with low detail
  fogFar: number;
  propDensity: number; // 0..1 fraction of small props shown
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: { tier: 'low', shadows: false, shadowSize: 512, maxDpr: 1.0, detailRadius: 1, lodRadius: 2, fogFar: 190, propDensity: 0.55 },
  medium: { tier: 'medium', shadows: true, shadowSize: 1024, maxDpr: 1.25, detailRadius: 1, lodRadius: 3, fogFar: 250, propDensity: 0.8 },
  high: { tier: 'high', shadows: true, shadowSize: 2048, maxDpr: 1.5, detailRadius: 2, lodRadius: 3, fogFar: 320, propDensity: 1 },
};

// Coarse DPR steps. iOS leaks memory when the drawing buffer is resized often,
// so we change at most every few seconds and cap total changes per session.
const DPR_STEPS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3, 1.5];
const MAX_DPR_CHANGES = 14;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  quality: QualitySettings;
  contextLost = false;
  onContextRestored: (() => void) | null = null;
  onQualityChange: ((q: QualitySettings) => void) | null = null;
  autoQuality = true;

  private dprIndex = 3;
  private dprChanges = 0;
  private lastDprChange = 0;
  private frameMsAvg = 16.7;
  private slowFrames = 0;
  private fastFrames = 0;
  private width = 0;
  private height = 0;
  private resizePending = true;
  fpsCap = 60;

  constructor(container: HTMLElement, tier: QualityTier) {
    this.quality = { ...QUALITY[tier] };
    this.gl = new THREE.WebGLRenderer({
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    this.canvas = this.gl.domElement;
    this.canvas.id = 'gl';
    container.appendChild(this.canvas);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = this.quality.shadows;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.info.autoReset = false;
    const startDpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
    this.dprIndex = closestStep(startDpr);
    this.gl.setPixelRatio(DPR_STEPS[this.dprIndex]);

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      errors.push('webglcontextlost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      errors.push('webglcontextrestored');
      this.resizePending = true;
      this.onContextRestored?.();
    });
    window.addEventListener('resize', () => (this.resizePending = true));
    window.addEventListener('orientationchange', () => (this.resizePending = true));
  }

  get dpr(): number {
    return DPR_STEPS[this.dprIndex];
  }

  /** Call once per frame before rendering. Only resizes when the layout really changed. */
  syncSize(camera: THREE.PerspectiveCamera): void {
    if (!this.resizePending) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.resizePending = false;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** Feed the last frame's CPU+GPU-ish time to drive adaptive resolution and quality. */
  adapt(frameMs: number, now: number): void {
    this.frameMsAvg = this.frameMsAvg * 0.95 + frameMs * 0.05;
    const target = 1000 / this.fpsCap;
    if (this.frameMsAvg > target * 1.25) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else if (this.frameMsAvg < target * 0.8) {
      this.fastFrames++;
      this.slowFrames = 0;
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = Math.max(0, this.fastFrames - 1);
    }
    if (now - this.lastDprChange < 4000 || this.dprChanges >= MAX_DPR_CHANGES) return;
    if (this.slowFrames > 90) {
      if (this.dprIndex > 0) this.setDprIndex(this.dprIndex - 1, now);
      else if (this.autoQuality && this.quality.tier !== 'low') this.downgrade();
      this.slowFrames = 0;
    } else if (this.fastFrames > 300) {
      const maxIdx = closestStep(Math.min(this.quality.maxDpr, window.devicePixelRatio || 1));
      if (this.dprIndex < maxIdx) this.setDprIndex(this.dprIndex + 1, now);
      this.fastFrames = 0;
    }
  }

  get avgFrameMs(): number {
    return this.frameMsAvg;
  }

  downgrade(): void {
    const next: QualityTier = this.quality.tier === 'high' ? 'medium' : 'low';
    this.setTier(next);
    errors.push(`auto-downgrade to ${next}`);
  }

  setTier(tier: QualityTier): void {
    this.quality = { ...QUALITY[tier] };
    this.gl.shadowMap.enabled = this.quality.shadows;
    const maxIdx = closestStep(Math.min(this.quality.maxDpr, window.devicePixelRatio || 1));
    if (this.dprIndex > maxIdx) this.setDprIndex(maxIdx, performance.now());
    this.onQualityChange?.(this.quality);
  }

  private setDprIndex(i: number, now: number): void {
    this.dprIndex = i;
    this.dprChanges++;
    this.lastDprChange = now;
    this.gl.setPixelRatio(DPR_STEPS[i]);
    this.width = 0; // force size refresh on next sync
    this.resizePending = true;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.contextLost) return;
    this.gl.info.reset();
    this.gl.render(scene, camera);
  }

  stats(): { calls: number; tris: number; geometries: number; textures: number; programs: number } {
    const i = this.gl.info;
    return {
      calls: i.render.calls,
      tris: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      programs: i.programs?.length ?? 0,
    };
  }
}

function closestStep(v: number): number {
  let best = 0;
  for (let i = 0; i < DPR_STEPS.length; i++) if (Math.abs(DPR_STEPS[i] - v) < Math.abs(DPR_STEPS[best] - v)) best = i;
  return best;
}

/** Tracks approximate GPU texture memory for textures we create. */
class TextureBudget {
  private map = new Map<THREE.Texture, number>();
  track(t: THREE.Texture, w: number, h: number, bytesPerPixel = 4, mips = true): THREE.Texture {
    this.map.set(t, w * h * bytesPerPixel * (mips ? 1.34 : 1));
    t.addEventListener('dispose', () => this.map.delete(t));
    return t;
  }
  get mb(): number {
    let s = 0;
    for (const v of this.map.values()) s += v;
    return s / (1024 * 1024);
  }
}
export const textureBudget = new TextureBudget();
