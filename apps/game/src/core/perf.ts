// Performance overlay (fps, frame ms, draw calls, tris, texture MB, heap)
// and the "Copy device report" button. Hidden by default; toggle in settings
// or with ?perf=1 / backquote key.
import { GAME_VERSION } from '@dg/shared';
import { errors } from './errors';
import type { Renderer } from './renderer';
import { textureBudget } from './renderer';

export interface PerfCounters {
  fps: number;
  frameMs: number;
  worstMs: number;
  calls: number;
  tris: number;
  geometries: number;
  textures: number;
  textureMB: number;
  heapMB: number | null;
  dpr: number;
  tier: string;
  chunks: number;
  chunkBuildMs: number;
  entities: number;
  colliders: number;
}

export class PerfOverlay {
  readonly el: HTMLDivElement;
  private text: HTMLPreElement;
  visible = false;
  counters: PerfCounters = {
    fps: 0, frameMs: 0, worstMs: 0, calls: 0, tris: 0, geometries: 0, textures: 0, textureMB: 0,
    heapMB: null, dpr: 1, tier: '', chunks: 0, chunkBuildMs: 0, entities: 0, colliders: 0,
  };
  private frames = 0;
  private acc = 0;
  private worst = 0;
  private lastUpdate = 0;
  peak = { calls: 0, tris: 0, textureMB: 0, heapMB: 0, chunkBuildMs: 0 };
  extra: () => Record<string, string | number> = () => ({});

  constructor(private renderer: Renderer) {
    this.el = document.createElement('div');
    this.el.className = 'perf';
    this.text = document.createElement('pre');
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = 'Copy device report';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.copyReport(btn);
    });
    btn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.el.append(this.text, btn);
    this.el.style.display = 'none';
    document.getElementById('ui')!.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') this.toggle();
    });
    if (new URLSearchParams(location.search).has('perf')) this.toggle(true);
  }

  toggle(on = !this.visible): void {
    this.visible = on;
    this.el.style.display = on ? 'block' : 'none';
  }

  frame(ms: number, now: number, extra: { chunks: number; chunkBuildMs: number; entities: number; colliders: number }): void {
    this.frames++;
    this.acc += ms;
    this.worst = Math.max(this.worst, ms);
    const s = this.renderer.stats();
    const c = this.counters;
    c.calls = s.calls;
    c.tris = s.tris;
    c.geometries = s.geometries;
    c.textures = s.textures;
    c.chunks = extra.chunks;
    c.chunkBuildMs = extra.chunkBuildMs;
    c.entities = extra.entities;
    c.colliders = extra.colliders;
    this.peak.calls = Math.max(this.peak.calls, s.calls);
    this.peak.tris = Math.max(this.peak.tris, s.tris);
    this.peak.chunkBuildMs = Math.max(this.peak.chunkBuildMs, extra.chunkBuildMs);
    if (now - this.lastUpdate > 500) {
      c.fps = Math.round((this.frames * 1000) / (now - this.lastUpdate));
      c.frameMs = +(this.acc / Math.max(1, this.frames)).toFixed(1);
      c.worstMs = +this.worst.toFixed(1);
      c.textureMB = +textureBudget.mb.toFixed(1);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      c.heapMB = mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null;
      c.dpr = this.renderer.dpr;
      c.tier = this.renderer.quality.tier;
      this.peak.textureMB = Math.max(this.peak.textureMB, c.textureMB);
      if (c.heapMB) this.peak.heapMB = Math.max(this.peak.heapMB, c.heapMB);
      this.frames = 0;
      this.acc = 0;
      this.worst = 0;
      this.lastUpdate = now;
      if (this.visible) {
        const ex = this.extra();
        this.text.textContent =
          `${c.fps} fps  ${c.frameMs} ms (worst ${c.worstMs})\n` +
          `calls ${c.calls}  tris ${(c.tris / 1000).toFixed(0)}k\n` +
          `geo ${c.geometries}  tex ${c.textures} (${c.textureMB} MB)\n` +
          `heap ${c.heapMB ?? 'n/a'} MB  dpr ${c.dpr}  ${c.tier}\n` +
          `chunks ${c.chunks}  build ${c.chunkBuildMs.toFixed(1)} ms\n` +
          `ents ${c.entities}  cols ${c.colliders}\n` +
          Object.entries(ex).map(([k, v]) => `${k} ${v}`).join('\n');
      }
    }
  }

  report(): string {
    const c = this.counters;
    const gl = this.renderer.gl.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return [
      `DORMANT GRID device report — v${GAME_VERSION}`,
      `time: ${new Date().toISOString()}`,
      `ua: ${navigator.userAgent}`,
      `gpu: ${gpu}`,
      `screen: ${screen.width}x${screen.height} @${devicePixelRatio}  viewport ${innerWidth}x${innerHeight}`,
      `standalone: ${matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true}`,
      `fps ${c.fps}  frame ${c.frameMs} ms  worst ${c.worstMs} ms`,
      `calls ${c.calls} (peak ${this.peak.calls})  tris ${c.tris} (peak ${this.peak.tris})`,
      `textures ${c.textures}  textureMB ${c.textureMB} (peak ${this.peak.textureMB})`,
      `heapMB ${c.heapMB ?? 'n/a'} (peak ${this.peak.heapMB || 'n/a'})`,
      `dpr ${c.dpr}  tier ${c.tier}  chunks ${c.chunks}  chunkBuildMs peak ${this.peak.chunkBuildMs.toFixed(1)}`,
      `maxTextureSize ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`,
      ...Object.entries(this.extra()).map(([k, v]) => `${k}: ${v}`),
      `errors (${errors.count}):`,
      ...errors.items.slice(-25),
    ].join('\n');
  }

  async copyReport(btn?: HTMLElement): Promise<void> {
    const text = this.report();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // fallback: textarea + execCommand (older iOS)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = ok ? 'Copied ✓' : 'Copy failed — long-press to select';
      setTimeout(() => (btn.textContent = old), 1800);
    }
  }
}
