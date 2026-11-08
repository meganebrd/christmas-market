import * as THREE from 'three';
import type { CharacterAppearance } from '../../config/types';
import { B, radiusAt, torsoProfile, type Dims } from './dims';
import { GeoBuilder, M, box, capsule, cylinder, ellipsoid, flip, fluffy, fluffyTorus, lathe, latheMasked, mul, ribbed, seg, sphere, torus, tube } from './geo';
import { CREAM, GOLD, LEATHER, mix, shade } from './colors';
import { smoothstep } from '../util';

/**
 * Body: torso by outfit (coat with toggles, sweater with a knitted band, apron, cape, vest), short arms
 * with mittens, short legs with snow boots, a chunky knitted scarf with swaying tails, bag & co.
 */
export interface BodyCtx {
  g: GeoBuilder;
  a: Required<CharacterAppearance>;
  d: Dims;
  detail: number;
  rand: () => number;
}

export interface BodyInfo {
  /** Scarf tails spring pivot (model space) or null. */
  scarfPivot: THREE.Vector3 | null;
  capePivot: THREE.Vector3 | null;
  sleeve: THREE.Color;
}

const BOOTS = ['#5a3a2a', '#3b2a22', '#7a3b2e', '#2f3a4a', '#6b4f3a', '#4a3b52'];

