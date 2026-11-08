import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import type { LandmarkEnv } from './index';
import { BOX, CYL, SPH, TOR, Frame, Kit, T, cyl, mul, tube } from './kit';
import { IRON, SNOW, gableRoof, lantern, lump, pine, setSignLevel, signMesh, snowMound } from './props';

/**
 * La Porte du Givre — the carved wooden entrance arch over the avenue at the south gate.
 * Frame: local +Z = south (outside, where visitors arrive), the market is at local -Z.
 */
export function buildArch(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kit = new Kit(ctx);
  const town = ctx.config.meta.town || 'Givrelune';
  const PX = 2.75;

  // ── posts on stone plinths
  for (const sx of [-1, 1]) {
    const x = sx * PX;
    const m = T(x, 0, 0);
    // plinth
    kit.flat.add(BOX(), '#8e8f9c', mul(m, T(0, 0.26, 0, 0, 0, 0, 0.78, 0.52, 0.78)));
    kit.flat.add(BOX(), '#a3a4b0', mul(m, T(0, 0.55, 0, 0, 0, 0, 0.86, 0.08, 0.86)));
    kit.body.add(SPH(8, 4), SNOW, mul(m, T(0.12 * sx, 0.6, 0.05, 0, 0, 0, 0.38, 0.06, 0.36)));
    // octagonal carved post
    kit.body.add(cyl(0.19, 0.22, 4.0, 8), P.wood, mul(m, T(0, 2.58, 0, 0, Math.PI / 8, 0)));
    for (const y of [0.75, 1.25, 3.3, 3.75]) kit.body.add(cyl(0.245, 0.245, 0.09, 8), P.woodDark, mul(m, T(0, y, 0, 0, Math.PI / 8, 0)));
    // carved diamond motifs
    for (const y of [1.9, 2.5]) {
      kit.body.add(BOX(), P.woodLight, mul(m, T(0, y, 0.205, 0, 0, Math.PI / 4, 0.12, 0.12, 0.03)));
      kit.body.add(BOX(), P.woodLight, mul(m, T(0, y, -0.205, 0, 0, Math.PI / 4, 0.12, 0.12, 0.03)));
    }
    // knee braces
    kit.body.add(BOX(), P.wood, mul(m, T(-sx * 0.42, 3.95, 0, 0, 0, sx * 0.78, 0.13, 1.05, 0.15)));
    // garland spiralling up the post with bulbs
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      const a = t * Math.PI * 2 * 2.5 + (sx > 0 ? 0 : Math.PI);
      pts.push(new THREE.Vector3(x + Math.sin(a) * 0.27, 0.75 + t * 3.4, Math.cos(a) * 0.27));
    }
    kit.body.add(tube(pts, 0.07, 5), P.holly);
    pts.forEach((p, k) => {
      if (k % 3 === 1) kit.bulb(new THREE.Vector3(p.x + (p.x - x) * 0.35, p.y, p.z * 1.35), P.warm, 0.04, k % 6 === 1 ? 0.5 : 0);
      if (k % 7 === 3) kit.body.add(SPH(5, 4), P.berry, T(p.x + (p.x - x) * 0.3, p.y - 0.05, p.z * 1.3, 0, 0, 0, 0.045));
    });
    // lantern on a bracket, facing the arriving visitors
    kit.metal.add(BOX(), IRON, T(x, 2.75, 0.4, 0, 0, 0, 0.04, 0.04, 0.5));
    kit.metal.add(BOX(), IRON, T(x, 2.6, 0.3, -0.7, 0, 0, 0.03, 0.03, 0.35));
    kit.metal.add(BOX(), IRON, T(x, 2.62, 0.62, 0, 0, 0, 0.015, 0.12, 0.015));
    lantern(kit, T(x, 2.35, 0.62), 0.9);
    kit.pool(T(), x, 0.8, 1.7, P.warm2, 0.4);
    // small lit pines around the posts
    pine(kit, T(x + sx * 1.25, 0, 0.55), 2.1, { lights: [P.warm, P.candle], seed: 3 + sx });
    pine(kit, T(x + sx * 2.1, 0, -0.35), 1.55, { lights: [P.warm], seed: 7 + sx });
    pine(kit, T(x + sx * 0.95, 0, -0.95), 1.2, { seed: 9 + sx });
    snowMound(kit, T(x + sx * 1.6, 0, 0.2), 1.1, 0.32, 5 + sx);
    snowMound(kit, T(x + sx * 0.8, 0, 0.9), 0.55, 0.22, 8 + sx);
    snowMound(kit, T(x + sx * 2.4, 0, -0.9), 0.8, 0.26, 11 + sx);
    f.circle(x, 0, 0.48, 'solid');
  }

  // ── crossbeam & gable roof
  kit.body.add(BOX(), P.woodDark, T(0, 4.42, 0, 0, 0, 0, PX * 2 + 0.9, 0.34, 0.36));
  kit.body.add(BOX(), P.wood, T(0, 4.21, 0, 0, 0, 0, PX * 2 + 0.6, 0.1, 0.42));
  // carved scallops under the beam
  for (let i = 0; i < 13; i++) {
    const x = -PX + 0.2 + (i / 12) * (PX * 2 - 0.4);
    kit.body.add(CYL(8), P.woodLight, T(x, 4.18, 0, Math.PI / 2, 0, 0, 0.11, 0.44, 0.11));
  }
  gableRoof(kit, T(0, 4.6, 0), PX * 2 + 0.7, 1.2, 0.48, { color: P.roof, overhang: 0.22, seed: 2, snowCover: 0.62 });
  // gable ends (little triangles)
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(-0.6, 0);
    s.lineTo(0.6, 0);
    s.lineTo(0, 0.48);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
    kit.body.add(g, P.woodDark, T(sx * (PX + 0.3), 4.6, 0, 0, Math.PI / 2, 0));
  }

  // ── on the ridge: a carved glowing star, fir sprigs and a string of bulbs
  {
    const ridgeY = 4.6 + 0.48 + 0.2;
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 0.16 : 0.38;
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    const starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    starGeo.translate(0, 0, -0.04);
    kit.body.add(BOX(), P.woodDark, T(0, ridgeY + 0.12, 0, 0, 0, 0, 0.08, 0.36, 0.08));
    kit.lit.add(starGeo, P.gold, T(0, ridgeY + 0.6, 0), 1.6);
    kit.halos.push({ pos: new THREE.Vector3(0, ridgeY + 0.6, 0), color: P.warm, size: 2.2, k: 0.45 });
    for (let i = 0; i < 9; i++) {
      const x = -PX - 0.2 + (i / 8) * (PX * 2 + 0.4);
      if (Math.abs(x) < 0.4) continue;
      kit.body.add(lump(i + 60, 0, 0.3), i % 2 ? P.holly : P.pine, T(x, ridgeY - 0.02, 0, 0, i, 0, 0.22, 0.1, 0.16));
      if (i % 2) kit.body.add(SPH(5, 3), P.berry, T(x + 0.08, ridgeY + 0.06, 0.06, 0, 0, 0, 0.04));
    }
    for (let i = 0; i < 16; i++) {
      const x = -PX - 0.1 + (i / 15) * (PX * 2 + 0.2);
      if (Math.abs(x) < 0.3) continue;
      kit.bulb(new THREE.Vector3(x, ridgeY + 0.06, 0), i % 2 ? P.warm : P.candle, 0.04, i % 3 === 0 ? 0.45 : 0);
    }
  }

  // ── wreaths (front & back) with a red bow
  for (const sz of [1, -1]) {
    const z = sz * 0.24;
    const m = T(0, 4.48, z, 0, sz > 0 ? 0 : Math.PI, 0);
    kit.body.add(TOR(1, 0.32, 6, 18), P.holly, mul(m, T(0, 0, 0, 0, 0, 0, 0.34)));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      kit.body.add(SPH(5, 4), i % 2 ? P.berry : P.pineLight, mul(m, T(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.09, 0, 0, 0, i % 2 ? 0.045 : 0.07)));
    }
    kit.body.add(TOR(1, 0.35, 5, 10), P.red, mul(m, T(-0.09, -0.3, 0.1, 0, 0, 0.5, 0.08)));
    kit.body.add(TOR(1, 0.35, 5, 10), P.red, mul(m, T(0.09, -0.3, 0.1, 0, 0, -0.5, 0.08)));
    kit.body.add(BOX(), P.red, mul(m, T(-0.05, -0.45, 0.1, 0, 0, 0.25, 0.05, 0.22, 0.02)));
    kit.body.add(BOX(), P.red, mul(m, T(0.05, -0.45, 0.1, 0, 0, -0.25, 0.05, 0.22, 0.02)));
  }

  // ── evergreen swags along the beam (both faces) with warm bulbs
  for (const sz of [1, -1]) {
    for (const [x0, x1] of [
      [-PX, -0.35],
      [0.35, PX],
    ]) {
      const a = new THREE.Vector3(x0, 4.3, sz * 0.26);
      const b = new THREE.Vector3(x1, 4.3, sz * 0.26);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.34;
        p.z += sz * Math.sin(t * Math.PI) * 0.08;
        pts.push(p);
      }
      kit.body.add(tube(pts, 0.075, 5), P.holly);
      for (let i = 1; i < 14; i += 2) {
        const p = pts[i];
        kit.bulb(new THREE.Vector3(p.x, p.y - 0.07, p.z + sz * 0.06), i % 4 === 1 ? P.warm : P.candle, 0.045, 0.55);
        if (i % 4 === 3) kit.body.add(SPH(5, 4), P.gold, T(p.x, p.y - 0.12, p.z + sz * 0.05, 0, 0, 0, 0.06));
      }
    }
  }

  // ── the lit sign (both faces), hanging under the beam
  kit.body.add(BOX(), P.woodDeep, T(0, 3.68, 0, 0, 0, 0, 3.7, 0.86, 0.1));
  kit.body.add(BOX(), P.woodDark, T(0, 4.14, 0, 0, 0, 0, 3.86, 0.08, 0.14));
  kit.body.add(BOX(), P.woodDark, T(0, 3.22, 0, 0, 0, 0, 3.86, 0.08, 0.14));
  for (const sx of [-1, 1]) kit.metal.add(BOX(), '#8c7a52', T(sx * 1.4, 4.17, 0, 0, 0, 0, 0.03, 0.12, 0.03));
  const signs: THREE.Mesh[] = [];
  for (const sz of [1, -1]) {
    const s = signMesh(town, 3.5, 0.78, {
      bg: '#3a2416',
      fg: '#ffe6ad',
      border: '#c9a24a',
      stars: true,
      grain: true,
      lit: 1.9,
      px: 1024,
      round: 0.2,
    });
    s.position.set(0, 3.68, sz * 0.056);
    s.rotation.y = sz > 0 ? 0 : Math.PI;
    f.group.add(s);
    signs.push(s);
    // marquee bulbs around the sign
    for (let i = 0; i < 12; i++) {
      const x = -1.75 + (i / 11) * 3.5;
      kit.bulb(new THREE.Vector3(x, 4.06, sz * 0.09), P.warm, 0.03, 0);
      kit.bulb(new THREE.Vector3(x, 3.3, sz * 0.09), P.warm, 0.03, 0);
    }
  }
  // glow spilling from the sign onto the snow
  kit.pool(T(), 0, 1.3, 2.6, P.warm, 0.25);
  kit.pool(T(), 0, -1.3, 2.6, P.warm, 0.2);

  // ── a little welcome bell under the beam end
  kit.metal.add(cyl(0.05, 0.13, 0.18, 10), P.gold, T(-PX + 0.62, 3.95, 0.2));
  kit.metal.add(SPH(6, 4), P.gold, T(-PX + 0.62, 3.85, 0.2, 0, 0, 0, 0.035));

  const parts = kit.finish(f.group, 'arch');
  f.light(0, 4, 0, (k) => {
    parts.setLevel(k);
    for (const s of signs) setSignLevel(s, k, 0.35);
  });

  f.anchor('gate:arch', 0, 0, Math.PI);
}
