/**
 * Sound effects, all synthesised. Every call varies a little (pitch, timing, filter, grain) so that
 * repeats never sound mechanical. Positional sounds go through an equal-power PannerNode relative
 * to the listener (the camera), with distance roll-off and a bit more reverb when far away.
 */
import type { SfxName } from '../core/contracts';
import { makeSizzle, makeSnowSteps, pick, rr, type Rng } from './dsp';
import { Voice, VoicePool, type Graph } from './graph';
import { celesta } from './instruments';
import { mtof } from './theory';

interface C {
  g: Graph;
  v: Voice;
  t: number;
  out: AudioNode;
  rng: Rng;
  /** Pitch multiplier. */
  p: number;
}

// ───────────────────────────── building blocks ─────────────────────────────

function env(param: AudioParam, t: number, amp: number, attack: number, tc: number) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(amp, t + attack);
  param.setTargetAtTime(0, t + attack, tc);
}

function tone(c: C, type: OscillatorType, f: number, t: number, amp: number, attack: number, tc: number, dest: AudioNode = c.out): OscillatorNode {
  const g = c.v.gain(0);
  g.connect(dest);
  env(g.gain, t, amp, attack, tc);
  const o = c.v.osc(type, f, t);
  o.connect(g);
  return o;
}

function noise(c: C, t: number, dur: number, buf: AudioBuffer = c.g.white): AudioBufferSourceNode {
  return c.v.buf(buf, t, { offset: c.g.noiseOffset(buf, dur) });
}

/** Burst of filtered noise. Returns the filter (to automate its frequency). */
function hiss(c: C, t: number, type: BiquadFilterType, f: number, q: number, amp: number, attack: number, tc: number, dur = tc * 6 + attack, buf?: AudioBuffer): BiquadFilterNode {
  const flt = c.v.filter(type, f, q, t);
  const g = c.v.gain(0);
  flt.connect(g).connect(c.out);
  env(g.gain, t, amp, attack, tc);
  noise(c, t, dur, buf).connect(flt);
  return flt;
}

type Partials = [number, number, number][];
const BELL: Partials = [[1, 1, 1], [2, 0.5, 0.6], [2.4, 0.25, 0.4], [3, 0.2, 0.3], [4.5, 0.12, 0.2], [5.9, 0.06, 0.12]];
const GLOCK: Partials = [[1, 1, 1], [2.76, 0.22, 0.3], [5.4, 0.1, 0.12]];
const GLASS: Partials = [[1, 1, 1], [2.32, 0.4, 0.6], [4.25, 0.2, 0.35], [6.63, 0.08, 0.2]];
const METAL: Partials = [[1, 1, 1], [2.31, 0.7, 0.6], [3.87, 0.5, 0.45], [5.6, 0.3, 0.3]];

/** Struck tone made of partials (bell, glass, metal…). */
function ding(c: C, t: number, f: number, amp: number, tc: number, partials: Partials = GLOCK, attack = 0.0015, dest: AudioNode = c.out) {
  for (const [r, l, dm] of partials) {
    const pf = f * r;
    if (pf > 16000) continue;
    tone(c, 'sine', pf, t, amp * l, attack, tc * dm, dest);
  }
  return t + tc * 6;
}

/** Soft wooden click (UI). */
function click(c: C, t: number, amp: number, f = 1400) {
  hiss(c, t, 'bandpass', f * rr(c.rng, 0.9, 1.15), 2.5, amp * 0.6, 0.0008, 0.004);
  tone(c, 'sine', f * 0.62 * rr(c.rng, 0.95, 1.05), t, amp * 0.5, 0.001, 0.012);
}

const mid = (m: number, c: C) => mtof(m) * c.p;

// ───────────────────────────── the catalogue ─────────────────────────────