export function buildBody(c: BodyCtx): BodyInfo {
  const { g, a, d, detail, rand } = c;
  const { h, b } = d;
  const rs = seg(20, detail, 9);
  const torsoBone = (p: THREE.Vector3): [number, number, number] => [B.hips, B.chest, smoothstep(d.chestY - 0.14 * h, d.chestY + 0.09 * h, p.y)];
  const outfit = a.outfit;
  const main = a.outfitColor;
  const second = a.outfitColor2;
  const prof = torsoProfile(d, outfit);
  const R = (y: number) => radiusAt(prof, y);
  const shirt = '#efe6d6';
  let trousers = second;
  let sleeve = new THREE.Color(main);
  let scarfPivot: THREE.Vector3 | null = null;
  let capePivot: THREE.Vector3 | null = null;

  // ── torso ──
  const baseCol = outfit === 'cape' ? second : outfit === 'vest' ? shirt : main;
  g.add(lathe(prof, rs), {
    color: (p) => {
      let col = new THREE.Color(baseCol);
      if (outfit === 'coat' && p.y < d.hemY + 0.035 * h) col = shade(baseCol, 0.82);
      // soft occlusion at the bottom, a touch lighter on the shoulders
      return col.multiplyScalar(0.9 + 0.14 * smoothstep(d.hemY, d.neckY, p.y));
    },
    bone: torsoBone,
  });

  // hips / trousers top (shows between sweater hem and legs)
  if (outfit !== 'coat' && outfit !== 'cape') {
    g.add(lathe([[0, 0.135 * h], [0.15 * b, 0.135 * h], [0.18 * b, 0.155 * h], [0.192 * b, 0.185 * h], [0, 0.2 * h]], rs), { color: trousers, bone: B.hips });
  }

  switch (outfit) {
    case 'coat': {
      // placket down the front
      const pts: [number, number][] = [];
      for (let y = d.hemY + 0.005; y <= d.neckY - 0.04 * h; y += 0.04 * h) pts.push([R(y) + 0.004, y]);
      g.add(lathe(pts, 2, -0.075, 0.15), { color: shade(main, 0.84), bone: torsoBone });
      // toggles (horn) with little rope loops
      for (const ty of [0.235, 0.33, 0.425]) {
        const y = ty * h;
        const z = R(y) + 0.012;
        g.add(capsule(0.0105, 0.04 * b, 1, 5), { color: '#efe0bf', bone: torsoBone, matrix: M(0, y, z, 0, 0, Math.PI / 2) });
        if (detail >= 0.7) for (const s of [1, -1]) g.add(torus(0.011, 0.0035, 3, 6), { color: '#3a2a22', bone: torsoBone, matrix: M(s * 0.034 * b, y, z - 0.004, 0, s * 0.5, 0) });
      }
      // pockets
      if (detail >= 0.7) for (const s of [1, -1]) {
        const pp: [number, number][] = [];
        for (let y = 0.19 * h; y <= 0.26 * h; y += 0.035 * h) pp.push([R(y) + 0.004, y]);
        g.add(lathe(pp, 3, s * 0.95 - 0.22, 0.44), { color: shade(main, 0.8), bone: B.hips });
      }
      if (!a.scarf) g.add(torus(0.1 * b, 0.034, 6, seg(20, detail, 10)), { color: shade(main, 0.9), bone: B.chest, matrix: M(0, d.neckY - 0.02 * h, 0, Math.PI / 2, 0, 0, 1, 1, 0.75) });
      break;
    }
    case 'sweater':
    case 'apron': {
      const ribR = R(d.hemY + 0.026 * h);
      g.add(ribbed(ribR + 0.004, ribR + 0.006, 0.045 * h, seg(40, detail, 16), 22, 0.022), { color: shade(main, 0.84), bone: B.hips, matrix: M(0, d.hemY + 0.028 * h, 0) });
      if (outfit === 'sweater') knitBand(c, prof, torsoBone);
      if (!a.scarf) g.add(ribbed(0.092 * b, 0.1 * b, 0.06 * h, seg(30, detail, 12), 16, 0.03), { color: shade(main, 0.9), bone: B.chest, matrix: M(0, d.neckY - 0.012 * h, 0) });
      if (outfit === 'apron') {
        apron(c, prof, second, torsoBone);
        trousers = mix(main, '#2b2630', 0.7).getStyle();
      }
      break;
    }
    case 'vest': {
      sleeve = new THREE.Color(shirt);
      const vp: [number, number][] = [];
      for (let y = d.hemY + 0.024 * h; y <= d.neckY - 0.025 * h; y += 0.035 * h) vp.push([R(y) + 0.007, y]);
      vp.push([R(d.neckY - 0.01 * h) + 0.004, d.neckY - 0.01 * h]);
      const vTop = 0.4 * h;
      g.add(
        latheMasked(vp, seg(30, detail, 14), (phi, y) => y > vTop && Math.abs(phi) < 0.18 + ((y - vTop) / (d.neckY - vTop)) * 0.75, 0.9),
        { color: (p) => shade(main, 0.88 + 0.15 * smoothstep(0.2 * h, 0.6 * h, p.y)), bone: torsoBone },
      );
      for (const ty of [0.235, 0.295, 0.355]) {
        const y = ty * h;
        g.add(sphere(0.013, 6, 5), { color: GOLD, bone: torsoBone, emit: 0.12, matrix: M(0, y, R(y) + 0.012) });
      }
      // pocket-watch chain
      const pts = [new THREE.Vector3(0, 0.295 * h, R(0.295 * h) + 0.012), new THREE.Vector3(0.07 * b, 0.27 * h, R(0.27 * h) + 0.004), new THREE.Vector3(0.14 * b, 0.28 * h, R(0.28 * h) * 0.84)];
      g.add(tube(pts, 0.0035, 8, 3), { color: GOLD, bone: torsoBone, emit: 0.15 });
      if (!a.scarf) g.add(torus(0.09 * b, 0.02, 5, seg(20, detail, 10)), { color: shirt, bone: B.chest, matrix: M(0, d.neckY - 0.015 * h, 0, Math.PI / 2, 0, 0) });
      break;
    }
    case 'cape': {
      sleeve = new THREE.Color(main);
      const cp: [number, number][] = [
        [0.08 * b, d.neckY + 0.006 * h],
        [0.13 * b, d.neckY - 0.012 * h],
        [0.19 * b, d.neckY - 0.055 * h],
        [0.238 * b, d.neckY - 0.13 * h],
        [0.268 * b, d.neckY - 0.235 * h],
        [0.29 * b, 0.29 * h],
        [0.305 * b, 0.18 * h],
        [0.316 * b, 0.105 * h],
      ];
      cp.reverse();
      const open = 0.62;
      capePivot = new THREE.Vector3(0, d.neckY - 0.045 * h, -0.04 * b);
      const capeBone = (p: THREE.Vector3): [number, number, number] => [B.chest, B.cape, smoothstep(d.neckY - 0.08 * h, 0.2 * h, p.y) * smoothstep(0.1, -0.15, p.z / b)];
      g.add(lathe(cp, seg(28, detail, 14), open, Math.PI * 2 - open * 2), {
        color: (p) => shade(main, 0.85 + 0.2 * smoothstep(0.1 * h, 0.6 * h, p.y)),
        bone: capeBone,
      });
      g.add(flip(lathe(cp.map(([r, y]) => [r - 0.006, y] as [number, number]), seg(28, detail, 14), open, Math.PI * 2 - open * 2)), {
        color: shade(main, 0.55),
        bone: capeBone,
      });
      // collar & golden clasp
      g.add(torus(0.105 * b, 0.026, 6, seg(20, detail, 10)), { color: shade(main, 1.12), bone: B.chest, matrix: M(0, d.neckY - 0.02 * h, 0, Math.PI / 2 - 0.1, 0, 0, 1, 1, 0.8) });
      g.add(sphere(0.02, 8, 6), { color: GOLD, bone: B.chest, emit: 0.2, matrix: M(0, d.neckY - 0.045 * h, 0.105 * b) });
      break;
    }
  }

  if (a.accessory === 'apron' && outfit !== 'apron') apron(c, prof, outfit === 'coat' ? CREAM : second === main ? CREAM : second, torsoBone);

  // ── legs & snow boots ──
  const boot = BOOTS[Math.floor(rand() * BOOTS.length)];
  const furCuff = rand() < 0.55;
  for (const s of [1, -1]) {
    const bone = s > 0 ? B.legL : B.legR;
    const x = s * d.legX;
    const top = d.hipY + 0.02 * h;
    const bot = 0.07;
    g.add(cylinder(d.legR, d.legR * 1.06, top - bot, seg(10, detail, 6)), { color: trousers, bone, matrix: M(x, (top + bot) / 2, 0) });
    const bk = Math.sqrt(d.hk);
    g.add(ellipsoid(0.066 * bk, 0.054 * bk, 0.092 * bk, seg(10, detail, 7), seg(7, detail, 5)), {
      color: (p) => shade(boot, 0.85 + 0.35 * smoothstep(0.02, 0.09, p.y)),
      bone,
      matrix: M(x, 0.052, 0.018, 0, s * 0.12, 0),
    });
    g.add(ellipsoid(0.069 * bk, 0.017, 0.096 * bk, seg(9, detail, 6), 3), { color: '#2a1d17', bone, matrix: M(x, 0.014, 0.018, 0, s * 0.12, 0) });
    if (furCuff) g.add(fluffyTorus(0.056 * bk, 0.022, 4, seg(12, detail, 7), 0.25, 9), { color: CREAM, bone, matrix: M(x, 0.094, 0.004, Math.PI / 2, 0, 0) });
    else g.add(torus(0.058 * bk, 0.016, 4, seg(12, detail, 8)), { color: shade(boot, 1.25), bone, matrix: M(x, 0.094, 0.004, Math.PI / 2, 0, 0) });
  }

  // ── arms & mittens ──
  const bareHands = outfit === 'apron';
  const bigMittens = a.accessory === 'mittens';
  const mitten = bareHands ? a.skin : bigMittens ? a.hatColor : a.scarf ?? a.hatColor;
  for (const s of [1, -1]) {
    const arm = s > 0 ? B.armL : B.armR;
    const hand = s > 0 ? B.handL : B.handR;
    const x = s * d.shoulderX;
    const L = d.armLen;
    g.add(capsule(d.armR, L - d.armR, 2, seg(9, detail, 6)), {
      color: (p) => sleeve.clone().multiplyScalar(0.92 + 0.1 * smoothstep(d.shoulderY - L, d.shoulderY, p.y)),
      bone: arm,
      matrix: M(x, d.shoulderY - L / 2 + d.armR * 0.25, 0),
    });
    const wristY = d.shoulderY - L;
    if (bigMittens) g.add(fluffyTorus(d.armR * 1.05, d.armR * 0.45, 4, 10, 0.25, 9), { color: CREAM, bone: hand, matrix: M(x, wristY - 0.004, 0, Math.PI / 2, 0, 0) });
    else if (!bareHands) g.add(torus(d.armR * 0.95, d.armR * 0.36, 3, 8), { color: outfit === 'coat' && rand() < 0.5 ? CREAM : sleeve.clone().multiplyScalar(0.82), bone: arm, matrix: M(x, wristY + d.armR * 0.25, 0, Math.PI / 2, 0, 0) });
    const hr = d.handR * (bareHands ? 0.82 : bigMittens ? 1.15 : 1);
    const hc = new THREE.Vector3(x, wristY - hr * 0.72, 0.004);
    g.add(ellipsoid(hr, hr * 1.06, hr * 0.86, seg(9, detail, 7), seg(7, detail, 5)), { color: mitten, bone: hand, matrix: M(hc.x, hc.y, hc.z) });
    g.add(ellipsoid(hr * 0.42, hr * 0.56, hr * 0.42, 5, 3), { color: shade(mitten, 0.94), bone: hand, matrix: M(hc.x - s * hr * 0.62, hc.y + hr * 0.12, hc.z + hr * 0.42, 0.3, 0, s * 0.5) });
  }

  // ── scarf ──
  if (a.scarf) scarfPivot = scarf(c, prof);

  // ── bag ──
  if (a.accessory === 'bag') {
    const y = 0.39 * h;
    const r = R(y) + 0.014;
    g.add(torus(r * 1.02, 0.009, 4, seg(28, detail, 14)), { color: LEATHER, bone: torsoBone, matrix: M(0, y + 0.01 * h, 0, Math.PI / 2, 0.62, 0, 1, 1.08, 1) });
    const bx = -(R(0.27 * h) + 0.03);
    g.add(box(0.05, 0.11, 0.14), { color: '#7a4a2c', bone: B.hips, matrix: M(bx, 0.27 * h, 0.03, 0, 0, 0.08) });
    g.add(ellipsoid(0.03, 0.035, 0.074, 8, 6), { color: '#5a3520', bone: B.hips, matrix: M(bx - 0.012, 0.31 * h, 0.03, 0, 0, 0.08) });
    g.add(box(0.012, 0.022, 0.026), { color: GOLD, bone: B.hips, emit: 0.1, matrix: M(bx - 0.03, 0.285 * h, 0.03) });
  }

  return { scarfPivot, capePivot, sleeve };
}

