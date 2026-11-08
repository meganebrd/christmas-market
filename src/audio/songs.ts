/**
 * The procedural playlist: public-domain carols + one original waltz, in the compact line format of
 * `theory.ts`. Melodies were transcribed from reference scores and double-checked note by note
 * (`node scripts/audio-check.mjs` prints the first phrase of each song):
 *
 *   douce-nuit      Stille Nacht — F. X. Gruber (1818), common modern version (Wikipedia score).
 *   mon-beau-sapin  O Tannenbaum — trad. German (Wikipedia score, Anschütz 1824 melody).
 *   il-est-ne       Il est né le divin Enfant — trad. French (Wikipedia score).
 *   vive-le-vent    Jingle Bells — J. L. Pierpont (1857), the familiar later melody (P. Hardy, ABC).
 *   les-anges       Les anges dans nos campagnes — trad. French (Wikipedia score, Barnes harmonisation).
 *   deck-the-halls  Nos Galan / Deck the Halls — trad. Welsh (P. Hardy, ABC).
 *   we-wish-you     We Wish You a Merry Christmas — trad. English (P. Hardy, ABC).
 *   greensleeves    Greensleeves — trad. English, 16th c. (P. Hardy, ABC).
 *   valse-de-givrelune  original waltz composed for Givrelune.
 *
 * Every section must be made of whole bars. A section `pickup` (anacrusis) is played at the end of
 * whatever precedes the section, so the preceding section ends with a rest long enough to host it.
 */
import type { ProceduralSongId } from '../config/types';

export type Feel = 'lilt' | 'waltz' | 'march' | 'four' | 'gallop';

export interface SectionDef {
  melody: string;
  chords: string;
  pickup?: string;
}

export interface SongDef {
  id: ProceduralSongId;
  title: string;
  author: string;
  license: string;
  /** Time signature, informative. */
  meter: [number, number];
  /** Grid unit as a note value: 8 = eighth note, 16 = sixteenth. */
  unit: number;
  barUnits: number;
  /** Units per counted beat (bpm refers to that beat). */
  beatUnits: number;
  bpm: number;
  feel: Feel;
  /** 0.5 = straight. 0.56 = gentle swing of the `swingUnit` pairs. */
  swing?: number;
  swingUnit?: number;
  /** Sleigh bells in the livelier passes. */
  bells?: boolean;
  /** Octave shift (semitones) of the lead so it sits in the music-box register. */
  leadOctave: number;
  /** Print flats instead of sharps. */
  flats?: boolean;
  sections: Record<string, SectionDef>;
  form: string[];
  /** Sections of the "softer verse" pass for long songs. */
  softForm?: string[];
  /** Chord held at the very end (e.g. a Picardy third). */
  finalChord?: string;
  /** Level trim so every song sounds equally loud (dB). */
  trimDb?: number;
}

const PD = 'Domaine public';

