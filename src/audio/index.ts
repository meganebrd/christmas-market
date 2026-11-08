/**
 * Givrelune audio — everything is synthesised live with the Web Audio API:
 *   music.ts      music-box carols + an original waltz (lookahead scheduler, playlist, crossfades)
 *   sfx.ts        every SfxName (positional when given a position)
 *   voice.ts      cute dialogue babble
 *   ambience.ts   wind, crowd, fire, sizzle, furnace, fairground organ… per zone
 *   graph.ts      buses, reverb, compressor/limiter
 *
 * Safe before `unlock()`: calls are ignored or remembered (zone, wanted track, duck/swell, volumes).
 * Nothing here ever throws into the game.
 */
import type * as THREE from 'three';
import type { AudioApi, GameContext, Settings, SfxName, TrackInfo } from '../core/contracts';
import type { ZoneId } from '../config/types';
import type { Surface } from '../world/layout';
import { Ambience } from './ambience';
import { Graph } from './graph';
import { MusicPlayer } from './music';
import { SfxPlayer } from './sfx';
import { VoicePlayer } from './voice';
import { busLevels, clamp01, DUCK, MASTER, SWELL } from './levels';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Zone = ZoneId | 'alley' | null;

class AudioEngine {
  private ac: AudioContext | null = null;
  private g: Graph | null = null;
  private music: MusicPlayer | null = null;
  private sfxp: SfxPlayer | null = null;
  private voicep: VoicePlayer | null = null;
  private amb: Ambience | null = null;
  private settings: Settings;
  private sessionMute: boolean;
  unlocked = false;
  private unlocking: Promise<void> | null = null;
  private duckOn = false;
  private swellOn = false;
  private zone: Zone = null;
  private wantTrack: number | undefined;
  private userPaused = false;
  private hidden = typeof document !== 'undefined' && document.hidden;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private ticks = 0;
  private lastStepEvent = 0;
  private lastStepDirect = 0;
  private emitting = false;
  private lastListener = [NaN, NaN, NaN, NaN, NaN, NaN];

