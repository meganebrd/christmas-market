import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import { glowUnique, setGlow } from '../materials';
import type { LandmarkEnv } from './index';
import { Halos, duskEnv } from './fx';
import { BOX, CYL, SPH, TOR, Frame, Kit, T, cyl, emitter, lathe, mul, pt, rng } from './kit';
import { IRON, SNOW, barrel, bench, crate, gableRoof, gableWall, lantern, lanternPost, lump, pine, setSignLevel, signBoard, signMesh, snowMound } from './props';

/**
 * L'Atelier du Verrier — an open-front stone & timber workshop: beehive furnace glowing (with sparks
 * and smoke), the gaffer's workbench, shelves and strings full of glass baubles that sparkle.
 * Frame: local +Z faces the plaza.
 */
export function buildWorkshop(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const r = rng(90);
  const name = ctx.layout.zones.workshop.name || 'L’Atelier du Verrier';

  const W = 6.8;
  const D = 4.2;
  const CZ = -4.7;
  const front = CZ + D / 2; // -2.6
  const back = CZ - D / 2; // -6.8
  const EAVE = 2.95;
  const stoneH = 1.25;
  const plaster = '#e6dac2';
  const timber = '#4a3020';
  const stones = ['#8e8f9c', '#9a9aa6', '#7b7d8f', '#a19a98'];

  // ── stone base walls (back + sides)
  const stoneRow = (x0: number, z0: number, x1: number, z1: number, seed: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const rows = 4;
    const rs = rng(seed);
    for (let j = 0; j < rows; j++) {
      const h = stoneH / rows;
      let t = j % 2 ? -0.25 : 0;
      while (t < len) {
        const bw = 0.42 + rs() * 0.3;
        const c = Math.min(len, t + bw);
        const s = Math.max(0, t);
        if (c - s > 0.05) {
          const m = (s + c) / 2 / len;
          const x = x0 + (x1 - x0) * m;
          const z = z0 + (z1 - z0) * m;
          kit.flat.add(BOX(), stones[Math.floor(rs() * stones.length)], T(x, h * (j + 0.5), z, 0, yaw, 0, c - s - 0.03, h - 0.03, 0.42 + rs() * 0.06));
        }
        t += bw;
      }
    }
    kit.flat.add(BOX(), '#6c6e7e', T((x0 + x1) / 2, stoneH + 0.04, (z0 + z1) / 2, 0, yaw, 0, len + 0.1, 0.08, 0.5));
  };
  stoneRow(-W / 2, back, W / 2, back, 1);
  stoneRow(-W / 2, back, -W / 2, front, 2);
  stoneRow(W / 2, back, W / 2, front, 3);

  // ── timber frame + plaster above the stone
  const frameWall = (x0: number, z0: number, x1: number, z1: number, nBays: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const h = EAVE - stoneH;
    const m = T(mx, stoneH, mz, 0, yaw, 0);
    kit.body.add(BOX(), plaster, mul(m, T(0, h / 2, 0, 0, 0, 0, len, h, 0.16)));
    kit.body.add(BOX(), timber, mul(m, T(0, 0.06, 0, 0, 0, 0, len + 0.1, 0.12, 0.22)));
    kit.body.add(BOX(), timber, mul(m, T(0, h - 0.06, 0, 0, 0, 0, len + 0.1, 0.14, 0.22)));
    for (let i = 0; i <= nBays; i++) {
      const x = -len / 2 + (i / nBays) * len;
      kit.body.add(BOX(), timber, mul(m, T(x, h / 2, 0, 0, 0, 0, 0.14, h, 0.2)));
      if (i < nBays) {
        const bw = len / nBays;
        const ang = Math.atan2(h - 0.2, bw);
        kit.body.add(BOX(), timber, mul(m, T(x + bw / 2, h / 2, 0, 0, 0, (i % 2 ? 1 : -1) * ang, Math.hypot(bw, h - 0.2) - 0.1, 0.1, 0.19)));
      }
    }
  };
  frameWall(-W / 2, back, W / 2, back, 4);
  frameWall(-W / 2, back, -W / 2, front, 2);
  frameWall(W / 2, back, W / 2, front, 2);
  // front posts + big header
  for (const sx of [-1, 1]) kit.body.add(BOX(), timber, T(sx * (W / 2 - 0.05), EAVE / 2, front, 0, 0, 0, 0.32, EAVE, 0.32));
  kit.body.add(BOX(), timber, T(0, EAVE - 0.16, front, 0, 0, 0, W + 0.2, 0.32, 0.3));
  for (const sx of [-1, 1]) kit.body.add(BOX(), timber, T(sx * (W / 2 - 0.55), EAVE - 0.55, front, 0, 0, sx * 0.8, 0.12, 0.9, 0.16));
  // roof (ridge along z) with gables
  const RISE = 1.75;
  gableRoof(kit, T(0, EAVE, CZ, 0, Math.PI / 2, 0), D, W, RISE, { color: P.roofSlate, overhang: 0.42, seed: 9, thickness: 0.12 });
  for (const z of [front, back]) {
    gableWall(kit, T(0, EAVE, z), W - 0.2, RISE - 0.08, plaster, 0.14);
    const m = T(0, EAVE, z + (z === front ? 0.08 : -0.08));
    kit.body.add(BOX(), timber, mul(m, T(0, RISE / 2 - 0.05, 0, 0, 0, 0, 0.14, RISE - 0.1, 0.06)));
    for (const sx of [-1, 1]) kit.body.add(BOX(), timber, mul(m, T(sx * 1.2, 0.55, 0, 0, 0, sx * 0.95, 0.1, 1.25, 0.06)));
  }

  // ── beehive furnace
  const FX = -1.65;
  const FZ = -5.35;
  kit.flat.add(cyl(1.18, 1.25, 0.42, 14), '#7b7d8f', T(FX, 0.21, FZ));
  kit.flat.add(
    lathe(
      [
        [0.001, 1.95],
        [0.42, 1.88],
        [0.78, 1.62],
        [1.0, 1.2],
        [1.08, 0.72],
        [1.1, 0.42],
      ],
      14,
    ),
    '#a07c66',
    T(FX, 0, FZ),
  );
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const y = 0.55 + r() * 1.1;
    const rr = 1.08 - (y - 0.5) * 0.35;
    if (Math.abs(Math.sin(a)) < 0.35 && Math.cos(a) > 0) continue;
    kit.flat.add(lump(i, 0, 0.25), r() > 0.5 ? '#8f6e5c' : '#b08a72', T(FX + Math.sin(a) * rr, y, FZ + Math.cos(a) * rr, 0, a, 0, 0.16, 0.1, 0.1));
  }
  // mouth: brick arch, dark recess, glowing core
  const mouthZ = FZ + 1.02;
  const mouthY = 0.95;
  kit.flat.add(TOR(1, 0.18, 4, 14, Math.PI), '#8a5a48', T(FX, mouthY, mouthZ + 0.02, 0, 0, 0, 0.42));
  kit.body.add(BOX(), '#8a5a48', T(FX - 0.42, mouthY - 0.22, mouthZ + 0.02, 0, 0, 0, 0.14, 0.44, 0.16));
  kit.body.add(BOX(), '#8a5a48', T(FX + 0.42, mouthY - 0.22, mouthZ + 0.02, 0, 0, 0, 0.14, 0.44, 0.16));
  kit.flat.add(BOX(), '#6c6e7e', T(FX, mouthY - 0.47, mouthZ + 0.1, 0, 0, 0, 1.0, 0.08, 0.36));
  kit.body.add(CYL(14), '#1a0d08', T(FX, mouthY, mouthZ - 0.02, Math.PI / 2, 0, 0, 0.36, 0.02, 0.36));
  const coreMat = glowUnique('#ffb347', 3.2);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), coreMat);
  core.position.set(FX, mouthY - 0.03, mouthZ - 0.005);
  core.name = 'furnace-core';
  f.group.add(core);
  kit.flames.push({ pos: new THREE.Vector3(FX - 0.05, mouthY - 0.28, mouthZ + 0.02), w: 0.32, h: 0.42, k: 2.0 });
  kit.flames.push({ pos: new THREE.Vector3(FX + 0.1, mouthY - 0.28, mouthZ + 0.03), w: 0.22, h: 0.3, k: 1.8 });
  kit.halos.push({ pos: new THREE.Vector3(FX, mouthY, mouthZ + 0.25), color: '#ff8a3a', size: 2.2, k: 0.5 });
  kit.pool(T(), FX, mouthZ + 1.0, 2.4, '#ff7a2a', 0.42);
  // chimney through the roof
  kit.flat.add(BOX(), '#8a5a48', T(FX, 1.9 + 1.75, FZ, 0, 0, 0, 0.55, 3.5, 0.55));
  kit.flat.add(BOX(), '#6c4a3e', T(FX, 5.45, FZ, 0, 0, 0, 0.68, 0.12, 0.68));
  kit.body.add(SPH(8, 4), SNOW, T(FX, 5.52, FZ, 0, 0, 0, 0.3, 0.05, 0.3));
  f.circle(FX, FZ, 1.22, 'solid');

  // ── workbench (the visitor's station)
  const BX = 1.0;
  const BZ = front - 0.55;
  const top = 0.86;
  kit.body.add(BOX(), '#a5774f', T(BX, top, BZ, 0, 0, 0, 2.2, 0.08, 0.76));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) kit.body.add(BOX(), P.woodDark, T(BX + sx * 1.0, top / 2, BZ + sz * 0.3, 0, 0, 0, 0.09, top, 0.09));
  kit.body.add(BOX(), P.wood, T(BX, 0.25, BZ, 0, 0, 0, 2.0, 0.05, 0.6));
  // marver (steel plate), tools, blowpipes, rods
  kit.metal.add(BOX(), '#c9ccd6', T(BX - 0.55, top + 0.06, BZ - 0.05, 0, 0, 0, 0.7, 0.05, 0.5));
  for (let i = 0; i < 2; i++) kit.metal.add(CYL(6), '#8f8a86', T(BX + 0.15, top + 0.075 + i * 0.03, BZ - 0.15 + i * 0.22, 0, 0.1 * i, Math.PI / 2, 0.018, 1.7, 0.018));
  kit.glow.add(SPH(10, 8), '#ff9a3a', T(BX - 0.72, top + 0.11, BZ - 0.15, 0, 0, 0, 0.07, 0.065, 0.065), 2.2);
  kit.metal.add(BOX(), '#6e6a6c', T(BX + 0.62, top + 0.05, BZ + 0.22, 0, 0.4, 0, 0.32, 0.015, 0.03));
  kit.metal.add(BOX(), '#6e6a6c', T(BX + 0.62, top + 0.05, BZ + 0.26, 0, 0.5, 0, 0.32, 0.015, 0.03));
  kit.body.add(BOX(), '#7a4e33', T(BX + 0.25, top + 0.07, BZ + 0.2, 0, 0.2, 0, 0.22, 0.07, 0.14));
  const rodColors = ['#e85a4f', '#3fa7d6', '#f2c14e', '#5fbf77', '#b06ad8', '#ff8fb1'];
  kit.gloss.add(cyl(0.08, 0.08, 0.18, 10), '#dfeaf2', T(BX + 0.88, top + 0.13, BZ - 0.18));
  rodColors.forEach((c, i) => kit.gloss.add(CYL(5), c, T(BX + 0.86 + (i % 3) * 0.03, top + 0.3, BZ - 0.2 + Math.floor(i / 3) * 0.04, (i - 3) * 0.06, 0, (i % 3 - 1) * 0.08, 0.012, 0.42, 0.012)));
  // a finished bauble on a little stand
  kit.metal.add(cyl(0.02, 0.05, 0.06, 8), P.gold, T(BX - 0.1, top + 0.07, BZ + 0.15));
  // gaffer's bench (seat with long arms) and a water bucket
  {
    const gm = T(-0.25, 0, -4.05, 0, 0.5, 0);
    kit.body.add(BOX(), P.wood, mul(gm, T(0, 0.48, 0, 0, 0, 0, 0.5, 0.06, 0.5)));
    for (const sx of [-1, 1]) {
      kit.body.add(BOX(), P.woodDark, mul(gm, T(sx * 0.22, 0.24, 0, 0, 0, 0, 0.06, 0.48, 0.42)));
      kit.body.add(BOX(), P.woodDark, mul(gm, T(sx * 0.22, 0.7, 0, 0, 0, 0, 0.07, 0.06, 1.5)));
      kit.body.add(BOX(), P.woodDark, mul(gm, T(sx * 0.22, 0.6, 0.62, 0, 0, 0, 0.06, 0.2, 0.06)));
    }
    kit.body.add(cyl(0.2, 0.17, 0.3, 12), '#7a5234', T(2.45, 0.15, -3.6));
    kit.gloss.add(CYL(12), '#3a5a7a', T(2.45, 0.27, -3.6, 0, 0, 0, 0.18, 0.01, 0.18));
  }
  f.box(BX, BZ, 1.12, 0.42, 0, 'prop');

  // ── shelves full of baubles (back-right and right side), strings of baubles from the header
  const bauble: { p: THREE.Vector3; s: number; c: string }[] = [];
  const bc = ['#e8453c', '#e2b34a', '#3f7fd6', '#5fbf77', '#b06ad8', '#ff8fb1', '#f2efe6', '#36b3b3', '#ff9a3a', '#c0392b'];
  const shelf = (m: THREE.Matrix4, len: number, levels: number[], seed: number) => {
    const rs = rng(seed);
    for (const sx of [-1, 1]) kit.body.add(BOX(), P.woodDark, mul(m, T((sx * len) / 2, 1.1, 0, 0, 0, 0, 0.07, 2.2, 0.32)));
    for (const y of levels) {
      kit.body.add(BOX(), '#9b6e47', mul(m, T(0, y, 0, 0, 0, 0, len, 0.05, 0.34)));
      let x = -len / 2 + 0.16;
      while (x < len / 2 - 0.12) {
        const s = 0.07 + rs() * 0.05;
        if (rs() < 0.18) {
          // a vase / bottle instead
          kit.gloss.add(lathe([[0.001, 0], [s * 0.8, 0], [s, s * 1.2], [s * 0.4, s * 2.4], [s * 0.5, s * 2.8], [0.001, s * 2.8]], 10), bc[Math.floor(rs() * bc.length)], mul(m, T(x, y + 0.025, (rs() - 0.5) * 0.1)));
        } else {
          bauble.push({ p: pt(m, x, y + 0.025 + s, (rs() - 0.5) * 0.12), s, c: bc[Math.floor(rs() * bc.length)] });
          kit.metal.add(CYL(6), P.gold, mul(m, T(x, y + 0.03 + s * 2, 0, 0, 0, 0, s * 0.25, s * 0.3, s * 0.25)));
        }
        x += s * 2 + 0.05;
      }
    }
  };
  shelf(T(1.65, 0, back + 0.42), 2.6, [0.5, 0.95, 1.4, 1.85], 4);
  shelf(T(W / 2 - 0.42, 0, -4.3, 0, -Math.PI / 2, 0), 2.6, [0.6, 1.1, 1.6], 5);
  for (let i = 0; i < 11; i++) {
    const x = -W / 2 + 0.55 + (i / 10) * (W - 1.1);
    const len = 0.25 + ((i * 7) % 5) * 0.12;
    const y = EAVE - 0.32 - len;
    kit.body.add(BOX(), '#d9c9a0', T(x, EAVE - 0.32 - len / 2, front + 0.02, 0, 0, 0, 0.008, len, 0.008));
    bauble.push({ p: new THREE.Vector3(x, y - 0.1, front + 0.02), s: 0.1 + (i % 3) * 0.02, c: bc[(i * 3) % bc.length] });
  }
  const bMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 9, 7),
    (() => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.25, emissive: '#ffffff', emissiveIntensity: 0.06 });
      const e = duskEnv(ctx.renderer);
      if (e) {
        m.envMap = e;
        m.envMapIntensity = 1.6;
      }
      return m;
    })(),
    bauble.length,
  );
  bMesh.name = 'workshop-baubles';
  const mm = new THREE.Matrix4();
  const cc = new THREE.Color();
  bauble.forEach((b, i) => {
    mm.makeScale(b.s, b.s, b.s).setPosition(b.p);
    bMesh.setMatrixAt(i, mm);
    bMesh.setColorAt(i, cc.set(b.c));
  });
  bMesh.computeBoundingSphere();
  f.group.add(bMesh);
  const sparkles = new Halos(
    bauble
      .filter((_, i) => i % 2 === 0)
      .map((b) => ({ pos: b.p.clone().add(new THREE.Vector3(b.s * 0.4, b.s * 0.45, b.s * 0.6)), color: '#fff4dc', size: 0.32, k: 0.9, twinkle: 1 })),
    { twinkle: 1, sparkle: true },
  );
  f.group.add(sparkles.mesh);

  // ── lanterns, sign, outside props
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.05);
    kit.metal.add(BOX(), IRON, T(x - sx * 0.05, 2.25, front + 0.42, 0, 0, 0, 0.04, 0.04, 0.5));
    lantern(kit, T(x - sx * 0.05, 1.95, front + 0.62), 0.85);
    kit.pool(T(), x, front + 1.0, 1.8, P.warm2, 0.3);
  }
  lantern(kit, T(0.9, EAVE - 0.55, CZ), 0.8);
  kit.lit.add(BOX(), '#ffb066', T(0, 2.1, back + 0.13, 0, 0, 0, W - 0.6, 1.2, 0.02), 0.18);
  const sign = signMesh(name, 3.0, 0.55, {
    bg: '#22403a',
    fg: '#f6d58a',
    border: '#e2b34a',
    grain: true,
    lit: 1.05,
    px: 1024,
    paint: (g, w, h) => {
      const cols = ['#e8453c', '#3f7fd6', '#e2b34a'];
      [w * 0.07, w * 0.93].forEach((x, k) => {
        g.fillStyle = cols[k];
        g.beginPath();
        g.arc(x, h * 0.56, h * 0.22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f6d58a';
        g.fillRect(x - h * 0.06, h * 0.25, h * 0.12, h * 0.1);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.beginPath();
        g.arc(x - h * 0.07, h * 0.48, h * 0.05, 0, Math.PI * 2);
        g.fill();
      });
    },
  });
  sign.position.set(0, EAVE + 0.62, front + 0.2);
  f.group.add(sign);
  signBoard(kit, T(0, EAVE + 0.62, front + 0.17), 3.0, 0.55);

  // woodpile on the left
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 6 - row; i++) {
      const z = -5.6 + i * 0.27 + row * 0.135;
      kit.body.add(CYL(7), '#7a5234', T(-W / 2 - 0.55, 0.13 + row * 0.23, z, 0, 0, Math.PI / 2, 0.12, 0.9, 0.12));
      kit.body.add(CYL(7), '#c79a6a', T(-W / 2 - 0.1, 0.13 + row * 0.23, z, 0, 0, Math.PI / 2, 0.1, 0.01, 0.1));
    }
  kit.body.add(SPH(8, 4), SNOW, T(-W / 2 - 0.55, 1.03, -5.0, 0, 0, 0, 0.5, 0.06, 0.45));
  f.box(-W / 2 - 0.55, -5.0, 0.5, 0.85, 0, 'prop');
  // crates of straw with baubles + a barrel, outside right
  crate(kit, T(W / 2 + 0.5, 0, front + 0.3, 0, 0.3, 0), 0.6, 0.4, 0.45);
  kit.body.add(lump(3, 1, 0.2), '#d9b866', T(W / 2 + 0.5, 0.42, front + 0.3, 0, 0, 0, 0.26, 0.06, 0.2));
  for (let i = 0; i < 4; i++) kit.gloss.add(SPH(10, 7), bc[i * 2], T(W / 2 + 0.36 + (i % 2) * 0.24, 0.5, front + 0.22 + Math.floor(i / 2) * 0.16, 0, 0, 0, 0.075));
  barrel(kit, T(W / 2 + 0.55, 0, front - 0.6, 0, 0.4, 0), 0.8, 0.3);
  f.box(W / 2 + 0.52, front - 0.15, 0.38, 0.75, 0.15, 'prop');
  // ── forecourt: bauble display table, a little glass-bauble fir, a bench, a lantern, a demo slate
  {
    const tm = T(-3.1, 0, 0.9, 0, 0.45, 0);
    kit.body.add(BOX(), '#22403a', mul(tm, T(0, 0.74, 0, 0, 0, 0, 1.5, 0.05, 0.75)));
    kit.body.add(BOX(), '#22403a', mul(tm, T(0, 0.5, 0.375, 0, 0, 0, 1.5, 0.48, 0.01)));
    kit.body.add(BOX(), P.gold, mul(tm, T(0, 0.3, 0.38, 0, 0, 0, 1.5, 0.04, 0.01)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.body.add(BOX(), P.woodDark, mul(tm, T(sx * 0.68, 0.37, sz * 0.32, 0, 0, 0, 0.06, 0.74, 0.06)));
    const tierH = (k: number) => 0.06 + k * 0.13;
    for (let k = 0; k < 3; k++) kit.body.add(BOX(), k % 2 ? '#8a5f3d' : '#9b6e47', mul(tm, T(0, 0.765 + tierH(k) / 2, 0.22 - k * 0.2, 0, 0, 0, 1.3, tierH(k), 0.18)));
    const dc = ['#e8453c', '#3f7fd6', '#e2b34a', '#5fbf77', '#b06ad8', '#36b3b3', '#ff8fb1'];
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < 5; i++) {
        const y = 0.765 + tierH(k) + 0.075;
        const p = pt(tm, -0.5 + i * 0.25, y, 0.22 - k * 0.2);
        kit.gloss.add(SPH(10, 7), dc[(i + k * 2) % dc.length], T(p.x, p.y, p.z, 0, 0, 0, 0.075));
        kit.metal.add(CYL(6), P.gold, T(p.x, p.y + 0.075, p.z, 0, 0, 0, 0.02, 0.025, 0.02));
      }
    f.box(-3.1, 0.9, 0.8, 0.42, 0.45, 'prop');
    // glass-bauble fir
    pine(kit, T(3.35, 0, 1.0), 2.3, { lights: [P.warm, P.candle], seed: 12 });
    const pr = rng(33);
    for (let i = 0; i < 16; i++) {
      const t = pr();
      const y = 0.45 + t * 1.45;
      const rad = (0.36 - (y / 2.3) * 0.27) * 2.3 * 0.95;
      const a = pr() * Math.PI * 2;
      kit.gloss.add(SPH(8, 6), dc[i % dc.length], T(3.35 + Math.sin(a) * rad, y - 0.08, 1.0 + Math.cos(a) * rad, 0, 0, 0, 0.065));
    }
    f.circle(3.35, 1.0, 0.75, 'prop');
    // bench & lantern post
    bench(kit, T(-3.5, 0, 3.6, 0, 1.25, 0), 1.6);
    f.box(-3.5, 3.6, 0.82, 0.3, 1.25, 'prop');
    lanternPost(kit, T(2.6, 0, 4.2, 0, Math.PI, 0), 2.3);
    f.circle(2.6, 4.2, 0.14, 'prop');
    // demonstration slate
    const em = T(2.55, 0, -1.3, 0, -0.5, 0);
    for (const sz of [1, -1]) kit.body.add(BOX(), P.woodDark, mul(em, T(0, 0.55, sz * 0.1, -sz * 0.15, 0, 0, 0.6, 1.1, 0.04)));
    const slate = signMesh('Démonstrations', 0.5, 0.86, {
      bg: '#24302a',
      fg: '#f3ead8',
      chalk: true,
      px: 320,
      round: 0.05,
      lines: ['Soufflage de verre', 'à la tombée du jour', '☆ Atelier boules ☆'],
    });
    slate.position.copy(pt(em, 0, 0.6, 0.13));
    slate.rotation.set(-0.15, -0.5, 0, 'YXZ');
    f.group.add(slate);
    f.box(2.55, -1.3, 0.34, 0.2, -0.5, 'prop');
  }
  snowMound(kit, T(-W / 2 - 0.8, 0, front + 0.6), 0.8, 0.3, 4);
  snowMound(kit, T(W / 2 + 0.4, 0, back + 0.2), 1.0, 0.32, 6);
  snowMound(kit, T(-W / 2 + 0.4, 0, back - 0.5), 1.1, 0.34, 8);

  // colliders: walls (open front)
  f.box(0, back, W / 2 + 0.1, 0.26, 0, 'chalet');
  f.box(-W / 2, CZ, 0.26, D / 2, 0, 'chalet');
  f.box(W / 2, CZ, 0.26, D / 2, 0, 'chalet');

  const parts = kit.finish(f.group, 'workshop', { twinkle: 0.2 });
  emitter(f.group, [new THREE.Vector3(FX, mouthY - 0.1, mouthZ + 0.05)], {
    count: Math.round(22 * Math.max(0.5, kit.detail)),
    life: 1.6,
    vel: [0, 0.9, 0.55],
    spread: 0.6,
    jitter: 0.12,
    gravity: 0.55,
    wobble: 0.15,
    size: [0.06, 0.02],
    color: ['#fff0b0', '#ff6a1a'],
    additive: true,
    opacity: 1.6,
    sharp: 9,
  });
  emitter(f.group, [new THREE.Vector3(FX, 5.55, FZ)], {
    count: Math.round(22 * Math.max(0.5, kit.detail)),
    life: 4.5,
    vel: [0.15, 0.55, 0.05],
    spread: 0.9,
    jitter: 0.12,
    wobble: 0.4,
    size: [0.3, 1.3],
    color: ['#c9c4c8', '#6d7590'],
    opacity: 0.28,
    sharp: 2.4,
  });

  let light: THREE.PointLight | null = null;
  if (env.takePointLight()) {
    light = new THREE.PointLight('#ff9a4a', 3.5, 9, 1.7);
    light.position.set(FX, mouthY + 0.1, mouthZ + 0.9);
    light.name = 'workshop-furnace-light';
    f.group.add(light);
  }
  f.light(0, 2, CZ, (k) => {
    parts.setLevel(k);
    setSignLevel(sign, k, 0.5);
  });

  f.anchor('workshop:glassblower', 0.75, -3.95, 0);
  f.anchor('workshop:bench-spot', BX, BZ + 1.25, Math.PI);
  f.anchor('workshop:furnace', FX, mouthZ + 0.15, 0);

  return (_dt: number, t: number) => {
    const fl = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 17.1) + 0.05 * Math.sin(t * 2.3);
    setGlow(coreMat, fl, 0);
    if (light) light.intensity = 3.2 * fl;
  };
}
