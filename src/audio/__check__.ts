/**
 * Audio test bench (served by Vite at /src/audio/__check__.html):
 *  - `window.__audioCheck` renders songs, effects, voices and ambiences with an OfflineAudioContext
 *    through the real synth code and the real mix graph, and returns signal statistics;
 *  - the page itself is a small audition board (real AudioContext) for humans.
 */
import type { SfxName } from '../core/contracts';
import type { ZoneId } from '../config/types';
import { Ambience, type AmbZone } from './ambience';
import { makeFire, makeFurnace, makeImpulse, makeMurmur, makeSizzle, makeSnowSteps, mulberry32 } from './dsp';
import { arrange, firstPhrase, validateSong } from './arrange';
import { Graph, VoicePool } from './graph';
import { busLevels, DUCK, MASTER, SWELL } from './levels';
import { MusicPlayer, ProcTrack } from './music';
import { SFX_NAMES, SfxPlayer } from './sfx';
import { SONGS, SONG_IDS } from './songs';
import { VoicePlayer } from './voice';

const SR = 44100;
const DEFAULT = { music: 0.6, sfx: 0.8 };
const MARKET_MUSIC_VOLUME = 0.55;
const ZONES: AmbZone[] = ['base', 'gate', 'alley', 'plaza', 'bar', 'food', 'workshop', 'rink', 'carousel', 'belvedere', 'fair'];
const SENTENCE = 'Bonjour ! Bienvenue à Givrelune, le marché des étoiles. Un chocolat chaud ?';

