/**
 * Offline DSP helpers: seeded random, noise buffers, the generated reverb impulse response and the
 * procedural sample generators (crowd murmur, fire crackle, sizzle, furnace roar, snow crunch).
 * Everything is computed in plain JS into AudioBuffers once, then looped/reused by cheap nodes.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const rr = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
export const dbToGain = (db: number) => Math.pow(10, db / 20);

function buffer(ac: BaseAudioContext, channels: number, seconds: number, sr = ac.sampleRate): AudioBuffer {
  return ac.createBuffer(channels, Math.max(1, Math.ceil(seconds * sr)), sr);
}

// ───────────────────────────── noise ─────────────────────────────

export function whiteNoise(ac: BaseAudioContext, seconds: number, rng: Rng): AudioBuffer {
  const b = buffer(ac, 1, seconds);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  return b;
}

export function pinkNoise(ac: BaseAudioContext, seconds: number, rng: Rng, channels = 1): AudioBuffer {
  const sr = ac.sampleRate;
  const fade = 0.25;
  const n = Math.floor((seconds + fade) * sr);
  const chs: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const d = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    chs.push(d);
  }
  return toLoop(ac, chs, sr, fade);
}

export function brownNoise(ac: BaseAudioContext, seconds: number, rng: Rng): AudioBuffer {
  const sr = ac.sampleRate;
  const fade = 0.25;
  const d = new Float32Array(Math.floor((seconds + fade) * sr));
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (rng() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return toLoop(ac, [d], sr, fade);
}

/**
 * Loop-ready buffer: the input holds `fade` seconds more than the loop; that extra tail is
 * cross-faded (equal power) into the head, so the end flows into the start without a click.
 */
function toLoop(ac: BaseAudioContext, chs: Float32Array[], sr: number, fade: number): AudioBuffer {
  const n = Math.floor(fade * sr);
  const len = chs[0].length - n;
  const b = ac.createBuffer(chs.length, len, sr);
  chs.forEach((src, c) => {
    const out = b.getChannelData(c);
    for (let i = 0; i < len; i++) {
      if (i < n) {
        const t = i / n;
        out[i] = src[i] * Math.sin(t * Math.PI * 0.5) + src[len + i] * Math.cos(t * Math.PI * 0.5);
      } else out[i] = src[i];
    }
  });
  return b;
}

function toLoopBuffer(ac: BaseAudioContext, L: Float32Array, R: Float32Array, sr: number, fade: number): AudioBuffer {
  return toLoop(ac, [L, R], sr, fade);
}

function normalize(chs: Float32Array[], peak: number) {
  let m = 1e-9;
  for (const d of chs) for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const k = peak / m;
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= k;
}

// ───────────────────────────── simple filters ─────────────────────────────

/** Biquad band-pass (constant 0 dB peak gain) coefficients. */
function bpCoefs(f: number, q: number, sr: number) {
  const w = (2 * Math.PI * f) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  return { b0: alpha / a0, b2: -alpha / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - alpha) / a0 };
}

const onePole = (fc: number, sr: number) => 1 - Math.exp((-2 * Math.PI * fc) / sr);

// ───────────────────────────── reverb impulse response ─────────────────────────────

/**
 * A soft "snowy village" space: a few early reflections off wooden chalets, then a short, dark, diffuse
 * tail (snow swallows the highs). Stereo-decorrelated.
 */
export function makeImpulse(ac: BaseAudioContext, rng: Rng, seconds = 2.4, t60 = 1.9): AudioBuffer {
  const sr = ac.sampleRate;
  const b = buffer(ac, 2, seconds, sr);
  const pre = Math.floor(0.014 * sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let y = 0;
    let y2 = 0;
    for (let i = pre; i < d.length; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / t60);
      // damping grows with time: bright at first, then woolly
      const k = lerp(0.55, 0.06, Math.min(1, t / 1.2));
      y += k * (rng() * 2 - 1 - y);
      y2 += k * (y - y2);
      const fadeIn = Math.min(1, t / 0.008);
      d[i] = y2 * env * fadeIn * 2.2;
    }
    // early reflections
    for (let r = 0; r < 9; r++) {
      const t = 0.008 + rng() * 0.07;
      const i = pre + Math.floor(t * sr);
      const a = (0.5 - t * 4) * (rng() < 0.5 ? -1 : 1);
      for (let j = 0; j < 24 && i + j < d.length; j++) d[i + j] += a * Math.exp(-j / 5);
    }
  }
  return b;
}

