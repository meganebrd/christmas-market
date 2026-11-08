/**
 * Arranger: turns a compact song (melody + chords + form) into a complete little piece for a music-box
 * ensemble, as a sorted list of timed note events:
 *
 *   intro      the last phrase, softly, on celesta over the pad
 *   theme      music-box lead, warm pad, plucked bass, harp "oom-pah" (per feel)
 *   variation  celesta lead + music-box counter-melody, sleigh bells on lively songs
 *   soft       a softer verse: music box, pad, sparse bass, rolled chords
 *   final      (short songs) the theme again, fuller
 *   outro      the last phrase with a ritardando, then a held final chord and a sparkle
 *
 * Events flagged `sw` (extra counter-melody, glockenspiel descant, bells) only play during the
 * finale "swell". Light humanisation: timing/velocity jitter, swing where the song asks for it.
 */
import { clamp, mulberry32, type Rng } from './dsp';
import type { Inst } from './instruments';
import { SONGS, type SongDef } from './songs';
import { nearestPc, noteName, parseChord, parseChordLine, parseMelody, type Chord } from './theory';

export interface PNote {
  u: number;
  len: number;
  midi: number;
}
export interface PChord {
  u: number;
  len: number;
  chord: Chord | null;
}
export interface Theme {
  notes: PNote[];
  chords: PChord[];
  length: number;
  sections: { id: string; u: number; len: number }[];
}

export type PassKind = 'intro' | 'theme' | 'variation' | 'soft' | 'final' | 'outro';

export interface Ev {
  /** Seconds from the start of the track. */
  t: number;
  /** Duration in seconds (sustain for pad/bass/organ; informative for struck instruments). */
  d: number;
  i: Inst;
  m: number;
  v: number;
  /** Swell-only layer. */
  sw?: boolean;
  /** Priority for voice stealing: 0 ornaments … 3 lead. */
  pr: number;
}

export interface Arrangement {
  song: SongDef;
  events: Ev[];
  /** Seconds until the last note has rung out. */
  end: number;
  /** Start of the main theme (after the intro). */
  themeStart: number;
  passes: { kind: PassKind; t0: number; t1: number }[];
}

// ───────────────────────────── parsing ─────────────────────────────

export function buildTheme(song: SongDef, form: string[]): Theme {
  const notes: PNote[] = [];
  const chords: PChord[] = [];
  const sections: Theme['sections'] = [];
  let u = 0;
  for (const id of form) {
    const sec = song.sections[id];
    if (!sec) continue;
    if (sec.pickup) {
      const p = parseMelody(sec.pickup);
      let pu = u - p.total;
      for (const n of p.items) {
        if (n.midi !== null) notes.push({ u: pu, len: n.len, midi: n.midi });
        pu += n.len;
      }
    }
    const mel = parseMelody(sec.melody);
    let mu = u;
    for (const n of mel.items) {
      if (n.midi !== null) notes.push({ u: mu, len: n.len, midi: n.midi });
      mu += n.len;
    }
    const ch = parseChordLine(sec.chords);
    let cu = u;
    for (const c of ch.items) {
      chords.push({ u: cu, len: c.len, chord: c.chord });
      cu += c.len;
    }
    sections.push({ id, u, len: mel.total });
    u += mel.total;
  }
  notes.sort((a, b) => a.u - b.u);
  return { notes, chords, length: u, sections };
}

function excerpt(th: Theme, a: number, b: number): Theme {
  return {
    notes: th.notes.filter((n) => n.u >= a && n.u < b).map((n) => ({ ...n, u: n.u - a })),
    chords: th.chords
      .filter((c) => c.u + c.len > a && c.u < b)
      .map((c) => ({ chord: c.chord, u: Math.max(c.u, a) - a, len: Math.min(c.u + c.len, b) - Math.max(c.u, a) })),
    length: b - a,
    sections: th.sections
      .filter((s) => s.u + s.len > a && s.u < b)
      .map((s) => ({ id: s.id, u: Math.max(s.u, a) - a, len: Math.min(s.u + s.len, b) - Math.max(s.u, a) })),
  };
}

