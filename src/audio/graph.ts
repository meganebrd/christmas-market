/**
 * The mixing graph, shared by the live game and the offline checks:
 *
 *   music ─┐ (dry) → level → tone(high-shelf) ─┐
 *   sfx   ─┤ (dry) → level ────────────────────┤
 *   amb   ─┤ (dry) → level ────────────────────┼→ master → compressor → limiter → out
 *   voice ─┘ (dry) → level ────────────────────┤
 *   every bus also has a "wet" send → level → reverb (generated IR) ┘
 */
import { brownNoise, makeImpulse, mulberry32, pinkNoise, whiteNoise, type Rng } from './dsp';

/** Collects the nodes of one sound so they can all be disconnected when it has finished. */
export class Voice {
  private nodes: AudioNode[] = [];
  private srcs: AudioScheduledSourceNode[] = [];
  constructor(readonly ac: BaseAudioContext) {}

  add<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  gain(v = 0): GainNode {
    const g = this.add(this.ac.createGain());
    g.gain.value = v;
    return g;
  }
  osc(type: OscillatorType, freq: number, t: number, wave?: PeriodicWave): OscillatorNode {
    const o = this.ac.createOscillator();
    if (wave) o.setPeriodicWave(wave);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.nodes.push(o);
    this.srcs.push(o);
    o.start(t);
    return o;
  }
  buf(buffer: AudioBuffer, t: number, opts: { offset?: number; rate?: number; loop?: boolean } = {}): AudioBufferSourceNode {
    const s = this.ac.createBufferSource();
    s.buffer = buffer;
    s.loop = !!opts.loop;
    if (opts.rate) s.playbackRate.setValueAtTime(opts.rate, t);
    this.nodes.push(s);
    this.srcs.push(s);
    s.start(t, opts.offset ?? 0);
    return s;
  }
  filter(type: BiquadFilterType, freq: number, q = 0.707, t?: number): BiquadFilterNode {
    const f = this.add(this.ac.createBiquadFilter());
    f.type = type;
    if (t !== undefined) f.frequency.setValueAtTime(freq, t);
    else f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }
  pan(p: number): StereoPannerNode | GainNode {
    if (typeof this.ac.createStereoPanner !== 'function') return this.gain(1);
    const s = this.add(this.ac.createStereoPanner());
    s.pan.value = Math.max(-1, Math.min(1, p));
    return s;
  }
  /** Stops every source at `t` and disconnects everything once they have all ended. */
  end(t: number, onDone?: () => void) {
    let left = this.srcs.length;
    const done = () => {
      for (const n of this.nodes) {
        try {
          n.disconnect();
        } catch {
          /* already */
        }
      }
      this.nodes = [];
      this.srcs = [];
      onDone?.();
    };
    if (!left) return done();
    for (const s of this.srcs) {
      s.onended = () => {
        if (--left === 0) done();
      };
      try {
        s.stop(t);
      } catch {
        /* already stopped */
      }
    }
  }
}

/** A mixer channel with a dry input and a reverb-send input, both behind the same level. */
export class Bus {
  readonly dry: GainNode;
  readonly wet: GainNode;
  private lvDry: GainNode;
  private lvWet: GainNode;
  constructor(private ac: BaseAudioContext, dest: AudioNode, reverb: AudioNode, level: number) {
    this.dry = ac.createGain();
    this.wet = ac.createGain();
    this.lvDry = ac.createGain();
    this.lvWet = ac.createGain();
    this.lvDry.gain.value = level;
    this.lvWet.gain.value = level;
    this.dry.connect(this.lvDry).connect(dest);
    this.wet.connect(this.lvWet).connect(reverb);
  }
  set(level: number, tc = 0.08) {
    const t = this.ac.currentTime;
    for (const g of [this.lvDry, this.lvWet]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(Math.max(0, level), t, tc);
    }
  }
  get level() {
    return this.lvDry.gain.value;
  }
}

