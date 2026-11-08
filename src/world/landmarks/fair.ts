import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import type { LandmarkEnv } from './index';
import { BOX, CONE, CYL, SPH, TOR, Frame, Kit, T, catenary, cyl, mul, rng, tube, warmLitMat } from './kit';
import { IRON, SNOW, lantern, lump, setSignLevel, signBoard, signMesh, snowMound } from './props';

/**
 * Le Chamboule-Neige — a striped fair booth with a counter (the mini-game puts the cans on it),
 * prize shelves full of plush toys, marquee bulbs, and a throwing line 4.5 m in front.
 * Frame: local +Z faces the plaza.
 */

const RED = '#c0403a';
const CREAM = '#f3e6c8';

// ── plush toys (merged into the body bucket)
function teddy(kit: Kit, m: THREE.Matrix4, c: string, s = 1) {
  const muzzle = '#f1d7b4';
  kit.body.add(SPH(6, 4), c, mul(m, T(0, 0.16 * s, 0, 0, 0, 0, 0.15 * s, 0.16 * s, 0.13 * s)));
  kit.body.add(SPH(6, 4), c, mul(m, T(0, 0.38 * s, 0.01 * s, 0, 0, 0, 0.12 * s)));
  kit.body.add(SPH(6, 4), muzzle, mul(m, T(0, 0.35 * s, 0.1 * s, 0, 0, 0, 0.055 * s, 0.045 * s, 0.04 * s)));
  kit.body.add(SPH(6, 4), '#2a1d17', mul(m, T(0, 0.37 * s, 0.14 * s, 0, 0, 0, 0.018 * s)));
  kit.body.add(SPH(6, 4), muzzle, mul(m, T(0, 0.16 * s, 0.1 * s, 0, 0, 0, 0.09 * s, 0.1 * s, 0.04 * s)));
  for (const sx of [-1, 1]) {
    kit.body.add(SPH(6, 4), c, mul(m, T(sx * 0.09 * s, 0.48 * s, 0, 0, 0, 0, 0.045 * s, 0.045 * s, 0.03 * s)));
    kit.body.add(SPH(6, 4), '#2a1d17', mul(m, T(sx * 0.04 * s, 0.41 * s, 0.105 * s, 0, 0, 0, 0.014 * s)));
    kit.body.add(SPH(6, 4), c, mul(m, T(sx * 0.15 * s, 0.2 * s, 0.03 * s, 0, 0, sx * 0.5, 0.045 * s, 0.09 * s, 0.045 * s)));
  }
  kit.body.add(BOX(), P.berry, mul(m, T(0, 0.27 * s, 0.07 * s, 0, 0, 0, 0.1 * s, 0.05 * s, 0.02 * s)));
}

function penguin(kit: Kit, m: THREE.Matrix4, s = 1) {
  kit.body.add(SPH(6, 4), '#2a2d3e', mul(m, T(0, 0.2 * s, 0, 0, 0, 0, 0.14 * s, 0.2 * s, 0.13 * s)));
  kit.body.add(SPH(6, 4), '#f4f1ea', mul(m, T(0, 0.18 * s, 0.05 * s, 0, 0, 0, 0.11 * s, 0.16 * s, 0.1 * s)));
  kit.body.add(CONE(6), '#f0a23a', mul(m, T(0, 0.3 * s, 0.14 * s, Math.PI / 2, 0, 0, 0.03 * s, 0.07 * s, 0.025 * s)));
  for (const sx of [-1, 1]) {
    kit.body.add(SPH(6, 4), '#111', mul(m, T(sx * 0.04 * s, 0.33 * s, 0.11 * s, 0, 0, 0, 0.015 * s)));
    kit.body.add(SPH(6, 4), '#2a2d3e', mul(m, T(sx * 0.14 * s, 0.18 * s, 0, 0, 0, sx * 0.4, 0.03 * s, 0.11 * s, 0.06 * s)));
    kit.body.add(SPH(6, 4), '#f0a23a', mul(m, T(sx * 0.05 * s, 0.02 * s, 0.05 * s, 0, 0, 0, 0.05 * s, 0.02 * s, 0.06 * s)));
  }
  kit.body.add(TOR(1, 0.35, 5, 12), P.red, mul(m, T(0, 0.3 * s, 0, Math.PI / 2, 0, 0, 0.1 * s)));
}

