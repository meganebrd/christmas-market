/**
 * Ambience: looping beds (wind, crowd murmur, chatter, fire, sizzle, furnace, fairground organ) mixed
 * per zone with 2.5 s crossfades, plus occasional one-shots (distant laughter, children, bells, an
 * accordion phrase on the plaza, clinks at the bar, glass tinks in the workshop, skate scrapes, a far
 * church bell from the belvedere…). Idle layers are stopped to save CPU.
 */
import type { ZoneId } from '../config/types';
import { parseChordLine, parseMelody } from './theory';
import { makeFire, makeFurnace, makeMurmur, makeSizzle, mulberry32, murmurSteps, pick, rr, type Rng } from './dsp';
import { Voice, type Graph } from './graph';
import { accordion, bells, churchBell, glock, organ } from './instruments';
import { ACCORDION_PHRASES, ORGAN_LOOP } from './songs';

export type AmbZone = ZoneId | 'alley' | 'base';

type Layer = 'wind' | 'gust' | 'murmur' | 'chatter' | 'fire' | 'sizzle' | 'furnace' | 'organ';
type Evt = 'laugh' | 'kids' | 'jingle' | 'accordion' | 'clink' | 'tink' | 'skate' | 'church' | 'pop';

const MIX: Record<AmbZone, Partial<Record<Layer, number>>> = {
  base: { wind: 0.6, murmur: 0.35 },
  gate: { wind: 0.6, murmur: 0.32 },
  alley: { wind: 0.35, murmur: 0.62, chatter: 0.18 },
  plaza: { wind: 0.3, murmur: 0.66, chatter: 0.26 },
  bar: { wind: 0.18, murmur: 0.3, chatter: 0.62, fire: 0.6 },
  food: { wind: 0.22, murmur: 0.45, chatter: 0.3, fire: 0.35, sizzle: 0.5 },
  workshop: { wind: 0.22, murmur: 0.2, furnace: 0.55, fire: 0.15 },
  rink: { wind: 0.48, murmur: 0.32 },
  carousel: { wind: 0.28, murmur: 0.38, organ: 0.6 },
  belvedere: { wind: 0.75, gust: 0.6, murmur: 0.07 },
  fair: { wind: 0.3, murmur: 0.5, chatter: 0.32 },
};

/** Events per second. */
const RATES: Record<AmbZone, Partial<Record<Evt, number>>> = {
  base: { laugh: 1 / 40, jingle: 1 / 45 },
  gate: { laugh: 1 / 45, jingle: 1 / 38 },
  alley: { laugh: 1 / 16, jingle: 1 / 50, clink: 1 / 28 },
  plaza: { laugh: 1 / 20, kids: 1 / 28, accordion: 1 / 26, jingle: 1 / 60 },
  bar: { laugh: 1 / 9, clink: 1 / 3.5 },
  food: { laugh: 1 / 24, pop: 1 / 2.2, clink: 1 / 22 },
  workshop: { tink: 1 / 4.5 },
  rink: { skate: 1 / 2, kids: 1 / 8 },
  carousel: { kids: 1 / 7, laugh: 1 / 30 },
  belvedere: { church: 1 / 36 },
  fair: { kids: 1 / 9, laugh: 1 / 15 },
};

/** Calibration of each bed. */
const LEVEL: Record<Layer, number> = { wind: 0.5, gust: 0.1, murmur: 0.5, chatter: 0.42, fire: 0.5, sizzle: 0.22, furnace: 0.55, organ: 0.75 };
const SEND: Record<Layer, number> = { wind: 0.1, gust: 0.2, murmur: 0.45, chatter: 0.3, fire: 0.15, sizzle: 0.15, furnace: 0.2, organ: 0.45 };

interface LayerState {
  gain: GainNode;
  voice: Voice | null;
  target: number;
  offAt: number;
  pending: boolean;
}

interface OrganEv {
  t: number;
  d: number;
  m: number;
  v: number;
  glock?: boolean;
}

export class Ambience {
  private layers = new Map<Layer, LayerState>();
  private zone: AmbZone = 'base';
  private zoneSince = 0;
  private evT = 0;
  private rng: Rng;
  private organIn: GainNode;
  private organEvs: OrganEv[];
  private organLen: number;
  private organT0: number | null = null;
  private organIdx = 0;
  private started = false;

