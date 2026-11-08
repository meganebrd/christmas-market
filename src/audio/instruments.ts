/**
 * Synthesised instruments. Each note is a handful of oscillators with exponential envelopes; every
 * node is disconnected when the note has rung out (see `Voice`).
 */
import { clamp, rr } from './dsp';
import { Voice, type Graph } from './graph';
import { mtof } from './theory';

export type Inst = 'musicbox' | 'celesta' | 'glock' | 'harp' | 'bass' | 'pad' | 'bells' | 'organ' | 'accordion';

export interface NoteResult {
  end: number;
  /** Main amplitude node — used to damp a ringing tine when the same pitch is struck again. */
  gain?: GainNode;
}

type Partial = [ratio: number, level: number, decayMul: number];

/** Struck/plucked metal: a sum of partials with their own exponential decays. */
function struck(v: Voice, out: AudioNode, t: number, f: number, amp: number, tc: number, attack: number, partials: Partial[], detuneCents = 0): GainNode {
  let main: GainNode | undefined;
  for (const [ratio, level, dm] of partials) {
    const pf = f * ratio;
    if (pf > 15000) continue;
    const g = v.gain(0);
    g.connect(out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp * level, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tc * dm);
    const o = v.osc('sine', pf, t);
    if (detuneCents) o.detune.setValueAtTime(detuneCents, t);
    o.connect(g);
    if (!main) main = g;
  }
  return main!;
}

export function musicBox(g: Graph, out: AudioNode, t: number, midi: number, vel: number, detune = 0): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const tc = clamp(0.62 * Math.sqrt(784 / f), 0.22, 1.1);
  const amp = vel * 0.2 * Math.pow(523 / f, 0.22);
  const main = struck(v, out, t, f, amp, tc, 0.0025, [
    [1, 1, 1],
    [2, 0.14, 0.35],
    [5.95, 0.09, 0.07],
  ], detune);
  // slightly detuned twin for the shimmering beat of a real comb
  const twin = v.gain(0);
  twin.connect(out);
  twin.gain.setValueAtTime(0, t);
  twin.gain.linearRampToValueAtTime(amp * 0.32, t + 0.003);
  twin.gain.setTargetAtTime(0, t + 0.003, tc * 0.8);
  const o = v.osc('sine', f, t);
  o.detune.setValueAtTime(detune + rr(g.rng, 3, 6), t);
  o.connect(twin);
  const end = t + tc * 6.5;
  v.end(end);
  return { end, gain: main };
}

export function celesta(g: Graph, out: AudioNode, t: number, midi: number, vel: number, detune = 0): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const tc = clamp(0.45 * Math.sqrt(784 / f), 0.16, 0.8);
  const amp = vel * 0.21 * Math.pow(523 / f, 0.2);
  const main = struck(v, out, t, f, amp, tc, 0.004, [
    [1, 1, 1],
    [2.003, 0.1, 0.45],
    [3.98, 0.06, 0.14],
  ], detune);
  const end = t + tc * 6.5;
  v.end(end);
  return { end, gain: main };
}

export function glock(g: Graph, out: AudioNode, t: number, midi: number, vel: number, detune = 0): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const tc = clamp(0.55 * Math.sqrt(1568 / f), 0.25, 0.9);
  const amp = vel * 0.15;
  const main = struck(v, out, t, f, amp, tc, 0.0012, [
    [1, 1, 1],
    [2.76, 0.2, 0.3],
    [5.4, 0.09, 0.12],
  ], detune);
  const end = t + tc * 6.5;
  v.end(end);
  return { end, gain: main };
}

export function harp(g: Graph, out: AudioNode, t: number, midi: number, vel: number): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const tc = clamp(0.36 * Math.sqrt(392 / f), 0.12, 0.6);
  const gn = v.gain(0);
  gn.connect(out);
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(vel * 0.2, t + 0.004);
  gn.gain.setTargetAtTime(0, t + 0.004, tc);
  v.osc('sine', f, t, g.waves.harp).connect(gn);
  const end = t + tc * 6.5;
  v.end(end);
  return { end, gain: gn };
}

export function bass(g: Graph, out: AudioNode, t: number, midi: number, vel: number, dur: number): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const lp = v.filter('lowpass', 300, 0.8);
  lp.frequency.setValueAtTime(380 + 1100 * vel, t);
  lp.frequency.setTargetAtTime(260, t + 0.005, 0.12);
  const gn = v.gain(0);
  lp.connect(gn).connect(out);
  const hold = Math.min(dur, 2.4);
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(vel * 0.36, t + 0.006);
  gn.gain.setTargetAtTime(vel * 0.1, t + 0.006, 0.4);
  gn.gain.setTargetAtTime(0, t + hold, 0.08);
  v.osc('sine', f, t, g.waves.bass).connect(lp);
  const end = t + hold + 0.6;
  v.end(end);
  return { end, gain: gn };
}

/** Warm pad voice: two detuned saws, slow attack/release. The pad bus adds the low-pass + chorus. */
export function pad(g: Graph, out: AudioNode, t: number, midi: number, vel: number, dur: number, lfo?: AudioNode): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const gn = v.gain(0);
  gn.connect(out);
  const amp = vel * 0.05;
  gn.gain.setValueAtTime(0, t);
  gn.gain.setTargetAtTime(amp, t, 0.32);
  gn.gain.setTargetAtTime(0, t + dur, 0.42);
  for (const [cents, p] of [[-7, -0.45], [7, 0.45]] as const) {
    const o = v.osc('sawtooth', f, t);
    o.detune.setValueAtTime(cents + rr(g.rng, -2, 2), t);
    if (lfo) lfo.connect(o.detune);
    o.connect(v.pan(p)).connect(gn);
  }
  const tri = v.osc('triangle', f / 2, t);
  const tg = v.gain(0.9);
  tri.connect(tg).connect(gn);
  const end = t + dur + 2.6;
  v.end(end);
  return { end, gain: gn };
}