export interface Stats {
  duration: number;
  rmsDb: number;
  /** Gated loudness (400 ms blocks, −70 dB absolute and −10 dB relative gates), dBFS. */
  loudDb: number;
  peak: number;
  peakDb: number;
  nan: number;
  clipped: number;
  silent: boolean;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const round = (x: number, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

function analyze(buf: AudioBuffer): Stats {
  const chs = [...Array(buf.numberOfChannels).keys()].map((c) => buf.getChannelData(c));
  const n = buf.length;
  const block = Math.floor(0.4 * buf.sampleRate);
  let sum = 0;
  let peak = 0;
  let nan = 0;
  let clipped = 0;
  const blocks: number[] = [];
  for (let b = 0; b < n; b += block) {
    let bs = 0;
    const e = Math.min(n, b + block);
    for (const d of chs) {
      for (let i = b; i < e; i++) {
        const x = d[i];
        if (!Number.isFinite(x)) {
          nan++;
          continue;
        }
        const ax = Math.abs(x);
        if (ax > peak) peak = ax;
        if (ax > 0.99) clipped++;
        bs += x * x;
      }
    }
    sum += bs;
    blocks.push(bs / ((e - b) * chs.length));
  }
  const abs = blocks.filter((m) => m > 1e-7);
  const mean = abs.reduce((a, b) => a + b, 0) / Math.max(1, abs.length);
  const rel = abs.filter((m) => m > mean / 10);
  const loud = rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length);
  return {
    duration: round(buf.duration, 2),
    rmsDb: round(db(Math.sqrt(sum / (n * chs.length)))),
    loudDb: round(10 * Math.log10(Math.max(1e-12, loud))),
    peak: round(peak, 3),
    peakDb: round(db(peak)),
    nan,
    clipped,
    silent: peak < 1e-3,
  };
}

async function render(seconds: number, fill: (g: Graph) => void, settings = DEFAULT, musicVolume = MARKET_MUSIC_VOLUME): Promise<Stats> {
  const ac = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const g = new Graph(ac, { seed: 4242 });
  g.master.gain.value = MASTER;
  const lv = busLevels(settings, musicVolume);
  g.music.set(lv.music, 0.0005);
  g.sfx.set(lv.sfx, 0.0005);
  g.amb.set(lv.amb, 0.0005);
  g.voice.set(lv.voice, 0.0005);
  fill(g);
  return analyze(await ac.startRendering());
}

// ───────────────────────────── API used by scripts/audio-check.mjs ─────────────────────────────

const api = {
  ready: true,
  songIds: SONG_IDS,
  sfxNames: SFX_NAMES,
  zones: ZONES,

  songs() {
    return SONG_IDS.map((id) => {
      const s = SONGS[id];
      const arr = arrange(s, 1);
      return {
        id,
        title: s.title,
        author: s.author,
        license: s.license,
        meter: s.meter.join('/'),
        bpm: s.bpm,
        errors: validateSong(s),
        duration: round(arr.end, 1),
        themeStart: round(arr.themeStart, 1),
        passes: arr.passes.map((p) => `${p.kind} ${round(p.t1 - p.t0, 1)}s`),
        events: arr.events.length,
        firstPhrase: firstPhrase(s, 20),
      };
    });
  },

  /** Renders `seconds` of a song from its theme (or from `from` seconds). */
  renderSong(id: keyof typeof SONGS, seconds = 20, from: number | 'theme' | 'end' = 'theme', opts: { swell?: boolean; loud?: boolean; duck?: boolean } = {}) {
    const settings = opts.loud ? { music: 1, sfx: 1 } : DEFAULT;
    return render(
      seconds,
      (g) => {
        const arr = arrange(SONGS[id], 1);
        const start = from === 'theme' ? arr.themeStart - 0.25 : from === 'end' ? Math.max(0, arr.end - seconds) : from;
        if (opts.swell || opts.duck) {
          const lv = busLevels(settings, opts.loud ? 1 : MARKET_MUSIC_VOLUME);
          g.music.set(lv.music * (opts.swell ? SWELL : 1) * (opts.duck ? DUCK : 1), 0.0005);
          if (opts.swell) g.musicTone.gain.value = 5;
        }
        const tr = new ProcTrack(g, { swell: !!opts.swell, pool: new VoicePool(60) }, arr, { title: id });
        tr.begin(0, start, 0);
        tr.schedule(0, seconds);
      },
      settings,
      opts.loud ? 1 : MARKET_MUSIC_VOLUME,
    );
  },

  renderSfx(name: SfxName, opts: { positional?: boolean; loud?: boolean; repeat?: number } = {}) {
    return render(
      opts.repeat ? 1 + opts.repeat * 0.12 + 3 : 3.8,
      (g) => {
        const p = new SfxPlayer(g);
        const n = opts.repeat ?? 1;
        for (let k = 0; k < n; k++) {
          p.play(name, opts.positional ? { position: { x: 6, y: 1, z: -4 } } : {}, 0.05 + k * 0.12);
        }
      },
      opts.loud ? { music: 1, sfx: 1 } : DEFAULT,
    );
  },

  renderVoice(pitch = 1, text = SENTENCE) {
    return render(text.length * 0.05 + 1, (g) => {
      const v = new VoicePlayer(g);
      [...text].forEach((c, i) => v.blip(c, pitch, 0.05 + i * 0.05));
    });
  },

  /** Main-thread cost (ms) of the one-off generators, measured in a 48 kHz context. */
  generationCost() {
    const ac = new OfflineAudioContext(2, 48000, 48000);
    const rng = mulberry32(5);
    const time = (f: () => unknown) => {
      const t = performance.now();
      f();
      return round(performance.now() - t, 1);
    };
    return {
      graph: time(() => new Graph(ac)),
      impulse: time(() => makeImpulse(ac, rng)),
      murmur: time(() => makeMurmur(ac, rng, { seconds: 9, talkers: 9, cutoff: 1100 })),
      chatter: time(() => makeMurmur(ac, rng, { seconds: 8, talkers: 5, cutoff: 2400 })),
      fire: time(() => makeFire(ac, rng)),
      sizzle: time(() => makeSizzle(ac, rng)),
      furnace: time(() => makeFurnace(ac, rng)),
      snowSteps: time(() => makeSnowSteps(ac, rng, 7)),
      arrangeAll: time(() => SONG_IDS.forEach((id, i) => arrange(SONGS[id], 100 + i))),
    };
  },

  async renderAmbience(zone: AmbZone, seconds = 10) {
    let events: string[] = [];
    const stats = await render(seconds, (g) => {
      const amb = new Ambience(g, { offline: true });
      amb.setZone(zone === 'base' ? null : (zone as ZoneId | 'alley'), 0.3);
      events = amb.demo(1.5, 1.1);
      amb.update(0, seconds);
    });
    return { ...stats, events };
  },
};

(window as any).__audioCheck = api;

// ───────────────────────────── audition board ─────────────────────────────

let live: { ac: AudioContext; g: Graph; music: MusicPlayer; sfx: SfxPlayer; voice: VoicePlayer; amb: Ambience } | null = null;

function getLive() {
  if (live) return live;
  const ac = new AudioContext();
  const g = new Graph(ac);
  g.master.gain.value = MASTER;
  const lv = busLevels(DEFAULT, MARKET_MUSIC_VOLUME);
  g.music.set(lv.music);
  g.sfx.set(lv.sfx);
  g.amb.set(lv.amb);
  g.voice.set(lv.voice);
  const music = new MusicPlayer(g, { enabled: true, volume: MARKET_MUSIC_VOLUME, shuffle: false, tracks: SONG_IDS.map((song) => ({ type: 'procedural' as const, song })) });
  const amb = new Ambience(g);
  live = { ac, g, music, sfx: new SfxPlayer(g), voice: new VoicePlayer(g), amb };
  let k = 0;
  setInterval(() => {
    const now = ac.currentTime;
    music.tick(now, now + 0.12);
    if (k++ % 4 === 0) amb.update(now, now + 0.4);
    const cur = music.current();
    const el = document.getElementById('out');
    if (el && cur) el.textContent = `♪ ${cur.title} — ${cur.author ?? ''} · ${cur.license ?? ''}  (${now.toFixed(1)} s)`;
  }, 25);
  return live;
}

function button(parent: string, label: string, onClick: (b: HTMLButtonElement) => void) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    const l = getLive();
    l.ac.resume();
    onClick(b);
  };
  document.getElementById(parent)?.appendChild(b);
  return b;
}