  constructor(private g: Graph, private opts: { offline?: boolean } = {}) {
    this.rng = mulberry32(Math.floor(g.rng() * 1e9));
    const ac = g.ac;
    // organ chain: notes → low-pass (heard from a little distance) → layer gain
    this.organIn = ac.createGain();
    this.organIn.gain.value = 1;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    this.organIn.connect(lp).connect(this.layer('organ').gain);
    const { evs, len } = buildOrgan();
    this.organEvs = evs;
    this.organLen = len;
  }

  private layer(id: Layer): LayerState {
    let s = this.layers.get(id);
    if (s) return s;
    const ac = this.g.ac;
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(this.g.amb.dry);
    const send = ac.createGain();
    send.gain.value = SEND[id];
    gain.connect(send).connect(this.g.amb.wet);
    s = { gain, voice: null, target: 0, offAt: 0, pending: false };
    this.layers.set(id, s);
    return s;
  }

  get current(): AmbZone {
    return this.zone;
  }

  /** Crossfades every bed to the mix of `zone`. */
  setZone(zone: ZoneId | 'alley' | null, fade = 2.5) {
    const z: AmbZone = zone && zone in MIX ? zone : 'base';
    const now = this.g.ac.currentTime;
    if (z === this.zone && this.started) return;
    this.started = true;
    this.zone = z;
    this.zoneSince = now;
    if (this.evT < now) this.evT = now;
    const mix = MIX[z];
    for (const id of Object.keys(LEVEL) as Layer[]) {
      const target = (mix[id] ?? 0) * LEVEL[id];
      const s = this.layer(id);
      if (target === s.target && (target === 0 || s.voice || s.pending)) continue;
      s.target = target;
      if (target > 0) this.ensure(id, s);
      const p = s.gain.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      if (fade > 0.01) p.linearRampToValueAtTime(target, now + fade);
      else p.setValueAtTime(target, now);
      s.offAt = target === 0 ? now + fade + 0.6 : 0;
    }
  }

  /** Builds the bed's sources (generating its sample buffer if needed, off the main frame). */
  private ensure(id: Layer, s: LayerState) {
    if (s.voice || s.pending || id === 'organ') return;
    const g = this.g;
    const key = { murmur: 'amb-murmur', chatter: 'amb-chatter', fire: 'amb-fire', sizzle: 'sizzle', furnace: 'amb-furnace' }[id as string];
    const make = () => {
      switch (id) {
        case 'murmur':
          return makeMurmur(g.ac, mulberry32(11), { seconds: 9, talkers: 9, cutoff: 1100 });
        case 'chatter':
          return makeMurmur(g.ac, mulberry32(23), { seconds: 8, talkers: 5, cutoff: 2400 });
        case 'fire':
          return makeFire(g.ac, mulberry32(37));
        case 'sizzle':
          return makeSizzle(g.ac, mulberry32(41));
        default:
          return makeFurnace(g.ac, mulberry32(53));
      }
    };
    const start = () => {
      s.pending = false;
      if (s.target <= 0 || s.voice) return;
      try {
        s.voice = this.buildBed(id, s.gain, key ? (g.sample(key, make) as AudioBuffer) : null);
      } catch (e) {
        console.warn('[givrelune audio] ambience layer failed', id, e);
      }
    };
    if (!key || g.cache.has(key) || this.opts.offline) start();
    else if (id === 'murmur' || id === 'chatter') {
      // crowd beds are the expensive ones: one talker per task
      s.pending = true;
      const it = id === 'murmur' ? murmurSteps(g.ac, mulberry32(11), { seconds: 9, talkers: 9, cutoff: 1100 }) : murmurSteps(g.ac, mulberry32(23), { seconds: 8, talkers: 5, cutoff: 2400 });
      const step = () => {
        try {
          const r = it.next();
          if (!r.done) return void setTimeout(step, 0);
          g.cache.set(key, r.value);
        } catch (e) {
          console.warn('[givrelune audio] crowd generation failed', e);
          s.pending = false;
          return;
        }
        start();
      };
      setTimeout(step, 0);
    } else {
      s.pending = true;
      setTimeout(start, 0);
    }
  }

