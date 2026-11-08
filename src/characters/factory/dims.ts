import type { CharacterAppearance } from '../../config/types';

/**
 * Bone indices. The rig is a small hierarchy (bones are plain Object3Ds in the scene graph):
 *
 *   base (feet, squash & jump)
 *    └ hips (bounce, sway, lean)
 *        ├ chest (breathing, upper twist)
 *        │   ├ head (look, nod) ─ eyes (blink), mouth, smile, brows, tip (pompom spring), tail (hair spring)
 *        │   ├ armL ─ handL      ├ armR ─ handR
 *        │   ├ scarf (tails spring)
 *        │   └ cape (cape spring)
 *        ├ legL
 *        └ legR
 */
export const B = {
  base: 0,
  hips: 1,
  chest: 2,
  head: 3,
  eyes: 4,
  mouth: 5,
  smile: 6,
  brows: 7,
  armL: 8,
  armR: 9,
  handL: 10,
  handR: 11,
  legL: 12,
  legR: 13,
  tip: 14,
  tail: 15,
  scarf: 16,
  cape: 17,
} as const;
export const BONE_COUNT = 18;
export const BONE_PARENT: number[] = [-1, B.base, B.hips, B.chest, B.head, B.head, B.head, B.head, B.chest, B.chest, B.armL, B.armR, B.hips, B.hips, B.head, B.head, B.chest, B.chest];

/** Body measurements (metres, bind pose, character facing +Z). */
export interface Dims {
  h: number;
  b: number;
  /** Head size factor (children have relatively bigger heads). */
  hk: number;
  hipY: number;
  legX: number;
  legR: number;
  chestY: number;
  /** Neck (head bone pivot) height. */
  neckY: number;
  shoulderX: number;
  shoulderY: number;
  armLen: number;
  armR: number;
  handR: number;
  headR: number;
  /** Head centre height above the neck pivot. */
  headC: number;
  /** Head ellipsoid scale. */
  hsx: number;
  hsy: number;
  hsz: number;
  /** Bottom of the main garment. */
  hemY: number;
  /** Total height to the top of the head (no hat). */
  top: number;
}

export function computeDims(a: Required<CharacterAppearance>): Dims {
  const h = a.height;
  const b = a.build;
  const hk = 0.62 + 0.38 * h;
  const headR = 0.246 * hk;
  const hipY = 0.19 * h;
  const neckY = 0.63 * h;
  const headC = 0.2 * hk;
  const hsy = 0.95;
  const hemY = a.outfit === 'coat' ? 0.112 * h : a.outfit === 'cape' ? 0.095 * h : 0.178 * h;
  return {
    h,
    b,
    hk,
    hipY,
    legX: 0.088 * b,
    legR: 0.056 * Math.sqrt(b),
    chestY: 0.44 * h,
    neckY,
    shoulderX: 0.16 * b,
    shoulderY: 0.54 * h,
    armLen: 0.19 * h,
    armR: 0.05 * Math.sqrt(b),
    handR: 0.06 * Math.sqrt(hk),
    headR,
    headC,
    hsx: 1.07,
    hsy,
    hsz: 1.0,
    hemY,
    top: neckY + headC + headR * hsy,
  };
}

/** Torso silhouette (radius at height y) — a soft pear, round and wide at the bottom. */
export function torsoProfile(d: Dims, outfit: CharacterAppearance['outfit']): [number, number][] {
  const { h, b } = d;
  const top = d.neckY / h;
  // upper part (shared): shoulders rounding into the neck
  const upper = (k: number): [number, number][] => [
    [0.205 * k, top - 0.205],
    [0.178 * k, top - 0.15],
    [0.145 * k, top - 0.1],
    [0.108 * k, top - 0.055],
    [0.066 * k, top - 0.018],
    [0, top - 0.002],
  ];
  let pts: [number, number][];
  switch (outfit) {
    case 'coat':
      pts = [[0, 0.112], [0.19, 0.112], [0.236, 0.128], [0.25, 0.165], [0.25, 0.22], [0.24, 0.29], [0.226, top - 0.27], ...upper(1)];
      break;
    case 'cape':
      pts = [[0, 0.095], [0.15, 0.095], [0.19, 0.12], [0.205, 0.2], [0.205, 0.3], [0.198, top - 0.27], ...upper(0.97)];
      break;
    default:
      pts = [[0, 0.178], [0.185, 0.178], [0.226, 0.193], [0.24, 0.225], [0.244, 0.27], [0.232, top - 0.27], ...upper(1)];
  }
  return pts.map(([r, y]) => [r * b, y * h]);
}

/** Radius of a lathe profile at height y (linear interpolation). */
export function radiusAt(profile: [number, number][], y: number): number {
  if (y <= profile[0][1]) return profile[1][0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i];
    const [r0, y0] = profile[i - 1];
    if (y <= y1) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return profile[profile.length - 1][0];
}
