// Tier B audio: recorded files by stable ID (assets/audio-registry.json → ingest →
// models/manifest.json). Nothing is downloaded unless the manifest lists audio; each file
// is fetched and decoded on first use. The synthesized sounds stay the fallback.
export interface AudioRuntime {
  sfx?: string;
  amb?: string;
  music?: string;
  pending?: string;
}
interface ManifestEntry {
  kind?: string;
  path?: string;
  audioId?: string;
  runtime?: AudioRuntime;
}

export class AudioFiles {
  /** Sfx name → variant URLs */
  readonly sfx = new Map<string, string[]>();
  readonly amb = new Map<string, string[]>();
  readonly music = new Map<string, string[]>();
  private buffers = new Map<string, AudioBuffer | 'loading' | 'error'>();
  loaded = false;
  /** ids present in the manifest that nothing plays yet (runtime.pending) */
  pending: string[] = [];

  /** Read the asset manifest; resolves with the number of playable files. */
  async load(base: string, fetchImpl: typeof fetch = fetch): Promise<number> {
    let manifest: { assets?: Record<string, ManifestEntry> };
    try {
      const r = await fetchImpl(`${base}models/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return 0;
      manifest = (await r.json()) as typeof manifest;
    } catch {
      return 0;
    }
    let n = 0;
    for (const e of Object.values(manifest.assets ?? {})) {
      if (e.kind !== 'audio' || !e.path || !e.runtime) continue;
      const url = `${base}models/${e.path}`;
      const add = (m: Map<string, string[]>, k: string) => {
        const l = m.get(k) ?? [];
        l.push(url);
        m.set(k, l);
        n++;
      };
      if (e.runtime.sfx) add(this.sfx, e.runtime.sfx);
      else if (e.runtime.amb) add(this.amb, e.runtime.amb);
      else if (e.runtime.music) add(this.music, e.runtime.music);
      else if (e.audioId) this.pending.push(e.audioId);
    }
    this.loaded = true;
    return n;
  }

  /** A decoded buffer for one of the URLs (random variant), or null while it loads / if it failed. */
  get(ctx: BaseAudioContext, urls: string[]): AudioBuffer | null {
    const url = urls[Math.floor(Math.random() * urls.length)];
    const b = this.buffers.get(url);
    if (b && b !== 'loading' && b !== 'error') return b;
    if (!b) void this.decode(ctx, url);
    // fall back to any variant that is already decoded
    for (const u of urls) {
      const x = this.buffers.get(u);
      if (x && x !== 'loading' && x !== 'error') return x;
    }
    return null;
  }

  /** decode every short sound up front (after the audio unlock) */
  warm(ctx: BaseAudioContext): void {
    for (const urls of this.sfx.values()) for (const u of urls) if (!this.buffers.has(u)) void this.decode(ctx, u);
  }

  private async decode(ctx: BaseAudioContext, url: string): Promise<void> {
    this.buffers.set(url, 'loading');
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.arrayBuffer();
      this.buffers.set(url, await ctx.decodeAudioData(data));
    } catch {
      this.buffers.set(url, 'error');
    }
  }
}