function chordAt(th: Theme, u: number): Chord | null {
  let lo = 0;
  let hi = th.chords.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = th.chords[mid];
    if (u < c.u) hi = mid - 1;
    else if (u >= c.u + c.len) lo = mid + 1;
    else return c.chord;
  }
  return null;
}

function noteAt(th: Theme, u: number): PNote | null {
  let best: PNote | null = null;
  for (const n of th.notes) {
    if (n.u > u) break;
    if (n.u + n.len > u) best = n;
  }
  return best;
}

/** Problems with a song definition (bar lengths, unknown sections, pickups without room…). */
export function validateSong(song: SongDef): string[] {
  const errs: string[] = [];
  for (const [id, sec] of Object.entries(song.sections)) {
    const m = parseMelody(sec.melody, song.barUnits);
    const c = parseChordLine(sec.chords, song.barUnits);
    errs.push(...m.errors.map((e) => `${id}: ${e}`), ...c.errors.map((e) => `${id}: ${e}`));
    if (m.total !== c.total) errs.push(`${id}: melody ${m.total} units ≠ chords ${c.total} units`);
    if (m.total % song.barUnits) errs.push(`${id}: not a whole number of bars`);
    for (const n of m.items) {
      if (n.midi === null) continue;
      const s = n.midi + song.leadOctave;
      if (s < 55 || s > 98) errs.push(`${id}: ${noteName(n.midi)} out of the music-box range once shifted`);
    }
  }
  song.form.forEach((id, i) => {
    const sec = song.sections[id];
    if (!sec) return errs.push(`form: unknown section ${id}`);
    if (!sec.pickup || i === 0) return;
    const prev = parseMelody(song.sections[song.form[i - 1]].melody);
    const last = prev.items[prev.items.length - 1];
    const p = parseMelody(sec.pickup);
    if (!last || last.midi !== null || last.len < p.total) errs.push(`form: ${song.form[i - 1]} must end with a rest ≥ ${p.total} units for the pickup of ${id}`);
  });
  return errs;
}

/** The first `count` melody notes, as written (no octave shift) — used to proof-read transcriptions. */
export function firstPhrase(song: SongDef, count = 14): { name: string; len: number; midi: number }[] {
  return buildTheme(song, song.form)
    .notes.slice(0, count)
    .map((n) => ({ name: noteName(n.midi, song.flats), len: n.len, midi: n.midi }));
}

// ───────────────────────────── tempo map ─────────────────────────────

class TempoMap {
  private segs: { u0: number; u1: number; t0: number; s0: number; s1: number }[] = [];
  add(len: number, s0: number, s1 = s0) {
    const last = this.segs[this.segs.length - 1];
    const u0 = last ? last.u1 : 0;
    const t0 = last ? this.secIn(last, last.u1) : 0;
    this.segs.push({ u0, u1: u0 + len, t0, s0, s1 });
  }
  private secIn(s: { u0: number; u1: number; t0: number; s0: number; s1: number }, u: number) {
    const x = u - s.u0;
    const span = Math.max(1e-9, s.u1 - s.u0);
    return s.t0 + s.s0 * x + ((s.s1 - s.s0) * x * x) / (2 * span);
  }
  sec(u: number): number {
    const segs = this.segs;
    if (u <= segs[0].u0) return segs[0].t0 + (u - segs[0].u0) * segs[0].s0;
    for (const s of segs) if (u <= s.u1) return this.secIn(s, u);
    const l = segs[segs.length - 1];
    return this.secIn(l, l.u1) + (u - l.u1) * l.s1;
  }
}

// ───────────────────────────── voicing helpers ─────────────────────────────