// ───────────────────────────── crowd murmur ─────────────────────────────

const VOWEL_F: [number, number][] = [
  [800, 1200], [500, 1850], [320, 2300], [480, 880], [340, 820], [600, 1600], [380, 1650], [650, 1050],
];

/**
 * Unintelligible crowd: N "talkers", each a glottal-ish pulse train through two formant resonators,
 * syllable envelopes grouped in phrases with pauses, panned across the stereo field.
 */
export function makeMurmur(ac: BaseAudioContext, rng: Rng, opts: { seconds: number; talkers: number; cutoff: number }): AudioBuffer {
  const it = murmurSteps(ac, rng, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * Same as `makeMurmur`, as a generator that yields after each talker so the work can be spread over
 * several tasks (no frame hitch when a bed starts during a cinematic).
 */
export function* murmurSteps(ac: BaseAudioContext, rng: Rng, opts: { seconds: number; talkers: number; cutoff: number }): Generator<void, AudioBuffer, void> {
  const sr = 22050;
  const n = Math.floor((opts.seconds + 0.5) * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let k = 0; k < opts.talkers; k++) {
    if (k > 0) yield;
    const pan = rr(rng, -0.85, 0.85);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const level = rr(rng, 0.35, 1);
    const high = rng() < 0.5;
    const f0base = high ? rr(rng, 175, 250) : rr(rng, 95, 145);
    const fScale = high ? 1.12 : 1;
    let phase = rng();
    let ax1 = 0, ax2 = 0, ay1 = 0, ay2 = 0, bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
    let i = Math.floor(rr(rng, 0, 1.2) * sr);
    while (i < n) {
      const syllables = 3 + Math.floor(rng() * 9);
      let f0 = f0base * rr(rng, 0.97, 1.12);
      for (let s = 0; s < syllables && i < n; s++) {
        const len = Math.floor(sr * rr(rng, 0.1, 0.23));
        const v = VOWEL_F[Math.floor(rng() * VOWEL_F.length)];
        const ca = bpCoefs(v[0] * fScale * rr(rng, 0.92, 1.08), 4.5, sr);
        const cb = bpCoefs(v[1] * fScale * rr(rng, 0.92, 1.08), 7, sr);
        const amp = level * rr(rng, 0.55, 1);
        const voiced = rng() > 0.15;
        const glide = rr(rng, -0.08, 0.06);
        for (let j = 0; j < len && i + j < n; j++) {
          const x = j / len;
          const env = Math.pow(Math.sin(Math.PI * x), 1.4);
          const f = f0 * (1 + glide * x);
          phase += f / sr;
          if (phase >= 1) phase -= 1;
          const src = voiced ? (2 * phase - 1) * 0.7 + (rng() * 2 - 1) * 0.12 : (rng() * 2 - 1) * 0.45;
          const ya = ca.b0 * src + ca.b2 * ax2 - ca.a1 * ay1 - ca.a2 * ay2;
          ax2 = ax1; ax1 = src; ay2 = ay1; ay1 = ya;
          const yb = cb.b0 * src + cb.b2 * bx2 - cb.a1 * by1 - cb.a2 * by2;
          bx2 = bx1; bx1 = src; by2 = by1; by1 = yb;
          const o = (ya + 0.55 * yb) * env * amp;
          L[i + j] += o * gl;
          R[i + j] += o * gr;
        }
        i += len + Math.floor(sr * rr(rng, 0, 0.05));
        f0 *= rr(rng, 0.965, 1.0);
      }
      i += Math.floor(sr * rr(rng, 0.25, 1.5));
    }
  }
  yield;
  // distance: gentle low-pass, remove DC
  const a = onePole(opts.cutoff, sr);
  for (const d of [L, R]) {
    let y = 0;
    let dc = 0;
    for (let i = 0; i < n; i++) {
      y += a * (d[i] - y);
      dc += 0.0015 * (y - dc);
      d[i] = y - dc;
    }
  }
  normalize([L, R], 0.6);
  return toLoopBuffer(ac, L, R, sr, 0.5);
}

// ───────────────────────────── fire crackle ─────────────────────────────

export function makeFire(ac: BaseAudioContext, rng: Rng, seconds = 7): AudioBuffer {
  const sr = 22050;
  const n = Math.floor((seconds + 0.4) * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  // warm rumble + soft hiss, slowly breathing
  let br = 0, lp = 0, hp = 0, prev = 0, flick = 0.5, flickT = 0.5;
  const aLow = onePole(260, sr);
  for (let i = 0; i < n; i++) {
    if (i % 600 === 0) flickT = rr(rng, 0.3, 1);
    flick += 0.002 * (flickT - flick);
    br = (br + 0.02 * (rng() * 2 - 1)) / 1.02;
    lp += aLow * (br * 3 - lp);
    const w = rng() * 2 - 1;
    hp = 0.6 * (hp + w - prev);
    prev = w;
    const v = lp * 0.5 * flick + hp * 0.012 * flick;
    L[i] += v;
    R[i] += v;
  }
  // crackles
  let t = 0;
  while (true) {
    t += -Math.log(1 - rng()) / 16; // ~16 per second, Poisson
    const i0 = Math.floor(t * sr);
    if (i0 >= n - 400) break;
    const big = rng() < 0.06;
    const amp = big ? rr(rng, 0.6, 1) : 0.04 + 0.5 * Math.pow(rng(), 4);
    const pan = rr(rng, -0.7, 0.7);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const subs = 1 + Math.floor(rng() * (big ? 5 : 3));
    let off = 0;
    for (let s = 0; s < subs; s++) {
      const len = Math.floor(sr * rr(rng, 0.0006, big ? 0.006 : 0.0025));
      let p = 0;
      for (let j = 0; j < len * 4 && i0 + off + j < n; j++) {
        const w = rng() * 2 - 1;
        const e = Math.exp(-j / len) * amp * (s === 0 ? 1 : 0.6);
        const v = (w - p) * e;
        p = w;
        L[i0 + off + j] += v * gl;
        R[i0 + off + j] += v * gr;
      }
      off += Math.floor(sr * rr(rng, 0.001, 0.008));
    }
  }
  normalize([L, R], 0.7);
  return toLoopBuffer(ac, L, R, sr, 0.3);
}

// ───────────────────────────── sizzle (griddle, chestnut pan) ─────────────────────────────

export function makeSizzle(ac: BaseAudioContext, rng: Rng, seconds = 5): AudioBuffer {
  const sr = 32000;
  const n = Math.floor((seconds + 0.3) * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const c = { x1: 0, x2: 0, y1: 0, y2: 0 };
  // 2-pole high-pass ~2.6 kHz
  const w = (2 * Math.PI * 2600) / sr;
  const alpha = Math.sin(w) / (2 * 0.7);
  const cosw = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 + cosw) / 2 / a0, b1 = -(1 + cosw) / a0, b2 = b0, a1 = (-2 * cosw) / a0, a2 = (1 - alpha) / a0;
  let mod = 0.4, modT = 0.4, burst = 0;
  for (let i = 0; i < n; i++) {
    if (i % 400 === 0) modT = rr(rng, 0.15, 0.85);
    mod += 0.004 * (modT - mod);
    if (rng() < 7 / sr) burst = rr(rng, 0.5, 1.2);
    burst *= 0.9985;
    const x = rng() * 2 - 1;
    const y = b0 * x + b1 * c.x1 + b2 * c.x2 - a1 * c.y1 - a2 * c.y2;
    c.x2 = c.x1; c.x1 = x; c.y2 = c.y1; c.y1 = y;
    const crackle = rng() < 0.002 ? rr(rng, 0.5, 1) * (rng() < 0.5 ? -1 : 1) : 0;
    const v = y * (mod + burst) * 0.5 + crackle * 0.4;
    const pan = Math.sin(i / sr * 0.7) * 0.3;
    L[i] = v * (1 - pan);
    R[i] = v * (1 + pan);
  }
  normalize([L, R], 0.5);
  return toLoopBuffer(ac, L, R, sr, 0.3);
}

// ───────────────────────────── furnace roar ─────────────────────────────

export function makeFurnace(ac: BaseAudioContext, rng: Rng, seconds = 8): AudioBuffer {
  const sr = 22050;
  const n = Math.floor((seconds + 0.5) * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let br1 = 0, br2 = 0, lp1 = 0, lp2 = 0, flut = 1, flutT = 1;
  let bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
  const cb = bpCoefs(420, 0.9, sr);
  const aLow = onePole(170, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % 1500 === 0) flutT = rr(rng, 0.75, 1.25);
    flut += 0.0015 * (flutT - flut);
    const breath = 0.75 + 0.15 * Math.sin(t * 2 * Math.PI * 0.13) + 0.1 * Math.sin(t * 2 * Math.PI * 0.31 + 1);
    br1 = (br1 + 0.02 * (rng() * 2 - 1)) / 1.02;
    br2 = (br2 + 0.02 * (rng() * 2 - 1)) / 1.02;
    lp1 += aLow * (br1 * 3.5 - lp1);
    lp2 += aLow * (br2 * 3.5 - lp2);
    const w = rng() * 2 - 1;
    const mid = cb.b0 * w + cb.b2 * bx2 - cb.a1 * by1 - cb.a2 * by2;
    bx2 = bx1; bx1 = w; by2 = by1; by1 = mid;
    const k = breath * flut;
    L[i] = (lp1 * 0.9 + mid * 0.18) * k;
    R[i] = (lp2 * 0.9 + mid * 0.18) * k;
  }
  normalize([L, R], 0.6);
  return toLoopBuffer(ac, L, R, sr, 0.5);
}

// ───────────────────────────── snow footsteps ─────────────────────────────

/** A few variants of a soft snow crunch (short, mono). */
export function makeSnowSteps(ac: BaseAudioContext, rng: Rng, count = 6): AudioBuffer[] {
  const sr = 32000;
  const out: AudioBuffer[] = [];
  for (let v = 0; v < count; v++) {
    const len = Math.floor(0.24 * sr);
    const d = new Float32Array(len);
    // compression thump
    let lp = 0;
    const aT = onePole(rr(rng, 160, 260), sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.006) * Math.exp(-t / 0.045);
      lp += aT * (rng() * 2 - 1 - lp);
      d[i] += lp * env * 2.2;
    }
    // crunch grains, densest around 30–70 ms
    const grains = 28 + Math.floor(rng() * 30);
    const center = rr(rng, 0.03, 0.06);
    const spread = rr(rng, 0.018, 0.03);
    const cb = bpCoefs(rr(rng, 1500, 3200), 0.9, sr);
    for (let g = 0; g < grains; g++) {
      const t = Math.max(0.002, center + (rng() + rng() + rng() - 1.5) * spread * 1.6);
      const i0 = Math.floor(t * sr);
      const glen = Math.floor(sr * rr(rng, 0.0003, 0.0018));
      const amp = Math.pow(rng(), 1.6) * (1 - Math.min(0.8, Math.abs(t - center) / 0.08));
      for (let j = 0; j < glen * 3 && i0 + j < len; j++) d[i0 + j] += (rng() * 2 - 1) * amp * Math.exp(-j / glen);
    }
    // band-shape the crunch (keep the thump below)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const res = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const x = d[i];
      const y = cb.b0 * x + cb.b2 * x2 - cb.a1 * y1 - cb.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      res[i] = y * 1.6 + x * 0.35;
    }
    // soften the very top
    let s = 0;
    const aS = onePole(6000, sr);
    for (let i = 0; i < len; i++) {
      s += aS * (res[i] - s);
      res[i] = s;
    }
    // fade out
    for (let i = 0; i < 400; i++) res[len - 1 - i] *= i / 400;
    normalize([res], 0.9);
    const b = ac.createBuffer(1, len, sr);
    b.getChannelData(0).set(res);
    out.push(b);
  }
  return out;
}