const SFX: Record<SfxName, (c: C) => number> = {
  'step-snow'(c) {
    const steps = c.g.sample('snow-steps', () => makeSnowSteps(c.g.ac, c.g.rng, 7));
    const b = pick(c.rng, steps);
    const rate = rr(c.rng, 0.86, 1.12) * c.p;
    const g = c.v.gain(rr(c.rng, 0.42, 0.55));
    g.connect(c.out);
    c.v.buf(b, c.t, { rate }).connect(g);
    return c.t + b.duration / rate;
  },
  'step-stone'(c) {
    hiss(c, c.t, 'lowpass', rr(c.rng, 650, 1100) * c.p, 0.7, 0.3, 0.002, 0.012);
    const o = tone(c, 'sine', 115 * rr(c.rng, 0.9, 1.1) * c.p, c.t, 0.38, 0.002, 0.022);
    o.frequency.exponentialRampToValueAtTime(70, c.t + 0.05);
    return c.t + 0.16;
  },
  'step-wood'(c) {
    const f = rr(c.rng, 165, 215) * c.p;
    const o = tone(c, 'sine', f, c.t, 0.42, 0.002, 0.035);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, c.t + 0.08);
    tone(c, 'sine', f * 2.3, c.t, 0.12, 0.001, 0.016);
    hiss(c, c.t, 'bandpass', rr(c.rng, 900, 1400), 2, 0.14, 0.001, 0.008);
    return c.t + 0.26;
  },
  'step-ice'(c) {
    const f = hiss(c, c.t, 'bandpass', rr(c.rng, 3600, 5200) * c.p, 3, 0.16, 0.012, 0.04, 0.3);
    f.frequency.exponentialRampToValueAtTime(rr(c.rng, 2200, 2800), c.t + 0.12);
    tone(c, 'sine', rr(c.rng, 5500, 6500), c.t, 0.025, 0.001, 0.006);
    return c.t + 0.3;
  },
  'ui-open'(c) {
    click(c, c.t, 0.35);
    ding(c, c.t + 0.005, mid(88, c), 0.16, 0.22);
    ding(c, c.t + 0.07, mid(95, c), 0.12, 0.26);
    return c.t + 1.7;
  },
  'ui-close'(c) {
    click(c, c.t, 0.3, 1100);
    ding(c, c.t + 0.005, mid(95, c), 0.1, 0.18);
    ding(c, c.t + 0.065, mid(88, c), 0.11, 0.22);
    return c.t + 1.5;
  },
  'ui-select'(c) {
    click(c, c.t, 0.45);
    ding(c, c.t + 0.004, mid(pick(c.rng, [91, 93]), c), 0.12, 0.16);
    return c.t + 1.1;
  },
  'ui-hover'(c) {
    tone(c, 'sine', rr(c.rng, 2200, 2600) * c.p, c.t, 0.045, 0.001, 0.008);
    return c.t + 0.08;
  },
  'dialogue-next'(c) {
    const o = tone(c, 'sine', 520 * c.p, c.t, 0.12, 0.004, 0.04);
    o.frequency.exponentialRampToValueAtTime(790 * c.p, c.t + 0.05);
    ding(c, c.t + 0.01, mid(98, c), 0.04, 0.1);
    return c.t + 0.7;
  },
  'star-collect'(c) {
    const base = 84 + pick(c.rng, [0, 2, -1]);
    [0, 4, 7, 12, 16].forEach((iv, k) => ding(c, c.t + k * 0.048, mid(base + iv, c), 0.2 - k * 0.02, 0.38));
    for (let k = 0; k < 9; k++) {
      const t = c.t + rr(c.rng, 0.12, 0.85);
      const g = c.v.gain(0);
      g.connect(c.out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + rr(c.rng, 0.05, 0.25));
      g.gain.setTargetAtTime(0, t + 0.25, 0.3);
      c.v.osc('sine', rr(c.rng, 3200, 8500), t).connect(g);
    }
    const f = c.v.filter('bandpass', 6000, 0.8, c.t);
    f.frequency.exponentialRampToValueAtTime(9500, c.t + 1.4);
    const g = c.v.gain(0);
    f.connect(g).connect(c.out);
    g.gain.setValueAtTime(0, c.t);
    g.gain.linearRampToValueAtTime(0.05, c.t + 0.3);
    g.gain.setTargetAtTime(0, c.t + 0.4, 0.35);
    noise(c, c.t, 2.4).connect(f);
    return c.t + 2.6;
  },
  bell(c) {
    return ding(c, c.t, 880 * c.p * rr(c.rng, 0.98, 1.02), 0.22, 0.65, BELL, 0.002);
  },
  chime(c) {
    const notes = [79, 81, 84, 86, 88, 91, 93];
    const n = 3 + Math.floor(c.rng() * 2);
    let end = c.t;
    for (let k = 0; k < n; k++) end = Math.max(end, ding(c, c.t + rr(c.rng, 0, 0.38), mid(pick(c.rng, notes), c), 0.13, 0.5));
    return end;
  },
  whoosh(c) {
    const f = c.v.filter('bandpass', 300, 1.2, c.t);
    f.frequency.exponentialRampToValueAtTime(1600 * c.p, c.t + 0.25);
    f.frequency.exponentialRampToValueAtTime(480, c.t + 0.62);
    const g = c.v.gain(0);
    const pan = c.v.pan(0);
    f.connect(g).connect(pan).connect(c.out);
    if ('pan' in pan) {
      pan.pan.setValueAtTime(-0.6, c.t);
      pan.pan.linearRampToValueAtTime(0.6, c.t + 0.6);
    }
    g.gain.setValueAtTime(0, c.t);
    g.gain.linearRampToValueAtTime(0.42, c.t + 0.22);
    g.gain.linearRampToValueAtTime(0, c.t + 0.66);
    noise(c, c.t, 0.8, c.g.pink).connect(f);
    return c.t + 0.7;
  },
  pop(c) {
    const o = tone(c, 'sine', 820 * c.p * rr(c.rng, 0.92, 1.08), c.t, 0.38, 0.002, 0.03);
    o.frequency.exponentialRampToValueAtTime(190, c.t + 0.06);
    hiss(c, c.t, 'highpass', 2200, 0.7, 0.1, 0.0005, 0.003);
    return c.t + 0.24;
  },
  sizzle(c) {
    const b = c.g.sample('sizzle', () => makeSizzle(c.g.ac, c.g.rng));
    const g = c.v.gain(0);
    g.connect(c.out);
    g.gain.setValueAtTime(0, c.t);
    g.gain.linearRampToValueAtTime(0.4, c.t + 0.05);
    g.gain.setTargetAtTime(0.25, c.t + 0.05, 0.3);
    g.gain.setTargetAtTime(0, c.t + 0.9, 0.22);
    c.v.buf(b, c.t, { offset: c.g.rng() * (b.duration - 2), rate: rr(c.rng, 0.9, 1.1) }).connect(g);
    return c.t + 2;
  },
  pour(c) {
    const f = c.v.filter('bandpass', 450 * c.p, 4, c.t);
    f.frequency.exponentialRampToValueAtTime(1400 * c.p, c.t + 1.6);
    const g = c.v.gain(0);
    f.connect(g).connect(c.out);
    g.gain.setValueAtTime(0, c.t);
    g.gain.linearRampToValueAtTime(0.26, c.t + 0.08);
    g.gain.setValueAtTime(0.26, c.t + 1.45);
    g.gain.setTargetAtTime(0, c.t + 1.5, 0.12);
    noise(c, c.t, 2.2, c.g.pink).connect(f);
    hiss(c, c.t, 'lowpass', 320, 0.7, 0.06, 0.1, 0.6, 2.2, c.g.pink);
    for (let k = 0; k < 11; k++) {
      const t = c.t + rr(c.rng, 0.1, 1.5);
      const bf = rr(c.rng, 300, 700) * (1 + (t - c.t) * 0.6) * c.p;
      const o = tone(c, 'sine', bf, t, rr(c.rng, 0.03, 0.07), 0.002, 0.014);
      o.frequency.exponentialRampToValueAtTime(bf * 1.7, t + 0.03);
    }
    return c.t + 2.1;
  },
  'glass-clink'(c) {
    const f = rr(c.rng, 1900, 2600) * c.p;
    ding(c, c.t, f, 0.18, 0.35, GLASS, 0.0008);
    ding(c, c.t + rr(c.rng, 0.07, 0.11), f * rr(c.rng, 1.03, 1.09), 0.11, 0.3, GLASS, 0.0008);
    return c.t + 2.4;
  },
  throw(c) {
    const f = c.v.filter('bandpass', 1800 * c.p, 1.5, c.t);
    f.frequency.exponentialRampToValueAtTime(420, c.t + 0.26);
    const g = c.v.gain(0);
    f.connect(g).connect(c.out);
    g.gain.setValueAtTime(0, c.t);
    g.gain.linearRampToValueAtTime(0.32, c.t + 0.05);
    g.gain.linearRampToValueAtTime(0, c.t + 0.3);
    noise(c, c.t, 0.4, c.g.pink).connect(f);
    return c.t + 0.34;
  },
  'snow-hit'(c) {
    hiss(c, c.t, 'lowpass', rr(c.rng, 750, 1000) * c.p, 0.7, 0.5, 0.003, 0.05);
    tone(c, 'sine', 90 * c.p, c.t, 0.34, 0.002, 0.04);
    const steps = c.g.sample('snow-steps', () => makeSnowSteps(c.g.ac, c.g.rng, 7));
    const g = c.v.gain(0.42);
    g.connect(c.out);
    c.v.buf(pick(c.rng, steps), c.t + 0.004, { rate: 0.8 }).connect(g);
    return c.t + 0.42;
  },
  'can-fall'(c) {
    const f0 = rr(c.rng, 520, 680) * c.p;
    let t = c.t;
    let gap = rr(c.rng, 0.12, 0.15);
    let amp = 0.2;
    const n = 3 + Math.floor(c.rng() * 3);
    for (let k = 0; k < n; k++) {
      ding(c, t, f0 * rr(c.rng, 0.97, 1.04), amp, rr(c.rng, 0.07, 0.11), METAL, 0.0006);
      hiss(c, t, 'bandpass', 3000, 1.5, amp * 0.6, 0.0005, 0.006);
      t += gap;
      gap *= rr(c.rng, 0.55, 0.75);
      amp *= 0.65;
    }
    return t + 0.6;
  },
  success(c) {
    const out = c.out;
    const tr = pick(c.rng, [0, 2]);
    [72, 76, 79].forEach((m, k) => celesta(c.g, out, c.t + k * 0.075, m + tr, 0.55));
    [84, 88, 91].forEach((m, k) => celesta(c.g, out, c.t + 0.24 + k * 0.012, m + tr, k === 0 ? 0.7 : 0.4));
    ding(c, c.t + 0.5, mtof(96 + tr), 0.06, 0.4);
    ding(c, c.t + 0.58, mtof(100 + tr), 0.05, 0.4);
    return c.t + 3;
  },
  fail(c) {
    [76, 72, 69].forEach((m, k) => celesta(c.g, c.out, c.t + k * 0.13, m, 0.5 - k * 0.06));
    // a last soft "oh…" that sags in pitch
    const o = tone(c, 'triangle', mtof(64), c.t + 0.39, 0.07, 0.03, 0.25);
    o.frequency.setValueAtTime(mtof(64), c.t + 0.45);
    o.frequency.exponentialRampToValueAtTime(mtof(63.3), c.t + 0.9);
    return c.t + 2.4;
  },
  firework(c) {
    const t = c.t;
    // whistle
    const wg = c.v.gain(0);
    wg.connect(c.out);
    wg.gain.setValueAtTime(0, t);
    wg.gain.linearRampToValueAtTime(0.06, t + 0.15);
    wg.gain.linearRampToValueAtTime(0.045, t + 0.85);
    wg.gain.linearRampToValueAtTime(0, t + 0.95);
    const w = c.v.osc('sine', 900 * c.p, t);
    w.frequency.exponentialRampToValueAtTime(2600 * c.p, t + 0.9);
    const vib = c.v.osc('sine', 17, t);
    const vg = c.v.gain(18);
    vib.connect(vg).connect(w.frequency);
    w.connect(wg);
    hiss(c, t, 'highpass', 5000, 0.7, 0.025, 0.2, 0.3, 1);
    // muffled boom
    const tb = t + 1;
    hiss(c, tb, 'lowpass', 380, 0.7, 0.75, 0.006, 0.32, 2.2, c.g.brown);
    const b = tone(c, 'sine', 72, tb, 0.5, 0.006, 0.22);
    b.frequency.exponentialRampToValueAtTime(34, tb + 0.5);
    // crackle
    const cf = c.v.filter('highpass', 3000, 0.7, tb);
    const cg = c.v.gain(0);
    cf.connect(cg).connect(c.out);
    cg.gain.setValueAtTime(0, tb);
    const ticks = 26 + Math.floor(c.rng() * 16);
    for (let k = 0; k < ticks; k++) {
      const tk = tb + 0.15 + Math.pow(c.rng(), 1.5) * 1.6;
      cg.gain.setValueAtTime(rr(c.rng, 0.05, 0.22), tk);
      cg.gain.setTargetAtTime(0, tk + 0.001, 0.004);
    }
    noise(c, tb, 2).connect(cf);
    return t + 3.3;
  },
  magic(c) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const base = 79 + pick(c.rng, [0, 2, 5]);
    for (let k = 0; k < 9; k++) ding(c, c.t + k * 0.036, mid(base + scale[k], c), 0.13 - k * 0.008, 0.42);
    const f = c.v.filter('bandpass', 5500, 1, c.t);
    f.frequency.exponentialRampToValueAtTime(9800, c.t + 0.9);
    const g = c.v.gain(0);
    f.connect(g).connect(c.out);
    g.gain.setValueAtTime(0, c.t);
    g.gain.linearRampToValueAtTime(0.06, c.t + 0.35);
    g.gain.setTargetAtTime(0, c.t + 0.45, 0.3);
    noise(c, c.t, 2).connect(f);
    return c.t + 2.4;
  },
  page(c) {
    const f = c.v.filter('bandpass', rr(c.rng, 2600, 3600), 0.8, c.t);
    const g = c.v.gain(0);
    f.connect(g).connect(c.out);
    g.gain.setValueAtTime(0, c.t);
    let t = c.t;
    const n = 4 + Math.floor(c.rng() * 3);
    for (let k = 0; k < n; k++) {
      g.gain.linearRampToValueAtTime(rr(c.rng, 0.1, 0.22), t + 0.012);
      g.gain.linearRampToValueAtTime(rr(c.rng, 0.01, 0.05), t + 0.03);
      t += rr(c.rng, 0.025, 0.045);
    }
    g.gain.linearRampToValueAtTime(0, t + 0.04);
    noise(c, c.t, 0.4).connect(f);
    hiss(c, t, 'lowpass', 500, 0.7, 0.12, 0.003, 0.03);
    return t + 0.25;
  },
  door(c) {
    const t = c.t;
    // shop bell above the door
    [pick(c.rng, [91, 93]), pick(c.rng, [95, 96]), pick(c.rng, [91, 98])].forEach((m, k) => ding(c, t + 0.03 + k * rr(c.rng, 0.05, 0.09), mid(m, c), 0.07, 0.3, BELL));
    // wooden creak (stick–slip)
    const f = c.v.filter('bandpass', 850, 3, t);
    const g = c.v.gain(0);
    f.connect(g).connect(c.out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.08);
    g.gain.setValueAtTime(0.08, t + 0.42);
    g.gain.linearRampToValueAtTime(0, t + 0.5);
    const o = c.v.osc('sawtooth', 92 * c.p, t);
    for (let k = 0; k < 16; k++) o.frequency.setValueAtTime((92 + k * 3.2 + rr(c.rng, -9, 9)) * c.p, t + k * 0.03);
    o.connect(f);
    // thud as it closes
    const tt = t + 0.56;
    hiss(c, tt, 'lowpass', 300, 0.7, 0.4, 0.003, 0.06);
    tone(c, 'sine', 76 * c.p, tt, 0.34, 0.003, 0.08);
    return t + 2;
  },
  tick(c) {
    hiss(c, c.t, 'bandpass', 3500 * c.p, 3, 0.25, 0.0005, 0.004);
    tone(c, 'sine', 1900 * c.p, c.t, 0.09, 0.0005, 0.006);
    return c.t + 0.08;
  },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/** Default reverb send per effect. */
