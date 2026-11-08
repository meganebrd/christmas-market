/** Mix calibration shared by the game and the offline checks. */
export const MASTER = 0.85;
export const DUCK = 0.316; // −10 dB
export const SWELL = 1.41; // +3 dB
const MUSIC_TRIM = 1.45;
const SFX_TRIM = 1;
const AMB_TRIM = 0.5;
const VOICE_TRIM = 0.9;

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const sq = (v: number) => clamp01(v) * clamp01(v);

/** Bus gains for the given slider values (sliders are squared: a more natural loudness curve). */
export function busLevels(s: { music: number; sfx: number }, musicVolume = 0.6) {
  const fx = sq(s.sfx);
  return {
    music: sq(s.music) * clamp01(musicVolume) * MUSIC_TRIM,
    sfx: fx * SFX_TRIM,
    amb: fx * AMB_TRIM,
    voice: fx * VOICE_TRIM,
  };
}