  constructor(private ctx: GameContext) {
    this.settings = { ...ctx.save.data.settings };
    this.sessionMute = ctx.flags.has('mute');
    if (this.sessionMute) this.settings.muted = true;
    ctx.events.on('settings:change', (s) => {
      if (this.emitting || !s) return;
      this.settings = { ...this.settings, ...s };
      if (this.sessionMute) this.settings.muted = true; // ?mute stays muted until setMuted(false)
      this.applyLevels();
    });
    ctx.events.on('player:step', (p) => this.onStep(p.surface, p.running));
    ctx.events.on('finale:start', () => this.setSwell(true));
    ctx.events.on('finale:end', () => this.setSwell(false));
    if (typeof window !== 'undefined') {
      const onGesture = () => {
        if (!this.unlocked) void this.unlock();
        else if (this.ac && this.ac.state !== 'running' && this.audible) this.ac.resume().catch(() => undefined);
      };
      for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, onGesture, { capture: true, passive: true });
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden;
        this.applyLevels();
      });
    }
    if (ctx.flags.has('debug')) (window as any).__givreluneAudio = this;
  }

  private get audible() {
    return !this.settings.muted && !this.hidden;
  }

  // ───────────────────────────── unlock & graph ─────────────────────────────

  unlock(): Promise<void> {
    if (this.unlocked) return this.ac && this.ac.state !== 'running' && this.audible ? this.ac.resume().catch(() => undefined) : Promise.resolve();
    if (!this.unlocking) {
      this.unlocking = this.doUnlock().finally(() => {
        this.unlocking = null;
      });
    }
    return this.unlocking;
  }

  private async doUnlock() {
    try {
      if (!this.ac) {
        const AC: typeof AudioContext | undefined = (window as any).AudioContext ?? (window as any).webkitAudioContext;
        if (!AC) return;
        this.ac = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      const ac = this.ac!;
      if (ac.state !== 'running') await Promise.race([ac.resume().catch(() => undefined), wait(1200)]);
      if (ac.state !== 'running' || this.unlocked) return;
      this.unlocked = true;
      this.timer = setInterval(() => this.tick(), 25);
      this.syncMusic(3); // playlist starts with a 3 s fade-in (if enabled and not muted)
      this.applyLevels(true);
      this.amb?.setZone(this.zone, 2);
    } catch (e) {
      console.warn('[givrelune audio] unlock failed', e);
    }
  }

  private build() {
    const g = new Graph(this.ac!);
    g.master.gain.value = 0;
    this.g = g;
    this.music = new MusicPlayer(g, this.ctx.config.music);
    this.sfxp = new SfxPlayer(g);
    this.voicep = new VoicePlayer(g);
    this.amb = new Ambience(g);
  }

  private tick() {
    const ac = this.ac;
    if (!ac || ac.state !== 'running') return;
    try {
      const now = ac.currentTime;
      this.music?.tick(now, now + 0.12);
      if (this.ticks++ % 4 === 0) this.amb?.update(now, now + 0.4);
    } catch (e) {
      console.warn('[givrelune audio] scheduler error', e);
    }
  }

  // ───────────────────────────── levels ─────────────────────────────

  private applyLevels(slow = false, musicTc = 0.1) {
    const g = this.g;
    if (!g) return;
    const s = this.settings;
    const now = g.ac.currentTime;
    const m = g.master.gain;
    m.cancelScheduledValues(now);
    m.setTargetAtTime(this.audible ? MASTER : 0, now, slow ? 0.25 : 0.05);
    const lv = busLevels(s, this.ctx.config.music.volume ?? 0.6);
    g.music.set(lv.music * (this.duckOn ? DUCK : 1) * (this.swellOn ? SWELL : 1) * (this.zone === 'carousel' ? 0.5 : 1), musicTc);
    g.musicTone.gain.cancelScheduledValues(now);
    g.musicTone.gain.setTargetAtTime(this.swellOn ? 5 : 0, now, 0.9);
    g.sfx.set(lv.sfx);
    g.amb.set(lv.amb, 0.25);
    g.voice.set(lv.voice);
    this.syncMusic(2);
    if (this.audible) this.resumeCtx();
    else this.scheduleSuspend();
  }

  /** Starts/stops the music according to settings, config and the visitor's pause. */
  private syncMusic(fadeIn: number) {
    const m = this.music;
    if (!m || !this.unlocked) return;
    const s = this.settings;
    const want = this.ctx.config.music.enabled !== false && s.music > 0.001 && !s.muted && !this.userPaused;
    if (want && !m.playing) {
      if (m.current()) m.resume();
      else m.play(this.wantTrack, fadeIn);
    } else if (!want && m.playing && (s.music <= 0.001 || this.userPaused)) m.pause();
  }

  private scheduleSuspend() {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (this.ac && !this.audible && this.ac.state === 'running') this.ac.suspend().catch(() => undefined);
    }, 450);
  }

  private resumeCtx() {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (this.ac && this.unlocked && this.ac.state !== 'running') this.ac.resume().catch(() => undefined);
  }

  private persist(fn: (s: Settings) => void) {
    fn(this.settings);
    try {
      this.ctx.save.update((d) => fn(d.settings));
    } catch {
      /* storage may be unavailable */
    }
    if (this.emitting) return;
    this.emitting = true;
    try {
      this.ctx.events.emit('settings:change', { ...this.settings });
    } finally {
      this.emitting = false;
    }
  }

  setMuted(muted: boolean) {
    const v = !!muted;
    if (this.sessionMute) {
      this.settings.muted = v; // ?mute: session only, never persisted
      if (!v) this.sessionMute = false;
    } else this.persist((s) => (s.muted = v));
    this.applyLevels();
  }

  setVolume(channel: 'music' | 'sfx', v: number) {
    if (channel !== 'music' && channel !== 'sfx') return;
    const x = clamp01(v);
    this.persist((s) => (s[channel] = x));
    this.applyLevels();
  }

  isMuted() {
    return !!this.settings.muted;
  }

  // ───────────────────────────── music controls ─────────────────────────────

  musicPlay(index?: number) {
    this.userPaused = false;
    if (index !== undefined) this.wantTrack = index;
    if (!this.unlocked || !this.music) return;
    if (this.settings.muted || this.settings.music <= 0.001) return; // will start when audible
    this.music.play(index, 2.5);
  }
  musicNext() {
    this.userPaused = false;
    if (!this.unlocked || !this.music) {
      this.wantTrack = (this.wantTrack ?? -1) + 1;
      return;
    }
    this.music.next(2.5);
  }
  musicPause() {
    this.userPaused = true;
    this.music?.pause();
  }
  musicResume() {
    this.userPaused = false;
    this.syncMusic(2.5);
  }
  current(): TrackInfo | null {
    return this.music?.current() ?? null;
  }
  duck(on: boolean) {
    if (this.duckOn === !!on) return;
    this.duckOn = !!on;
    this.applyLevels(false, this.duckOn ? 0.25 : 0.45);
  }
  setSwell(on: boolean) {
    this.swellOn = !!on;
    if (this.music) this.music.ctl.swell = this.swellOn;
    this.applyLevels(false, 1.1);
  }

  // ───────────────────────────── sfx, voice, ambience, listener ─────────────────────────────

  private get live() {
    return this.unlocked && !!this.g && this.audible && this.ac?.state === 'running';
  }

  sfx(name: SfxName, opts?: { volume?: number; pitch?: number; position?: THREE.Vector3 }) {
    if (typeof name === 'string' && name.startsWith('step-')) {
      const now = performance.now();
      if (now - this.lastStepEvent < 70) return; // already played from the player:step event
      this.lastStepDirect = now;
    }
    if (!this.live || !this.sfxp) return;
    const p = opts?.position;
    this.sfxp.play(name, {
      volume: opts?.volume,
      pitch: opts?.pitch,
      position: p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, y: p.y || 0, z: p.z } : undefined,
    });
  }

  private onStep(surface: Surface, running: boolean) {
    const now = performance.now();
    if (now - this.lastStepDirect < 70) return; // the caller played it directly
    this.lastStepEvent = now;
    if (!this.live || !this.sfxp) return;
    const name = (`step-${surface}` as SfxName) || 'step-snow';
    this.sfxp.play(['step-snow', 'step-stone', 'step-wood', 'step-ice'].includes(name) ? name : 'step-snow', {
      volume: running ? 0.95 : 0.75,
      pitch: running ? 1.04 : 1,
    });
  }

  blip(char: string, pitch: number) {
    if (!this.live || !this.voicep) return;
    this.voicep.blip(String(char ?? '').charAt(0), Number(pitch) || 1);
  }

  setAmbience(zone: Zone) {
    const z = (zone ?? null) as Zone;
    const changed = z !== this.zone;
    this.zone = z;
    if (!this.unlocked || !this.amb) return;
    this.amb.setZone(z, 2.5);
    if (changed) this.applyLevels(false, 0.8);
  }

  setListener(position: THREE.Vector3, forward: THREE.Vector3) {
    const g = this.g;
    if (!g || !position || !forward) return;
    const fl = Math.hypot(forward.x, forward.y, forward.z);
    if (!(fl > 1e-6) || !Number.isFinite(position.x)) return;
    const v = [position.x, position.y, position.z, forward.x / fl, forward.y / fl, forward.z / fl];
    const L = this.lastListener;
    let moved = false;
    for (let i = 0; i < 6; i++) if (!(Math.abs(v[i] - L[i]) < (i < 3 ? 0.01 : 0.002))) moved = true;
    if (!moved) return;
    this.lastListener = v;
    const l = g.ac.listener as AudioListener & { setPosition?: Function; setOrientation?: Function };
    if (l.positionX) {
      l.positionX.value = v[0];
      l.positionY.value = v[1];
      l.positionZ.value = v[2];
      l.forwardX.value = v[3];
      l.forwardY.value = v[4];
      l.forwardZ.value = v[5];
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition?.(v[0], v[1], v[2]);
      l.setOrientation?.(v[3], v[4], v[5], 0, 1, 0);
    }
    if (this.sfxp) this.sfxp.listener = { x: v[0], y: v[1], z: v[2] };
  }
}

