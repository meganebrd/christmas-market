/**
 * Tiny music-theory toolkit: note names ⇄ MIDI numbers, chord symbols, and the compact
 * melody/chord line format used by the song files.
 *
 *   melody line:  "G4:3 A4:1 G4:2 E4:6 | D5:4 r:2 B4:6~ | B4:4"
 *                 note:units (units = the song grid, e.g. 16ths), `r` = rest,
 *                 trailing `~` ties to the next note of the same pitch, `|` = bar line (checked).
 *   chord line:   "C:12 | G7:6 C:6 | Dm/C:12 | -:4"   (`-` = no chord)
 */

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// flats where they are idiomatic (F major, D/G minor), but keep C# and F# (leading tones)
const FLAT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** "C4" → 60, "F#4" → 66, "Bb3" → 58. Throws on garbage. */
export function parseNote(s: string): number {
  const m = /^([A-Ga-g])([#b]*)(-?\d)$/.exec(s.trim());
  if (!m) throw new Error(`bad note "${s}"`);
  let pc = LETTER[m[1].toUpperCase()];
  for (const c of m[2]) pc += c === '#' ? 1 : -1;
  return 12 * (Number(m[3]) + 1) + pc;
}

export function noteName(midi: number, flats = false): string {
  const pc = ((midi % 12) + 12) % 12;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc] + (Math.floor(midi / 12) - 1);
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// ───────────────────────────── chords ─────────────────────────────

export interface Chord {
  symbol: string;
  /** Root pitch class 0..11 */
  root: number;
  /** Pitch classes of the chord tones, root first. */
  pcs: number[];
  /** Bass pitch class (slash chords), defaults to the root. */
  bass: number;
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 2],
  '9': [0, 4, 7, 10, 2],
};

function parsePc(s: string): number {
  const m = /^([A-G])([#b]?)$/.exec(s);
  if (!m) throw new Error(`bad pitch class "${s}"`);
  return (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** "Dm/C", "G7", "Bbmaj7" → Chord. "-" → null (no chord). */
export function parseChord(sym: string): Chord | null {
  if (sym === '-' || sym === 'N') return null;
  const [main, slash] = sym.split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  if (!m) throw new Error(`bad chord "${sym}"`);
  const root = parsePc(m[1]);
  const q = QUALITIES[m[2]];
  if (!q) throw new Error(`unknown chord quality "${m[2]}" in "${sym}"`);
  return { symbol: sym, root, pcs: q.map((iv) => (root + iv) % 12), bass: slash ? parsePc(slash) : root };
}

// ───────────────────────────── lines ─────────────────────────────

export interface LineNote {
  /** MIDI number, or null for a rest. */
  midi: number | null;
  len: number;
}

export interface ParsedLine {
  items: LineNote[];
  total: number;
  /** Problems found (bar lengths, syntax). */
  errors: string[];
}

/** Parses a melody line. `barUnits` enables bar-length checks at each `|`. */
export function parseMelody(src: string, barUnits?: number): ParsedLine {
  const items: LineNote[] = [];
  const errors: string[] = [];
  let total = 0;
  let barStart = 0;
  let bar = 1;
  let tie = false;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      if (barUnits && total - barStart !== barUnits) errors.push(`bar ${bar}: ${total - barStart} units instead of ${barUnits}`);
      barStart = total;
      bar++;
      continue;
    }
    const m = /^(r|[A-G][#b]?-?\d):(\d+)(~?)$/.exec(tok);
    if (!m) {
      errors.push(`bad token "${tok}"`);
      continue;
    }
    const len = Number(m[2]);
    const midi = m[1] === 'r' ? null : parseNote(m[1]);
    const prev = items[items.length - 1];
    if (tie && prev && prev.midi === midi) prev.len += len;
    else items.push({ midi, len });
    tie = m[3] === '~';
    total += len;
  }
  if (barUnits && total - barStart !== barUnits && total !== barStart) errors.push(`bar ${bar}: ${total - barStart} units instead of ${barUnits}`);
  return { items, total, errors };
}

export interface LineChord {
  chord: Chord | null;
  len: number;
}

export function parseChordLine(src: string, barUnits?: number): { items: LineChord[]; total: number; errors: string[] } {
  const items: LineChord[] = [];
  const errors: string[] = [];
  let total = 0;
  let barStart = 0;
  let bar = 1;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      if (barUnits && total - barStart !== barUnits) errors.push(`chords bar ${bar}: ${total - barStart} units instead of ${barUnits}`);
      barStart = total;
      bar++;
      continue;
    }
    const i = tok.lastIndexOf(':');
    if (i < 0) {
      errors.push(`bad chord token "${tok}"`);
      continue;
    }
    const len = Number(tok.slice(i + 1));
    try {
      items.push({ chord: parseChord(tok.slice(0, i)), len });
    } catch (e) {
      errors.push(String((e as Error).message));
    }
    total += len;
  }
  if (barUnits && total - barStart !== barUnits && total !== barStart) errors.push(`chords bar ${bar}: ${total - barStart} units instead of ${barUnits}`);
  return { items, total, errors };
}

/** Nearest MIDI note with pitch class `pc` to `target`, constrained to [lo, hi] when possible. */
export function nearestPc(pc: number, target: number, lo = 0, hi = 127): number {
  let best = -1;
  let bestD = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (((m % 12) + 12) % 12 !== pc) continue;
    const d = Math.abs(m - target);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (best >= 0) return best;
  // out of range: fold into the closest octave
  let m = target - ((((target - pc) % 12) + 12) % 12);
  if (target - m > 6) m += 12;
  return m;
}
