import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import type { LandmarkEnv } from './index';
import { BOX, CYL, SPH, TOR, Frame, Kit, T, cyl, emitter, lathe, mul, pt, rng } from './kit';
import { IRON, SNOW, barrel, crate, gableRoof, gableWall, lantern, logWall, lump, mug, plankWall, setSignLevel, signBoard, signMesh, snowMound, stool, stringLights } from './props';

/**
 * Le Chaudron Doré — the mulled-wine bar. Log hut with a serving counter, a big steaming copper
 * cauldron over a fire, barrel tables, two braziers and a guinguette canopy of string lights.
 * Frame: local +Z faces the plaza.
 */

/** Little golden cauldron drawn on the sign. */
function cauldronIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save();
  g.fillStyle = '#ffd27a';
  g.strokeStyle = '#ffd27a';
  g.lineWidth = s * 0.08;
  g.beginPath();
  g.ellipse(x, y + s * 0.1, s * 0.5, s * 0.42, 0, 0, Math.PI);
  g.lineTo(x - s * 0.5, y + s * 0.1);
  g.fill();
  g.fillRect(x - s * 0.58, y - s * 0.02, s * 1.16, s * 0.14);
  g.beginPath();
  for (const dx of [-0.2, 0.05, 0.28]) {
    g.moveTo(x + dx * s, y - s * 0.1);
    g.bezierCurveTo(x + (dx - 0.15) * s, y - s * 0.35, x + (dx + 0.15) * s, y - s * 0.5, x + dx * s, y - s * 0.75);
  }
  g.stroke();
  g.restore();
}

