/**
 * "Babble" voices for dialogues — an original cute gibberish: one tiny blip per typed letter.
 *   vowels      → a short voiced tone through a two-formant vowel filter (a / e / i / o / u)
 *   plosives    → a soft click        fricatives → a breathy noise tick
 *   m n l r     → a little hum        spaces/punctuation → silence
 * Pitch = base × voicePitch with a little randomness, a cute rise-and-fall glide, ≥ 45 ms apart.
 */
import { rr, type Rng } from './dsp';
import { Voice, type Graph } from './graph';

const FORMANTS: Record<string, [number, number]> = {
  a: [820, 1250],
  e: [470, 1950],
  i: [310, 2350],
  o: [500, 900],
  u: [320, 1700],
  y: [320, 1700],
};

const ACCENTS: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', æ: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e', œ: 'e',
  î: 'i', ï: 'i', í: 'i',
  ô: 'o', ö: 'o', ó: 'o',
  ù: 'u', û: 'u', ü: 'u', ú: 'u',
  ç: 's', ñ: 'n',
};

type Kind = 'vowel' | 'plosive' | 'fricative' | 'hum' | 'none';

function classify(ch: string): { kind: Kind; letter: string } {
  const c = ACCENTS[ch] ?? ch;
  if (c in FORMANTS) return { kind: 'vowel', letter: c };
  if ('pbtdkgqc'.includes(c)) return { kind: 'plosive', letter: c };
  if ('sfvzjxhw'.includes(c)) return { kind: 'fricative', letter: c };
  if ('mnlr'.includes(c)) return { kind: 'hum', letter: c };
  if (/[0-9]/.test(c)) return { kind: 'vowel', letter: 'aeiou'[Number(c) % 5] };
  return { kind: 'none', letter: c };
}

export class VoicePlayer {
  private last = -1;
  private rng: Rng;

  constructor(private g: Graph) {
    this.rng = g.rng;
  }

  /** One blip. Returns false when throttled or silent. */
  blip(char: string, pitch = 1, at?: number): boolean {
    if (!char) return false;
    const { kind, letter } = classify(char.toLowerCase());
    if (kind === 'none') return false;
    const ac = this.g.ac;
    const t = at ?? ac.currentTime + 0.004;
    if (t - this.last < 0.045) return false;
    this.last = t;
    const p = Math.max(0.4, Math.min(2.2, pitch || 1));
    const v = new Voice(ac);
    const out = v.gain(1);
    out.connect(this.g.voice.dry);
    const send = v.gain(0.12);
    out.connect(send).connect(this.g.voice.wet);
    const rng = this.rng;
    let end = t + 0.1;

    if (kind === 'vowel') {
      const f0 = 255 * p * rr(rng, 0.93, 1.08);
      const [F1, F2] = FORMANTS[letter];
      const k = 1.08 + (p - 1) * 0.18; // small voices have higher formants
      const src = v.osc('sawtooth', f0, t);
      src.frequency.linearRampToValueAtTime(f0 * 1.05, t + 0.02);
      src.frequency.linearRampToValueAtTime(f0 * rr(rng, 0.9, 0.97), t + 0.07);
      const lp = v.filter('lowpass', 3600, 0.5);
      const b1 = v.filter('bandpass', F1 * k, 5);
      const b2 = v.filter('bandpass', F2 * k, 8);
      const g2 = v.gain(0.55);
      src.connect(lp);
      lp.connect(b1);
      lp.connect(b2).connect(g2);
      const env = v.gain(0);
      b1.connect(env);
      g2.connect(env);
      env.connect(out);
      const dur = rr(rng, 0.05, 0.075);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.42, t + 0.008);
      env.gain.setValueAtTime(0.42, t + dur * 0.55);
      env.gain.linearRampToValueAtTime(0, t + dur);
      end = t + dur + 0.02;
    } else if (kind === 'plosive') {
      const f = rr(rng, 1300, 2100) * Math.pow(p, 0.3);
      const g = v.gain(0);
      g.connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.0008);
      g.gain.setTargetAtTime(0, t + 0.0008, 0.005);
      v.osc('sine', f, t).connect(g);
      const n = v.filter('highpass', 2800, 0.7);
      const ng = v.gain(0);
      n.connect(ng).connect(out);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.02, t + 0.0005);
      ng.gain.setTargetAtTime(0, t + 0.0005, 0.003);
      v.buf(this.g.white, t, { offset: this.g.noiseOffset(this.g.white, 0.05) }).connect(n);
      end = t + 0.04;
    } else if (kind === 'fricative') {
      const n = v.filter('bandpass', rr(rng, 4200, 6200), 2);
      const ng = v.gain(0);
      n.connect(ng).connect(out);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.045, t + 0.006);
      ng.gain.linearRampToValueAtTime(0, t + 0.03);
      v.buf(this.g.white, t, { offset: this.g.noiseOffset(this.g.white, 0.05) }).connect(n);
      end = t + 0.04;
    } else {
      const f0 = 255 * p * rr(rng, 0.95, 1.05);
      const lp = v.filter('lowpass', 620, 0.7);
      const g = v.gain(0);
      lp.connect(g).connect(out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.006);
      g.gain.linearRampToValueAtTime(0, t + 0.035);
      v.osc('triangle', f0, t).connect(lp);
      end = t + 0.045;
    }
    v.end(end + 0.02);
    return true;
  }
}