  private buildBed(id: Layer, dest: AudioNode, buf: AudioBuffer | null): Voice {
    const g = this.g;
    const ac = g.ac;
    const v = new Voice(ac);
    const t = ac.currentTime;
    const rng = this.rng;
    if (id === 'wind') {
      const src = v.buf(g.pink, t, { loop: true, offset: rng() * 4 });
      const lp = v.filter('lowpass', 520, 0.5);
      v.osc('sine', 0.055, t).connect(v.gain(240)).connect(lp.frequency);
      const gust = v.gain(0.75);
      v.osc('sine', 0.11, t).connect(v.gain(0.25)).connect(gust.gain);
      src.connect(lp).connect(gust).connect(dest);
    } else if (id === 'gust') {
      const src = v.buf(g.pink, t, { loop: true, offset: rng() * 4 });
      const bp = v.filter('bandpass', 760, 10);
      v.osc('sine', 0.043, t).connect(v.gain(280)).connect(bp.frequency);
      const amp = v.gain(0.5);
      v.osc('sine', 0.07, t).connect(v.gain(0.45)).connect(amp.gain);
      src.connect(bp).connect(amp).connect(dest);
    } else if (buf) {
      const src = v.buf(buf, t, { loop: true, offset: rng() * buf.duration });
      const amp = v.gain(0.88);
      v.osc('sine', rr(rng, 0.025, 0.045), t).connect(v.gain(0.12)).connect(amp.gain);
      src.connect(amp).connect(dest);
    }
    return v;
  }

  /** Spawns one-shots and keeps the organ loop going up to `horizon`; stops faded-out beds. */
  update(now: number, horizon: number) {
    const rates = RATES[this.zone];
    while (this.evT < horizon) {
      const t = this.evT;
      this.evT += 0.25;
      if (t < now - 0.5) continue;
      const w = Math.min(1, Math.max(0, (t - this.zoneSince - 1) / 3));
      for (const [e, r] of Object.entries(rates) as [Evt, number][]) {
        if (this.rng() < r * 0.25 * w) this.spawn(e, Math.max(t, now) + this.rng() * 0.25);
      }
    }
    // organ loop
    const org = this.layers.get('organ');
    if (org && (org.target > 0 || now < org.offAt)) {
      if (this.organT0 === null) {
        this.organT0 = now + 0.1;
        this.organIdx = 0;
      }
      for (let guard = 0; guard < 200; guard++) {
        const e = this.organEvs[this.organIdx];
        const at = this.organT0 + e.t;
        if (at >= horizon) break;
        if (at >= now - 0.05) {
          if (e.glock) glock(this.g, this.organIn, at, e.m, e.v);
          else organ(this.g, this.organIn, at, e.m, e.v, e.d);
        }
        if (++this.organIdx >= this.organEvs.length) {
          this.organIdx = 0;
          this.organT0 += this.organLen;
        }
      }
    } else this.organT0 = null;
    // stop beds that have faded out
    for (const s of this.layers.values()) {
      if (s.target === 0 && s.voice && s.offAt && now > s.offAt) {
        s.voice.end(now);
        s.voice = null;
      }
    }
  }

  // ───────────────────────────── one-shots ─────────────────────────────

  private out(v: Voice, t: number, pan: number, cutoff: number, send: number): AudioNode {
    const g = this.g;
    const input = v.gain(1);
    const lp = v.filter('lowpass', cutoff, 0.5, t);
    const p = v.pan(pan);
    input.connect(lp).connect(p).connect(g.amb.dry);
    p.connect(v.gain(send)).connect(g.amb.wet);
    return input;
  }

  /** Spawns one of each of the current zone's occasional sounds (offline checks, auditions). */
  demo(t: number, spacing = 1.2): string[] {
    const list = Object.keys(RATES[this.zone]) as Evt[];
    list.forEach((e, k) => this.spawn(e, t + spacing * k));
    return list;
  }

  spawn(e: Evt, t: number) {
    try {
      this.spawnUnsafe(e, t);
    } catch (err) {
      /* a missing one-shot is never worth an error */
    }
  }