export function buildBar(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const r = rng(135);
  const name = ctx.layout.zones.bar.name || 'Le Chaudron Doré';

  // ── the hut
  const HX = 0.6;
  const HZ = -4.6;
  const W = 5.2;
  const D = 2.8;
  const H = 2.4;
  const front = HZ + D / 2; // -3.2
  const back = HZ - D / 2; // -6.0
  logWall(kit, T(HX, 0, back + 0.11), W, H, '#8a5a3b', 1);
  logWall(kit, T(HX - W / 2 + 0.11, 0, HZ, 0, Math.PI / 2, 0), D, H, '#8a5a3b', 2);
  logWall(kit, T(HX + W / 2 - 0.11, 0, HZ, 0, Math.PI / 2, 0), D, H, '#8a5a3b', 3);
  for (const sx of [-1, 1]) gableWall(kit, T(HX + sx * (W / 2 - 0.11), H, HZ, 0, Math.PI / 2, 0), D + 0.2, 1.15, '#7a4e33', 0.12);
  // front: counter wall, corner posts, header
  plankWall(kit, T(HX, 0, front, 0, 0, 0), W, 0.95, '#9b6a45', 4);
  for (const sx of [-1, 1]) kit.body.add(BOX(), P.woodDark, T(HX + sx * (W / 2 - 0.1), H / 2, front, 0, 0, 0, 0.22, H, 0.22));
  kit.body.add(BOX(), P.woodDark, T(HX, H - 0.14, front, 0, 0, 0, W, 0.28, 0.24));
  // counter top
  kit.body.add(BOX(), '#b98a5c', T(HX, 0.99, front + 0.12, 0, 0, 0, W + 0.1, 0.07, 0.72));
  kit.body.add(BOX(), P.woodDark, T(HX, 0.93, front + 0.46, 0, 0, 0, W + 0.1, 0.06, 0.04));
  // interior: warm back wall, shelves with bottles and mugs
  kit.lit.add(BOX(), '#ffb066', T(HX, 1.45, back + 0.24, 0, 0, 0, W - 0.5, 1.9, 0.02), 0.3);
  kit.lit.add(BOX(), '#ff9d4d', T(HX - W / 2 + 0.24, 1.45, HZ, 0, 0, 0, 0.02, 1.9, D - 0.5), 0.22);
  for (const y of [1.3, 1.78]) {
    kit.body.add(BOX(), P.woodDark, T(HX, y, back + 0.4, 0, 0, 0, W - 0.6, 0.05, 0.3));
    for (let i = 0; i < 11; i++) {
      const x = HX - W / 2 + 0.55 + i * 0.4 + (r() - 0.5) * 0.1;
      if (r() < 0.5) {
        const c = ['#2d5a3a', '#6b1f2a', '#3a2a1a', '#8a6a2a'][i % 4];
        kit.gloss.add(cyl(0.045, 0.055, 0.26, 8), c, T(x, y + 0.155, back + 0.4));
        kit.gloss.add(cyl(0.018, 0.03, 0.08, 6), c, T(x, y + 0.32, back + 0.4));
      } else mug(kit, T(x, y + 0.025, back + 0.42), ['#f3ead8', '#b8413a', '#2f5d50'][i % 3], '#3a1a12');
    }
  }
  // hanging mugs on hooks under the header
  for (let i = 0; i < 9; i++) {
    const x = HX - W / 2 + 0.6 + i * 0.5;
    kit.metal.add(BOX(), IRON, T(x, H - 0.33, front - 0.05, 0, 0, 0, 0.012, 0.1, 0.012));
    mug(kit, T(x, H - 0.5, front - 0.05, 0, i, 0), i % 2 ? P.red : P.cream, i % 2 ? P.red : P.cream);
  }
  lantern(kit, T(HX - 0.6, H - 0.45, HZ), 0.8);
  lantern(kit, T(HX + 1.2, H - 0.45, HZ + 0.2), 0.8);
  // on the counter: mugs, a tray, a cinnamon jar, a little wreath
  for (let i = 0; i < 6; i++) mug(kit, T(HX - 1.6 + i * 0.22, 1.025, front + 0.25 + (i % 2) * 0.1, 0, i * 0.8, 0), i % 3 === 1 ? P.red : P.cream);
  kit.body.add(BOX(), P.woodDark, T(HX + 1.25, 1.035, front + 0.25, 0, 0.1, 0, 0.6, 0.02, 0.36));
  kit.gloss.add(cyl(0.07, 0.07, 0.2, 10), '#d8e6ee', T(HX + 2.0, 1.13, front + 0.2));
  for (let i = 0; i < 6; i++) kit.body.add(CYL(5), '#7a3a1a', T(HX + 1.97 + (i % 3) * 0.03, 1.2, front + 0.18 + (i % 2) * 0.03, 0.08 * (i - 3), 0, 0, 0.012, 0.26, 0.012));
  // the little wreath hangs near the left post (not in front of Barnabé's face)
  kit.body.add(TOR(1, 0.3, 5, 14), P.holly, T(HX - W / 2 + 0.4, 1.75, front + 0.13, 0, 0, 0, 0.22));
  kit.body.add(SPH(5, 4), P.berry, T(HX - W / 2 + 0.4, 1.55, front + 0.17, 0, 0, 0, 0.05));
  // fabric valance along the eave (scallops) and the roof
  gableRoof(kit, T(HX, H, HZ), W, D, 1.15, { color: P.roof, overhang: 0.42, seed: 5 });
  const eaveZ = front + 0.42 - 0.02;
  const eaveY = H - (1.15 * 0.42) / (D / 2) - 0.02;
  for (let i = 0; i < 16; i++) {
    const x = HX - W / 2 - 0.3 + (i + 0.5) * ((W + 0.6) / 16);
    const c = i % 2 ? P.cream : P.red;
    kit.body.add(BOX(), c, T(x, eaveY - 0.08, eaveZ, 0, 0, 0, (W + 0.6) / 16, 0.16, 0.02));
    kit.body.add(CYL(10), c, T(x, eaveY - 0.16, eaveZ, Math.PI / 2, 0, 0, (W + 0.6) / 32, 0.02, (W + 0.6) / 32));
  }
  // sign standing on the roof
  const sign = signMesh(name, 3.4, 0.72, {
    bg: '#6e2420',
    fg: '#ffd27a',
    border: '#e2b34a',
    grain: true,
    lit: 1.35,
    px: 1024,
    paint: (g, w, h) => {
      cauldronIcon(g, w * 0.075, h * 0.55, h * 0.55);
      cauldronIcon(g, w * 0.925, h * 0.55, h * 0.55);
    },
  });
  const signY = H + 0.95;
  const signZ = front + 0.05;
  sign.position.set(HX, signY, signZ + 0.035);
  f.group.add(sign);
  signBoard(kit, T(HX, signY, signZ), 3.4, 0.72, { wood: P.woodDeep });
  for (const sx of [-1, 1]) kit.body.add(BOX(), P.woodDark, T(HX + sx * 1.4, signY - 0.55, signZ - 0.08, 0, 0, 0, 0.08, 0.6, 0.08));
  for (let i = 0; i < 14; i++) {
    const x = HX - 1.7 + (i / 13) * 3.4;
    kit.bulb(new THREE.Vector3(x, signY + 0.42, signZ + 0.04), P.warm, 0.035, i % 3 === 0 ? 0.45 : 0);
  }
  // colliders: walls + counter (interior left free for the barista)
  f.box(HX, back + 0.12, W / 2, 0.16, 0, 'chalet');
  f.box(HX - W / 2 + 0.12, HZ, 0.16, D / 2, 0, 'chalet');
  f.box(HX + W / 2 - 0.12, HZ, 0.16, D / 2, 0, 'chalet');
  f.box(HX, front + 0.12, W / 2, 0.36, 0, 'chalet');

  // ── the copper cauldron over a fire pit
  const CX = -3.55;
  const CZ = -2.3;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    kit.flat.add(lump(i + 3, 0, 0.2), i % 2 ? '#8e8f9c' : '#7b7d8f', T(CX + Math.sin(a) * 0.8, 0.09, CZ + Math.cos(a) * 0.8, 0, a, 0, 0.17, 0.13, 0.16));
  }
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const rr = r() * 0.45;
    kit.glow.add(lump(i + 20, 0, 0.3), i % 2 ? '#ff6a2a' : '#ffa040', T(CX + Math.sin(a) * rr, 0.05, CZ + Math.cos(a) * rr, 0, a, 0, 0.13, 0.07, 0.11), 1.6);
  }
  for (let i = 0; i < 3; i++) kit.body.add(CYL(6), '#3a2418', T(CX + (i - 1) * 0.2, 0.07, CZ, 0, i * 1.1, Math.PI / 2, 0.05, 0.7, 0.05));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    kit.metal.add(BOX(), IRON, T(CX + Math.sin(a) * 0.62, 0.28, CZ + Math.cos(a) * 0.62, Math.cos(a) * -0.25, a, 0, 0.05, 0.6, 0.05));
  }
  kit.metal.add(TOR(1, 0.04, 4, 20), IRON, T(CX, 0.52, CZ, Math.PI / 2, 0, 0, 0.6));
  const pot = lathe(
    [
      [0.001, 0.42],
      [0.4, 0.45],
      [0.63, 0.6],
      [0.74, 0.84],
      [0.71, 1.06],
      [0.77, 1.12],
      [0.76, 1.17],
      [0.68, 1.15],
      [0.65, 1.04],
    ],
    20,
  );
  kit.metal.add(pot, '#c4703f', T(CX, 0, CZ));
  kit.metal.add(cyl(0.775, 0.775, 0.05, 20, true), '#e2b34a', T(CX, 1.14, CZ));
  for (const s of [-1, 1]) kit.metal.add(TOR(1, 0.2, 5, 12), '#e2b34a', T(CX + s * 0.78, 0.98, CZ, 0, Math.PI / 2, 0, 0.12));
  kit.glow.add(CYL(20), '#7a1e12', T(CX, 1.05, CZ, 0, 0, 0, 0.66, 0.01, 0.66), 0.75);
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const rr = 0.15 + r() * 0.4;
    kit.body.add(CYL(8), '#f08a2a', T(CX + Math.sin(a) * rr, 1.065, CZ + Math.cos(a) * rr, 0, 0, 0, 0.07, 0.012, 0.07));
  }
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    kit.body.add(CYL(5), '#6a3418', T(CX + Math.sin(a) * 0.3, 1.07, CZ + Math.cos(a) * 0.3, 0, a, Math.PI / 2, 0.015, 0.18, 0.015));
  }
  // ladle
  kit.body.add(CYL(6), '#a0744a', T(CX + 0.3, 1.35, CZ + 0.2, 0.5, 0.9, 0.3, 0.025, 1.0, 0.025));
  kit.metal.add(SPH(8, 5), '#c4703f', T(CX + 0.12, 1.02, CZ + 0.05, 0, 0, 0, 0.11, 0.06, 0.11));
  // a wooden stool of mugs next to the cauldron
  crate(kit, T(CX + 1.05, 0, CZ + 0.55, 0, 0.4, 0), 0.5, 0.42, 0.42);
  for (let i = 0; i < 4; i++) mug(kit, T(CX + 0.92 + (i % 2) * 0.2, 0.42, CZ + 0.48 + Math.floor(i / 2) * 0.16), i % 2 ? P.red : P.cream);
  f.circle(CX, CZ, 0.98, 'solid');
  f.circle(CX + 1.05, CZ + 0.55, 0.32, 'prop');
  kit.halos.push({ pos: new THREE.Vector3(CX, 0.35, CZ), color: '#ff8a3a', size: 1.8, k: 0.4 });

  // ── braziers
  const braziers = [
    { x: -3.9, z: 2.7 },
    { x: 4.2, z: 1.3 },
  ];
  const fireOrigins: THREE.Vector3[] = [];
  for (const b of braziers) {
    const m = T(b.x, 0, b.z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      kit.metal.add(BOX(), IRON, mul(m, T(Math.sin(a) * 0.3, 0.32, Math.cos(a) * 0.3, Math.cos(a) * 0.2, a, 0, 0.05, 0.66, 0.05)));
    }
    kit.metal.add(
      lathe(
        [
          [0.001, 0.58],
          [0.22, 0.6],
          [0.4, 0.72],
          [0.46, 0.86],
          [0.42, 0.86],
          [0.36, 0.76],
        ],
        14,
      ),
      '#3a3438',
      m,
    );
    kit.metal.add(TOR(1, 0.06, 4, 16), '#56484a', mul(m, T(0, 0.86, 0, Math.PI / 2, 0, 0, 0.45)));
    for (let i = 0; i < 4; i++) kit.body.add(CYL(6), '#3a2418', mul(m, T(0, 0.82, 0, 0, i * 0.8, Math.PI / 2 - 0.15, 0.05, 0.6, 0.05)));
    for (let i = 0; i < 5; i++) kit.glow.add(lump(i + 40, 0, 0.3), i % 2 ? '#ff5a1a' : '#ffb040', mul(m, T((r() - 0.5) * 0.4, 0.8, (r() - 0.5) * 0.4, 0, 0, 0, 0.1, 0.06, 0.1)), 1.8);
    kit.flames.push({ pos: pt(m, 0, 0.78, 0), w: 0.55, h: 0.95, k: 2.4 });
    kit.flames.push({ pos: pt(m, 0.12, 0.8, 0.08), w: 0.32, h: 0.6, k: 2.2 });
    kit.flames.push({ pos: pt(m, -0.12, 0.8, -0.06), w: 0.3, h: 0.55, k: 2.2 });
    kit.halos.push({ pos: pt(m, 0, 1.1, 0), color: '#ff8a3a', size: 2.2, k: 0.38 });
    kit.pool(m, 0, 0, 2.6, '#ff7a2a', 0.35);
    fireOrigins.push(pt(m, 0, 0.95, 0));
    snowMound(kit, mul(m, T(0.7, 0, -0.4)), 0.5, 0.18, 3);
    f.circle(b.x, b.z, 0.45, 'prop');
  }
  // fire under the cauldron
  kit.flames.push({ pos: new THREE.Vector3(CX, 0.05, CZ), w: 0.5, h: 0.55, k: 2.2 });
  kit.flames.push({ pos: new THREE.Vector3(CX + 0.18, 0.05, CZ - 0.1), w: 0.3, h: 0.4, k: 2 });
  kit.pool(T(), CX, CZ, 2.4, '#ff7a2a', 0.3);

  // ── barrel tables and stools
  const tables = [
    { x: 2.8, z: -1.1 },
    { x: -1.9, z: 0.8 },
    { x: 2.1, z: 2.6 },
  ];
  tables.forEach((t, i) => {
    const m = T(t.x, 0, t.z, 0, i * 1.3, 0);
    barrel(kit, m, 0.86, 0.33);
    kit.body.add(CYL(14), '#a5774f', mul(m, T(0, 0.9, 0, 0, 0, 0, 0.46, 0.05, 0.46)));
    kit.body.add(SPH(10, 4), SNOW, mul(m, T(0.18, 0.93, -0.12, 0, 0, 0, 0.16, 0.025, 0.12)));
    mug(kit, mul(m, T(-0.12, 0.925, 0.08)), P.cream);
    mug(kit, mul(m, T(0.1, 0.925, 0.16, 0, 2, 0)), P.red);
    // candle jar
    kit.gloss.add(cyl(0.05, 0.05, 0.1, 8), '#e8eef2', mul(m, T(-0.05, 0.975, -0.15)));
    kit.lit.add(cyl(0.03, 0.03, 0.05, 6), P.candle, mul(m, T(-0.05, 0.98, -0.15)), 2.2);
    kit.halos.push({ pos: pt(m, -0.05, 1.05, -0.15), color: P.candle, size: 0.7, k: 0.6, twinkle: 0.5 });
    stool(kit, mul(m, T(0.68, 0, 0.1)), 0.5);
    stool(kit, mul(m, T(-0.55, 0, 0.42)), 0.5);
    f.circle(t.x, t.z, 0.42, 'prop');
  });

  // ── chalkboard menu (A-frame)
  {
    const m = T(-1.5, 0, 4.75, 0, 0.3, 0);
    const lean = 0.16;
    for (const s of [1, -1]) kit.body.add(BOX(), P.woodDark, mul(m, T(0, 0.6, s * 0.12, -s * lean, 0, 0, 0.74, 1.2, 0.04)));
    kit.body.add(BOX(), '#24302a', mul(m, T(0, 0.64, 0.147, -lean, 0, 0, 0.62, 0.96, 0.01)));
    const board = signMesh('La carte', 0.62, 0.96, {
      bg: '#24302a',
      fg: '#f3ead8',
      chalk: true,
      px: 384,
      round: 0.04,
      font: '"Fraunces", Georgia, serif',
      lines: ['Vin chaud · 4 €', 'Chocolat chaud · 3 €', 'Jus de pomme épicé · 3 €', 'Guimauve offerte ♥'],
    });
    board.position.copy(pt(m, 0, 0.64, 0.155));
    board.rotation.set(-lean, 0.3, 0, 'YXZ');
    f.group.add(board);
    f.box(-1.5, 4.75, 0.4, 0.25, 0.3, 'prop');
  }

  // ── stacked barrels, crates of oranges
  barrel(kit, T(4.15, 0, -4.3, 0, 0.3, 0), 0.9, 0.36);
  for (const z of [-3.4, -5.15]) {
    kit.body.add(
      lathe(
        [
          [0.001, 0],
          [0.3, 0],
          [0.33, 0.16],
          [0.36, 0.42],
          [0.33, 0.68],
          [0.3, 0.84],
          [0.001, 0.84],
        ],
        12,
      ),
      '#7d5233',
      T(4.4, 0.36, z + 0.42, Math.PI / 2, 0.15, 0),
    );
  }
  kit.body.add(SPH(8, 4), SNOW, T(4.15, 0.92, -4.3, 0, 0, 0, 0.3, 0.05, 0.3));
  crate(kit, T(-2.75, 0, -4.9, 0, 0.2, 0), 0.6, 0.42, 0.45);
  crate(kit, T(-2.7, 0.42, -4.95, 0, -0.1, 0), 0.55, 0.36, 0.42);
  for (let i = 0; i < 12; i++) kit.body.add(SPH(6, 4), '#f08a2a', T(-2.95 + (i % 4) * 0.13, 0.82, -5.08 + Math.floor(i / 4) * 0.12, 0, 0, 0, 0.065));
  f.box(4.25, -4.3, 0.45, 1.3, 0, 'prop');
  f.box(-2.75, -4.9, 0.35, 0.3, 0.2, 'prop');
  snowMound(kit, T(-2.4, 0, -6.4), 1.0, 0.3, 9);
  snowMound(kit, T(3.8, 0, -6.2), 0.9, 0.3, 10);

  // ── guinguette canopy of string lights
  const poleL = new THREE.Vector3(-4.75, 3.15, 4.0);
  const poleR = new THREE.Vector3(4.9, 3.15, 3.7);
  for (const p of [poleL, poleR]) {
    kit.metal.add(cyl(0.05, 0.07, p.y, 8), IRON, T(p.x, p.y / 2, p.z));
    kit.metal.add(SPH(6, 4), IRON, T(p.x, p.y + 0.05, p.z, 0, 0, 0, 0.08));
    snowMound(kit, T(p.x, 0, p.z), 0.4, 0.15, 12);
    f.circle(p.x, p.z, 0.14, 'prop');
  }
  const eave = (x: number) => new THREE.Vector3(x, eaveY - 0.02, eaveZ + 0.05);
  const warmMix = [P.warm, P.candle, P.warm, '#ffb35c'];
  stringLights(kit, eave(-1.9), poleL, 0.55, { colors: warmMix });
  stringLights(kit, eave(-0.1), poleL, 0.75, { colors: warmMix });
  stringLights(kit, eave(1.4), poleR, 0.75, { colors: warmMix });
  stringLights(kit, eave(3.1), poleR, 0.55, { colors: warmMix });
  stringLights(kit, poleL, poleR, 0.75, { colors: warmMix });
  stringLights(kit, eave(-2.0), eave(3.2), 0.12, { colors: warmMix, spacing: 0.32, halo: 0.4 });
  // light spill on the ground under the canopy
  kit.pool(T(), 0.4, 0.6, 4.5, P.warm, 0.12);
  kit.pool(T(), HX, front + 1.0, 2.6, P.warm2, 0.2);

  // ── FX
  const parts = kit.finish(f.group, 'bar', { twinkle: 0.2 });
  emitter(f.group, [new THREE.Vector3(CX, 1.12, CZ)], {
    count: Math.round(44 * Math.max(0.5, kit.detail)),
    life: 3.4,
    vel: [0.05, 0.42, 0],
    spread: 0.55,
    jitter: 0.45,
    wobble: 0.3,
    size: [0.35, 1.25],
    color: ['#f4f6ff', '#b7c3e2'],
    opacity: 0.32,
    sharp: 2.6,
  });
  emitter(f.group, [...fireOrigins, new THREE.Vector3(CX, 0.4, CZ)], {
    count: Math.round(14 * Math.max(0.5, kit.detail)),
    life: 2.2,
    vel: [0, 0.85, 0],
    spread: 0.45,
    jitter: 0.18,
    wobble: 0.22,
    size: [0.07, 0.025],
    color: ['#ffd27a', '#ff5a1a'],
    additive: true,
    opacity: 1.4,
    sharp: 8,
  });

  let light: THREE.PointLight | null = null;
  if (env.takePointLight()) {
    light = new THREE.PointLight('#ff8a3a', 4, 9, 1.7);
    light.position.set(CX + 0.75, 0.4, CZ + 0.45);
    light.name = 'bar-fire-light';
    f.group.add(light);
  }
  f.light(HX, 2, HZ + 2, (k) => {
    parts.setLevel(k);
    setSignLevel(sign, k, 0.4);
  });

  // ── anchors
  f.anchor('bar:barista', HX + 0.2, front - 0.55, 0);
  f.anchor('bar:counter-spot', HX + 0.2, front + 1.15, Math.PI);
  f.anchor('bar:cauldron', CX, CZ, 0);

  return (_dt: number, t: number) => {
    if (light) light.intensity = 3.6 + Math.sin(t * 9.3) * 0.45 + Math.sin(t * 23.1) * 0.3 + Math.sin(t * 3.7) * 0.4;
  };
}
