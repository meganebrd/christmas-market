/**
 * Music player: playlist (procedural songs + optional user audio files), lookahead scheduler
 * (a 25 ms timer schedules ~120 ms ahead on the AudioContext clock), crossfades between tracks,
 * pause/resume, and the finale "swell" layer.
 */
import type { TrackInfo } from '../core/contracts';
import type { MusicConfig, MusicTrack, ProceduralSongId } from '../config/types';
import { arrangementFor, type Arrangement, type Ev } from './arrange';
import { dbToGain, rr } from './dsp';
import { VoicePool, type Graph } from './graph';
import { playInst, type Inst, type NoteResult } from './instruments';
import { SONGS } from './songs';

const STRUCK: Partial<Record<Inst, true>> = { musicbox: true, celesta: true, glock: true, harp: true };
/** [pan, reverb send, level] per instrument. */
const MIX: Record<Inst, [number, number, number]> = {
  musicbox: [0, 0.32, 1],
  celesta: [0.08, 0.38, 1],
  glock: [0.32, 0.45, 0.9],
  harp: [-0.22, 0.26, 1],
  bass: [0, 0.07, 1],
  pad: [0, 0.5, 1],
  bells: [0.38, 0.3, 0.9],
  organ: [0, 0.3, 1],
  accordion: [0, 0.3, 1],
};

export interface PlayerCtl {
  swell: boolean;
  pool: VoicePool;
}

interface Track {
  info: TrackInfo;
  /** Seconds left before the track should hand over to the next one. */
  remaining(now: number): number;
  failed: boolean;
  pause(now: number): void;
  resume(now: number): void;
  stop(now: number, fade: number): void;
  schedule(now: number, until: number): void;
}

/** A procedural song: owns its instrument sub-mix and plays the arrangement's events. */
export class ProcTrack implements Track {
  failed = false;
  private dry: GainNode;
  private wet: GainNode;
  private insts = new Map<Inst, AudioNode>();
  private extra: AudioNode[] = [];
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private t0 = 0;
  private idx = 0;
  private pausedPos: number | null = null;
  private ringing = new Map<string, NoteResult>();
  private level: number;

  constructor(private g: Graph, private ctl: PlayerCtl, readonly arr: Arrangement, readonly info: TrackInfo) {
    const ac = g.ac;
    this.level = dbToGain(arr.song.trimDb ?? 0);
    this.dry = ac.createGain();
    this.wet = ac.createGain();
    this.dry.gain.value = 0;
    this.wet.gain.value = 0;
    this.dry.connect(g.music.dry);
    this.wet.connect(g.music.wet);
    // gentle chorus for the pad: shared slow vibrato on every pad oscillator
    this.lfo = ac.createOscillator();
    this.lfo.frequency.value = 0.23;
    this.lfoGain = ac.createGain();
    this.lfoGain.gain.value = 5;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();
  }

  private inst(i: Inst): AudioNode {
    let n = this.insts.get(i);
    if (n) return n;
    const ac = this.g.ac;
    const [pan, send, level] = MIX[i];
    const input = ac.createGain();
    input.gain.value = level;
    let head: AudioNode = input;
    if (i === 'pad') {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1450;
      lp.Q.value = 0.4;
      input.connect(lp);
      head = lp;
      this.extra.push(lp);
    }
    if (pan && typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      head.connect(p);
      head = p;
      this.extra.push(p);
    }
    head.connect(this.dry);
    const s = ac.createGain();
    s.gain.value = send;
    head.connect(s).connect(this.wet);
    this.extra.push(s);
    this.insts.set(i, input);
    return input;
  }

  /** Starts playback so that song position `from` (s) is heard at AudioContext time `now`. */
  begin(now: number, from = 0, fadeIn = 0) {
    this.t0 = now - from;
    this.seek(from, now);
    this.fadeTo(now, this.level, fadeIn);
  }

  private seek(pos: number, now: number) {
    const ev = this.arr.events;
    let i = 0;
    while (i < ev.length && ev[i].t < pos) i++;
    this.idx = i;
    // re-sound the sustained notes that started before `pos`
    for (let k = 0; k < i; k++) {
      const e = ev[k];
      if ((e.i === 'pad' || e.i === 'bass') && e.t + e.d > pos + 0.3 && (!e.sw || this.ctl.swell)) {
        this.play({ ...e, d: e.t + e.d - pos }, now + 0.02);
      }
    }
  }