const SEND: Partial<Record<SfxName, number>> = {
  'step-snow': 0.06, 'step-stone': 0.1, 'step-wood': 0.1, 'step-ice': 0.1,
  'ui-hover': 0.05, tick: 0.05, 'ui-select': 0.15, 'ui-open': 0.2, 'ui-close': 0.2,
  'star-collect': 0.45, bell: 0.45, chime: 0.5, magic: 0.5, success: 0.35, fail: 0.3, firework: 0.55,
};
/** Low-priority effects are the first dropped when too many voices play. */
const PRIORITY: Partial<Record<SfxName, number>> = { 'ui-hover': 0, tick: 0, 'step-snow': 0, 'step-stone': 0, 'step-wood': 0, 'step-ice': 0, 'star-collect': 2, success: 2, firework: 2 };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class SfxPlayer {
  private pool = new VoicePool(24);
  private last = new Map<SfxName, number>();
  /** Where the listener is (for the distance → reverb mix). */
  listener: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private g: Graph, private bus = g.sfx) {}

  play(name: SfxName, opts: { volume?: number; pitch?: number; position?: Vec3 } = {}, at?: number): number {
    const recipe = SFX[name];
    if (!recipe) return 0;
    const ac = this.g.ac;
    const now = ac.currentTime;
    const t = at ?? now + 0.006;
    // the same effect stacked within 25 ms is pointless (hover spam, double triggers)
    const prev = this.last.get(name);
    if (at === undefined && prev !== undefined && t - prev < 0.025) return 0;
    this.last.set(name, t);
    if (!this.pool.take(now, t + 1.5, PRIORITY[name] ?? 1)) return 0;
    const v = new Voice(ac);
    const out = v.gain(Math.max(0, Math.min(2, opts.volume ?? 1)));
    let send = SEND[name] ?? 0.2;
    const pos = opts.position;
    if (pos && typeof ac.createPanner === 'function') {
      const p = v.add(ac.createPanner());
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 4;
      p.maxDistance = 90;
      p.rolloffFactor = 1.15;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else (p as any).setPosition(pos.x, pos.y, pos.z);
      const l = this.listener;
      const dist = Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z);
      send = Math.min(0.7, send + dist / 70);
      out.connect(p);
      // far sounds lose their highs
      if (dist > 14) {
        const lp = v.filter('lowpass', Math.max(1200, 16000 - dist * 260), 0.5);
        p.connect(lp).connect(this.bus.dry);
      } else p.connect(this.bus.dry);
      const s = v.gain(send);
      p.connect(s).connect(this.bus.wet);
    } else {
      out.connect(this.bus.dry);
      const s = v.gain(send);
      out.connect(s).connect(this.bus.wet);
    }
    const end = recipe({ g: this.g, v, t, out, rng: this.g.rng, p: Math.max(0.25, Math.min(4, opts.pitch ?? 1)) });
    v.end(end + 0.05);
    return end - t;
  }
}
