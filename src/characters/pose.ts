/**
 * A pose is a flat Float32Array of channels (absolute values: rotations in radians, offsets in metres).
 * Animations write absolute poses starting from REST; the rig blends them by weight, then adds the
 * additive layers (look-at, talking, blinking, emote hops, springs).
 */
export const P = {
  baseY: 0,
  baseSX: 1,
  baseSY: 2,
  baseRX: 3,
  baseRY: 4,
  baseRZ: 5,
  hipsX: 6,
  hipsY: 7,
  hipsZ: 8,
  hipsRX: 9,
  hipsRY: 10,
  hipsRZ: 11,
  chestY: 12,
  chestRX: 13,
  chestRY: 14,
  chestRZ: 15,
  headRX: 16,
  headRY: 17,
  headRZ: 18,
  armLX: 19,
  armLY: 20,
  armLZ: 21,
  armRX: 22,
  armRY: 23,
  armRZ: 24,
  handLX: 25,
  handLY: 26,
  handLZ: 27,
  handRX: 28,
  handRY: 29,
  handRZ: 30,
  legLX: 31,
  legLZ: 32,
  legLY: 33,
  legRX: 34,
  legRZ: 35,
  legRY: 36,
  /** 0 closed → 1 wide open. */
  mouth: 37,
  /** 1 open → 0 closed. */
  eyes: 38,
  /** Brow raise (−1 frown … 1 surprised). */
  brow: 39,
  /** Smile scale (1 = normal). */
  smile: 40,
  eyeX: 41,
  eyeY: 42,
  /** Free channel for props (accordion squeeze, bulb size…). */
  prop0: 43,
  prop1: 44,
} as const;
export const POSE_SIZE = 45;
export type Pose = Float32Array;

export const REST: Pose = (() => {
  const r = new Float32Array(POSE_SIZE);
  r[P.baseSX] = 1;
  r[P.baseSY] = 1;
  r[P.armLZ] = 0.42;
  r[P.armRZ] = -0.42;
  r[P.armLX] = -0.08;
  r[P.armRX] = -0.08;
  r[P.legLZ] = 0.03;
  r[P.legRZ] = -0.03;
  r[P.eyes] = 1;
  r[P.smile] = 1;
  return r;
})();

export function resetPose(p: Pose) {
  p.set(REST);
}
