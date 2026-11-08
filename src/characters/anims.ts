import type { AnimName } from '../core/contracts';
import { P, type Pose } from './pose';
import { TAU, bump, clamp, lerp, smoothstep } from './util';

/**
 * Procedural animations. Each one writes an absolute pose for time `t` (seconds since it started; for
 * locomotion, `t` is the shared stride phase 0..1). Short legs, round bodies: everything bounces a little.
 */
export type ExtraAnim =
  | 'arrange'
  | 'stir'
  | 'wipe'
  | 'blow'
  | 'accordion'
  | 'lantern'
  | 'spyglass'
  | 'stargaze'
  | 'point'
  | 'shake'
  | 'invite'
  | 'rub'
  | 'stomp'
  | 'scoop'
  | 'sit-talk';
export type AnyAnim = AnimName | ExtraAnim;

export type PropName = 'spatula' | 'mug' | 'hammer' | 'snowball' | 'ladle' | 'cloth' | 'blowpipe' | 'accordion' | 'pole' | 'spyglass' | 'pan';

export interface AnimCtx {
  h: number;
  hipY: number;
  /** 0..1 per-character variation. */
  seed: number;
  /** Seat height when sitting. */
  seat: number;
}

export interface AnimDef {
  /** Cycle length (s). Non-looping anims end after one cycle. */
  duration: number;
  loop: boolean;
  /** Blend-in time (s). */
  fade: number;
  /** Driven by the locomotion stride phase instead of time. Value = metres per cycle. */
  stride?: number;
  props?: { R?: PropName; L?: PropName; chest?: PropName };
  /** Events fired when the cycle time crosses these normalised times. */
  events?: [number, string][];
  /** Plays the talking mouth while active. */
  talks?: boolean;
  /** Idle-like: allows fidgets and look-around. */
  idleLike?: boolean;
  fn: (t: number, p: Pose, k: AnimCtx) => void;
}

/** Shared idle base: breathing, weight shift, relaxed arms. */
function idleBase(t: number, p: Pose, k: AnimCtx, amt = 1) {
  const ph = k.seed * 10;
  const br = Math.sin((t * TAU) / 3.4 + ph);
  const shift = Math.sin((t * TAU) / 7.5 + ph * 1.7);
  p[P.chestY] += 0.0065 * br * k.h * amt;
  p[P.chestRX] += -0.02 * br * amt;
  p[P.baseSY] += 0.007 * br * amt;
  p[P.baseSX] -= 0.003 * br * amt;
  p[P.hipsRZ] += 0.03 * shift * amt;
  p[P.hipsX] += 0.007 * shift * amt;
  p[P.headRZ] += (-0.02 * shift + 0.018 * Math.sin(t * 0.83 + ph)) * amt;
  p[P.headRX] += 0.018 * br * amt;
  p[P.armLZ] += 0.035 * br * amt;
  p[P.armRZ] -= 0.035 * br * amt;
  p[P.armLX] += 0.03 * Math.sin(t * 1.1 + ph) * amt;
  p[P.armRX] += 0.03 * Math.sin(t * 1.1 + ph + 1.3) * amt;
  p[P.handLZ] += 0.05 * Math.sin(t * 0.9 + ph) * amt;
  p[P.handRZ] -= 0.05 * Math.sin(t * 0.9 + ph + 2) * amt;
}

const env = (t: number, a: number, b: number, c: number, d: number) => smoothstep(a, b, t) * (1 - smoothstep(c, d, t));