/** Runs `fn`, swallowing (and logging once in a while) any error: audio must never break the game. */
function safe<A extends unknown[], R>(fn: (...a: A) => R, fallback: R): (...a: A) => R {
  return (...a: A) => {
    try {
      return fn(...a);
    } catch (e) {
      console.warn('[givrelune audio]', e);
      return fallback;
    }
  };
}

export function createAudio(ctx: GameContext): AudioApi {
  const e = new AudioEngine(ctx);
  return {
    get unlocked() {
      return e.unlocked;
    },
    unlock: () => {
      try {
        return e.unlock();
      } catch {
        return Promise.resolve();
      }
    },
    setMuted: safe((m: boolean) => e.setMuted(m), undefined),
    isMuted: safe(() => e.isMuted(), false),
    setVolume: safe((c: 'music' | 'sfx', v: number) => e.setVolume(c, v), undefined),
    music: {
      play: safe((i?: number) => e.musicPlay(i), undefined),
      next: safe(() => e.musicNext(), undefined),
      pause: safe(() => e.musicPause(), undefined),
      resume: safe(() => e.musicResume(), undefined),
      current: safe(() => e.current(), null),
      duck: safe((on: boolean) => e.duck(on), undefined),
      swell: safe((on: boolean) => e.setSwell(on), undefined),
    },
    sfx: safe((name: SfxName, opts?: { volume?: number; pitch?: number; position?: THREE.Vector3 }) => e.sfx(name, opts), undefined),
    voice: { blip: safe((c: string, p: number) => e.blip(c, p), undefined) },
    setAmbience: safe((z: Zone) => e.setAmbience(z), undefined),
    setListener: safe((p: THREE.Vector3, f: THREE.Vector3) => e.setListener(p, f), undefined),
  };
}