export interface Waves {
  harp: PeriodicWave;
  bass: PeriodicWave;
  organ: PeriodicWave;
  reed: PeriodicWave;
}

export class Graph {
  readonly master: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly reverbIn: GainNode;
  readonly music: Bus;
  readonly musicTone: BiquadFilterNode;
  readonly sfx: Bus;
  readonly amb: Bus;
  readonly voice: Bus;
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  readonly waves: Waves;
  readonly rng: Rng;
  /** Lazily generated sample buffers (murmur, fire, snow steps…). */
  readonly cache = new Map<string, AudioBuffer | AudioBuffer[]>();

  constructor(readonly ac: BaseAudioContext, opts: { seed?: number; out?: AudioNode } = {}) {
    this.rng = mulberry32(opts.seed ?? (Date.now() & 0xffff) + 7);
    const out = opts.out ?? ac.destination;

    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.limiter.connect(out);

    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 2.4;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.3;
    this.comp.connect(this.limiter);

    this.master = ac.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.comp);

    // shared reverb
    this.reverbIn = ac.createGain();
    const convolver = ac.createConvolver();
    convolver.buffer = makeImpulse(ac, this.rng);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    const ret = ac.createGain();
    ret.gain.value = 0.9;
    this.reverbIn.connect(hp).connect(convolver).connect(ret).connect(this.master);

    this.musicTone = ac.createBiquadFilter();
    this.musicTone.type = 'highshelf';
    this.musicTone.frequency.value = 2800;
    this.musicTone.gain.value = 0;
    this.musicTone.connect(this.master);

    this.music = new Bus(ac, this.musicTone, this.reverbIn, 0);
    this.sfx = new Bus(ac, this.master, this.reverbIn, 0);
    this.amb = new Bus(ac, this.master, this.reverbIn, 0);
    this.voice = new Bus(ac, this.master, this.reverbIn, 0);

    this.white = whiteNoise(ac, 2, this.rng);
    this.pink = pinkNoise(ac, 6, this.rng, 2);
    this.brown = brownNoise(ac, 4, this.rng);

    const wave = (h: number[]) => {
      const real = new Float32Array(h.length + 1);
      const imag = new Float32Array(h.length + 1);
      h.forEach((a, i) => (imag[i + 1] = a));
      return ac.createPeriodicWave(real, imag);
    };
    this.waves = {
      harp: wave([1, 0.32, 0.12, 0.05, 0.02]),
      bass: wave([1, 0.42, 0.16, 0.07, 0.03]),
      organ: wave([1, 0.55, 0.42, 0.22, 0.18, 0.1, 0.08, 0.05, 0.04]),
      reed: wave([1, 0.7, 0.55, 0.42, 0.33, 0.25, 0.2, 0.15, 0.12, 0.09, 0.07, 0.05]),
    };
  }

  /** Cached sample buffer (generated on first use). */
  sample<T extends AudioBuffer | AudioBuffer[]>(key: string, make: () => T): T {
    let b = this.cache.get(key) as T | undefined;
    if (!b) {
      b = make();
      this.cache.set(key, b);
    }
    return b;
  }

  /** Random offset inside a noise buffer (so repeated sounds never share the same grain). */
  noiseOffset(buf: AudioBuffer, dur: number): number {
    return this.rng() * Math.max(0, buf.duration - dur - 0.01);
  }
}

/** Counts live voices per pool to cap polyphony (phones!). */
export class VoicePool {
  private ends: number[] = [];
  constructor(readonly max: number) {}
  /** Registers a voice ending at `end`; returns false if the pool is full (voice should be skipped). */
  take(now: number, end: number, priority = 1): boolean {
    if (this.ends.length > 8) this.ends = this.ends.filter((e) => e > now);
    const limit = priority >= 2 ? this.max * 1.5 : priority <= 0 ? this.max * 0.7 : this.max;
    if (this.ends.length >= limit) return false;
    this.ends.push(end);
    return true;
  }
  get size() {
    return this.ends.length;
  }
}