/** Close voicing of `n` chord tones within [lo, hi], as near as possible to the previous voicing. */
function voiceChord(ch: Chord, prev: number[], lo: number, hi: number, n: number): number[] {
  let pcs = ch.pcs.slice();
  if (pcs.length > n) pcs = pcs.filter((_, i) => i !== 2).slice(0, n);
  const center = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : (lo + hi) / 2;
  let best: number[] = [];
  let bestCost = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const order = pcs.slice(r).concat(pcs.slice(0, r));
    for (let base = lo; base < lo + 12; base++) {
      if (((base % 12) + 12) % 12 !== order[0]) continue;
      for (let o = 0; o <= 24; o += 12) {
        const notes: number[] = [];
        let cur = base + o;
        for (const pc of order) {
          while (((cur % 12) + 12) % 12 !== pc) cur++;
          notes.push(cur);
          cur++;
        }
        if (notes[notes.length - 1] > hi || notes[0] < lo) continue;
        const cost =
          prev.length === notes.length
            ? notes.reduce((a, m, i) => a + Math.abs(m - prev[i]), 0)
            : Math.abs(notes.reduce((a, b) => a + b, 0) / notes.length - center) * notes.length;
        if (cost < bestCost) {
          bestCost = cost;
          best = notes;
        }
      }
    }
  }
  if (!best.length) best = pcs.map((pc) => nearestPc(pc, (lo + hi) / 2, lo, hi)).sort((a, b) => a - b);
  return best;
}

// ───────────────────────────── the arranger ─────────────────────────────

const LEAD_VEL: Record<PassKind, number> = { intro: 0.5, theme: 0.8, variation: 0.78, soft: 0.6, final: 0.85, outro: 0.72 };
const PAD_VEL: Record<PassKind, number> = { intro: 0.45, theme: 0.5, variation: 0.48, soft: 0.62, final: 0.55, outro: 0.55 };
const BASS_VEL: Record<PassKind, number> = { intro: 0.4, theme: 0.55, variation: 0.6, soft: 0.45, final: 0.62, outro: 0.5 };
const HARP_VEL: Record<PassKind, number> = { intro: 0.25, theme: 0.32, variation: 0.36, soft: 0.3, final: 0.38, outro: 0.3 };