function snowman(kit: Kit, m: THREE.Matrix4, s = 1) {
  kit.body.add(SPH(6, 4), '#f8f8fb', mul(m, T(0, 0.13 * s, 0, 0, 0, 0, 0.14 * s)));
  kit.body.add(SPH(6, 4), '#f8f8fb', mul(m, T(0, 0.33 * s, 0, 0, 0, 0, 0.1 * s)));
  kit.body.add(CONE(6), '#f08a2a', mul(m, T(0, 0.33 * s, 0.13 * s, Math.PI / 2, 0, 0, 0.02 * s, 0.08 * s, 0.02 * s)));
  kit.body.add(cyl(0.07 * s, 0.07 * s, 0.1 * s, 10), '#2a2d3e', mul(m, T(0, 0.46 * s, 0)));
  kit.body.add(cyl(0.11 * s, 0.11 * s, 0.015 * s, 10), '#2a2d3e', mul(m, T(0, 0.415 * s, 0)));
  kit.body.add(TOR(1, 0.3, 5, 12), '#3c7a5a', mul(m, T(0, 0.25 * s, 0, Math.PI / 2, 0, 0, 0.08 * s)));
  for (const sx of [-1, 1]) kit.body.add(SPH(6, 4), '#111', mul(m, T(sx * 0.035 * s, 0.36 * s, 0.085 * s, 0, 0, 0, 0.013 * s)));
}

function bunny(kit: Kit, m: THREE.Matrix4, c: string, s = 1) {
  kit.body.add(SPH(6, 4), c, mul(m, T(0, 0.14 * s, 0, 0, 0, 0, 0.13 * s, 0.14 * s, 0.12 * s)));
  kit.body.add(SPH(6, 4), c, mul(m, T(0, 0.33 * s, 0.01 * s, 0, 0, 0, 0.1 * s)));
  for (const sx of [-1, 1]) {
    kit.body.add(SPH(6, 4), c, mul(m, T(sx * 0.05 * s, 0.5 * s, 0, 0, 0, sx * 0.15, 0.03 * s, 0.12 * s, 0.025 * s)));
    kit.body.add(SPH(6, 4), '#ff9fb4', mul(m, T(sx * 0.05 * s, 0.5 * s, 0.012 * s, 0, 0, sx * 0.15, 0.016 * s, 0.09 * s, 0.015 * s)));
    kit.body.add(SPH(6, 4), '#111', mul(m, T(sx * 0.035 * s, 0.35 * s, 0.09 * s, 0, 0, 0, 0.013 * s)));
  }
  kit.body.add(SPH(6, 4), '#ff9fb4', mul(m, T(0, 0.31 * s, 0.1 * s, 0, 0, 0, 0.018 * s)));
}

function reindeer(kit: Kit, m: THREE.Matrix4, s = 1) {
  const c = '#9a6a45';
  kit.body.add(SPH(6, 4), c, mul(m, T(0, 0.15 * s, 0, 0, 0, 0, 0.14 * s, 0.15 * s, 0.13 * s)));
  kit.body.add(SPH(6, 4), c, mul(m, T(0, 0.36 * s, 0.02 * s, 0, 0, 0, 0.1 * s, 0.1 * s, 0.11 * s)));
  kit.body.add(SPH(6, 4), '#e33a2a', mul(m, T(0, 0.34 * s, 0.13 * s, 0, 0, 0, 0.03 * s)));
  for (const sx of [-1, 1]) {
    kit.body.add(CYL(5), '#e8d6b0', mul(m, T(sx * 0.06 * s, 0.5 * s, 0, 0, 0, sx * -0.4, 0.012 * s, 0.14 * s, 0.012 * s)));
    kit.body.add(CYL(5), '#e8d6b0', mul(m, T(sx * 0.1 * s, 0.55 * s, 0, 0, 0, sx * 0.6, 0.01 * s, 0.07 * s, 0.01 * s)));
    kit.body.add(SPH(6, 4), '#111', mul(m, T(sx * 0.04 * s, 0.39 * s, 0.095 * s, 0, 0, 0, 0.013 * s)));
  }
}

