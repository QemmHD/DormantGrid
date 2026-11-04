// Procedural Web Audio engine: synthesized SFX (layered, pitch-varied),
// ambience beds driven by world state, and adaptive generative music.
// No decoded files needed; Tier B audio can override by id later.

export type Sfx =
  | 'step'
  | 'stepHard'
  | 'stepWet'
  | 'hitWood'
  | 'hitMetal'
  | 'hitStone'
  | 'hitGlass'
  | 'hitFlesh'
  | 'break'
  | 'breakBig'
  | 'pickup'
  | 'craft'
  | 'place'
  | 'deny'
  | 'click'
  | 'open'
  | 'close'
  | 'jump'
  | 'land'
  | 'swing'
  | 'hurt'
  | 'eat'
  | 'drink'
  | 'thunder'
  | 'collapse'
  | 'powerUp'
  | 'alarm'
  | 'node'
  | 'levelUp'
  | 'drone'
  | 'shot'
  | 'bow';

const MAX_VOICES = 24;

interface MusicState {
  danger: number; // 0..1
  warmth: number; // 0..1
  night: number; // 0..1
  combat: number; // 0..1
}

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private voices = 0;
  muted = false;
  volumes = { master: 0.9, sfx: 0.9, music: 0.55, ambience: 0.7 };
  listener = { x: 0, z: 0, yaw: 0 };
  private amb: { wind: GainNode; windF: BiquadFilterNode; drone: GainNode; droneOsc: OscillatorNode[]; hum: GainNode; rain: GainNode; warm: GainNode } | null = null;
  private music = { nextBeat: 0, beat: 0, bar: 0, chord: 0, state: { danger: 0, warmth: 0, night: 0, combat: 0 } as MusicState };
  private unlocked = false;

  /** Must be called from a user gesture (first tap). */
  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.applyVolumes();
    // 2 s of white noise
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // iOS: play a silent buffer inside the gesture to fully unlock
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    void ctx.resume();
    this.unlocked = true;
    this.startAmbience();
    this.music.nextBeat = ctx.currentTime + 0.5;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.volumes.master;
    this.master.gain.value = m;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music;
    this.ambBus.gain.value = this.volumes.ambience;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  private env(g: GainNode, t: number, a: number, peak: number, dcy: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }

  private noiseSrc(t: number, dur: number, rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }

  /** Positional helper: returns a gain+panner chain feeding the sfx bus. */
  private out(vol: number, pos?: { x: number; z: number }): AudioNode | null {
    const ctx = this.ctx!;
    let v = vol;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 45) return null;
      v *= 1 / (1 + dist * 0.12);
      // right vector of listener
      const rx = -Math.cos(this.listener.yaw);
      const rz = Math.sin(this.listener.yaw);
      pan = dist > 0.5 ? Math.max(-0.8, Math.min(0.8, (dx * rx + dz * rz) / dist)) : 0;
    }
    const g = ctx.createGain();
    g.gain.value = v;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }

  play(name: Sfx, opts: { vol?: number; pitch?: number; pos?: { x: number; z: number } } = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted) return;
    if (this.voices >= MAX_VOICES) return;
    const out = this.out(opts.vol ?? 1, opts.pos);
    if (!out) return;
    this.voices++;
    const t = ctx.currentTime + 0.005;
    const p = (opts.pitch ?? 1) * (0.92 + Math.random() * 0.16);
    const dur = this.synth(name, t, p, out);
    setTimeout(() => {
      this.voices--;
      out.disconnect();
    }, (dur + 0.2) * 1000);
  }

  private synth(name: Sfx, t: number, p: number, out: AudioNode): number {
    const ctx = this.ctx!;
    const osc = (type: OscillatorType, f0: number, f1: number, a: number, peak: number, d: number, dest: AudioNode = out) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
      const g = ctx.createGain();
      this.env(g, t, a, peak, d);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + a + d + 0.05);
    };
    const nz = (type: BiquadFilterType, f: number, q: number, a: number, peak: number, d: number, rate = 1, f1?: number) => {
      const s = this.noiseSrc(t, a + d, rate);
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.setValueAtTime(f, t);
      if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + a + d);
      flt.Q.value = q;
      const g = ctx.createGain();
      this.env(g, t, a, peak, d);
      s.connect(flt);
      flt.connect(g);
      g.connect(out);
    };
    switch (name) {
      case 'step':
        nz('bandpass', 380 * p, 1.2, 0.004, 0.22, 0.07);
        nz('lowpass', 160 * p, 0.7, 0.003, 0.25, 0.05);
        return 0.12;
      case 'stepHard':
        nz('bandpass', 1400 * p, 2, 0.002, 0.16, 0.05);
        nz('lowpass', 220 * p, 0.7, 0.002, 0.22, 0.05);
        return 0.1;
      case 'stepWet':
        nz('bandpass', 900 * p, 1, 0.004, 0.2, 0.09, 1, 2400 * p);
        return 0.13;
      case 'swing':
        nz('bandpass', 600 * p, 1.6, 0.06, 0.18, 0.12, 1, 2200 * p);
        return 0.2;
      case 'hitWood':
        osc('triangle', 220 * p, 120 * p, 0.002, 0.5, 0.12);
        nz('bandpass', 900 * p, 3, 0.001, 0.5, 0.08);
        nz('lowpass', 300 * p, 1, 0.001, 0.4, 0.15);
        return 0.25;
      case 'hitMetal':
        osc('square', 520 * p, 480 * p, 0.001, 0.12, 0.35);
        osc('triangle', 1310 * p, 1250 * p, 0.001, 0.14, 0.45);
        osc('sine', 2210 * p, 2150 * p, 0.001, 0.08, 0.5);
        nz('highpass', 2500 * p, 1, 0.001, 0.3, 0.05);
        return 0.6;
      case 'hitStone':
        nz('lowpass', 700 * p, 1, 0.001, 0.6, 0.12);
        nz('bandpass', 2000 * p, 1.5, 0.001, 0.25, 0.05);
        osc('sine', 110 * p, 60, 0.001, 0.4, 0.1);
        return 0.25;
      case 'hitGlass':
        osc('sine', 2600 * p, 2500 * p, 0.001, 0.15, 0.3);
        osc('sine', 3900 * p, 3700 * p, 0.001, 0.1, 0.25);
        nz('highpass', 4000, 1, 0.001, 0.35, 0.18);
        return 0.4;
      case 'hitFlesh':
        nz('lowpass', 500 * p, 1, 0.002, 0.6, 0.09);
        osc('sine', 90 * p, 50, 0.002, 0.5, 0.1);
        return 0.2;
      case 'break':
        nz('lowpass', 1200 * p, 0.8, 0.002, 0.7, 0.35, 0.8, 200);
        osc('sine', 80 * p, 40, 0.002, 0.5, 0.25);
        for (let i = 0; i < 4; i++) {
          const tt = t + 0.05 + Math.random() * 0.25;
          const s = this.noiseSrc(tt, 0.05);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 800 + Math.random() * 2400;
          f.Q.value = 3;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.15, tt + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
          s.connect(f);
          f.connect(g);
          g.connect(out);
        }
        return 0.5;
      case 'breakBig':
      case 'collapse':
        nz('lowpass', 900 * p, 0.7, 0.01, 0.9, 1.1, 0.6, 90);
        osc('sine', 60 * p, 28, 0.01, 0.8, 0.9);
        nz('bandpass', 2400, 1, 0.05, 0.2, 0.6);
        return 1.3;
      case 'pickup':
        osc('sine', 880 * p, 880 * p, 0.003, 0.18, 0.12);
        osc('sine', 1320 * p, 1320 * p, 0.003, 0.12, 0.16);
        return 0.25;
      case 'craft':
        osc('triangle', 523 * p, 523 * p, 0.005, 0.2, 0.12);
        setTimeout(() => this.play('pickup', { pitch: 1.5, vol: 0.6 }), 90);
        nz('bandpass', 3000, 2, 0.002, 0.12, 0.06);
        return 0.3;
      case 'place':
        nz('lowpass', 500 * p, 1, 0.002, 0.6, 0.18);
        osc('sine', 140 * p, 70, 0.002, 0.45, 0.16);
        nz('bandpass', 1800 * p, 2, 0.001, 0.2, 0.05);
        return 0.3;
      case 'deny':
        osc('square', 150, 140, 0.005, 0.08, 0.12);
        osc('square', 110, 100, 0.005, 0.08, 0.16);
        return 0.25;
      case 'click':
        osc('sine', 1800 * p, 1200 * p, 0.001, 0.08, 0.03);
        return 0.06;
      case 'open':
        osc('sine', 600 * p, 900 * p, 0.005, 0.07, 0.08);
        nz('bandpass', 2500, 1, 0.01, 0.04, 0.08);
        return 0.12;
      case 'close':
        osc('sine', 900 * p, 600 * p, 0.005, 0.06, 0.08);
        return 0.1;
      case 'jump':
        nz('bandpass', 700 * p, 1, 0.01, 0.12, 0.08);
        return 0.1;
      case 'land':
        nz('lowpass', 300 * p, 0.8, 0.002, 0.45, 0.12);
        osc('sine', 80, 45, 0.002, 0.3, 0.1);
        return 0.15;
      case 'hurt':
        osc('sawtooth', 200 * p, 120 * p, 0.005, 0.12, 0.18);
        nz('lowpass', 600, 1, 0.002, 0.4, 0.12);
        return 0.25;
      case 'eat':
        for (let i = 0; i < 3; i++) {
          const tt = t + i * 0.13;
          const s = this.noiseSrc(tt, 0.06);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 1200 + Math.random() * 600;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.2, tt + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06);
          s.connect(f);
          f.connect(g);
          g.connect(out);
        }
        return 0.45;
      case 'drink':
        for (let i = 0; i < 3; i++) osc('sine', (300 + i * 60) * p, (500 + i * 40) * p, 0.01 + i * 0.12, 0.12, 0.08);
        return 0.45;
      case 'thunder':
        nz('lowpass', 400, 0.5, 0.05, 1, 2.6, 0.5, 60);
        nz('lowpass', 1200, 0.5, 0.005, 0.5, 0.4, 0.8, 200);
        return 3;
      case 'powerUp':
        osc('sawtooth', 60, 420, 0.05, 0.12, 1.4);
        osc('sine', 120, 840, 0.05, 0.25, 1.4);
        nz('bandpass', 400, 4, 0.2, 0.15, 1.2, 1, 4000);
        return 1.7;
      case 'node':
        osc('sine', 440 * p, 440 * p, 0.005, 0.15, 0.2);
        osc('sine', 660 * p, 660 * p, 0.005, 0.1, 0.25);
        return 0.3;
      case 'alarm':
        for (let i = 0; i < 4; i++) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.setValueAtTime(i % 2 ? 640 : 820, t + i * 0.22);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + i * 0.22);
          g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.22 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
          o.connect(g);
          g.connect(out);
          o.start(t + i * 0.22);
          o.stop(t + i * 0.22 + 0.22);
        }
        return 0.95;
      case 'levelUp':
        [523, 659, 784, 1046].forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          const g = ctx.createGain();
          const tt = t + i * 0.09;
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.16, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
          o.connect(g);
          g.connect(out);
          o.start(tt);
          o.stop(tt + 0.55);
        });
        return 0.9;
      case 'drone':
        osc('sawtooth', 180 * p, 210 * p, 0.05, 0.05, 0.5);
        osc('square', 90 * p, 95 * p, 0.05, 0.03, 0.5);
        return 0.6;
      case 'shot':
        nz('lowpass', 3000, 0.7, 0.001, 0.9, 0.25, 1, 300);
        osc('sine', 150, 50, 0.001, 0.7, 0.15);
        return 0.35;
      case 'bow':
        osc('triangle', 180 * p, 90 * p, 0.002, 0.2, 0.12);
        nz('highpass', 3000, 1, 0.01, 0.12, 0.15);
        return 0.2;
    }
    return 0.3;
  }

  // ---------------- ambience ----------------
  private startAmbience(): void {
    const ctx = this.ctx!;
    const loopNoise = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start();
      return s;
    };
    const wind = ctx.createGain();
    wind.gain.value = 0.0;
    const windF = ctx.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 400;
    windF.Q.value = 0.6;
    loopNoise().connect(windF);
    windF.connect(wind);
    wind.connect(this.ambBus);

    const rain = ctx.createGain();
    rain.gain.value = 0;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1800;
    loopNoise().connect(rf);
    rf.connect(rain);
    rain.connect(this.ambBus);

    const drone = ctx.createGain();
    drone.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 260;
    dlp.connect(drone);
    drone.connect(this.ambBus);
    const droneOsc: OscillatorNode[] = [];
    for (const f of [55, 55.4, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dlp);
      o.start();
      droneOsc.push(o);
    }
    const hum = ctx.createGain();
    hum.gain.value = 0;
    const ho = ctx.createOscillator();
    ho.type = 'square';
    ho.frequency.value = 120;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 240;
    hf.Q.value = 6;
    ho.connect(hf);
    hf.connect(hum);
    hum.connect(this.ambBus);
    ho.start();
    const warm = ctx.createGain();
    warm.gain.value = 0;
    warm.connect(this.ambBus);
    this.amb = { wind, windF, drone, droneOsc, hum, rain, warm };
  }

  /** Update ambience + music. Call every frame (cheap). */
  update(state: { danger: number; warmth: number; night: number; rain: number; machine: number; combat: number; indoors: boolean }): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.amb) return;
    const t = ctx.currentTime;
    const a = this.amb;
    const k = 0.4; // time constant
    const indoor = state.indoors ? 0.35 : 1;
    a.wind.gain.setTargetAtTime((0.05 + (1 - state.warmth) * 0.07 + state.rain * 0.05) * indoor, t, k);
    a.windF.frequency.setTargetAtTime(300 + Math.sin(t * 0.13) * 140 + state.rain * 200, t, 1.5);
    a.rain.gain.setTargetAtTime(state.rain * 0.12 * indoor, t, k);
    a.drone.gain.setTargetAtTime((1 - state.warmth) * 0.03 + state.danger * 0.04, t, 1);
    a.hum.gain.setTargetAtTime(state.machine * 0.035, t, 0.3);
    this.music.state = { danger: state.danger, warmth: state.warmth, night: state.night, combat: state.combat };
    this.scheduleMusic();
  }

  // ---------------- generative adaptive music ----------------
  private scheduleMusic(): void {
    const ctx = this.ctx!;
    const m = this.music;
    const st = m.state;
    const bpm = 72 + st.combat * 34 + st.danger * 8;
    const beatDur = 60 / bpm;
    const root = st.warmth > 0.55 ? 57 : 50; // A3 warm vs D3 cold
    const scale = st.warmth > 0.55 ? SCALES.major : st.danger > 0.5 ? SCALES.minor : SCALES.dorian;
    const progression = st.warmth > 0.55 ? [0, 5, 3, 4] : [0, 5, 2, 6];
    while (m.nextBeat < ctx.currentTime + 0.25) {
      const t = m.nextBeat;
      const beatInBar = m.beat % 4;
      if (beatInBar === 0) {
        m.chord = progression[m.bar % progression.length];
        // pad chord (sparser at night/ruin)
        const degs = [0, 2, 4];
        for (const dgr of degs) {
          const note = root - 12 + this.deg(scale, m.chord + dgr);
          this.tone(t, note, beatDur * 4, 'triangle', 0.035 * (0.6 + st.warmth * 0.5), 1.2, 1.4);
        }
        // bass
        this.tone(t, root - 24 + this.deg(scale, m.chord), beatDur * 2, 'sine', 0.07, 0.02, 0.6);
        m.bar++;
      }
      // sparse plucks: warmer = more melodic
      const density = 0.18 + st.warmth * 0.35 + st.combat * 0.3;
      if (Math.random() < density) {
        const step = Math.floor(Math.random() * 5);
        const note = root + 12 + this.deg(scale, m.chord + step);
        this.tone(t + (Math.random() < 0.3 ? beatDur / 2 : 0), note, beatDur * 1.5, st.warmth > 0.5 ? 'triangle' : 'sine', 0.035, 0.005, 0.9);
      }
      // tension pulse in combat
      if (st.combat > 0.3) {
        this.tone(t, root - 12, beatDur * 0.4, 'sawtooth', 0.025 * st.combat, 0.005, 0.15, 600);
        if (beatInBar % 2 === 1) this.kick(t, 0.12 * st.combat);
      }
      m.beat++;
      m.nextBeat += beatDur;
    }
  }

  private deg(scale: number[], d: number): number {
    const n = scale.length;
    const o = Math.floor(d / n);
    return scale[((d % n) + n) % n] + o * 12;
  }

  private tone(t: number, midi: number, dur: number, type: OscillatorType, vol: number, a: number, rel: number, lp = 1800): void {
    const ctx = this.ctx!;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 8;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur - rel * 0.5), rel * 0.35);
    o.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + rel + 0.1);
  }

  private kick(t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.22);
  }
}

export const audio = new AudioEngine();