  private fadeTo(now: number, v: number, seconds: number) {
    for (const g of [this.dry.gain, this.wet.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (seconds > 0.01) g.linearRampToValueAtTime(v, now + seconds);
      else g.setValueAtTime(v, now);
    }
  }

  schedule(now: number, until: number) {
    if (this.pausedPos !== null) return;
    const ev = this.arr.events;
    while (this.idx < ev.length) {
      const e = ev[this.idx];
      const at = this.t0 + e.t;
      if (at >= until) break;
      this.idx++;
      if (at < now - 0.04) continue; // too late (tab was throttled): skip rather than burst
      if (e.sw && !this.ctl.swell) continue;
      const ring = e.i === 'pad' ? e.d + 2.6 : e.i === 'bass' ? Math.min(e.d, 2.4) + 0.6 : 2.5;
      if (!this.ctl.pool.take(at, at + ring, e.pr)) continue;
      this.play(e, Math.max(at, now));
    }
  }

  private play(e: Ev, at: number) {
    const out = this.inst(e.i);
    const struck = STRUCK[e.i];
    const key = e.i + e.m;
    if (struck) {
      // a re-struck tine damps the one still ringing (like a real comb)
      const prev = this.ringing.get(key);
      if (prev?.gain && prev.end > at) prev.gain.gain.setTargetAtTime(0, at, 0.02);
    }
    const res = playInst(this.g, e.i, out, at, e.m, e.v, e.d, this.lfoGain, struck ? rr(this.g.rng, -4, 4) : 0);
    if (struck) this.ringing.set(key, res);
  }

  remaining(now: number) {
    if (this.pausedPos !== null) return Infinity;
    return this.t0 + this.arr.end - 3.2 - now;
  }

  pause(now: number) {
    if (this.pausedPos !== null) return;
    this.pausedPos = now - this.t0;
    this.fadeTo(now, 0, 0.35);
  }

  resume(now: number) {
    if (this.pausedPos === null) return;
    const pos = this.pausedPos;
    this.pausedPos = null;
    this.t0 = now + 0.08 - pos;
    this.seek(pos, now + 0.08);
    this.fadeTo(now, this.level, 0.6);
  }

  stop(now: number, fade: number) {
    this.pausedPos = -1;
    this.idx = this.arr.events.length;
    this.fadeTo(now, 0, fade);
    setTimeout(() => this.dispose(), (fade + 3) * 1000);
  }

  dispose() {
    try {
      this.lfo.stop();
    } catch {
      /* already */
    }
    for (const n of [this.dry, this.wet, this.lfo, this.lfoGain, ...this.insts.values(), ...this.extra]) {
      try {
        n.disconnect();
      } catch {
        /* already */
      }
    }
    this.insts.clear();
    this.ringing.clear();
  }
}

/** A user-provided audio file (HTMLAudioElement → MediaElementSource → music bus). */
class FileTrack implements Track {
  failed = false;
  private el: HTMLAudioElement;
  private node: MediaElementAudioSourceNode | null = null;
  private dry: GainNode;
  private wet: GainNode;
  private stopped = false;

  constructor(private g: Graph, src: string, readonly info: TrackInfo, private onEnd: (failed: boolean) => void) {
    const ac = g.ac as AudioContext;
    this.dry = ac.createGain();
    this.wet = ac.createGain();
    this.dry.gain.value = 0;
    this.wet.gain.value = 0;
    this.dry.connect(g.music.dry);
    this.wet.connect(g.music.wet);
    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'auto';
    this.el.src = src;
    this.el.addEventListener('ended', () => !this.stopped && this.onEnd(false));
    this.el.addEventListener('error', () => {
      if (this.stopped) return;
      this.failed = true;
      console.warn('[givrelune audio] cannot play music file', src);
      this.onEnd(true);
    });
    try {
      this.node = ac.createMediaElementSource(this.el);
      this.node.connect(this.dry);
      const s = ac.createGain();
      s.gain.value = 0.12;
      this.node.connect(s).connect(this.wet);
    } catch (e) {
      this.failed = true;
    }
  }

  begin(now: number, fadeIn: number) {
    this.ramp(now, 1, fadeIn);
    this.el.play().catch(() => {
      if (this.stopped) return;
      this.failed = true;
      this.onEnd(true);
    });
  }