/** Fair-isle knitted band: two sawtooth rows around a solid row with cream dots. */
function knitBand(c: BodyCtx, prof: [number, number][], bone: (p: THREE.Vector3) => [number, number, number]) {
  const { g, a, d, detail } = c;
  const h = d.h;
  const y0 = 0.345 * h;
  const y1 = 0.445 * h;
  const rows = 5;
  const pts: [number, number][] = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    pts.push([radiusAt(prof, y) + 0.005, y]);
  }
  const segs = seg(42, detail, 21);
  const base = shade(a.outfitColor, 1.04);
  const motif = new THREE.Color(a.outfitColor2);
  const cream = new THREE.Color(CREAM);
  const rowH = (y1 - y0) / rows;
  g.add(lathe(pts, segs), {
    color: base,
    faceColor: (cen) => {
      const rf = (cen.y - y0) / rowH;
      const row = Math.min(rows - 1, Math.max(0, Math.floor(rf)));
      const lower = rf - row < 0.5;
      const phi = Math.atan2(cen.x, cen.z) + Math.PI;
      const col = Math.floor((phi / (Math.PI * 2)) * segs);
      switch (row) {
        case 0:
        case 4:
          return cream;
        case 1:
          return lower ? motif : base;
        case 2:
          return col % 3 === 0 ? cream : motif;
        default:
          return lower ? base : motif;
      }
    },
    bone,
  });
}