/** Sleigh bells: a cluster of tiny metallic noise hits. `shake` = longer roll. */
export function bells(g: Graph, out: AudioNode, t: number, vel: number, shake = false): NoteResult {
  const v = new Voice(g.ac);
  const rng = g.rng;
  const bp = v.filter('bandpass', rr(rng, 6800, 9200), 1.4);
  const hp = v.filter('highpass', 4200, 0.7);
  const gn = v.gain(0);
  bp.connect(hp).connect(gn).connect(out);
  const n = shake ? 6 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3);
  let tk = t;
  for (let k = 0; k < n; k++) {
    const a = vel * 0.55 * (k === 0 ? 1 : rr(rng, 0.35, 0.8)) * (shake ? 1 - k / (n + 2) : 1);
    gn.gain.setValueAtTime(0, tk);
    gn.gain.linearRampToValueAtTime(a, tk + 0.0015);
    gn.gain.setTargetAtTime(0, tk + 0.0015, 0.018);
    tk += rr(rng, 0.011, shake ? 0.03 : 0.024);
  }
  const src = v.buf(g.white, t, { offset: g.noiseOffset(g.white, 0.5) });
  src.connect(bp);
  // a faint metallic ping on top
  const pg = v.gain(0);
  pg.connect(out);
  pg.gain.setValueAtTime(0, t);
  pg.gain.linearRampToValueAtTime(vel * 0.025, t + 0.001);
  pg.gain.setTargetAtTime(0, t + 0.001, 0.035);
  v.osc('sine', rr(rng, 4300, 6600), t).connect(pg);
  const end = tk + 0.2;
  v.end(end);
  return { end, gain: gn };
}

export function organ(g: Graph, out: AudioNode, t: number, midi: number, vel: number, dur: number): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const gn = v.gain(0);
  gn.connect(out);
  const amp = vel * 0.1;
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(amp, t + 0.014);
  gn.gain.setTargetAtTime(amp * 0.8, t + 0.014, 0.1);
  gn.gain.setTargetAtTime(0, t + dur, 0.035);
  v.osc('sine', f, t, g.waves.organ).connect(gn);
  const fl = v.gain(0.22);
  v.osc('sine', f * 2, t).connect(fl).connect(gn);
  const end = t + dur + 0.3;
  v.end(end);
  return { end, gain: gn };
}

export function accordion(g: Graph, out: AudioNode, t: number, midi: number, vel: number, dur: number): NoteResult {
  const v = new Voice(g.ac);
  const f = mtof(midi);
  const lp = v.filter('lowpass', 2300, 0.6);
  const gn = v.gain(0);
  lp.connect(gn).connect(out);
  const amp = vel * 0.075;
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(amp, t + 0.045);
  gn.gain.setTargetAtTime(0, t + dur, 0.06);
  for (const c of [-13, 0, 13]) {
    const o = v.osc('sine', f, t, g.waves.reed);
    o.detune.setValueAtTime(c, t);
    const og = v.gain(c === 0 ? 0.5 : 0.45);
    o.connect(og).connect(lp);
  }
  const end = t + dur + 0.4;
  v.end(end);
  return { end, gain: gn };
}

/** Additive church bell (distant): hum, prime, tierce, quint, nominal… */
export function churchBell(g: Graph, out: AudioNode, t: number, f: number, vel: number): NoteResult {
  const v = new Voice(g.ac);
  const lp = v.filter('lowpass', 2400, 0.5);
  lp.connect(out);
  struck(v, lp, t, f, vel * 0.12, 1.4, 0.004, [
    [0.5, 0.9, 2.6],
    [1, 1, 1.6],
    [1.183, 0.6, 1.2],
    [1.506, 0.45, 0.9],
    [2, 0.55, 0.8],
    [2.514, 0.3, 0.5],
    [2.662, 0.22, 0.45],
    [3.011, 0.18, 0.35],
    [4.166, 0.12, 0.25],
  ]);
  const end = t + 1.4 * 2.6 * 5;
  v.end(end);
  return { end };
}

export function playInst(g: Graph, inst: Inst, out: AudioNode, t: number, midi: number, vel: number, dur: number, lfo?: AudioNode, detune = 0): NoteResult {
  switch (inst) {
    case 'musicbox':
      return musicBox(g, out, t, midi, vel, detune);
    case 'celesta':
      return celesta(g, out, t, midi, vel, detune);
    case 'glock':
      return glock(g, out, t, midi, vel, detune);
    case 'harp':
      return harp(g, out, t, midi, vel);
    case 'bass':
      return bass(g, out, t, midi, vel, dur);
    case 'pad':
      return pad(g, out, t, midi, vel, dur, lfo);
    case 'bells':
      return bells(g, out, t, vel, midi > 0);
    case 'organ':
      return organ(g, out, t, midi, vel, dur);
    case 'accordion':
      return accordion(g, out, t, midi, vel, dur);
  }
}