export function arrange(song: SongDef, seed = 1): Arrangement {
  const rng: Rng = mulberry32(seed * 7919 + song.id.length * 131);
  const bar = song.barUnits;
  const beat = song.beatUnits;
  const oct = song.leadOctave;
  const theme = buildTheme(song, song.form);
  const spu = 60 / (song.bpm * beat);
  const themeSec = theme.length * spu;
  const kinds: PassKind[] =
    themeSec < 40
      ? ['intro', 'theme', 'variation', 'soft', 'final', 'outro']
      : themeSec < 75
        ? ['intro', 'theme', 'variation', 'soft', 'outro']
        : ['intro', 'theme', 'variation', 'outro'];
  const soft = themeSec < 40 ? theme : buildTheme(song, song.softForm ?? song.form.slice(0, Math.ceil(song.form.length / 2)));
  const tailLen = Math.min(theme.length, 4 * bar);
  const tail = excerpt(theme, theme.length - tailLen, theme.length);
  const lastChord = [...theme.chords].reverse().find((c) => c.chord)?.chord ?? parseChord('C')!;
  const finalChord = (song.finalChord && parseChord(song.finalChord)) || lastChord;

  // ── layout & tempo
  const tm = new TempoMap();
  const passes: { kind: PassKind; u0: number; mat: Theme; len: number }[] = [];
  let u = 0;
  for (const kind of kinds) {
    const mat = kind === 'intro' || kind === 'outro' ? tail : kind === 'soft' ? soft : theme;
    if (kind === 'outro') {
      tm.add(mat.length, spu, spu / 0.74);
      tm.add(2 * bar, spu / 0.74, spu / 0.7);
      passes.push({ kind, u0: u, mat, len: mat.length + 2 * bar });
      u += mat.length + 2 * bar;
    } else {
      tm.add(mat.length, kind === 'soft' ? spu / 0.96 : kind === 'intro' ? spu / 0.97 : spu);
      passes.push({ kind, u0: u, mat, len: mat.length });
      u += mat.length;
    }
  }

  // ── event helpers
  const evs: Ev[] = [];
  const swingOff = (pos: number) => {
    if (!song.swing) return 0;
    const su = song.swingUnit ?? 1;
    const p = ((pos % (2 * su)) + 2 * su) % (2 * su);
    return p === su ? (song.swing - 0.5) * 2 * su : 0;
  };
  const jit = (amt: number) => (rng() + rng() - 1) * amt;
  const push = (pos: number, len: number, i: Inst, m: number, v: number, o: { jitter?: number; sw?: boolean; pr?: number } = {}) => {
    const t = tm.sec(pos + swingOff(pos)) + jit(o.jitter ?? 0.005);
    const d = Math.max(0.05, tm.sec(pos + len) - tm.sec(pos));
    const ev: Ev = { t: Math.max(0, t), d, i, m, v: clamp(v * (1 + jit(0.08)), 0.02, 1), pr: o.pr ?? 1 };
    if (o.sw) ev.sw = true;
    evs.push(ev);
    return ev;
  };
  const accent = (pos: number) => (pos % bar === 0 ? 1 : pos % beat === 0 ? 0.9 : 0.8);
  const leadNotes = theme.notes.map((n) => n.midi + oct);
  const leadMed = leadNotes.slice().sort((a, b) => a - b)[leadNotes.length >> 1] ?? 76;

  let prevPad: number[] = [];
  let prevHarp: number[] = [];
  let prevBass = 43;
  const bassNote = (pc: number) => {
    const m = nearestPc(pc, prevBass, 38, 53);
    prevBass = m;
    return m;
  };

  // ── pad: held chords, common tones tied across chord changes
  const padTrack = (M: Theme, U: number, vel: number, sw = false) => {
    const open = new Map<number, Ev>();
    let i = 0;
    while (i < M.chords.length) {
      const c = M.chords[i];
      let len = c.len;
      let j = i + 1;
      while (j < M.chords.length && M.chords[j].chord?.symbol === c.chord?.symbol) len += M.chords[j++].len;
      i = j;
      if (!c.chord) {
        open.clear();
        continue;
      }
      const v = voiceChord(c.chord, prevPad, 50, 72, 4);
      prevPad = v;
      const next = new Map<number, Ev>();
      for (const m of v) {
        const held = open.get(m);
        if (held) {
          held.d = tm.sec(U + c.u + len) - held.t;
          next.set(m, held);
        } else next.set(m, push(U + c.u, len, 'pad', m, vel * (m === v[0] ? 1 : 0.85), { jitter: 0, sw, pr: 2 }));
      }
      open.clear();
      next.forEach((e, m) => open.set(m, e));
    }
  };

  // ── bass + harp accompaniment, per feel
  const accompany = (M: Theme, U: number, kind: PassKind) => {
    const bv = BASS_VEL[kind];
    const hv = HARP_VEL[kind];
    const sparse = kind === 'soft';
    const harpChord = (pos: number, len: number, vel: number, ch: Chord, roll = false) => {
      const v = voiceChord(ch, prevHarp, 55, 74, 3);
      prevHarp = v;
      v.forEach((m, k) => push(U + pos + (roll ? k * Math.max(1, beat / 2) : 0), len, 'harp', m, vel * (k === 0 ? 1 : 0.85), { jitter: 0.004 + k * 0.004, pr: 1 }));
    };
    let lastSym = '';
    for (let b = 0; b < M.length; b += bar) {
      const ch = chordAt(M, b);
      if (sparse) {
        // bass + rolled chord only when the harmony changes
        for (const c of M.chords) {
          if (c.u < b || c.u >= b + bar || !c.chord || c.chord.symbol === lastSym) continue;
          lastSym = c.chord.symbol;
          push(U + c.u, Math.min(c.len, 2 * bar), 'bass', bassNote(c.chord.bass), bv, { pr: 2 });
          harpChord(c.u, c.len, hv, c.chord, true);
        }
        continue;
      }
      if (!ch) continue;
      const at = (off: number) => chordAt(M, b + off) ?? ch;
      const fifth = (c: Chord) => nearestPc((c.root + 7) % 12, prevBass + (prevBass > 46 ? -5 : 7), 36, 55);
      const changed = ch.symbol !== lastSym;
      lastSym = at(bar - 1).symbol;
      switch (song.feel) {
        case 'waltz': {
          const c0 = at(0);
          const root = changed || (b / bar) % 2 === 0 ? bassNote(c0.bass) : fifth(c0);
          push(U + b, beat, 'bass', root, bv, { pr: 2 });
          harpChord(b + beat, beat, hv * 0.9, at(beat));
          harpChord(b + 2 * beat, beat, hv * 0.8, at(2 * beat));
          break;
        }
        case 'lilt': {
          const c0 = at(0);
          push(U + b, bar / 2, 'bass', bassNote(c0.bass), bv, { pr: 2 });
          const c1 = at(bar / 2);
          push(U + b + bar / 2, bar / 2, 'bass', fifth(c1), bv * 0.6, { pr: 1 });
          const eighth = bar / 6;
          for (const [k, idx] of [[1, 0], [2, 1], [3, 2], [4, 1], [5, 0]] as const) {
            const c = at(k * eighth);
            const v = voiceChord(c, prevHarp, 55, 76, 3);
            if (k === 1 || k === 4) prevHarp = v;
            push(U + b + k * eighth, eighth * 2, 'harp', v[idx], hv * (k === 3 ? 0.9 : 0.75), { pr: 1 });
          }
          break;
        }
        case 'march': {
          const c0 = at(0);
          push(U + b, beat, 'bass', bassNote(c0.bass), bv, { pr: 2 });
          push(U + b + beat, beat, 'bass', fifth(at(beat)), bv * 0.8, { pr: 1 });
          harpChord(b + beat / 2, beat / 2, hv * 0.8, at(beat / 2));
          harpChord(b + beat * 1.5, beat / 2, hv * 0.8, at(beat * 1.5));
          break;
        }
        case 'four':
        case 'gallop': {
          const c0 = at(0);
          push(U + b, beat * 2, 'bass', bassNote(c0.bass), bv, { pr: 2 });
          const c2 = at(2 * beat);
          push(U + b + 2 * beat, beat * 2, 'bass', c2.symbol !== c0.symbol ? bassNote(c2.bass) : fifth(c2), bv * 0.8, { pr: 1 });
          harpChord(b + beat, beat, hv * 0.85, at(beat));
          harpChord(b + 3 * beat, beat, hv * 0.85, at(3 * beat));
          if (song.feel === 'gallop' || kind === 'variation' || kind === 'final') {
            harpChord(b + beat * 1.5, beat / 2, hv * 0.5, at(beat * 1.5));
            harpChord(b + beat * 3.5, beat / 2, hv * 0.5, at(beat * 3.5));
          }
          break;
        }
      }
    }
  };

  // ── counter-melody: chord tones under the lead, smooth, preferring thirds/sixths, contrary motion
  const counter = (M: Theme, U: number, inst: Inst, vel: number, sw: boolean) => {
    const step = song.meter[0] === 4 || song.meter[0] === 6 ? bar / 2 : bar;
    const hi = leadMed - 3;
    const lo = hi - 13;
    let prev = Math.round((lo + hi) / 2);
    let prevMel: number | null = null;
    for (let u0 = 0; u0 < M.length; u0 += step) {
      // split the step at chord changes
      const cuts = [u0];
      for (const c of M.chords) if (c.u > u0 && c.u < u0 + step) cuts.push(c.u);
      cuts.push(u0 + step);
      for (let k = 0; k < cuts.length - 1; k++) {
        const s = cuts[k];
        const len = cuts[k + 1] - s;
        const ch = chordAt(M, s);
        if (!ch) continue;
        const mn = noteAt(M, s);
        const mel = mn ? mn.midi + oct : null;
        let best = prev;
        let bestCost = Infinity;
        for (let m = lo; m <= hi; m++) {
          if (!ch.pcs.includes(((m % 12) + 12) % 12)) continue;
          let cost = Math.abs(m - prev) * 0.35 + (m === prev ? 0.5 : 0) + rng() * 0.3;
          if (mel !== null) {
            const iv = mel - m;
            if (iv <= 0) cost += 6;
            else if (iv < 3) cost += 4;
            else if ([3, 4, 8, 9, 15, 16].includes(iv)) cost -= 1.2;
            else if (iv % 12 === 0) cost += 2.5;
            if (prevMel !== null && mel !== prevMel) {
              const pi = (((prevMel - prev) % 12) + 12) % 12;
              const ci = ((iv % 12) + 12) % 12;
              if ((pi === 0 || pi === 7) && pi === ci) cost += 3;
              if (Math.sign(mel - prevMel) === Math.sign(m - prev) && m !== prev) cost += 0.6;
            }
          }
          if (cost < bestCost) {
            bestCost = cost;
            best = m;
          }
        }
        push(U + s, len, inst, best, vel * accent(s), { sw, pr: 2, jitter: 0.008 });
        // answer the lead while it holds a long note: a little turn of chord tones
        if (len >= 2 * beat && mn && mn.u + mn.len >= s + len * 0.9) {
          // turn upwards if there is room under the held lead note, else downwards
          const top = Math.min(hi + 2, (mel ?? 99) - 3);
          const tones = (a: number, b: number) => {
            const r: number[] = [];
            for (let m = a; m <= b; m++) if (ch.pcs.includes(((m % 12) + 12) % 12) && (mel === null || (mel - m) % 12 !== 0)) r.push(m);
            return r;
          };
          const up = tones(best + 1, top);
          const down = tones(best - 9, best - 1).reverse();
          const turn = up.length ? [up[0], up[1] ?? best] : down.length ? [down[0], down[1] ?? best] : null;
          if (turn) {
            push(U + s + len / 2, len / 4, inst, turn[0], vel * 0.75, { sw, pr: 1 });
            push(U + s + (len * 3) / 4, len / 4, inst, turn[1], vel * 0.65, { sw, pr: 1 });
          }
        }
        prev = best;
        prevMel = mel;
      }
    }
  };

  // ── glockenspiel descant above the lead (swell layer)
  const descant = (M: Theme, U: number, vel: number) => {
    const step = song.meter[0] === 4 ? bar / 2 : bar;
    for (let s = 0; s < M.length; s += step) {
      const ch = chordAt(M, s);
      const mn = noteAt(M, s);
      if (!ch || !mn) continue;
      const mel = mn.midi + oct;
      const cands: number[] = [];
      for (let m = mel + 3; m <= Math.min(98, mel + 11); m++) if (ch.pcs.includes(m % 12)) cands.push(m);
      if (!cands.length) continue;
      push(U + s, step, 'glock', cands[Math.floor(rng() * Math.min(2, cands.length))], vel, { sw: true, pr: 0 });
    }
  };

  // ── sleigh bells
  const bellsTrack = (M: Theme, U: number, vel: number, sw: boolean) => {
    for (let b = 0; b < M.length; b += bar) {
      const hit = (off: number, v: number, shake = false) => push(U + b + off, beat, 'bells', shake ? 1 : 0, vel * v, { sw, pr: 0, jitter: 0.004 });
      switch (song.feel) {
        case 'waltz':
          hit(0, 1, true);
          hit(beat, 0.55);
          hit(2 * beat, 0.55);
          break;
        case 'lilt':
          hit(0, 0.9, true);
          hit(bar / 2, 0.5);
          break;
        case 'march':
          for (let k = 0; k < bar; k += beat / 2) hit(k, k % beat ? 0.45 : k === beat ? 1 : 0.7);
          break;
        default:
          for (let k = 0; k < bar; k += beat) hit(k, (k / beat) % 2 ? 1 : 0.6, k === beat * 3);
          if (song.feel === 'gallop') for (let k = beat / 2; k < bar; k += beat) hit(k, 0.32);
      }
    }
  };

  // ── little glockenspiel sparkle where a section ends on a long note
  const sparkles = (M: Theme, U: number) => {
    for (const s of M.sections) {
      const inside = M.notes.filter((n) => n.u >= s.u && n.u < s.u + s.len);
      const last = inside[inside.length - 1];
      if (!last || last.len < 2 * beat) continue;
      const ch = chordAt(M, last.u);
      if (!ch) continue;
      const tones: number[] = [];
      for (let m = 84; m <= 98 && tones.length < 3; m++) if (ch.pcs.includes(m % 12)) tones.push(m);
      tones.forEach((m, k) => push(U + last.u + beat + k * (beat / 2), beat, 'glock', m, 0.2 - k * 0.03, { pr: 0 }));
    }
  };

  // ── generate every pass
  for (const p of passes) {
    const { kind, mat: M, u0: U } = p;
    const leadInst: Inst = kind === 'intro' || kind === 'variation' ? 'celesta' : 'musicbox';
    for (const n of M.notes) {
      const v = LEAD_VEL[kind] * accent(n.u);
      push(U + n.u, n.len, leadInst, n.midi + oct, v, { pr: 3, jitter: 0.007 });
      if (kind === 'outro' && n.midi + oct + 12 <= 96) push(U + n.u, n.len, 'celesta', n.midi + oct + 12, v * 0.32, { pr: 1 });
    }
    padTrack(M, U, PAD_VEL[kind]);
    if (kind === 'intro') {
      // just rolled harp chords on the changes
      let last = '';
      for (const c of M.chords) {
        if (!c.chord || c.chord.symbol === last) continue;
        last = c.chord.symbol;
        const v = voiceChord(c.chord, prevHarp, 55, 74, 3);
        prevHarp = v;
        v.forEach((m, k) => push(U + c.u + k * Math.max(1, beat / 2), c.len, 'harp', m, HARP_VEL.intro * (1 - k * 0.1), { pr: 1 }));
      }
    } else accompany(M, U, kind);

    if (kind === 'variation') counter(M, U, 'musicbox', 0.42, false);
    else if (kind !== 'intro') counter(M, U, 'celesta', 0.34, true);
    if (kind !== 'intro') descant(M, U, 0.26);

    const lively = song.bells && (kind === 'variation' || kind === 'final');
    if (lively) bellsTrack(M, U, 0.3, false);
    else if (kind !== 'intro' && kind !== 'outro') bellsTrack(M, U, 0.2, true);

    if (kind === 'theme' || kind === 'variation' || kind === 'final') sparkles(M, U);

    if (kind === 'outro') {
      // held final chord, rolled music-box arpeggio and a last sparkle
      const fu = U + M.length;
      const v = voiceChord(finalChord, prevPad, 50, 72, 4);
      v.forEach((m) => push(fu, 2 * bar, 'pad', m, 0.55, { jitter: 0, pr: 2 }));
      push(fu, 2 * bar, 'bass', nearestPc(finalChord.root, prevBass, 38, 50), 0.5, { pr: 2 });
      const start = nearestPc(finalChord.root, 60 + oct, 55 + oct, 67 + oct);
      const arp: number[] = [];
      for (let m = start; arp.length < 5 && m <= 96; m++) if (finalChord.pcs.includes(m % 12)) arp.push(m);
      arp.forEach((m, k) => push(fu + k * Math.max(1, beat / 2), 2 * bar, 'musicbox', m, 0.5 - k * 0.04, { pr: 2, jitter: 0.01 }));
      const top = nearestPc(finalChord.root, 93, 84, 96);
      push(fu + bar, bar, 'glock', top, 0.22, { pr: 1 });
      push(fu, bar, 'bells', 1, 0.16, { pr: 0 });
    }
  }

  evs.sort((a, b) => a.t - b.t);
  let end = 0;
  for (const e of evs) end = Math.max(end, e.t + (e.i === 'pad' ? e.d + 2.6 : e.i === 'bass' ? Math.min(e.d, 2.4) + 0.6 : 3.2));
  const secOf = (pu: number) => tm.sec(pu);
  return {
    song,
    events: evs,
    end,
    themeStart: secOf(passes[1]?.u0 ?? 0),
    passes: passes.map((p) => ({ kind: p.kind, t0: secOf(p.u0), t1: secOf(p.u0 + p.len) })),
  };
}

/** Cached arrangements (a song is arranged once per seed). */
const cache = new Map<string, Arrangement>();
export function arrangementFor(id: keyof typeof SONGS, seed = 1): Arrangement {
  const key = `${id}:${seed}`;
  let a = cache.get(key);
  if (!a) {
    a = arrange(SONGS[id], seed);
    cache.set(key, a);
  }
  return a;
}