  private spawnUnsafe(e: Evt, t: number) {
    const g = this.g;
    const rng = this.rng;
    const v = new Voice(g.ac);
    let end = t + 1;
    switch (e) {
      case 'laugh':
      case 'kids': {
        const kid = e === 'kids';
        const out = this.out(v, t, rr(rng, -0.8, 0.8), kid ? 2800 : 2000, 0.55);
        const n = 3 + Math.floor(rng() * 4);
        const f0 = kid ? rr(rng, 380, 500) : rr(rng, 170, 290);
        const vol = (kid ? 0.05 : 0.045) * rr(rng, 0.45, 1);
        const k = kid ? 1.25 : 1;
        const src = v.osc('sawtooth', f0, t);
        const b1 = v.filter('bandpass', 760 * k, 4);
        const b2 = v.filter('bandpass', 1250 * k, 6);
        const env = v.gain(0);
        src.connect(b1).connect(env);
        src.connect(b2).connect(v.gain(0.6)).connect(env);
        const nb = v.filter('bandpass', 1500 * k, 1);
        v.buf(g.white, t, { offset: g.noiseOffset(g.white, 1.5) }).connect(nb).connect(v.gain(0.35)).connect(env);
        env.connect(out);
        env.gain.setValueAtTime(0, t);
        let tk = t;
        for (let i = 0; i < n; i++) {
          const f = f0 * (1 - i * 0.045) * rr(rng, 0.97, 1.04);
          src.frequency.setValueAtTime(f * 1.04, tk);
          src.frequency.linearRampToValueAtTime(f * 0.94, tk + 0.08);
          env.gain.setValueAtTime(0, tk);
          env.gain.linearRampToValueAtTime(vol * (1 - i * 0.08), tk + 0.016);
          env.gain.linearRampToValueAtTime(vol * 0.7, tk + 0.05);
          env.gain.linearRampToValueAtTime(0, tk + 0.085);
          tk += rr(rng, 0.12, 0.16) * (kid ? 0.85 : 1);
        }
        end = tk + 0.15;
        break;
      }
      case 'jingle': {
        const out = this.out(v, t, rr(rng, -0.7, 0.7), 3500, 0.7);
        const n = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const tt = t + i * rr(rng, 0.09, 0.2);
          const f = 440 * Math.pow(2, (pick(rng, [88, 91, 93, 96]) - 69) / 12);
          for (const [r, l, d] of [[1, 1, 1], [2, 0.4, 0.5], [3, 0.2, 0.3]]) {
            const gn = v.gain(0);
            gn.connect(out);
            gn.gain.setValueAtTime(0, tt);
            gn.gain.linearRampToValueAtTime(0.022 * l, tt + 0.002);
            gn.gain.setTargetAtTime(0, tt + 0.002, 0.5 * d);
            v.osc('sine', f * r, tt).connect(gn);
          }
        }
        if (rng() < 0.4) bells(g, out, t + 0.05, 0.05, true);
        end = t + 3.5;
        break;
      }
      case 'accordion': {
        const out = this.out(v, t, rr(rng, -0.5, 0.5), 2600, 0.5);
        const level = v.gain(0.75);
        level.connect(out);
        end = this.accordionPhrase(level, t);
        // the notes own their nodes: keep this chain alive (silent source) until the phrase ends
        v.osc('sine', 1, t).connect(v.gain(0)).connect(out);
        break;
      }
      case 'clink': {
        const out = this.out(v, t, rr(rng, -0.7, 0.7), 6500, 0.35);
        const f = rr(rng, 1900, 2700);
        for (const [dt, a, k] of [[0, 0.05, 1], [rr(rng, 0.06, 0.11), 0.032, rr(rng, 1.03, 1.08)]]) {
          for (const [r, l, d] of [[1, 1, 1], [2.32, 0.4, 0.6], [4.25, 0.2, 0.35]]) {
            const gn = v.gain(0);
            gn.connect(out);
            gn.gain.setValueAtTime(0, t + dt);
            gn.gain.linearRampToValueAtTime(a * l, t + dt + 0.001);
            gn.gain.setTargetAtTime(0, t + dt + 0.001, 0.3 * d);
            v.osc('sine', f * k * r, t + dt).connect(gn);
          }
        }
        end = t + 2.2;
        break;
      }
      case 'tink': {
        const out = this.out(v, t, rr(rng, -0.6, 0.6), 8000, 0.4);
        const f = rr(rng, 3000, 5000);
        for (const [r, l] of [[1, 1], [2.63, 0.4]]) {
          const gn = v.gain(0);
          gn.connect(out);
          gn.gain.setValueAtTime(0, t);
          gn.gain.linearRampToValueAtTime(0.035 * l, t + 0.001);
          gn.gain.setTargetAtTime(0, t + 0.001, 0.12);
          v.osc('sine', f * r, t).connect(gn);
        }
        end = t + 1;
        break;
      }
      case 'skate': {
        const out = this.out(v, t, rr(rng, -0.8, 0.8), 7000, 0.3);
        const strokes = rng() < 0.4 ? 2 : 1;
        let tt = t;
        for (let i = 0; i < strokes; i++) {
          const len = rr(rng, 0.25, 0.55);
          const bp = v.filter('bandpass', rr(rng, 2400, 3800), 3, tt);
          bp.frequency.linearRampToValueAtTime(rr(rng, 1900, 2600), tt + len);
          const gn = v.gain(0);
          bp.connect(gn).connect(out);
          gn.gain.setValueAtTime(0, tt);
          gn.gain.linearRampToValueAtTime(rr(rng, 0.05, 0.09), tt + 0.06);
          gn.gain.setValueAtTime(0.05, tt + len);
          gn.gain.linearRampToValueAtTime(0, tt + len + 0.15);
          v.buf(g.white, tt, { offset: g.noiseOffset(g.white, 1) }).connect(bp);
          tt += len + rr(rng, 0.25, 0.45);
        }
        end = tt + 0.2;
        break;
      }
      case 'church': {
        const out = this.out(v, t, rr(rng, -0.35, 0.35), 2200, 0.75);
        const f = pick(rng, [174.6, 196, 220]);
        const strokes = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < strokes; i++) churchBell(g, out, t + i * 2.6, f, 0.55);
        // keep a silent source alive until the bells have rung out
        const keep = v.osc('sine', 1, t);
        keep.connect(v.gain(0)).connect(out);
        end = t + strokes * 2.6 + 18;
        break;
      }
      case 'pop': {
        const out = this.out(v, t, rr(rng, -0.6, 0.6), 7000, 0.15);
        const hp = v.filter('highpass', 1500, 0.7);
        const gn = v.gain(0);
        hp.connect(gn).connect(out);
        const a = rr(rng, 0.04, 0.12);
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(a, t + 0.0005);
        gn.gain.setTargetAtTime(0, t + 0.0005, 0.004);
        v.buf(g.white, t, { offset: g.noiseOffset(g.white, 0.1) }).connect(hp);
        const tg = v.gain(0);
        tg.connect(out);
        tg.gain.setValueAtTime(0, t);
        tg.gain.linearRampToValueAtTime(a * 0.5, t + 0.001);
        tg.gain.setTargetAtTime(0, t + 0.001, 0.01);
        v.osc('sine', rr(rng, 180, 260), t).connect(tg);
        end = t + 0.2;
        break;
      }
    }
    v.end(end);
  }

  private accordionPhrase(out: AudioNode, t0: number): number {
    const ph = pick(this.rng, ACCORDION_PHRASES);
    const spu = 60 / (ph.bpm * 2);
    const tr = pick(this.rng, [0, 0, 2, -2]);
    let u = 0;
    for (const n of parseMelody(ph.melody).items) {
      if (n.midi !== null) accordion(this.g, out, t0 + u * spu, n.midi + tr, 0.75, n.len * spu * 0.92);
      u += n.len;
    }
    let cu = 0;
    for (const c of parseChordLine(ph.chords).items) {
      if (c.chord) {
        const root = 48 + ((c.chord.bass - 0 + 12) % 12) + tr;
        accordion(this.g, out, t0 + cu * spu, root - (root > 53 ? 12 : 0), 0.45, 2 * spu * 0.8);
        for (const beatOff of [2, 4]) {
          for (const pc of c.chord.pcs.slice(0, 3)) {
            const m = 60 + ((pc - 0 + 12) % 12) + tr;
            accordion(this.g, out, t0 + (cu + beatOff) * spu, m > 66 ? m - 12 : m, 0.22, spu * 0.8);
          }
        }
      }
      cu += c.len;
    }
    return t0 + u * spu + 0.6;
  }
}