export const SONGS: Record<ProceduralSongId, SongDef> = {
  // ─────────────────────────── Stille Nacht (6/8, sixteenth grid) ───────────────────────────
  'douce-nuit': {
    id: 'douce-nuit',
    trimDb: 0.4,
    title: 'Douce nuit',
    author: 'Franz Xaver Gruber (1818)',
    license: PD,
    meter: [6, 8],
    unit: 16,
    barUnits: 12,
    beatUnits: 6,
    bpm: 46,
    feel: 'lilt',
    leadOctave: 12,
    sections: {
      A: {
        melody: `
          G4:3 A4:1 G4:2 E4:6 | G4:3 A4:1 G4:2 E4:6 | D5:4 D5:2 B4:6 | C5:4 C5:2 G4:6 |
          A4:4 A4:2 C5:3 B4:1 A4:2 | G4:3 A4:1 G4:2 E4:6 | A4:4 A4:2 C5:3 B4:1 A4:2 | G4:3 A4:1 G4:2 E4:6 |
          D5:4 D5:2 F5:3 D5:1 B4:2 | C5:6 E5:4 r:2 | C5:3 G4:1 E4:2 G4:3 F4:1 D4:2 | C4:10 r:2`,
        chords: `
          C:12 | C:12 | G7:12 | C:12 |
          F:12 | C:12 | F:12 | C:12 |
          G7:12 | C:12 | C:6 G7:6 | C:12`,
      },
    },
    form: ['A'],
  },

  // ─────────────────────────── O Tannenbaum (3/4, sixteenth grid) ───────────────────────────
  'mon-beau-sapin': {
    id: 'mon-beau-sapin',
    trimDb: 1.1,
    title: 'Mon beau sapin',
    author: 'trad. allemand',
    license: PD,
    meter: [3, 4],
    unit: 16,
    barUnits: 12,
    beatUnits: 4,
    bpm: 84,
    feel: 'waltz',
    leadOctave: 12,
    sections: {
      A: {
        pickup: 'D4:2',
        melody: `G4:3 G4:1 G4:4 A4:4 | B4:3 B4:1 B4:6 B4:2 | A4:2 B4:2 C5:4 F#4:4 | A4:4 G4:4 r:4`,
        chords: `G:8 D:4 | G:12 | Am:8 D7:4 | D7:4 G:8`,
      },
      B: {
        pickup: 'D5:2',
        melody: `D5:2 B4:2 E5:6 D5:2 | D5:2 C5:2 C5:6 C5:2 | C5:2 A4:2 D5:6 C5:2 | C5:2 B4:2 B4:4 r:4`,
        chords: `G7:4 C:8 | D7:12 | D7:12 | G:12`,
      },
    },
    form: ['A', 'B', 'A'],
  },

  // ─────────────────────────── Il est né le divin Enfant (2/4, eighth grid) ───────────────────────────
  'il-est-ne': {
    id: 'il-est-ne',
    trimDb: -1.6,
    title: 'Il est né le divin Enfant',
    author: 'trad. français',
    license: PD,
    meter: [2, 4],
    unit: 8,
    barUnits: 4,
    beatUnits: 2,
    bpm: 100,
    feel: 'march',
    bells: true,
    leadOctave: 12,
    sections: {
      R: {
        melody: `
          D4:2 G4:2 | G4:2 B4:1 G4:1 | D4:2 G4:2 | G4:4 |
          G4:2 G4:1 A4:1 | B4:2 C5:1 B4:1 | A4:2 G4:2 | A4:1 F#4:1 D4:2 |
          D4:2 G4:2 | G4:2 B4:1 G4:1 | D4:2 G4:2 | G4:4 |
          G4:2 A4:2 | B4:2 C5:1 B4:1 | A4:2 D5:2 | G4:4`,
        chords: `
          G:4 | G:4 | G:4 | G:4 |
          G:4 | G:4 | D:4 | D:4 |
          G:4 | G:4 | G:4 | G:4 |
          G:4 | G:2 C:2 | D7:4 | G:4`,
      },
      C: {
        melody: `
          B4:2 C5:2 | D5:2 C5:1 B4:1 | C5:2 E5:2 | D5:4 |
          B4:2 C5:2 | D5:2 E5:1 D5:1 | C5:2 B4:2 | B4:2 A4:2 |
          B4:2 C5:2 | D5:2 C5:1 B4:1 | C5:2 E5:2 | D5:4 |
          B4:2 C5:2 | D5:2 E5:1 D5:1 | C5:2 B4:2 | A4:4`,
        chords: `
          G:4 | G:4 | C:4 | G:4 |
          G:4 | G:4 | C:2 G:2 | G:2 D7:2 |
          G:4 | G:4 | C:4 | G:4 |
          G:4 | G:4 | Am:2 G:2 | D7:4`,
      },
    },
    form: ['R', 'C', 'R'],
    softForm: ['C', 'R'],
  },

  // ─────────────────────────── Jingle Bells (4/4, eighth grid) ───────────────────────────
  'vive-le-vent': {
    id: 'vive-le-vent',
    trimDb: -0.8,
    title: 'Vive le vent',
    author: 'James Lord Pierpont (1857)',
    license: PD,
    meter: [4, 4],
    unit: 8,
    barUnits: 8,
    beatUnits: 2,
    bpm: 126,
    feel: 'gallop',
    swing: 0.56,
    swingUnit: 1,
    bells: true,
    leadOctave: 12,
    sections: {
      V: {
        melody: `
          D4:2 B4:2 A4:2 G4:2 | D4:6 D4:1 D4:1 | D4:2 B4:2 A4:2 G4:2 | E4:8 |
          E4:2 C5:2 B4:2 A4:2 | F#4:6 r:1 F#4:1 | D5:2 D5:2 C5:2 A4:2 | B4:6 r:1 D4:1 |
          D4:2 B4:2 A4:2 G4:2 | D4:6 r:1 D4:1 | D4:2 B4:2 A4:2 G4:2 | E4:6 r:1 E4:1 |
          E4:2 C5:2 B4:2 A4:2 | D5:2 D5:2 D5:2 D5:2 | E5:2 D5:2 C5:2 A4:2 | G4:4 D5:4`,
        chords: `
          G:8 | G:8 | G:8 | C:8 |
          Am:8 | D7:8 | D7:8 | G:8 |
          G:8 | G:8 | G:8 | C:8 |
          Am:8 | G:8 | D7:8 | G:4 D7:4`,
      },
      C: {
        melody: `
          B4:2 B4:2 B4:4 | B4:2 B4:2 B4:4 | B4:2 D5:2 G4:3 A4:1 | B4:8 |
          C5:2 C5:2 C5:3 C5:1 | C5:2 B4:2 B4:2 B4:1 B4:1 | B4:2 A4:2 A4:2 B4:2 | A4:4 D5:4 |
          B4:2 B4:2 B4:4 | B4:2 B4:2 B4:4 | B4:2 D5:2 G4:3 A4:1 | B4:8 |
          C5:2 C5:2 C5:3 C5:1 | C5:2 B4:2 B4:2 B4:1 B4:1 | D5:2 D5:2 C5:2 A4:2 | G4:4 r:4`,
        chords: `
          G:8 | G:8 | G:8 | G:8 |
          C:8 | G:8 | A7:8 | D7:8 |
          G:8 | G:8 | G:8 | G:8 |
          C:8 | G:8 | D7:8 | G:8`,
      },
    },
    form: ['V', 'C'],
    softForm: ['C'],
  },

  // ─────────────────────────── Les anges dans nos campagnes (4/4, eighth grid) ───────────────────────────
  'les-anges': {
    id: 'les-anges',
    trimDb: 0.5,
    title: 'Les anges dans nos campagnes',
    author: 'trad. français',
    license: PD,
    meter: [4, 4],
    unit: 8,
    barUnits: 8,
    beatUnits: 2,
    bpm: 92,
    feel: 'four',
    leadOctave: 12,
    flats: true,
    sections: {
      V: {
        melody: `A4:2 A4:2 A4:2 C5:2 | C5:3 Bb4:1 A4:4 | A4:2 G4:2 A4:2 C5:2 | A4:3 G4:1 F4:4`,
        chords: `F:4 Am:4 | Dm:2 C/E:2 F:4 | F:2 C:2 F:4 | F/C:2 C7:2 F:4`,
      },
      R1: {
        melody: `
          C5:4 D5:1 C5:1 Bb4:1 A4:1 | Bb4:4 C5:1 Bb4:1 A4:1 G4:1 | A4:4 Bb4:1 A4:1 G4:1 F4:1 |
          G4:3 C4:1 C4:4 | F4:2 G4:2 A4:2 Bb4:2 | A4:4 G4:4`,
        chords: `F:4 Dm:4 | Gm:4 C:4 | F:4 Bb:4 | C/E:2 Dm7:2 C:2 C7/Bb:2 | F/A:2 C:2 F:2 Gm/Bb:2 | F/C:4 C:4`,
      },
      R2: {
        melody: `
          C5:4 D5:1 C5:1 Bb4:1 A4:1 | Bb4:4 C5:1 Bb4:1 A4:1 G4:1 | A4:4 Bb4:1 A4:1 G4:1 F4:1 |
          G4:3 C4:1 C4:4 | F4:2 G4:2 A4:2 Bb4:2 | A4:4 G4:4 | F4:8`,
        chords: `F:4 Dm:4 | Gm:4 C:4 | F:4 Bb:4 | C/E:2 Dm7:2 C:2 C7/Bb:2 | F/A:2 C:2 F:2 Gm/Bb:2 | F/C:4 C7:4 | F:8`,
      },
    },
    form: ['V', 'V', 'R1', 'R2'],
    softForm: ['V', 'R2'],
  },

  // ─────────────────────────── Deck the Halls (4/4, eighth grid) ───────────────────────────
  'deck-the-halls': {
    id: 'deck-the-halls',
    trimDb: -1.0,
    title: 'Deck the Halls',
    author: 'trad. gallois',
    license: PD,
    meter: [4, 4],
    unit: 8,
    barUnits: 8,
    beatUnits: 2,
    bpm: 112,
    feel: 'four',
    swing: 0.55,
    swingUnit: 1,
    bells: true,
    leadOctave: 12,
    sections: {
      A: {
        melody: `A4:3 G4:1 F#4:2 E4:2 | D4:2 E4:2 F#4:2 D4:2 | E4:1 F#4:1 G4:1 E4:1 F#4:3 E4:1 | D4:2 C#4:2 D4:4`,
        chords: `D:8 | D:8 | A7:4 D:4 | A7:4 D:4`,
      },
      B: {
        melody: `E4:3 F#4:1 G4:2 E4:2 | F#4:3 G4:1 A4:2 E4:2 | F#4:1 G4:1 A4:2 B4:1 C#5:1 D5:2 | C#5:2 B4:2 A4:4`,
        chords: `A:8 | D:4 A:4 | D:4 Bm:4 | E7:4 A:4`,
      },
      C: {
        melody: `A4:3 G4:1 F#4:2 E4:2 | D4:2 E4:2 F#4:2 D4:2 | B4:1 B4:1 B4:1 B4:1 A4:3 G4:1 | F#4:2 E4:2 D4:4`,
        chords: `D:8 | D:8 | G:4 D:4 | A7:4 D:4`,
      },
    },
    form: ['A', 'A', 'B', 'C'],
  },

  // ─────────────────────────── We Wish You a Merry Christmas (3/4, eighth grid) ───────────────────────────
  'we-wish-you': {
    id: 'we-wish-you',
    trimDb: -0.8,
    title: 'We Wish You a Merry Christmas',
    author: 'trad. anglais',
    license: PD,
    meter: [3, 4],
    unit: 8,
    barUnits: 6,
    beatUnits: 2,
    bpm: 120,
    feel: 'waltz',
    bells: true,
    leadOctave: 12,
    sections: {
      V: {
        pickup: 'D4:2',
        melody: `
          G4:2 G4:1 A4:1 G4:1 F#4:1 | E4:2 C4:2 E4:2 | A4:2 A4:1 B4:1 A4:1 G4:1 | F#4:2 D4:2 D4:2 |
          B4:2 B4:1 C5:1 B4:1 A4:1 | G4:2 E4:2 D4:1 D4:1 | E4:2 A4:2 F#4:2 | G4:4 r:2`,
        chords: `G:6 | C:6 | A7:6 | D:6 | B7:6 | Em:6 | C:4 D:2 | G:6`,
      },
      C: {
        pickup: 'D4:2',
        melody: `
          G4:2 G4:2 G4:2 | F#4:4 F#4:2 | G4:2 F#4:2 E4:2 | D4:4 A4:2 |
          B4:2 A4:1 A4:1 G4:2 | D5:2 D4:2 D4:1 D4:1 | E4:2 A4:2 F#4:2 | G4:4 r:2`,
        chords: `G:6 | D:6 | A7:6 | D7:6 | G:6 | D:6 | C:4 D:2 | G:6`,
      },
    },
    form: ['V', 'C', 'V'],
  },

  // ─────────────────────────── Greensleeves (3/4, eighth grid) ───────────────────────────
  greensleeves: {
    id: 'greensleeves',
    trimDb: 1.2,
    title: 'Greensleeves',
    author: 'trad. anglais (XVIe s.)',
    license: PD,
    meter: [3, 4],
    unit: 8,
    barUnits: 6,
    beatUnits: 2,
    bpm: 96,
    feel: 'waltz',
    leadOctave: 12,
    sections: {
      A: {
        pickup: 'E4:2',
        melody: `
          G4:4 A4:2 | B4:3 C5:1 B4:2 | A4:4 F#4:2 | D4:3 E4:1 F#4:2 |
          G4:4 E4:2 | E4:3 D#4:1 E4:2 | F#4:4 D#4:2 | B3:4 E4:2 |
          G4:4 A4:2 | B4:3 C5:1 B4:2 | A4:4 F#4:2 | D4:3 E4:1 F#4:2 |
          G4:3 F#4:1 E4:2 | D#4:3 C#4:1 D#4:2 | E4:6~ | E4:4 r:2`,
        chords: `
          Em:6 | G:6 | D:6 | Bm:6 |
          Em:6 | Em:6 | B:6 | B:6 |
          Em:6 | G:6 | D:6 | Bm:6 |
          Em:6 | B:6 | Em:6 | Em:6`,
      },
      B: {
        melody: `
          D5:6 | D5:3 C#5:1 B4:2 | A4:4 F#4:2 | D4:3 E4:1 F#4:2 |
          G4:4 E4:2 | E4:3 D#4:1 E4:2 | F#4:4 D#4:2 | B3:6 |
          D5:6 | D5:3 C#5:1 B4:2 | A4:4 F#4:2 | D4:3 E4:1 F#4:2 |
          G4:4 E4:2 | D#4:3 C#4:1 D#4:2 | E4:6~ | E4:4 r:2`,
        chords: `
          G:6 | G:6 | D:6 | D:6 |
          Em:6 | Em:6 | B:6 | B7:6 |
          G:6 | G:6 | D:6 | D:6 |
          Em:6 | B:6 | Em:6 | Em:6`,
      },
    },
    form: ['A', 'B'],
    softForm: ['A'],
  },

  // ─────────────────────────── La Valse de Givrelune — ORIGINAL (3/4, eighth grid) ───────────────────────────
  // AABA in D minor, lament bass (D–C–Bb–A) under an arpeggiated music-box line; the bridge opens to
  // F major; the very last chord turns to D major (Picardy third).
  'valse-de-givrelune': {
    id: 'valse-de-givrelune',
    trimDb: 0.1,
    title: 'La Valse de Givrelune',
    author: 'Givrelune (composition originale)',
    license: 'MIT — œuvre originale du projet Givrelune',
    meter: [3, 4],
    unit: 8,
    barUnits: 6,
    beatUnits: 2,
    bpm: 104,
    feel: 'waltz',
    leadOctave: 0,
    flats: true,
    sections: {
      A1: {
        melody: `
          D5:2 F5:2 A5:2 | G5:4 F5:2 | F5:2 E5:2 D5:2 | E5:3 D5:1 C#5:2 |
          D5:2 F5:2 A5:2 | C6:4 Bb5:2 | A5:3 G5:1 F5:2 | E5:6`,
        chords: `Dm:6 | Dm/C:6 | Bbmaj7:6 | A7:6 | Dm:6 | Dm/C:6 | Gm/Bb:6 | A7:6`,
      },
      A2: {
        melody: `
          D5:2 F5:2 A5:2 | G5:4 F5:2 | F5:2 E5:2 D5:2 | E5:3 D5:1 C#5:2 |
          D5:2 F5:2 A5:2 | Bb5:4 A5:2 | G5:2 E5:2 C#5:2 | D5:6`,
        chords: `Dm:6 | Dm/C:6 | Bbmaj7:6 | A7:6 | Dm:6 | Gm:6 | A7:6 | Dm:6`,
      },
      B: {
        melody: `
          C5:2 F5:2 A5:2 | G5:4 E5:2 | F5:3 E5:1 D5:2 | A5:4 G5:2 |
          F5:2 G5:2 Bb5:2 | A5:3 G5:1 E5:2 | F5:2 A5:2 C6:2 | A5:2 G5:2 E5:2`,
        chords: `F:6 | C/E:6 | Dm:6 | Bbmaj7:6 | Gm7:6 | C7:6 | F:6 | A7:6`,
      },
    },
    form: ['A1', 'A2', 'B', 'A2'],
    softForm: ['A1', 'A2'],
    finalChord: 'D',
  },
};