if (document.getElementById('songs')) {
  SONG_IDS.forEach((id, i) => button('songs', SONGS[id].title, () => getLive().music.play(i, 1)));
  button('songs', '⏭ suivant', () => getLive().music.next(1.5));
  button('songs', '⏸ pause', () => getLive().music.pause());
  button('songs', '▶ reprendre', () => getLive().music.resume());
  const swell = document.getElementById('swell') as HTMLInputElement;
  const duck = document.getElementById('duck') as HTMLInputElement;
  const levels = () => {
    const l = getLive();
    l.music.ctl.swell = swell.checked;
    l.g.music.set(busLevels(DEFAULT, MARKET_MUSIC_VOLUME).music * (swell.checked ? SWELL : 1) * (duck.checked ? DUCK : 1), 0.3);
    l.g.musicTone.gain.setTargetAtTime(swell.checked ? 5 : 0, l.ac.currentTime, 0.5);
  };
  swell.onchange = levels;
  duck.onchange = levels;
  SFX_NAMES.forEach((n) => button('sfx', n, () => getLive().sfx.play(n)));
  button('sfx', 'bell à droite (positionnel)', () => getLive().sfx.play('bell', { position: { x: 8, y: 1, z: 0 } }));
  ZONES.forEach((z) => button('zones', z, () => getLive().amb.setZone(z === 'base' ? null : (z as ZoneId | 'alley'))));
  for (const p of [0.7, 1, 1.25, 1.5]) {
    button('voices', `voix ${p}`, () => {
      const l = getLive();
      const t0 = l.ac.currentTime + 0.05;
      [...SENTENCE].forEach((c, i) => l.voice.blip(c, p, t0 + i * 0.05));
    });
  }
}
