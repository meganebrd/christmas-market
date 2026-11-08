import type * as THREE from 'three';
import { CHALET } from '../layout';

/**
 * Chalet measurements (local frame: front = +Z, origin on the ground at the centre).
 * Footprint ≈ CHALET.width × CHALET.depth (3.4 × 2.6 m) including the roof overhang.
 */
const PITCH = (42 * Math.PI) / 180;
const HW = 1.5;
const EAVE = 2.0;

export const D = {
  /** Wall half width (outer faces at x = ±hw). */
  hw: HW,
  /** Front wall outer plane. */
  zf: 0.95,
  /** Back wall outer plane. */
  zb: -1.2,
  /** Plank thickness. */
  pt: 0.04,
  eave: EAVE,
  pitch: PITCH,
  tan: Math.tan(PITCH),
  cos: Math.cos(PITCH),
  sin: Math.sin(PITCH),
  /** Roof underside at the centre line. */
  ridge: EAVE + HW * Math.tan(PITCH),
  /** Side overhang (horizontal). */
  oh: CHALET.width / 2 - HW - 0.0,
  /** Roof front / back edges. */
  rf: 1.38,
  rb: -1.42,
  /** Roof slab thickness. */
  rt: 0.08,
  /** Shingle thickness on top of the slab. */
  sh: 0.03,
  snowT: 0.15,
  /** Plinth. */
  ph: 0.12,
  pw: 1.6,
  pz0: -1.28,
  pz1: 1.2,
  /** Front opening. */
  ow: 1.125,
  oy0: 0.8,
  oy1: 1.86,
  /** Counter top. */
  cy: 0.84,
  cz0: 0.6,
  cz1: CHALET.counterZ + 0.02,
  chw: 1.3,
  /** Back shelves (top surfaces). */
  shelfY: [1.04, 1.42],
  shelfD: 0.27,
  /** Sign board centre & size. */
  signY: 2.27,
  signH: 0.4,
  signMaxW: 1.62,
  /** Awning front edge. */
  awZ: 1.46,
  awY0: 1.99,
  awY1: 1.85,
  awHW: 1.38,
} as const;

/** Underside of the roof at |x|. */
export function roofUnder(x: number): number {
  return D.ridge - Math.abs(x) * D.tan;
}

/** Top of the roof (incl. snow) at |x| — where roof decorations stand. */
export function roofTop(x: number, snow: boolean): number {
  return roofUnder(x) + (D.rt + D.sh + (snow ? D.snowT * 0.85 : 0)) / D.cos;
}

/** Eave edge (lowest point of the roof slab) — where icicles hang. */
export const EAVE_EDGE = { x: D.hw + D.oh, y: D.ridge - (D.hw + D.oh) * D.tan };

/** Is a chalet-space point inside the cabin (below the roof, behind the front wall)? */
export function insideCabin(p: THREE.Vector3): boolean {
  return (
    p.x > -D.hw + 0.035 &&
    p.x < D.hw - 0.035 &&
    p.z > D.zb + 0.035 &&
    p.z < D.zf - 0.03 &&
    p.y > 0.05 &&
    p.y < roofUnder(p.x) - 0.005
  );
}