export function buildFair(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const r = rng(315);
  const name = ctx.layout.zones.fair.name || 'Le Chamboule-Neige';

  const W = 4.8;
  const back = -5.8;
  const front = -3.4;
  const H = 2.5;
  const counterTop = 0.98;
  const counterZ = front + 0.32;

  // ── striped canvas walls
  const stripes = (x0: number, z0: number, x1: number, z1: number, h: number, yaw: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 0.32));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      kit.body.add(BOX(), i % 2 ? CREAM : RED, T(x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t, 0, yaw, 0, len / n + 0.002, h, 0.05));
    }
  };
  stripes(-W / 2, back, W / 2, back, H, 0);
  stripes(-W / 2, back, -W / 2, front, H, Math.PI / 2);
  stripes(W / 2, back, W / 2, front, H, Math.PI / 2);
  // candy-striped corner posts
  for (const [x, z] of [
    [-W / 2, front],
    [W / 2, front],
    [-W / 2, back],
    [W / 2, back],
  ]) {
    for (let k = 0; k < 9; k++) kit.body.add(cyl(0.08, 0.08, 0.3, 8), k % 2 ? '#fbf6ee' : RED, T(x, 0.15 + k * 0.3, z));
    kit.metal.add(SPH(6, 4), P.gold, T(x, 2.78, z, 0, 0, 0, 0.1));
  }
  // lean-to striped roof + scalloped valance
  const roofN = 14;
  for (let i = 0; i < roofN; i++) {
    const x = -W / 2 - 0.2 + ((i + 0.5) / roofN) * (W + 0.4);
    kit.body.add(BOX(), i % 2 ? CREAM : RED, T(x, H + 0.32, (front + back) / 2 + 0.1, -0.22, 0, 0, (W + 0.4) / roofN + 0.003, 0.05, 2.9));
  }
  kit.body.add(BOX(), SNOW, T(0, H + 0.4, (front + back) / 2 - 0.1, -0.22, 0, 0, W + 0.3, 0.06, 2.4));
  const valY = H + 0.0;
  const valZ = front + 0.36;
  for (let i = 0; i < 16; i++) {
    const x = -W / 2 - 0.2 + ((i + 0.5) / 16) * (W + 0.4);
    const c = i % 2 ? CREAM : RED;
    kit.body.add(BOX(), c, T(x, valY + 0.09, valZ, 0, 0, 0, (W + 0.4) / 16, 0.18, 0.02));
    kit.body.add(CYL(10), c, T(x, valY, valZ, Math.PI / 2, 0, 0, (W + 0.4) / 32, 0.02, (W + 0.4) / 32));
    kit.bulb(new THREE.Vector3(x, valY - 0.12, valZ + 0.02), i % 2 ? P.warm : '#ff7a6a', 0.045, i % 2 ? 0.45 : 0);
  }
  // marquee sign on top
  const signY = H + 1.05;
  const sign = signMesh(name, 3.4, 0.7, { bg: '#2f4f7a', fg: '#ffe2a0', border: P.gold, stars: true, lit: 1.2, px: 1024, round: 0.35 });
  sign.position.set(0, signY, front + 0.42);
  f.group.add(sign);
  signBoard(kit, T(0, signY, front + 0.38), 3.4, 0.7, { wood: '#1f3150' });
  for (const sx of [-1, 1]) kit.body.add(BOX(), P.woodDark, T(sx * 1.3, signY - 0.55, front + 0.3, 0, 0, 0, 0.07, 0.6, 0.07));
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI - (i / 22) * Math.PI;
    const x = Math.cos(a) * 1.82;
    const y = signY + Math.sin(a) * 0.5 - 0.05;
    kit.bulb(new THREE.Vector3(x, y, front + 0.45), i % 2 ? P.warm : '#ff6a5a', 0.045, i % 3 === 0 ? 0.5 : 0);
  }
  // pennant flags on the back posts
  for (const sx of [-1, 1]) {
    kit.metal.add(cyl(0.02, 0.02, 0.9, 6), IRON, T(sx * W / 2, H + 0.95 + 0.25, back));
    const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.26, 0), new THREE.Vector3(0.5, -0.13, 0)]);
    flag.computeVertexNormals();
    kit.body.add(flag, sx > 0 ? '#2f4f7a' : P.gold, T(sx * W / 2, H + 1.6, back));
    kit.body.add(flag, sx > 0 ? '#2f4f7a' : P.gold, T(sx * W / 2, H + 1.6, back, 0, Math.PI, 0));
  }
  // bulbs up the front posts
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) kit.bulb(new THREE.Vector3(sx * W / 2, 0.35 + k * 0.32, front + 0.1), k % 2 ? P.warm : '#ff6a5a', 0.04, k % 2 ? 0 : 0.4);

  // ── counter (keep the centre free for the cans)
  kit.body.add(BOX(), '#a5774f', T(0, counterTop - 0.03, counterZ, 0, 0, 0, W - 0.1, 0.06, 0.72));
  kit.body.add(BOX(), '#2f4f7a', T(0, (counterTop - 0.06) / 2, counterZ + 0.32, 0, 0, 0, W - 0.1, counterTop - 0.06, 0.05));
  kit.metal.add(BOX(), P.gold, T(0, counterTop - 0.08, counterZ + 0.35, 0, 0, 0, W - 0.1, 0.04, 0.02));
  kit.metal.add(BOX(), P.gold, T(0, 0.08, counterZ + 0.35, 0, 0, 0, W - 0.1, 0.04, 0.02));
  for (let i = 0; i < 4; i++) {
    const x = [-1.8, -0.9, 0.9, 1.8][i];
    const s = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? 0.07 : 0.16;
      if (k === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    kit.body.add(new THREE.ShapeGeometry(s), P.gold, T(x, 0.48, counterZ + 0.38));
  }
  // counter ends: bell, bucket of snowballs (props)
  kit.metal.add(cyl(0.05, 0.11, 0.14, 10), P.gold, T(-W / 2 + 0.4, counterTop + 0.07, counterZ));
  kit.metal.add(SPH(6, 4), P.gold, T(-W / 2 + 0.4, counterTop + 0.16, counterZ, 0, 0, 0, 0.03));
  kit.body.add(cyl(0.2, 0.16, 0.24, 12), '#7a5234', T(W / 2 - 0.45, counterTop + 0.12, counterZ));
  for (let i = 0; i < 7; i++) kit.body.add(SPH(6, 4), SNOW, T(W / 2 - 0.45 + (r() - 0.5) * 0.24, counterTop + 0.26 + r() * 0.04, counterZ + (r() - 0.5) * 0.2, 0, 0, 0, 0.065));
  // price slate
  const price = signMesh('6 boules · 2 €', 0.7, 0.32, { bg: '#24302a', fg: '#f3ead8', chalk: true, px: 384, round: 0.1, font: '"Nunito", system-ui, sans-serif' });
  price.position.set(0, 0.5, counterZ + 0.38);
  f.group.add(price);

  // ── prize shelves (stepped) with plush toys
  const shelfY = [1.05, 1.45, 1.85];
  shelfY.forEach((y, i) => {
    const z = back + 0.28 + i * 0.02;
    kit.body.add(BOX(), '#8a5f3d', T(0, y, z, 0, 0, 0, W - 0.3, 0.05, 0.38));
    kit.body.add(BOX(), '#6e4a2c', T(0, y / 2, z + 0.17, 0, 0, 0, W - 0.3, 0.02, 0.02));
  });
  const toys = (y: number, z: number, n: number, seed: number) => {
    const rs = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.55 + (i / (n - 1)) * (W - 1.1);
      const m = T(x, y + 0.025, z, 0, (rs() - 0.5) * 0.5, 0);
      const k = (i + seed) % 5;
      const s = 0.85 + rs() * 0.25;
      if (k === 0) teddy(kit, m, ['#a0683e', '#e8d2b0', '#f2a6b8'][i % 3], s);
      else if (k === 1) penguin(kit, m, s);
      else if (k === 2) snowman(kit, m, s);
      else if (k === 3) bunny(kit, m, ['#fbf6ee', '#e8d2b0'][i % 2], s);
      else reindeer(kit, m, s);
    }
  };
  const nt = kit.detail >= 0.9 ? 6 : 5;
  toys(shelfY[0], back + 0.3, nt, 1);
  toys(shelfY[1], back + 0.3, nt - 1, 2);
  toys(shelfY[2], back + 0.3, nt, 3);
  // giant teddies hanging at the front corners
  for (const sx of [-1, 1]) {
    const m = T(sx * (W / 2 - 0.35), 1.35, front + 0.1, 0, -sx * 0.3, 0);
    teddy(kit, m, sx > 0 ? '#e8d2b0' : '#a0683e', 1.9);
    kit.body.add(BOX(), '#d9c9a0', T(sx * (W / 2 - 0.35), 2.25, front + 0.1, 0, 0, 0, 0.01, 0.2, 0.01));
  }
  // interior light
  kit.lit.add(BOX(), '#ffd4a0', T(0, 2.25, back + 0.1, 0, 0, 0, W - 0.4, 0.3, 0.02), 0.25);
  for (let i = 0; i < 9; i++) kit.bulb(new THREE.Vector3(-W / 2 + 0.4 + (i / 8) * (W - 0.8), H - 0.12, back + 0.3), P.candle, 0.04, i % 2 ? 0 : 0.4);

  // ── throwing line, basket of snowballs, lanterns
  const throwZ = counterZ + 4.5;
  kit.body.add(BOX(), '#c79a6a', T(0, 0.025, throwZ - 0.45, 0, 0, 0, 1.8, 0.05, 0.12));
  kit.body.add(BOX(), RED, T(0, 0.052, throwZ - 0.45, 0, 0, 0, 1.8, 0.005, 0.04));
  for (const sx of [-1, 1]) kit.body.add(cyl(0.04, 0.05, 0.3, 6), RED, T(sx * 0.95, 0.15, throwZ - 0.45));
  {
    const bm = T(1.35, 0, throwZ - 0.1);
    kit.body.add(
      new THREE.LatheGeometry(
        [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.3, 0.3), new THREE.Vector2(0.28, 0.3)],
        12,
      ),
      '#a07448',
      bm,
    );
    kit.body.add(TOR(1, 0.08, 4, 14), '#7a5234', mul(bm, T(0, 0.3, 0, Math.PI / 2, 0, 0, 0.3)));
    for (let i = 0; i < 9; i++) kit.body.add(SPH(6, 4), SNOW, mul(bm, T((r() - 0.5) * 0.3, 0.3 + r() * 0.06, (r() - 0.5) * 0.3, 0, 0, 0, 0.075)));
    f.circle(1.35, throwZ - 0.1, 0.32, 'prop');
  }
  for (const sx of [-1, 1]) {
    const m = T(sx * 3.4, 0, -1.4, 0, sx > 0 ? Math.PI : 0, 0);
    kit.metal.add(cyl(0.05, 0.065, 2.3, 8), IRON, mul(m, T(0, 1.15, 0)));
    kit.metal.add(BOX(), IRON, mul(m, T(0.22, 2.25, 0, 0, 0, 0, 0.5, 0.04, 0.04)));
    lantern(kit, mul(m, T(0.42, 1.98, 0)), 0.85);
    kit.pool(m, 0.4, 0, 1.6, P.warm2, 0.3);
    f.circle(sx * 3.4, -1.4, 0.12, 'prop');
  }
  // string of bulbs from the booth to the lanterns
  for (const sx of [-1, 1]) {
    const a = new THREE.Vector3(sx * W / 2, H + 0.2, front + 0.1);
    const b = new THREE.Vector3(sx * 3.4, 2.35, -1.4);
    const pts = catenary(a, b, 0.3, 10);
    kit.body.add(tube(pts, 0.009, 3), '#1f1a1c');
    for (let i = 1; i < 10; i++) kit.bulb(pts[i].clone().setY(pts[i].y - 0.05), i % 2 ? P.warm : '#ff6a5a', 0.04, i % 2 ? 0.4 : 0);
  }
  kit.pool(T(), 0, front + 1.5, 3.2, P.warm, 0.2);
  snowMound(kit, T(-3.6, 0, -5.6), 1.0, 0.32, 3);
  snowMound(kit, T(3.5, 0, -6.0), 0.9, 0.3, 4);
  snowMound(kit, T(-4.4, 0, 1.8), 0.7, 0.24, 5);
  kit.body.add(lump(2, 1, 0.1), SNOW, T(3.9, 0.0, 2.2, 0, 0, 0, 0.6, 0.25, 0.5));

  // colliders: back & sides (closed), counter (front)
  f.box(0, back, W / 2 + 0.1, 0.12, 0, 'chalet');
  f.box(-W / 2, (front + back) / 2, 0.12, (front - back) / 2, 0, 'chalet');
  f.box(W / 2, (front + back) / 2, 0.12, (front - back) / 2, 0, 'chalet');
  f.box(0, counterZ, W / 2, 0.38, 0, 'chalet');

  const parts = kit.finish(f.group, 'fair', { twinkle: 0.25, bodyMaterial: warmLitMat(0.16) });
  f.light(0, 2, -3, (k) => {
    parts.setLevel(k);
    setSignLevel(sign, k, 0.4);
  });

  f.anchor('fair:keeper', -1.6, front - 0.5, 0);
  f.anchor('fair:throw-spot', 0, throwZ, Math.PI);
  f.anchor('fair:targets', 0, counterZ, 0, counterTop);
}