function apron(c: BodyCtx, prof: [number, number][], color: string, bone: (p: THREE.Vector3) => [number, number, number]) {
  const { g, d, detail } = c;
  const { h, b } = d;
  const R = (y: number) => radiusAt(prof, y);
  const hemR = R(0.2 * h);
  const skirt: [number, number][] = [];
  for (let y = 0.085 * h; y <= 0.35 * h + 1e-6; y += 0.033 * h) skirt.push([Math.max(R(y), hemR + (0.2 * h - y) * 0.25) + 0.011, y]);
  const col = (p: THREE.Vector3) => shade(color, 0.9 + 0.12 * smoothstep(0.08 * h, 0.5 * h, p.y));
  g.add(lathe(skirt, seg(16, detail, 8), -1.2, 2.4), { color: col, bone });
  const bib: [number, number][] = [];
  for (let y = 0.35 * h; y <= 0.505 * h + 1e-6; y += 0.031 * h) bib.push([R(y) + 0.011, y]);
  g.add(lathe(bib, seg(8, detail, 5), -0.55, 1.1), { color: col, bone });
  // pocket
  const pk: [number, number][] = [];
  for (let y = 0.19 * h; y <= 0.27 * h; y += 0.04 * h) pk.push([Math.max(R(y), hemR + (0.2 * h - y) * 0.25) + 0.016, y]);
  g.add(lathe(pk, 4, -0.38, 0.76), { color: shade(color, 0.86), bone });
  // waist tie & straps over the shoulders
  g.add(torus(R(0.35 * h) + 0.012, 0.009, 4, seg(28, detail, 14)), { color: shade(color, 0.82), bone, matrix: M(0, 0.35 * h, 0, Math.PI / 2, 0, 0) });
  for (const s of [1, -1]) {
    const yTop = 0.505 * h;
    const zf = R(yTop) + 0.01;
    const pts = [
      new THREE.Vector3(s * Math.sin(0.5) * zf, yTop, Math.cos(0.5) * zf),
      new THREE.Vector3(s * 0.09 * b, d.neckY - 0.025 * h, 0.07 * b),
      new THREE.Vector3(s * 0.1 * b, d.neckY - 0.01 * h, -0.04 * b),
      new THREE.Vector3(s * 0.12 * b, 0.52 * h, -R(0.52 * h) - 0.006),
      new THREE.Vector3(s * 0.05 * b, 0.36 * h, -R(0.36 * h) - 0.01),
    ];
    g.add(tube(pts, 0.008, 12, 3), { color: shade(color, 0.85), bone });
  }
  // bow at the back
  for (const s of [1, -1]) g.add(ellipsoid(0.03, 0.018, 0.012, 6, 5), { color: shade(color, 0.82), bone: B.hips, matrix: M(s * 0.028, 0.35 * h, -R(0.35 * h) - 0.016, 0, 0, s * 0.4) });
}