export const SONG_IDS = Object.keys(SONGS) as ProceduralSongId[];

// ───────────────────────────── small loops for the ambience (ORIGINAL) ─────────────────────────────

/** Fairground-organ waltz for the carousel (C major, 3/4). Melody + oom-pah-pah chords. */
export const ORGAN_LOOP = {
  bpm: 132,
  barUnits: 6,
  beatUnits: 2,
  melody: `
    E5:2 G5:2 C6:2 | B5:4 G5:2 | F5:2 A5:2 G5:2 | D5:6 |
    D5:2 F5:2 B5:2 | A5:4 F5:2 | E5:2 G5:2 D5:2 | C5:4 r:2 |
    E5:2 G5:2 C6:2 | D6:4 C6:2 | A5:2 C6:2 A5:2 | G5:6 |
    F5:2 A5:2 G5:2 | E5:3 D5:1 C5:2 | D5:2 G5:2 B4:2 | C5:4 r:2`,
  chords: `
    C:6 | C:6 | G7:6 | G7:6 | G7:6 | G7:6 | C:6 | C:6 |
    C:6 | F:6 | F:6 | C:6 | Dm:6 | C:6 | G7:6 | C:6`,
};

/** Little musette phrase heard from the plaza (G major, 3/4). */
export const ACCORDION_PHRASES = [
  { bpm: 150, melody: 'D5:2 B4:2 G4:2 | A4:3 B4:1 C5:2 | B4:2 A4:2 F#4:2 | G4:6', chords: 'G:6 | D7:6 | D7:6 | G:6' },
  { bpm: 150, melody: 'D5:2 E5:1 D5:1 C5:2 | B4:4 G4:2 | A4:2 C5:2 F#4:2 | G4:6', chords: 'G:6 | G:6 | D7:6 | G:6' },
  { bpm: 144, melody: 'G4:2 B4:2 D5:2 | E5:3 D5:1 B4:2 | C5:2 A4:2 F#4:2 | G4:6', chords: 'G:6 | C:6 | D7:6 | G:6' },
];