function buildOrgan(): { evs: OrganEv[]; len: number } {
  const L = ORGAN_LOOP;
  const spu = 60 / (L.bpm * L.beatUnits);
  const evs: OrganEv[] = [];
  let u = 0;
  for (const n of parseMelody(L.melody).items) {
    if (n.midi !== null) {
      evs.push({ t: u * spu, d: n.len * spu * 0.9, m: n.midi, v: 0.6 });
      if (u % L.barUnits === 0) evs.push({ t: u * spu, d: 0, m: n.midi + 12, v: 0.18, glock: true });
    }
    u += n.len;
  }
  let cu = 0;
  for (const c of parseChordLine(L.chords).items) {
    if (c.chord) {
      const bassM = 36 + c.chord.bass + (c.chord.bass > 7 ? -12 : 0) + 12;
      evs.push({ t: cu * spu, d: L.beatUnits * spu * 0.8, m: bassM, v: 0.55 });
      for (const off of [L.beatUnits, L.beatUnits * 2]) {
        for (const pc of c.chord.pcs.slice(0, 3)) {
          let m = 60 + pc;
          if (m > 67) m -= 12;
          evs.push({ t: (cu + off) * spu, d: L.beatUnits * spu * 0.45, m, v: 0.2 });
        }
      }
    }
    cu += c.len;
  }
  evs.sort((a, b) => a.t - b.t);
  return { evs, len: u * spu };
}
