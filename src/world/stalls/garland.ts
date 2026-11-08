import * as THREE from 'three';
import type { ChaletStyle } from '../../config/types';
import { PALETTE } from '../palette';
import { D, EAVE_EDGE } from './dims';
import { slopePoint } from './chalet';
import { G, Kit, col, toColor } from './kit';

/**
 * Roof-edge garland: a fluffy pine rope along the two front gable edges, festoons of bulbs under it and
 * along the side eaves. Bulbs are drawn with one InstancedMesh per chalet (see index.ts); this module
 * returns their positions/colours and bakes their soft glow onto the barge boards and the snow (channel 1).
 */

export interface BulbSet {
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
  twinkle: number;
}

const BULBS: Record<Exclude<NonNullable<ChaletStyle['garland']>, 'none'>, { colors: string[]; intensity: number; twinkle: number; bake: string }> = {
  warm: { colors: ['#ffc56b', '#ffb354', '#ffd690'], intensity: 3.0, twinkle: 0.22, bake: '#ffb862' },
  multicolor: { colors: ['#ff5040', '#ffcc3a', '#46d070', '#4f95ff', '#ff86cc'], intensity: 2.9, twinkle: 0.4, bake: '#ffcf9a' },
  blue: { colors: ['#a6d2ff', '#78b2ff', '#d8edff'], intensity: 3.0, twinkle: 0.3, bake: '#9cc6ff' },
};

const SLOPE_L = (D.hw + D.oh) / D.cos;
const BARGE_LOW = D.rt - 0.17;

export function buildGarland(k: Kit, style: ChaletStyle['garland'], opts: { apexBow: string | null }): BulbSet | null {
  if (!style || style === 'none') return null;
  const spec = BULBS[style] ?? BULBS.warm;
  const r = k.rand;
  const matrices: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  let ci = 0;
  const bulb = (x: number, y: number, z: number) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4)),
      new THREE.Vector3(0.03, 0.04, 0.03),
    );
    matrices.push(m);
    const c = toColor(spec.colors[ci++ % spec.colors.length]).multiplyScalar(spec.intensity);
    colors.push(c);
  };
  const pines = [col(PALETTE.pine), col(PALETTE.pineDark), col(PALETTE.pineLight), col('#24503f')];

  for (const s of [-1, 1]) {
    // rope
    const t0 = 0.12;
    const t1 = SLOPE_L - 0.03;
    const step = k.detail >= 0.75 ? 0.07 : 0.1;
    k.layer = 1;
    for (let t = t0; t < t1; t += step) {
      const p = slopePoint(s, t, BARGE_LOW + 0.03);
      const c = pines[Math.floor(r() * pines.length)].clone().multiplyScalar(0.85 + r() * 0.35);
      (k.detail >= 0.75 ? k.blob : k.tuft).call(k, 0.052 * (0.85 + r() * 0.35) * (k.detail >= 0.75 ? 1 : 1.2), c, p.x + (r() - 0.5) * 0.02, p.y + (r() - 0.5) * 0.025, D.rf + 0.035 + (r() - 0.5) * 0.02, {
        r: [r() * 3, r() * 3, r() * 3],
      });
    }
    k.layer = 0;
    // festoons of bulbs under the rope
    const swag = 0.46;
    const nSw = Math.max(1, Math.round((t1 - t0) / swag));
    const sl = (t1 - t0) / nSw;
    const per = 3;
    for (let j = 0; j < nSw; j++) {
      for (let b = 0; b < per; b++) {
        const f = (b + 0.5) / per;
        const p = slopePoint(s, t0 + (j + f) * sl, BARGE_LOW + 0.01);
        bulb(p.x, p.y - 0.045 - 0.06 * 4 * f * (1 - f), D.rf + 0.07);
      }
    }
    for (const t of [0.55, 1.25, 1.95]) {
      const p = slopePoint(s, t, BARGE_LOW);
      k.light(p.x, p.y - 0.06, D.rf + 0.12, spec.bake, 0.55, 0.7, 1, false, 0.6);
    }
    // side eave festoons
    const z0 = D.rf - 0.08;
    const z1 = D.rb + 0.08;
    const n = Math.max(2, Math.round((z0 - z1) / 0.5));
    const len = (z0 - z1) / n;
    for (let j = 0; j < n; j++) {
      for (let b = 0; b < 3; b++) {
        const f = (b + 0.5) / 3;
        bulb(s * (EAVE_EDGE.x - 0.015), EAVE_EDGE.y - 0.035 - 0.055 * 4 * f * (1 - f), z0 - (j + f) * len);
      }
    }
    for (const z of [-0.9, 0.1, 1.0]) k.light(s * (EAVE_EDGE.x + 0.05), EAVE_EDGE.y - 0.1, z, spec.bake, 0.45, 0.65, 1, false, 0.6);
  }
  if (opts.apexBow) {
    const p = slopePoint(1, 0.04, BARGE_LOW + 0.04);
    k.with(0, p.y - 0.01, D.rf + 0.07, 0, 1.3, () => {
      for (const sx of [-1, 1]) k.sphere(0.05, opts.apexBow!, sx * 0.05, 0.012, 0, { s: [1, 0.62, 0.45], r: [0, 0, sx * 0.4], seg: 8 });
      k.sphere(0.022, opts.apexBow!, 0, 0, 0.012, { seg: 6 });
      for (const sx of [-1, 1]) k.box(0.025, 0.12, 0.008, opts.apexBow!, sx * 0.032, -0.06, 0.004, { r: [0, 0, sx * 0.35] });
    });
  }
  return { matrices, colors, twinkle: spec.twinkle };
}

/** Shared bulb geometry. */
export function bulbGeometry(): THREE.BufferGeometry {
  return G.octa();
}