export const ANIMS: Record<AnyAnim, AnimDef> = {
  idle: {
    duration: 4,
    loop: true,
    fade: 0.3,
    idleLike: true,
    fn: (t, p, k) => idleBase(t, p, k),
  },

  walk: {
    duration: 1,
    loop: true,
    fade: 0.18,
    stride: 1.05,
    events: [
      [0.25, 'step-l'],
      [0.75, 'step-r'],
    ],
    fn: (ph, p, k) => {
      const a = ph * TAU;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const s4 = s * s * s * s;
      p[P.legLX] = -0.62 * s;
      p[P.legRX] = 0.62 * s;
      p[P.legLY] = 0.028 * Math.max(0, c) * k.h;
      p[P.legRY] = 0.028 * Math.max(0, -c) * k.h;
      p[P.hipsY] = (0.024 * c * c - 0.008) * k.h;
      p[P.baseSY] = 1 - 0.035 * s4 + 0.012 * c * c;
      p[P.baseSX] = 1 + 0.022 * s4;
      p[P.armLX] = 0.58 * s - 0.05;
      p[P.armRX] = -0.58 * s - 0.05;
      p[P.armLZ] = 0.36 + 0.06 * c * c;
      p[P.armRZ] = -0.36 - 0.06 * c * c;
      p[P.handLX] = -0.15 * Math.max(0, -s);
      p[P.handRX] = -0.15 * Math.max(0, s);
      p[P.hipsRZ] = -0.065 * s;
      p[P.hipsX] = 0.012 * s * k.h;
      p[P.hipsRY] = -0.1 * s;
      p[P.chestRY] = 0.14 * s;
      p[P.hipsRX] = 0.07;
      p[P.headRX] = -0.05 + 0.025 * c * c;
      p[P.headRZ] = 0.05 * s;
      p[P.headRY] = -0.04 * s;
    },
  },

  run: {
    duration: 1,
    loop: true,
    fade: 0.16,
    stride: 1.75,
    events: [
      [0.25, 'step-l'],
      [0.75, 'step-r'],
    ],
    fn: (ph, p, k) => {
      const a = ph * TAU;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const s4 = s * s * s * s;
      p[P.legLX] = -0.95 * s;
      p[P.legRX] = 0.95 * s;
      p[P.legLY] = 0.06 * Math.max(0, c) * k.h;
      p[P.legRY] = 0.06 * Math.max(0, -c) * k.h;
      p[P.baseY] = 0.05 * c * c * k.h;
      p[P.hipsY] = -0.012 * k.h;
      p[P.baseSY] = 1 - 0.075 * s4 + 0.05 * c * c;
      p[P.baseSX] = 1 + 0.045 * s4 - 0.015 * c * c;
      p[P.armLX] = 0.95 * s - 0.25;
      p[P.armRX] = -0.95 * s - 0.25;
      p[P.armLZ] = 0.5;
      p[P.armRZ] = -0.5;
      p[P.handLX] = -0.5;
      p[P.handRX] = -0.5;
      p[P.hipsRZ] = -0.05 * s;
      p[P.hipsRY] = -0.13 * s;
      p[P.chestRY] = 0.2 * s;
      p[P.hipsRX] = 0.2;
      p[P.headRX] = -0.13 + 0.03 * c * c;
      p[P.headRZ] = 0.04 * s;
      p[P.mouth] = 0.12;
    },
  },

  skate: {
    duration: 1,
    loop: true,
    fade: 0.35,
    stride: 2.8,
    events: [
      [0.25, 'push-l'],
      [0.75, 'push-r'],
    ],
    fn: (ph, p, k) => {
      const a = ph * TAU;
      const s = Math.sin(a);
      const pl = Math.max(0, s);
      const pr = Math.max(0, -s);
      p[P.legLZ] = 0.04 + 0.38 * pl;
      p[P.legLX] = 0.32 * pl;
      p[P.legLY] = 0.035 * pl * k.h;
      p[P.legRZ] = -0.04 - 0.38 * pr;
      p[P.legRX] = 0.32 * pr;
      p[P.legRY] = 0.035 * pr * k.h;
      p[P.hipsRZ] = 0.13 * s;
      p[P.hipsX] = -0.03 * s * k.h;
      p[P.hipsRX] = 0.26;
      p[P.hipsY] = (-0.035 + 0.008 * Math.cos(2 * a)) * k.h;
      p[P.baseSY] = 0.97;
      p[P.baseSX] = 1.02;
      p[P.armLZ] = 0.75 + 0.3 * s;
      p[P.armRZ] = -0.75 + 0.3 * s;
      p[P.armLX] = 0.45 * s - 0.1;
      p[P.armRX] = -0.45 * s - 0.1;
      p[P.chestRY] = 0.15 * s;
      p[P.headRX] = -0.2;
      p[P.headRZ] = -0.08 * s;
    },
  },

  talk: {
    duration: 4,
    loop: true,
    fade: 0.3,
    talks: true,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.8);
      const g = 0.6 + 0.4 * Math.sin(t * 1.3);
      p[P.headRX] += 0.065 * Math.sin(t * 5.1) * g;
      p[P.headRY] += 0.09 * Math.sin(t * 1.7);
      p[P.headRZ] += 0.05 * Math.sin(t * 1.15);
      const gest = 0.5 + 0.5 * Math.sin(t * 2.4);
      p[P.armRX] = -0.45 - 0.4 * gest;
      p[P.armRZ] = -0.5 - 0.15 * Math.sin(t * 1.9);
      p[P.handRZ] = 0.35 * Math.sin(t * 3.1);
      p[P.armLX] = -0.18 + 0.12 * Math.sin(t * 2.1 + 1);
      p[P.armLZ] = 0.42 + 0.08 * Math.sin(t * 1.6);
      p[P.chestRY] = 0.07 * Math.sin(t * 1.4);
      p[P.brow] = 0.25 * Math.max(0, Math.sin(t * 2.2));
    },
  },

  wave: {
    duration: 2.2,
    loop: false,
    fade: 0.18,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const e = env(t, 0, 0.28, 1.85, 2.2);
      const w = Math.sin(t * 12.5);
      p[P.armRZ] = lerp(-0.36, -2.55, e) + e * 0.26 * w;
      p[P.armRX] = lerp(-0.08, -0.32, e);
      p[P.handRZ] = e * 0.4 * Math.sin(t * 12.5 - 0.7);
      p[P.hipsRZ] += e * 0.06;
      p[P.headRZ] += 0.15 * e;
      p[P.chestRY] = -0.12 * e;
      p[P.baseY] = e * 0.012 * Math.abs(Math.sin(t * 6.2)) * k.h;
      p[P.smile] = 1 + 0.3 * e;
      p[P.brow] = 0.3 * e;
    },
  },

  cheer: {
    duration: 1.9,
    loop: false,
    fade: 0.12,
    fn: (t, p, k) => {
      const T = 0.95;
      const u = (t % T) / T;
      const crouch = u < 0.25 ? bump(u / 0.25) : 0;
      const land = u > 0.78 ? bump((u - 0.78) / 0.22) : 0;
      const fl = u >= 0.25 && u <= 0.78 ? (u - 0.25) / 0.53 : -1;
      const jump = fl >= 0 ? 4 * fl * (1 - fl) : 0;
      p[P.baseY] = 0.27 * jump * k.h;
      p[P.baseSY] = 1 - 0.13 * crouch - 0.11 * land + 0.08 * jump;
      p[P.baseSX] = 1 + 0.08 * crouch + 0.07 * land - 0.04 * jump;
      const up = clamp(0.55 + jump * 0.6 - crouch * 0.4, 0, 1);
      p[P.armLZ] = lerp(1.6, 2.75, up) + 0.12 * Math.sin(u * TAU * 2);
      p[P.armRZ] = -lerp(1.6, 2.75, up) - 0.12 * Math.sin(u * TAU * 2);
      p[P.armLX] = -0.15;
      p[P.armRX] = -0.15;
      p[P.handLZ] = 0.3 * Math.sin(u * TAU * 3);
      p[P.handRZ] = -0.3 * Math.sin(u * TAU * 3);
      p[P.legLX] = -0.35 * jump;
      p[P.legRX] = -0.2 * jump;
      p[P.legLZ] = 0.1 * jump;
      p[P.legRZ] = -0.1 * jump;
      p[P.headRX] = -0.18 + 0.1 * crouch;
      p[P.mouth] = 0.75;
      p[P.smile] = 1.25;
      p[P.eyes] = 0.35;
      p[P.brow] = 0.5;
    },
  },

  cook: {
    duration: 3.4,
    loop: true,
    fade: 0.3,
    props: { R: 'spatula' },
    events: [[0.58, 'flip']],
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.6);
      const f = bump((t - 1.95) / 0.55);
      const look = env(t, 1.9, 2.1, 2.55, 2.9);
      p[P.hipsRX] = 0.1;
      p[P.armRX] = -1.05 - 0.75 * f;
      p[P.armRZ] = -0.22;
      p[P.armRY] = 0.15 * Math.sin(t * 2.3) * (1 - f);
      p[P.handRX] = 0.25 - 1.3 * f;
      p[P.armLX] = -0.85;
      p[P.armLZ] = 0.35;
      p[P.armLY] = -0.15;
      p[P.headRX] = 0.28 - 0.5 * look;
      p[P.headRZ] += 0.06 * Math.sin(t * 1.2);
      p[P.baseY] = 0.015 * bump((t - 2.55) / 0.35) * k.h;
      p[P.brow] = 0.6 * look;
      p[P.mouth] = 0.35 * look;
      p[P.prop0] = clamp((t - 1.95) / 0.75, 0, 1);
    },
  },

  craft: {
    duration: 1.1,
    loop: true,
    fade: 0.25,
    props: { R: 'hammer' },
    events: [[0.72, 'hit']],
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.4);
      const u = t / 1.1;
      const raise = u < 0.6 ? smoothstep(0, 0.6, u) : u < 0.72 ? 1 - (u - 0.6) / 0.12 : bump((u - 0.72) / 0.28) * 0.12;
      p[P.hipsRX] = 0.14;
      p[P.armRX] = -0.85 - 0.95 * raise;
      p[P.armRZ] = -0.3;
      p[P.handRX] = -0.2 - 0.4 * raise;
      p[P.armLX] = -0.85;
      p[P.armLZ] = 0.18;
      p[P.armLY] = -0.25;
      p[P.headRX] = 0.32;
      const hit = u > 0.72 ? bump((u - 0.72) / 0.12) : 0;
      p[P.baseSY] = 1 - 0.025 * hit;
      p[P.eyes] = 1 - 0.5 * hit;
    },
  },

  drink: {
    duration: 5.2,
    loop: true,
    fade: 0.35,
    props: { R: 'mug' },
    events: [[0.5, 'sip'], [0.86, 'steam']],
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.8);
      const s = env(t, 2.4, 2.95, 3.8, 4.35);
      p[P.armRX] = -0.95 - 0.78 * s;
      p[P.armRZ] = -0.18;
      p[P.armRY] = 0.42 * s;
      p[P.handRX] = 0.28 + 0.55 * s;
      p[P.prop0] = s;
      p[P.armLX] = -0.72 - 0.28 * s;
      p[P.armLZ] = 0.2;
      p[P.armLY] = -0.25;
      p[P.headRX] = 0.08 - 0.22 * s;
      p[P.eyes] = 1 - 0.85 * s;
      const ah = env(t, 4.3, 4.5, 4.8, 5.1);
      p[P.mouth] = 0.3 * ah;
      p[P.chestY] += 0.008 * ah * k.h;
      p[P.smile] = 1 + 0.25 * ah;
    },
  },

  sit: {
    duration: 6,
    loop: true,
    fade: 0.45,
    idleLike: true,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.7);
      p[P.baseY] = k.seat - k.hipY + 0.07 * k.h;
      const kick = Math.sin(t * 2.3 + k.seed * 6);
      const lazy = 0.5 + 0.5 * Math.sin(t * 0.37 + k.seed * 3);
      p[P.legLX] = -1.42 + 0.22 * kick * lazy;
      p[P.legRX] = -1.42 - 0.22 * kick * lazy;
      p[P.legLZ] = 0.08;
      p[P.legRZ] = -0.08;
      p[P.armLX] = -0.65;
      p[P.armLZ] = 0.16;
      p[P.armRX] = -0.65;
      p[P.armRZ] = -0.16;
      p[P.hipsRX] = -0.06;
      p[P.hipsRZ] *= 0.4;
    },
  },

  throw: {
    duration: 1.05,
    loop: false,
    fade: 0.12,
    props: { R: 'snowball' },
    events: [[0.5, 'release']],
    fn: (t, p, k) => {
      const wind = smoothstep(0, 0.45, t) * (1 - smoothstep(0.45, 0.6, t));
      const fwd = smoothstep(0.42, 0.6, t) * (1 - smoothstep(0.7, 1.05, t));
      p[P.armRZ] = -0.4 - 1.75 * wind - 0.5 * fwd;
      p[P.armRX] = 0.55 * wind - 1.65 * fwd;
      p[P.handRX] = 0.6 * wind - 0.4 * fwd;
      p[P.chestRY] = -0.42 * wind + 0.38 * fwd;
      p[P.hipsRY] = -0.2 * wind + 0.18 * fwd;
      p[P.hipsRX] = -0.08 * wind + 0.18 * fwd;
      p[P.armLX] = -1.15 * wind - 0.4 * fwd;
      p[P.armLZ] = 0.4 + 0.2 * wind;
      p[P.legLX] = -0.35 * wind - 0.1 * fwd;
      p[P.legRX] = 0.2 * wind + 0.25 * fwd;
      p[P.headRX] = -0.08;
      p[P.baseSY] = 1 - 0.05 * wind + 0.04 * fwd;
      p[P.mouth] = 0.4 * fwd;
      p[P.brow] = -0.3 * wind;
      p[P.prop0] = t < 0.5 ? 1 : 0;
    },
  },

  clap: {
    duration: 0.52,
    loop: true,
    fade: 0.15,
    events: [[0.5, 'clap']],
    fn: (t, p, k) => {
      const u = (t % 0.52) / 0.52;
      const open = 0.5 + 0.5 * Math.cos(u * TAU);
      p[P.armLX] = -1.05;
      p[P.armRX] = -1.05;
      p[P.armLZ] = 0.04 + 0.42 * open;
      p[P.armRZ] = -0.04 - 0.42 * open;
      p[P.armLY] = -0.2;
      p[P.armRY] = 0.2;
      p[P.handLZ] = -0.5;
      p[P.handRZ] = 0.5;
      p[P.baseY] = 0.014 * Math.abs(Math.sin(u * Math.PI)) * k.h;
      p[P.headRX] = -0.05 + 0.04 * Math.sin(u * TAU);
      p[P.eyes] = 0.4;
      p[P.smile] = 1.25;
      p[P.mouth] = 0.25;
    },
  },

  think: {
    duration: 6,
    loop: true,
    fade: 0.4,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.6);
      p[P.armRX] = -2.15;
      p[P.armRY] = 0.5;
      p[P.armRZ] = -0.1;
      p[P.handRX] = -0.7;
      p[P.handRZ] = 0.12 * Math.sin(t * 3);
      p[P.armLX] = -0.8;
      p[P.armLY] = -0.65;
      p[P.armLZ] = 0.05;
      p[P.headRZ] = 0.13 + 0.03 * Math.sin(t * 0.7);
      p[P.headRX] = -0.14;
      p[P.eyeX] = 0.006;
      p[P.eyeY] = 0.007;
      p[P.brow] = 0.35;
      p[P.hipsRZ] = 0.04;
      p[P.smile] = 0.7;
    },
  },

  // ───────── extras (role behaviours, fidgets) ─────────

  arrange: {
    duration: 3.6,
    loop: true,
    fade: 0.35,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const sw = Math.sin((t * TAU) / 3.6);
      p[P.hipsRX] = 0.18;
      p[P.armLX] = -0.95 + 0.12 * Math.sin(t * 2.7);
      p[P.armRX] = -0.9 + 0.12 * Math.sin(t * 2.7 + 2);
      p[P.armLZ] = 0.2;
      p[P.armRZ] = -0.2;
      p[P.armLY] = -0.2 + 0.25 * sw;
      p[P.armRY] = 0.2 + 0.25 * sw;
      p[P.chestRY] = 0.18 * sw;
      p[P.headRY] = 0.25 * sw;
      p[P.headRX] = 0.35;
      p[P.hipsRY] = 0.05 * sw;
    },
  },

  stir: {
    duration: 2.2,
    loop: true,
    fade: 0.35,
    props: { R: 'ladle' },
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const w = (t * TAU) / 2.2;
      p[P.hipsRX] = 0.12;
      p[P.armRX] = -0.85 + 0.16 * Math.cos(w);
      p[P.armRY] = 0.28 * Math.sin(w);
      p[P.armRZ] = -0.25;
      p[P.handRX] = 0.6;
      p[P.chestRY] = 0.08 * Math.sin(w);
      p[P.armLZ] = 0.75;
      p[P.armLX] = 0.25;
      p[P.handLZ] = -0.6;
      p[P.headRX] = 0.3;
      p[P.headRZ] += 0.05 * Math.sin(w * 0.5);
    },
  },

  wipe: {
    duration: 1.5,
    loop: true,
    fade: 0.3,
    props: { L: 'mug', R: 'cloth' },
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const w = (t * TAU) / 0.75;
      p[P.armLX] = -1.0;
      p[P.armLY] = -0.35;
      p[P.armLZ] = 0.1;
      p[P.handLX] = 0.3;
      p[P.armRX] = -1.05 + 0.12 * Math.sin(w);
      p[P.armRY] = 0.4 + 0.14 * Math.cos(w);
      p[P.armRZ] = -0.1;
      p[P.headRX] = 0.3;
      p[P.headRZ] += 0.06;
    },
  },

  blow: {
    duration: 4.2,
    loop: true,
    fade: 0.4,
    props: { R: 'blowpipe' },
    events: [[0.3, 'puff']],
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.4);
      const blowE = env(t, 1.1, 1.4, 3.2, 3.6);
      const roll = t * 2.2;
      p[P.armRX] = -2.0;
      p[P.armRY] = 0.42;
      p[P.armRZ] = -0.08;
      p[P.handRY] = roll;
      p[P.armLX] = -1.7;
      p[P.armLY] = -0.32;
      p[P.armLZ] = 0.08;
      p[P.headRX] = 0.05 - 0.08 * (1 - blowE);
      p[P.chestY] += (0.01 * (1 - blowE) - 0.004 * blowE) * k.h;
      p[P.mouth] = 0.12 + 0.2 * blowE;
      p[P.smile] = 1 - 0.7 * blowE;
      p[P.eyes] = 1 - 0.45 * blowE;
      p[P.brow] = 0.3 * blowE;
      p[P.prop0] = blowE;
      p[P.prop1] = clamp(t / 3.4, 0, 1);
    },
  },

  accordion: {
    duration: 2.4,
    loop: true,
    fade: 0.4,
    props: { chest: 'accordion' },
    events: [[0, 'note'], [0.5, 'note']],
    fn: (t, p, k) => {
      const beat = (t * TAU) / 1.2;
      const sq = 0.5 + 0.5 * Math.sin((t * TAU) / 2.4);
      idleBase(t, p, k, 0.4);
      p[P.armLX] = -1.0;
      p[P.armRX] = -1.0;
      p[P.armLZ] = 0.35 + 0.42 * sq;
      p[P.armRZ] = -0.35 - 0.42 * sq;
      p[P.armLY] = -0.15;
      p[P.armRY] = 0.15;
      p[P.handLZ] = -0.4;
      p[P.handRZ] = 0.4;
      p[P.hipsRZ] = 0.07 * Math.sin(beat * 0.5);
      p[P.headRX] = 0.05 + 0.06 * Math.abs(Math.sin(beat));
      p[P.headRZ] = -0.12 * Math.sin(beat * 0.5);
      p[P.legRY] = 0.02 * Math.max(0, Math.sin(beat)) * k.h;
      p[P.legRX] = -0.12 * Math.max(0, Math.sin(beat));
      p[P.eyes] = 0.35 + 0.65 * smoothstep(0.3, 0.9, Math.sin(t * 0.5));
      p[P.smile] = 1.2;
      p[P.prop0] = sq;
    },
  },

  lantern: {
    duration: 6,
    loop: true,
    fade: 0.4,
    idleLike: true,
    props: { R: 'pole' },
    fn: (t, p, k) => {
      idleBase(t, p, k);
      p[P.armRX] = -0.42 + 0.03 * Math.sin(t * 0.9);
      p[P.armRZ] = -0.2;
      p[P.armRY] = 0.15;
      p[P.handRX] = 0.42;
      p[P.armLZ] = 0.32;
    },
  },

  spyglass: {
    duration: 8,
    loop: true,
    fade: 0.5,
    props: { R: 'spyglass' },
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      p[P.armRX] = -2.2;
      p[P.armRY] = 0.32;
      p[P.armRZ] = -0.22;
      p[P.handRX] = -0.15;
      p[P.armLX] = -2.0;
      p[P.armLY] = -0.35;
      p[P.armLZ] = 0.12;
      p[P.headRX] = -0.32;
      p[P.headRY] = 0.18 * Math.sin((t * TAU) / 8);
      p[P.chestRY] = 0.1 * Math.sin((t * TAU) / 8);
      p[P.hipsRX] = -0.07;
      p[P.eyes] = 0.75;
    },
  },

  stargaze: {
    duration: 7,
    loop: true,
    fade: 0.5,
    fn: (t, p, k) => {
      idleBase(t, p, k);
      p[P.armLX] = 0.5;
      p[P.armLZ] = 0.16;
      p[P.armRX] = 0.5;
      p[P.armRZ] = -0.16;
      p[P.armLY] = 0.3;
      p[P.armRY] = -0.3;
      p[P.headRX] = -0.55 + 0.05 * Math.sin(t * 0.5);
      p[P.headRY] = 0.25 * Math.sin((t * TAU) / 7);
      p[P.hipsRX] = -0.08;
      p[P.baseY] = 0.01 * Math.max(0, Math.sin(t * 0.9)) * k.h;
      p[P.mouth] = 0.15;
      p[P.eyeY] = 0.006;
    },
  },

  point: {
    duration: 2.6,
    loop: false,
    fade: 0.25,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const e = env(t, 0, 0.35, 2.1, 2.6);
      p[P.armRX] = lerp(-0.08, -2.35, e);
      p[P.armRZ] = lerp(-0.36, -0.35, e);
      p[P.handRX] = -0.3 * e;
      p[P.armLZ] = lerp(0.36, 0.7, e);
      p[P.armLX] = lerp(-0.08, 0.3, e);
      p[P.headRX] = -0.45 * e;
      p[P.baseY] = 0.02 * bump((t - 0.2) / 0.4) * k.h;
      p[P.mouth] = 0.4 * env(t, 0.3, 0.5, 1.2, 1.5);
      p[P.brow] = 0.5 * e;
    },
  },

  shake: {
    duration: 0.9,
    loop: true,
    fade: 0.3,
    props: { R: 'pan' },
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const w = (t * TAU) / 0.45;
      p[P.armRX] = -0.92 + 0.1 * Math.sin(w);
      p[P.armRY] = 0.1 * Math.sin(w + 1);
      p[P.armRZ] = -0.28;
      p[P.handRX] = 0.6;
      p[P.armLZ] = 0.45;
      p[P.hipsRX] = 0.06;
      p[P.headRX] = 0.22;
      p[P.prop0] = Math.max(0, Math.sin(w));
    },
  },

  invite: {
    duration: 2.6,
    loop: false,
    fade: 0.25,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.5);
      const e = env(t, 0, 0.3, 2.1, 2.6);
      const sweep = smoothstep(0.3, 1.2, t);
      p[P.armRX] = lerp(-0.08, lerp(-1.3, -0.55, sweep), e);
      p[P.armRZ] = lerp(-0.36, lerp(-0.5, -1.35, sweep), e);
      p[P.handRZ] = -0.4 * e * Math.sin(t * 6);
      p[P.armLZ] = lerp(0.36, 0.75, e);
      p[P.armLX] = lerp(-0.08, 0.25, e);
      p[P.hipsRX] = 0.12 * e;
      p[P.headRZ] += 0.12 * e;
      p[P.headRX] = -0.08 * e + 0.08 * Math.sin(t * 5) * e;
      p[P.baseY] = 0.012 * Math.abs(Math.sin(t * 5)) * e * k.h;
      p[P.mouth] = 0.55 * env(t, 0.3, 0.45, 1.3, 1.6);
      p[P.smile] = 1.2;
      p[P.brow] = 0.4 * e;
    },
  },

  rub: {
    duration: 2.6,
    loop: false,
    fade: 0.3,
    idleLike: true,
    events: [[0.82, 'breath']],
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.6);
      const e = env(t, 0, 0.35, 2.2, 2.6);
      const r = Math.sin(t * 15) * smoothstep(0.35, 0.5, t) * (1 - smoothstep(1.7, 1.9, t));
      const blowE = env(t, 1.8, 2.0, 2.3, 2.5);
      p[P.armLX] = lerp(-0.08, -1.1 - 0.2 * blowE, e);
      p[P.armRX] = lerp(-0.08, -1.1 - 0.2 * blowE, e);
      p[P.armLZ] = lerp(0.36, 0.05, e);
      p[P.armRZ] = lerp(-0.36, -0.05, e);
      p[P.armLY] = -0.3 * e + 0.07 * r;
      p[P.armRY] = 0.3 * e + 0.07 * r;
      p[P.handLZ] = -0.4 * e;
      p[P.handRZ] = 0.4 * e;
      p[P.headRX] = 0.1 * e + 0.15 * blowE;
      p[P.mouth] = 0.4 * blowE;
      p[P.eyes] = 1 - 0.7 * blowE;
      p[P.baseSX] = 1 + 0.01 * r;
    },
  },

  stomp: {
    duration: 1.6,
    loop: false,
    fade: 0.2,
    idleLike: true,
    fn: (t, p, k) => {
      idleBase(t, p, k, 0.6);
      const e = env(t, 0, 0.15, 1.3, 1.6);
      const w = Math.sin(t * TAU * 2.2);
      p[P.legLY] = 0.035 * Math.max(0, w) * e * k.h;
      p[P.legRY] = 0.035 * Math.max(0, -w) * e * k.h;
      p[P.legLX] = -0.25 * Math.max(0, w) * e;
      p[P.legRX] = -0.25 * Math.max(0, -w) * e;
      p[P.hipsRZ] = 0.05 * w * e;
      p[P.armLZ] = lerp(0.36, 0.16, e);
      p[P.armRZ] = lerp(-0.36, -0.16, e);
      p[P.baseY] = 0.008 * Math.abs(w) * e * k.h;
      p[P.eyes] = 1 - 0.5 * e;
      p[P.smile] = 1 + 0.2 * e;
    },
  },

  scoop: {
    duration: 1.4,
    loop: false,
    fade: 0.2,
    fn: (t, p, k) => {
      const e = env(t, 0, 0.3, 1.1, 1.4);
      const pat = Math.sin(t * 16) * smoothstep(0.35, 0.5, t) * (1 - smoothstep(0.95, 1.05, t));
      p[P.hipsRX] = 0.7 * e;
      p[P.hipsY] = -0.04 * e * k.h;
      p[P.baseSY] = 1 - 0.08 * e;
      p[P.baseSX] = 1 + 0.04 * e;
      p[P.legLX] = -0.45 * e;
      p[P.legRX] = -0.45 * e;
      p[P.armLX] = -0.9 * e;
      p[P.armRX] = -0.9 * e;
      p[P.armLZ] = lerp(0.36, 0.12, e);
      p[P.armRZ] = lerp(-0.36, -0.12, e);
      p[P.armLY] = -0.2 * e + 0.08 * pat;
      p[P.armRY] = 0.2 * e - 0.08 * pat;
      p[P.headRX] = -0.35 * e;
    },
  },

  'sit-talk': {
    duration: 5,
    loop: true,
    fade: 0.4,
    talks: true,
    fn: (t, p, k) => {
      ANIMS.sit.fn(t, p, k);
      p[P.headRX] += 0.05 * Math.sin(t * 5);
      p[P.armRX] = -0.75 - 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2));
      p[P.armRZ] = -0.35;
      p[P.handRZ] = 0.3 * Math.sin(t * 3);
    },
  },
};

/** Locomotion anims (driven by the stride phase). */
export const LOCO: AnyAnim[] = ['walk', 'run', 'skate'];
