/** Small math helpers shared by the characters module. */

export const TAU = Math.PI * 2;

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential smoothing factor. `rate` ≈ 1/time-constant. */
export function damp(rate: number, dt: number) {
  return 1 - Math.exp(-rate * dt);
}

export function wrapAngle(a: number) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Smoothly turn angle `a` toward `b` (shortest way). */
export function dampAngle(a: number, b: number, rate: number, dt: number) {
  return a + wrapAngle(b - a) * damp(rate, dt);
}

export const ease = {
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t,
  /** Overshoots a little then settles — pops. */
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function strSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 17.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/** Positive pulse 0..1..0 over [0,1]. */
export function bump(t: number) {
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
}

/** First sentence of a text (for ambient bubbles). */
export function firstSentence(s: string, max = 60) {
  const m = s.match(/^.*?[.!?…](?=\s|$)/);
  let out = (m ? m[0] : s).trim();
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}
