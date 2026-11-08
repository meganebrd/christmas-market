import * as THREE from 'three';
import { B } from './dims';
import { M, cylinder, ellipsoid, fluffy, fluffyTorus, mul, ribbed, seg, shell, sphere, torus } from './geo';
import { CREAM, GOLD, contrast, mix, shade } from './colors';
import { headSurf, type HeadCtx } from './head';
import { smoothstep } from '../util';

export interface HatInfo {
  /** Highest point (model space y). */
  top: number;
  /** Pivot of the springy tip (pompom, toque, stalk), model space. Null → the tip bone sits on the head top. */
  tip: THREE.Vector3 | null;
}

export function buildHat(h: HeadCtx): HatInfo {
  const { g, a, C, R, d, detail, rand } = h;
  const k = d.hk;
  const hc = a.hatColor;
  const headTop = C.y + R * d.hsy;
  const ws = seg(22, detail, 10);
  switch (a.hat) {
    case 'none':
      return { top: headTop + R * 0.08, tip: null };

    case 'bobble':
    case 'beanie': {
      const bobble = a.hat === 'bobble';
      const tilt = -0.3;
      const capR = R * 1.095;
      const capM = mul(M(C.x, C.y - R * 0.02, C.z - R * 0.02, tilt, 0, 0), M(0, 0, 0, 0, 0, 0, d.hsx, bobble ? 1.13 : 1.2, d.hsz));
      const theta = Math.PI * 0.47;
      const stripe = bobble ? CREAM : null;
      const capGeo = new THREE.SphereGeometry(capR, ws, seg(10, detail, 6), 0, Math.PI * 2, 0, theta);
      capGeo.deleteAttribute('uv');
      const yEdge = capR * Math.cos(theta);
      const inv = capM.clone().invert();
      g.add(capGeo, {
        faceColor: stripe
          ? (c) => {
              // one cosy cream stripe around the middle of the cap
              const lp = c.clone().applyMatrix4(inv);
              const v = lp.y / capR;
              return v > 0.42 && v < 0.6 ? new THREE.Color(stripe) : new THREE.Color(hc);
            }
          : undefined,
        color: (p) => mix(shade(hc, 0.9), shade(hc, 1.08), smoothstep(C.y, headTop + R * 0.2, p.y)),
        bone: B.head,
        matrix: capM,
      });
      // folded ribbed brim
      const brimH = 0.064 * k;
      g.add(ribbed(capR * 1.022, capR * 1.03, brimH, seg(36, detail, 18), detail >= 0.7 ? 18 : 9, 0.018), {
        color: bobble ? shade(hc, 0.85) : shade(hc, 0.92),
        bone: B.head,
        matrix: mul(capM, M(0, yEdge + brimH * 0.32, 0)),
      });
      const tipLocal = new THREE.Vector3(0, capR * (bobble ? 1.0 : 0.98), 0).applyMatrix4(capM);
      if (bobble) {
        const pr = 0.078 * k;
        const pomCol = rand() < 0.75 ? CREAM : contrast(hc).getStyle();
        g.add(fluffy(pr, seg(12, detail, 8), seg(9, detail, 6), 0.14, 10, rand() * 6), {
          color: (p) => mix(shade(pomCol, 0.85), pomCol, smoothstep(tipLocal.y, tipLocal.y + pr * 1.6, p.y)),
          bone: B.tip,
          matrix: M(tipLocal.x, tipLocal.y + pr * 0.75, tipLocal.z),
        });
        return { top: tipLocal.y + pr * 1.7, tip: tipLocal };
      }
      // beanie: a little knitted stalk on top
      g.add(cylinder(0.012 * k, 0.018 * k, 0.04 * k, 6), { color: shade(hc, 0.9), bone: B.tip, matrix: M(tipLocal.x, tipLocal.y + 0.014 * k, tipLocal.z, -0.25, 0, 0.2) });
      return { top: tipLocal.y + 0.04 * k, tip: tipLocal };
    }

    case 'beret': {
      const tilt = 0.26;
      const c = new THREE.Vector3(C.x + R * 0.1, C.y + R * 0.8, C.z - R * 0.06);
      const bm = M(c.x, c.y, c.z, -0.12, 0, -tilt);
      g.add(ellipsoid(R * 1.04, R * 0.28, R * 1.02, ws, seg(12, detail, 6)), {
        color: (p) => mix(shade(hc, 0.82), shade(hc, 1.08), smoothstep(c.y - R * 0.2, c.y + R * 0.25, p.y)),
        bone: B.head,
        matrix: bm,
      });
      g.add(torus(R * 0.8, R * 0.07, 5, seg(24, detail, 12)), { color: shade(hc, 0.75), bone: B.head, matrix: mul(bm, M(0, -R * 0.18, 0, Math.PI / 2, 0, 0)) });
      const tip = new THREE.Vector3(0, R * 0.3, 0).applyMatrix4(bm);
      g.add(cylinder(0.008 * k, 0.012 * k, 0.035 * k, 5), { color: shade(hc, 0.8), bone: B.tip, matrix: mul(bm, M(0, R * 0.3 + 0.012 * k, 0)) });
      return { top: tip.y + 0.04 * k, tip };
    }

    case 'tophat': {
      const base = new THREE.Vector3(C.x, C.y + R * 0.82, C.z - R * 0.02);
      const hm = M(base.x, base.y, base.z, -0.06, 0, 0.07);
      const crownH = R * 0.78;
      g.add(cylinder(R * 0.64, R * 0.6, crownH, seg(22, detail, 10)), {
        color: (p) => mix(shade(hc, 0.85), shade(hc, 1.15), smoothstep(base.y, base.y + crownH, p.y)),
        bone: B.head,
        matrix: mul(hm, M(0, crownH / 2, 0)),
      });
      g.add(cylinder(R * 0.98, R * 0.98, R * 0.06, seg(26, detail, 12)), { color: shade(hc, 0.9), bone: B.head, matrix: mul(hm, M(0, R * 0.03, 0, 0, 0, 0, 1, 1, 0.92)) });
      const bandCol = rand() < 0.5 ? '#b8413a' : GOLD;
      g.add(cylinder(R * 0.625, R * 0.612, R * 0.2, seg(22, detail, 10), true), { color: bandCol, bone: B.head, matrix: mul(hm, M(0, R * 0.17, 0)) });
      // holly sprig on the band
      const sp = mul(hm, M(R * 0.48, R * 0.2, R * 0.42, 0, 0.8, 0));
      g.add(ellipsoid(R * 0.16, R * 0.06, R * 0.03, 8, 5), { color: '#2f6b3f', bone: B.head, matrix: mul(sp, M(-R * 0.1, R * 0.02, 0, 0, 0, 0.5)) });
      g.add(ellipsoid(R * 0.16, R * 0.06, R * 0.03, 8, 5), { color: '#3f7a4a', bone: B.head, matrix: mul(sp, M(R * 0.1, R * 0.03, 0, 0, 0, -0.4)) });
      for (let i = 0; i < 3; i++) g.add(sphere(R * 0.045, 6, 5), { color: '#c0392b', bone: B.head, emit: 0.15, matrix: mul(sp, M((i - 1) * R * 0.05, -R * 0.02 + (i === 1 ? R * 0.05 : 0), R * 0.03)) });
      const tip = new THREE.Vector3(0, crownH, 0).applyMatrix4(hm);
      return { top: tip.y, tip: null };
    }

    case 'chef': {
      const white = hc;
      const base = new THREE.Vector3(C.x, C.y + R * 0.52, C.z - R * 0.02);
      const hm = M(base.x, base.y, base.z, -0.1, 0, 0);
      // pleated band
      g.add(ribbed(R * 0.93, R * 0.97, R * 0.34, seg(30, detail, 14), 14, 0.03), { color: shade(white, 0.92), bone: B.head, matrix: mul(hm, M(0, R * 0.17, 0)) });
      // puffy mushroom top (springy!)
      const puffY = R * 0.66;
      const top = new THREE.Vector3(0, puffY, 0).applyMatrix4(hm);
      const puffs = 6;
      for (let i = 0; i < puffs; i++) {
        const ang = (i / puffs) * Math.PI * 2;
        g.add(sphere(R * 0.4, seg(12, detail, 7), seg(9, detail, 5)), {
          color: (p) => mix(shade(white, 0.86), white, smoothstep(top.y - R * 0.3, top.y + R * 0.4, p.y)),
          bone: B.tip,
          matrix: mul(hm, M(Math.sin(ang) * R * 0.48, puffY + R * 0.1, Math.cos(ang) * R * 0.48)),
        });
      }
      g.add(sphere(R * 0.52, seg(14, detail, 8), seg(10, detail, 6)), { color: white, bone: B.tip, matrix: mul(hm, M(0, puffY + R * 0.3, 0)) });
      return { top: top.y + R * 0.82, tip: new THREE.Vector3(0, R * 0.42, 0).applyMatrix4(hm) };
    }

    case 'earmuffs': {
      const band = shade(hc, 0.55);
      g.add(torus(R * 1.1, R * 0.05, 5, seg(24, detail, 12), Math.PI), { color: band, bone: B.head, matrix: M(C.x, C.y - R * 0.02, C.z - R * 0.08, -0.12, 0, 0) });
      for (const s of [1, -1]) {
        const p = headSurf(h, s * 1.55, -0.08, R * 0.06).p;
        g.add(fluffy(R * 0.3, seg(11, detail, 7), seg(8, detail, 5), 0.12, 12, s * 3), {
          color: (q) => mix(shade(hc, 0.85), shade(hc, 1.12), smoothstep(p.y - R * 0.2, p.y + R * 0.3, q.y)),
          bone: B.head,
          matrix: M(p.x, p.y, p.z, 0, 0, 0, 0.75, 1, 1),
        });
      }
      return { top: headTop + R * 0.12, tip: null };
    }

    case 'hood': {
      const hoodGeo = shell(
        (dir) => {
          const ax = Math.abs(Math.atan2(dir.x, dir.z));
          const face = ax < 0.92 && dir.y < 0.58 && dir.y > -0.85;
          if (face || dir.y < -0.62) return R * 0.85;
          return R * (1.22 + 0.04 * Math.max(0, dir.y));
        },
        seg(26, detail, 12),
        seg(18, detail, 9),
        new THREE.Vector3(d.hsx, d.hsy * 1.04, d.hsz),
        R * 0.87,
      );
      g.add(hoodGeo, {
        color: (p) => mix(shade(hc, 0.75), shade(hc, 1.05), smoothstep(C.y - R, C.y + R, p.y)),
        bone: B.head,
        matrix: M(C.x, C.y + R * 0.02, C.z),
      });
      // drape down the back of the neck
      g.add(ellipsoid(R * 0.9, R * 0.62, R * 0.62, seg(14, detail, 8), seg(10, detail, 6)), {
        color: shade(hc, 0.8),
        bone: (p) => [B.head, B.chest, smoothstep(C.y - R * 0.5, C.y - R * 1.1, p.y)],
        matrix: M(C.x, C.y - R * 0.78, C.z - R * 0.62),
      });
      // fur trim around the face
      g.add(fluffyTorus(R * 0.88, R * 0.13, 5, seg(24, detail, 12), 0.22, 16), {
        color: CREAM,
        bone: B.head,
        matrix: M(C.x, C.y - R * 0.06, C.z + R * 0.74, -0.22, 0, 0, 1.12, 1.0, 1),
      });
      // a little pompom tassel on the back of the hood
      const tip = new THREE.Vector3(C.x, C.y + R * 1.0, C.z - R * 0.82);
      g.add(fluffy(R * 0.22, 10, 8, 0.14, 11, 1), { color: CREAM, bone: B.tip, matrix: M(tip.x, tip.y + R * 0.12, tip.z - R * 0.08) });
      return { top: C.y + R * 1.35, tip };
    }

    case 'cap': {
      const base = new THREE.Vector3(C.x, C.y + R * 0.3, C.z + R * 0.02);
      const hm = M(base.x, base.y, base.z, 0.1, 0, 0);
      g.add(cylinder(R * 1.07 * d.hsx, R * 1.11 * d.hsx, R * 0.38, seg(26, detail, 12), true), { color: shade(hc, 0.92), bone: B.head, matrix: mul(hm, M(0, R * 0.19, 0)) });
      g.add(ellipsoid(R * 1.2, R * 0.5, R * 1.26, seg(26, detail, 12), seg(12, detail, 6)), {
        color: (p) => mix(shade(hc, 0.88), shade(hc, 1.12), smoothstep(base.y, base.y + R * 0.9, p.y)),
        bone: B.head,
        matrix: mul(hm, M(0, R * 0.42, R * 0.08)),
      });
      // visor
      const visor = new THREE.CylinderGeometry(R * 0.72, R * 0.72, R * 0.05, seg(14, detail, 8), 1, false, -Math.PI / 2, Math.PI);
      visor.deleteAttribute('uv');
      g.add(visor, { color: shade(hc, 0.78), bone: B.head, matrix: mul(hm, M(0, R * 0.12, R * 0.82, 0.22, 0, 0, 1, 1, 0.75)) });
      g.add(sphere(R * 0.08, 6, 5), { color: shade(hc, 0.8), bone: B.head, matrix: mul(hm, M(0, R * 0.92, R * 0.08)) });
      return { top: base.y + R * 0.95, tip: null };
    }
  }
  return { top: headTop, tip: null };
}