  private ramp(now: number, v: number, s: number) {
    for (const g of [this.dry.gain, this.wet.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(v, now + Math.max(0.02, s));
    }
  }

  remaining() {
    const d = this.el.duration;
    if (!isFinite(d) || !d || this.el.paused) return Infinity;
    return d - this.el.currentTime - 2.5; // start the crossfade a little before the end
  }
  schedule() {}
  pause(now: number) {
    this.ramp(now, 0, 0.3);
    setTimeout(() => this.el.pause(), 320);
  }
  resume(now: number) {
    this.el.play().catch(() => undefined);
    this.ramp(now, 1, 0.5);
  }
  stop(now: number, fade: number) {
    this.stopped = true;
    this.ramp(now, 0, fade);
    setTimeout(() => {
      this.el.pause();
      this.el.removeAttribute('src');
      try {
        this.el.load();
      } catch {
        /* ignore */
      }
      for (const n of [this.node, this.dry, this.wet]) n?.disconnect();
    }, (fade + 0.2) * 1000);
  }
}

function resolveUrl(src: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
  let base = '/';
  try {
    base = (import.meta as any).env?.BASE_URL ?? '/';
  } catch {
    /* not in Vite */
  }
  return base.replace(/\/?$/, '/') + src.replace(/^\.\//, '');
}

export class MusicPlayer {
  readonly ctl: PlayerCtl = { swell: false, pool: new VoicePool(60) };
  private order: number[] = [];
  private pos = 0;
  private cur: Track | null = null;
  private plays = 0;
  private failures = 0;
  userPaused = false;

  constructor(private g: Graph, private cfg: Required<MusicConfig>) {
    this.reorder();
  }

  get tracks(): MusicTrack[] {
    return (this.cfg.tracks ?? []).filter((t) => (t.type === 'procedural' ? !!SONGS[t.song as ProceduralSongId] : !!t.src));
  }
  get playing() {
    return !!this.cur && !this.userPaused;
  }

  private reorder() {
    const n = this.tracks.length;
    const last = this.order[this.order.length - 1];
    this.order = [...Array(n).keys()];
    if (this.cfg.shuffle && n > 1) {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(this.g.rng() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
      if (this.order[0] === last) [this.order[0], this.order[n - 1]] = [this.order[n - 1], this.order[0]];
    }
    this.pos = 0;
  }

  current(): TrackInfo | null {
    return this.cur ? { ...this.cur.info } : null;
  }

  /** Plays playlist entry `index` (or the next one in the order) with a fade-in. */
  play(index?: number, fadeIn = 2.5): void {
    const tracks = this.tracks;
    if (!this.cfg.enabled || !tracks.length) return;
    this.userPaused = false;
    if (index === undefined && this.cur) return this.resume();
    if (index !== undefined) {
      const i = ((Math.floor(index) % tracks.length) + tracks.length) % tracks.length;
      const p = this.order.indexOf(i);
      this.pos = p >= 0 ? p : 0;
    }
    this.startAt(this.order[this.pos] ?? 0, fadeIn);
  }

  next(fadeIn = 2.5): void {
    if (!this.tracks.length) return;
    this.pos++;
    if (this.pos >= this.order.length) this.reorder();
    this.userPaused = false;
    this.startAt(this.order[this.pos], fadeIn);
  }

  private startAt(i: number, fadeIn: number): void {
    const now = this.g.ac.currentTime;
    const old = this.cur;
    this.cur = null;
    old?.stop(now, 2.8);
    const entry = this.tracks[i];
    if (!entry) return;
    try {
      if (entry.type === 'procedural') {
        const song = SONGS[entry.song];
        const arr = arrangementFor(entry.song, (this.plays++ % 3) + 1);
        const t = new ProcTrack(this.g, this.ctl, arr, { title: entry.title ?? song.title, author: song.author, license: song.license });
        t.begin(now + 0.06, 0, fadeIn);
        this.cur = t;
      } else {
        if (typeof Audio === 'undefined' || !('createMediaElementSource' in this.g.ac)) return this.skipFailed();
        const t = new FileTrack(this.g, resolveUrl(entry.src), { title: entry.title, author: entry.author, license: entry.license }, (failed) => {
          if (this.cur !== t) return;
          if (failed) this.skipFailed();
          else this.next(1.5);
        });
        if (t.failed) return this.skipFailed();
        t.begin(now, fadeIn);
        this.cur = t;
      }
      this.failures = 0;
    } catch (e) {
      console.warn('[givrelune audio] track failed', e);
      this.skipFailed();
    }
  }

  private skipFailed(): void {
    this.cur = null;
    if (++this.failures >= Math.max(1, this.tracks.length)) return; // nothing playable: stay silent
    setTimeout(() => this.next(1), 50);
  }

  pause() {
    this.userPaused = true;
    this.cur?.pause(this.g.ac.currentTime);
  }

  resume(): void {
    this.userPaused = false;
    if (!this.cur) return this.play(undefined);
    this.cur.resume(this.g.ac.currentTime);
  }

  stopAll(fade = 1) {
    this.cur?.stop(this.g.ac.currentTime, fade);
    this.cur = null;
  }

  /** Lookahead scheduling + automatic hand-over to the next track. */
  tick(now: number, until: number) {
    const t = this.cur;
    if (!t || this.userPaused) return;
    t.schedule(now, until);
    if (t.remaining(now) < 0) this.next(2);
  }
}