function scarf(c: BodyCtx, prof: [number, number][]): THREE.Vector3 {
  const { g, a, d, detail, rand } = c;
  const { h, b } = d;
  const col = a.scarf!;
  const stripe = rand() < 0.6 ? CREAM : shade(col, 0.62).getStyle();
  const y = d.neckY - 0.012 * h;
  const ringR = 0.095 * Math.pow(b, 0.6) + 0.015;
  const tubeR = 0.047 * d.hk;
  const ts = seg(18, detail, 10);
  const knitA = new THREE.Color(col);
  const knitB = shade(col, 0.86);
  g.add(torus(ringR, tubeR, seg(6, detail, 5), ts), {
    color: col,
    faceColor: (cen) => {
      const ang = Math.atan2(cen.x, cen.z) + Math.PI;
      return Math.floor((ang / (Math.PI * 2)) * ts) % 2 ? knitA : knitB;
    },
    bone: B.chest,
    matrix: M(0, y, 0.006, Math.PI / 2 + 0.08, 0, 0, 1, 1, 0.78),
  });
  // knot at the front-left
  const knot = new THREE.Vector3(0.075 * b, y - 0.025 * h, ringR + tubeR * 0.45);
  g.add(ellipsoid(0.045, 0.04, 0.036, 7, 5), { color: knitB, bone: B.chest, matrix: M(knot.x, knot.y, knot.z) });
  // two tails, striped, with a little fringe (they swing on the scarf spring bone)
  const tails = [
    { x: 0.105 * b, len: 0.15 * h, rz: 0.3, w: 0.064 },
    { x: 0.07 * b, len: 0.18 * h, rz: 0.12, w: 0.068 },
  ];
  for (const t of tails) {
    const cy = knot.y - t.len / 2 - 0.01;
    const zz = Math.max(radiusAt(prof, cy), radiusAt(prof, knot.y - t.len)) + 0.022;
    const geo = new THREE.BoxGeometry(t.w, t.len, 0.022, 1, 5, 1);
    geo.deleteAttribute('uv');
    const m = mul(M(t.x, knot.y - 0.01, Math.max(knot.z - 0.01, zz - 0.02), -0.22, 0, t.rz), M(0, -t.len / 2, 0));
    const inv = m.clone().invert();
    const sc = new THREE.Color(stripe);
    g.add(geo, {
      color: col,
      faceColor: (cen) => {
        const ly = cen.clone().applyMatrix4(inv).y / t.len + 0.5; // 0 bottom → 1 top
        return (ly > 0.12 && ly < 0.2) || (ly > 0.28 && ly < 0.35) ? sc : knitA;
      },
      bone: B.scarf,
      matrix: m,
    });
    // fringe
    if (detail >= 0.7) {
      for (let i = 0; i < 4; i++) {
        const fx = (i / 3 - 0.5) * t.w * 0.8;
        g.add(cylinder(0.006, 0.004, 0.03, 3), { color: shade(col, 0.9), bone: B.scarf, matrix: mul(m, M(fx, -t.len / 2 - 0.013, 0)) });
      }
    } else g.add(box(t.w * 0.85, 0.026, 0.012), { color: shade(col, 0.9), bone: B.scarf, matrix: mul(m, M(0, -t.len / 2 - 0.012, 0)) });
  }
  return knot;
}

