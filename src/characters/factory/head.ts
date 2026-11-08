import * as THREE from 'three';
import type { CharacterAppearance } from '../../config/types';
import { B, type Dims } from './dims';
import { GeoBuilder, M, MY, capsule, cylinder, ellipsoid, fluffy, mul, seg, shell, sphere, torus } from './geo';
import { CREAM, GOLD, INK, mix, shade } from './colors';
import { smoothstep } from '../util';

/**
 * Head, face & hair. Coordinates are the character's bind pose (model space, facing +Z).
 * The face is deliberately simple and readable from far away: two big dark oval eyes with a highlight,
 * a tiny smile, rosy cheeks, a little cold nose.
 */
export interface HeadCtx {
  g: GeoBuilder;
  a: Required<CharacterAppearance>;
  d: Dims;
  detail: number;
  rand: () => number;
  /** Head centre (model space). */
  C: THREE.Vector3;
  R: number;
}

export interface FaceInfo {
  /** Eye bone pivot (model space). */
  eyes: THREE.Vector3;
  mouth: THREE.Vector3;
  brows: THREE.Vector3;
  /** Front of the mouth (breath puffs, mugs). */
  mouthFront: THREE.Vector3;
}

/** Point on the head ellipsoid at azimuth `ax` (0 = front, + = toward +X) and elevation `ay`. */
export function headSurf(h: HeadCtx, ax: number, ay: number, lift = 0): { p: THREE.Vector3; n: THREE.Vector3 } {
  const { C, R, d } = h;
  const ux = Math.sin(ax) * Math.cos(ay);
  const uy = Math.sin(ay);
  const uz = Math.cos(ax) * Math.cos(ay);
  const rx = R * d.hsx;
  const ry = R * d.hsy;
  const rz = R * d.hsz;
  const n = new THREE.Vector3(ux / rx, uy / ry, uz / rz).normalize();
  const p = new THREE.Vector3(C.x + ux * rx, C.y + uy * ry, C.z + uz * rz).addScaledVector(n, lift);
  return { p, n };
}

/** Matrix placing a part on the head surface, its local +Z along the surface normal. */
function onSurf(h: HeadCtx, ax: number, ay: number, lift: number, roll = 0, sx = 1, sy = sx, sz = sx) {
  const { p, n } = headSurf(h, ax, ay, lift);
  const yaw = Math.atan2(n.x, n.z);
  const pitch = -Math.asin(THREE.MathUtils.clamp(n.y, -1, 1));
  return MY(p.x, p.y, p.z, pitch, yaw, roll, sx, sy, sz);
}

export function buildHeadAndFace(h: HeadCtx): FaceInfo {
  const { g, a, d, detail, C, R, rand } = h;
  const k = d.hk;
  const skin = a.skin;
  // head: a soft mochi
  g.add(ellipsoid(R * d.hsx, R * d.hsy, R * d.hsz, seg(24, detail, 11), seg(17, detail, 8)), {
    color: (p) => {
      // subtle warm gradient: a touch rosier on the lower face
      const t = smoothstep(C.y + R * 0.2, C.y - R * 0.8, p.y);
      return mix(skin, mix(skin, '#f2a39a', 0.35), t * 0.35);
    },
    bone: B.head,
    emit: 0.07,
    matrix: M(C.x, C.y, C.z),
  });

  // eyes
  const EAX = 0.37;
  const EAY = -0.1;
  const eyeCol = '#1d1412';
  const eyeL = onSurf(h, EAX, EAY, -0.006 * k);
  const eyeR = onSurf(h, -EAX, EAY, -0.006 * k);
  for (const em of [eyeL, eyeR]) {
    g.add(ellipsoid(0.031 * k, 0.044 * k, 0.02 * k, seg(10, detail, 6), seg(8, detail, 5)), { color: eyeCol, bone: B.eyes, matrix: em });
    // big highlight (upper, toward +X like a single light source) + a tiny one below
    g.add(sphere(0.0115 * k, 6, 4), { color: '#ffffff', bone: B.eyes, emit: 0.9, matrix: mul(em, M(0.011 * k, 0.016 * k, 0.016 * k)) });
    if (detail >= 0.7) g.add(sphere(0.006 * k, 4, 3), { color: '#ffffff', bone: B.eyes, emit: 0.7, matrix: mul(em, M(-0.009 * k, -0.017 * k, 0.017 * k)) });
  }
  // lashes on some faces: a small flick at the outer corner
  if (rand() < 0.45) {
    for (const s of [1, -1]) {
      const m = mul(onSurf(h, s * (EAX + 0.13), EAY + 0.12, 0.002 * k), M(0, 0, 0, 0, 0, s * -0.9));
      g.add(capsule(0.0055 * k, 0.018 * k, 1, 4), { color: eyeCol, bone: B.eyes, matrix: m });
    }
  }
  const eyeP = headSurf(h, 0, EAY).p;
  const eyes = new THREE.Vector3(0, eyeP.y, C.z);

  // brows (most people)
  const browC = shade(a.hair, a.hairStyle === 'bald' ? 1.1 : 0.8);
  const browY = EAY + 0.25;
  if (rand() < 0.75 || a.hairStyle === 'bald') {
    for (const s of [1, -1]) {
      // a soft arch, the inner end a touch higher (kind, not grumpy)
      const m = mul(onSurf(h, s * (EAX + 0.02), browY, 0.0015 * k), M(0, -0.03 * k, 0, 0, 0, Math.PI / 2 - 0.55 - s * 0.12));
      g.add(torus(0.034 * k, 0.0062 * k, 3, 6, 1.1), { color: browC, bone: B.brows, matrix: m });
    }
  }
  const brows = new THREE.Vector3(0, headSurf(h, 0, browY).p.y, C.z);

  // cold little nose
  g.add(ellipsoid(0.024 * k, 0.019 * k, 0.018 * k, 6, 4), { color: mix(skin, '#e8746c', 0.32), bone: B.head, matrix: onSurf(h, 0, -0.25, 0.004 * k) });

  // rosy cheeks (slightly self-lit so they stay visible at dusk)
  for (const s of [1, -1]) {
    g.add(ellipsoid(0.044 * k, 0.027 * k, 0.012 * k, 6, 4), {
      color: mix(skin, '#f06f78', 0.6),
      bone: B.head,
      emit: 0.16,
      matrix: onSurf(h, s * 0.64, -0.3, -0.003 * k),
    });
  }

  // mouth: a tiny smile (smile bone) + an open mouth that scales in when talking (mouth bone)
  const beard = !!a.beard;
  const MAY = -0.45;
  const smileM = mul(onSurf(h, 0, MAY + 0.03, (beard ? 0.012 : 0.0015) * k), M(0, 0, 0, 0, 0, Math.PI));
  g.add(torus(0.017 * k, 0.0052 * k, 3, 8, Math.PI), { color: '#3a1c18', bone: B.smile, matrix: smileM });
  const mouthM = onSurf(h, 0, MAY, (beard ? 0.008 : -0.004) * k);
  g.add(ellipsoid(0.024 * k, 0.022 * k, 0.012 * k, 7, 5), { color: '#5a1f22', bone: B.mouth, matrix: mouthM });
  if (detail >= 0.7) g.add(ellipsoid(0.014 * k, 0.008 * k, 0.01 * k, 6, 3), { color: '#d9606a', bone: B.mouth, matrix: mul(mouthM, M(0, -0.011 * k, 0.004 * k)) });
  const mp = headSurf(h, 0, MAY).p;
  const mouth = new THREE.Vector3(0, mp.y, C.z);
  const mouthFront = headSurf(h, 0, MAY, 0.03).p;

  // ears (hidden by some hats / long hair)
  const earsHidden = a.hat === 'earmuffs' || a.hat === 'hood' || a.hairStyle === 'long' || a.hairStyle === 'bob';
  if (!earsHidden) {
    for (const s of [1, -1]) {
      g.add(ellipsoid(0.034 * k, 0.046 * k, 0.026 * k, 5, 4), { color: mix(skin, '#e88a80', 0.15), bone: B.head, matrix: onSurf(h, s * 1.52, -0.12, -0.012 * k) });
    }
  }
  return { eyes, mouth, brows, mouthFront };
}

// ───────────────────────────── hair ─────────────────────────────

/** Azimuth of a direction (0 = front). */
const az = (d: THREE.Vector3) => Math.atan2(d.x, d.z);

/**
 * Hairline model: a direction is covered by hair when d.y > line(azimuth).
 * Uncovered directions are pulled inside the head (invisible) → a clean, rounded hairline.
 */
function hairShell(h: HeadCtx, line: (a: number, d: THREE.Vector3) => number, thick: (d: THREE.Vector3) => number, color: (d: THREE.Vector3) => THREE.Color, bone: number = B.head) {
  const { g, C, R, d, detail } = h;
  const ws = seg(30, detail, 12);
  const hs = seg(20, detail, 9);
  const geo = shell(
    (dir) => {
      const l = line(az(dir), dir);
      const t = smoothstep(l - 0.07, l + 0.015, dir.y);
      return R * (0.86 + (thick(dir) - 0.86) * t);
    },
    ws,
    hs,
    new THREE.Vector3(d.hsx, d.hsy, d.hsz),
    R * 0.875,
  );
  const dir = new THREE.Vector3();
  g.add(geo, {
    color: (p) => color(dir.copy(p).sub(C).normalize()),
    bone,
    matrix: M(C.x, C.y, C.z),
  });
}

/** Blend helper on |azimuth|: front value → side value → back value. */
function band(a: number, front: number, side: number, back: number, fEnd = 0.95, sStart = 1.25, sEnd = 1.85, bStart = 2.3) {
  const x = Math.abs(a);
  if (x <= fEnd) return front;
  if (x <= sStart) return front + (side - front) * smoothstep(fEnd, sStart, x);
  if (x <= sEnd) return side;
  if (x <= bStart) return side + (back - side) * smoothstep(sEnd, bStart, x);
  return back;
}

export function buildHair(h: HeadCtx) {
  const { g, a, C, R, d, detail, rand } = h;
  const k = d.hk;
  const hair = a.hair;
  const hatOn = a.hat !== 'none';
  const dark = shade(hair, 0.72);
  const light = shade(hair, 1.18);
  const gradient = (dir: THREE.Vector3) => mix(dark, light, smoothstep(-0.7, 0.95, dir.y) * 0.85);
  // under a hat, keep the volume below the hat line
  const capT = (t: number, dir: THREE.Vector3) => (hatOn && dir.y > 0.3 ? Math.min(t, 1.06) : t);
  const part = rand() < 0.5 ? 1 : -1;

  switch (a.hairStyle) {
    case 'short': {
      hairShell(
        h,
        (x) => band(x, 0.4 + 0.14 * part * (x / 0.95) + 0.05 * Math.abs(Math.sin(x * 7)), 0.08, -0.5),
        (dir) => capT(1.075 + 0.05 * Math.max(0, dir.y), dir),
        gradient,
      );
      break;
    }
    case 'bob': {
      hairShell(
        h,
        (x) => band(x, 0.3 + 0.03 * Math.abs(Math.sin(x * 9)), -0.72, -0.8, 0.85, 1.1),
        (dir) => capT(1.08 + 0.14 * smoothstep(0.15, -0.75, dir.y), dir),
        gradient,
      );
      break;
    }
    case 'long': {
      hairShell(
        h,
        (x) => band(x, 0.48 - 0.2 * Math.min(1, Math.abs(x) / 0.95), -0.65, -0.9, 0.95, 1.15),
        (dir) => capT(1.08 + 0.04 * Math.max(0, dir.y), dir),
        gradient,
      );
      // curtain of hair down the back (sways with the tail spring)
      const top = C.y - R * 0.1;
      const bot = C.y - R * 1.85;
      g.add(ellipsoid(R * 0.98, R * 1.0, R * 0.55, seg(12, detail, 7), seg(9, detail, 5)), {
        color: (p) => mix(dark, hair, smoothstep(bot, top, p.y)),
        bone: (p) => [B.head, B.tail, smoothstep(top, bot, p.y)],
        matrix: M(0, C.y - R * 0.85, C.z - R * 0.5),
      });
      // two locks framing the face
      for (const s of [1, -1]) {
        g.add(ellipsoid(R * 0.26, R * 0.78, R * 0.3, 7, 6), {
          color: (p) => mix(dark, hair, smoothstep(C.y - R * 1.4, C.y, p.y)),
          bone: (p) => [B.head, B.tail, smoothstep(C.y - R * 0.3, C.y - R * 1.4, p.y) * 0.5],
          matrix: M(s * R * 0.9, C.y - R * 0.62, C.z + R * 0.12, 0, 0, s * -0.08),
        });
      }
      break;
    }
    case 'bun': {
      hairShell(h, (x) => band(x, 0.5, 0.0, -0.52), (dir) => capT(1.05 + 0.02 * Math.max(0, dir.y), dir), gradient);
      const bunPos = hatOn ? new THREE.Vector3(0, C.y - R * 0.05, C.z - R * 1.05) : new THREE.Vector3(0, C.y + R * 0.78, C.z - R * 0.42);
      g.add(fluffy(R * 0.4, seg(12, detail, 7), seg(9, detail, 5), 0.06, 11, 2), {
        color: (p) => mix(hair, light, smoothstep(bunPos.y - R * 0.3, bunPos.y + R * 0.4, p.y)),
        bone: B.head,
        matrix: M(bunPos.x, bunPos.y, bunPos.z),
      });
      const tie = hatOn ? M(bunPos.x, bunPos.y, bunPos.z + R * 0.3, 0, 0, 0) : M(bunPos.x, bunPos.y - R * 0.26, bunPos.z + R * 0.12, Math.PI / 2 - 0.5, 0, 0);
      g.add(torus(R * 0.24, R * 0.06, 5, 12), { color: a.hatColor === '#ffffff' ? GOLD : a.hatColor, bone: B.head, matrix: tie });
      break;
    }
    case 'ponytail': {
      hairShell(h, (x) => band(x, 0.42 + 0.1 * part * (x / 0.95), 0.0, -0.5), (dir) => capT(1.06 + 0.03 * Math.max(0, dir.y), dir), gradient);
      const tieP = new THREE.Vector3(0, C.y + R * (hatOn ? -0.05 : 0.25), C.z - R * 1.02);
      g.add(torus(R * 0.16, R * 0.06, 5, 10), { color: a.scarf ?? a.hatColor, bone: B.head, matrix: M(tieP.x, tieP.y, tieP.z, 0.3, 0, 0) });
      // the tail itself hangs from the tie and swings on the spring bone
      g.add(ellipsoid(R * 0.27, R * 0.62, R * 0.28, seg(9, detail, 6), seg(9, detail, 6)), {
        color: (p) => mix(hair, dark, smoothstep(tieP.y, tieP.y - R * 1.1, p.y)),
        bone: (p) => [B.head, B.tail, smoothstep(tieP.y + R * 0.1, tieP.y - R * 0.3, p.y)],
        matrix: M(0, tieP.y - R * 0.55, tieP.z - R * 0.16, -0.25, 0, 0),
      });
      break;
    }
    case 'braids': {
      hairShell(h, (x) => band(x, 0.46 - 0.08 * Math.min(1, Math.abs(x) * 3), -0.15, -0.55), (dir) => capT(1.06, dir), gradient);
      for (const s of [1, -1]) {
        let p = new THREE.Vector3(s * R * 0.92, C.y - R * 0.5, C.z - R * 0.15);
        const sizes = [0.26, 0.24, 0.22, 0.2, 0.17];
        sizes.forEach((sz, i) => {
          const pos = p.clone();
          g.add(ellipsoid(R * sz, R * sz * 1.15, R * sz, 7, 5), {
            color: i % 2 ? hair : dark.clone().lerp(new THREE.Color(hair), 0.4),
            bone: i === 0 ? B.head : B.tail,
            matrix: M(pos.x, pos.y, pos.z, 0.2, 0, s * 0.15),
          });
          p = p.add(new THREE.Vector3(s * R * 0.04, -R * 0.36, R * 0.07));
        });
        g.add(torus(R * 0.12, R * 0.05, 5, 10), { color: a.scarf ?? a.hatColor, bone: B.tail, matrix: M(p.x, p.y + R * 0.15, p.z, Math.PI / 2, 0, 0) });
        g.add(fluffy(R * 0.14, 8, 6, 0.2, 13, s), { color: light, bone: B.tail, matrix: M(p.x, p.y - R * 0.02, p.z) });
      }
      break;
    }
    case 'curly': {
      hairShell(
        h,
        (x) => band(x, 0.36 + 0.09 * Math.abs(Math.sin(x * 8)), -0.32, -0.62),
        (dir) => capT(1.14 + 0.07 * Math.sin(dir.x * 13) * Math.sin(dir.y * 11 + 1) * Math.sin(dir.z * 12 + 2) + 0.05 * Math.max(0, dir.y), dir),
        gradient,
      );
      // a few loose curls around the face
      const curls = [
        [0.95, 0.3],
        [-0.95, 0.3],
        [1.35, -0.1],
        [-1.35, -0.1],
        [0.45, 0.62],
      ];
      for (const [ax, ay] of curls) {
        if (hatOn && ay > 0.5) continue;
        const { p } = headSurf(h, ax, ay, R * 0.1);
        g.add(fluffy(R * 0.16, 7, 5, 0.15, 10, ax), { color: hair, bone: B.head, matrix: M(p.x, p.y, p.z) });
      }
      break;
    }
    case 'bald': {
      // horseshoe of hair around the back, a shiny scalp
      hairShell(h, (x) => band(x, 2, 0.08, 0.12, 0.95, 1.2), (dir) => (dir.y > 0.14 || dir.y < -0.48 ? 0.86 : 1.06), () => shade(hair, 1.0));
      break;
    }
  }
}

export function buildBeard(h: HeadCtx) {
  const { g, a, C, R, d, detail } = h;
  if (!a.beard) return;
  const k = d.hk;
  const col = a.beard;
  const dark = shade(col, 0.82);
  const geo = shell(
    (dir) => {
      const x = Math.abs(az(dir));
      if (x > 1.75) return R * 0.86;
      // jawline rising into sideburns toward the ears
      const line = -0.43 + 0.17 * smoothstep(0.75, 1.55, x);
      const mouthHole = x < 0.3 && dir.y > -0.58 && dir.y < -0.3;
      if (dir.y > line || mouthHole) return R * 0.86;
      return R * (1.04 + 0.16 * smoothstep(-0.5, -0.95, dir.y) * (1 - smoothstep(0.9, 1.7, x)));
    },
    seg(26, detail, 12),
    seg(18, detail, 9),
    new THREE.Vector3(d.hsx, d.hsy, d.hsz),
    R * 0.875,
  );
  g.add(geo, { color: (p) => mix(dark, col, smoothstep(C.y - R * 1.1, C.y - R * 0.3, p.y)), bone: B.head, matrix: M(C.x, C.y, C.z) });
  // moustache
  for (const s of [1, -1]) {
    const m = mul(onSurf(h, s * 0.15, -0.33, 0.012 * k), M(0, 0, 0, 0, 0, s * 0.42));
    g.add(ellipsoid(0.048 * k, 0.019 * k, 0.02 * k, 10, 6), { color: col, bone: B.head, matrix: m });
  }
}

// ───────────────────────────── face accessories ─────────────────────────────

export function buildFaceAccessories(h: HeadCtx, face: FaceInfo) {
  const { g, a, d, R, rand } = h;
  const k = d.hk;
  if (a.accessory === 'glasses' || a.accessory === 'round-glasses') {
    const round = a.accessory === 'round-glasses';
    const frame = round ? GOLD : '#3a2a22';
    const rimR = (round ? 0.046 : 0.05) * k;
    const centers: THREE.Vector3[] = [];
    for (const s of [1, -1]) {
      const em = onSurf(h, s * 0.37, -0.1, 0.03 * k, 0, round ? 1 : 1.12, round ? 1 : 0.86, 1);
      g.add(torus(rimR, 0.0055 * k, 5, 18), { color: frame, bone: B.head, matrix: em });
      const c = new THREE.Vector3().setFromMatrixPosition(em);
      centers.push(c);
      // temple to the ear
      const ear = headSurf(h, s * 1.45, -0.02, 0.01 * k).p;
      const from = c.clone().add(new THREE.Vector3(s * rimR * 1.05, 0, -0.005));
      const mid = from.clone().lerp(ear, 0.5);
      const len = from.distanceTo(ear);
      const dir = ear.clone().sub(from).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const tm = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
      g.add(cylinder(0.004 * k, 0.004 * k, len, 4), { color: frame, bone: B.head, matrix: tm });
    }
    const mid = centers[0].clone().lerp(centers[1], 0.5);
    g.add(cylinder(0.004 * k, 0.004 * k, centers[0].distanceTo(centers[1]) - rimR * 2, 4), {
      color: frame,
      bone: B.head,
      matrix: M(mid.x, mid.y + 0.006 * k, mid.z, 0, 0, Math.PI / 2),
    });
  }
  if (a.accessory === 'pipe') {
    const m = mul(onSurf(h, -0.3, -0.47, 0.004 * k), M(0, -0.012 * k, 0.03 * k, 0.35, -0.35, 0));
    g.add(cylinder(0.006 * k, 0.007 * k, 0.07 * k, 6), { color: '#4a2c1a', bone: B.head, matrix: mul(m, M(0, 0, 0, Math.PI / 2, 0, 0)) });
    const bowl = mul(m, M(0, 0.012 * k, 0.04 * k));
    g.add(cylinder(0.019 * k, 0.015 * k, 0.04 * k, 8), { color: '#6b3f22', bone: B.head, matrix: bowl });
    g.add(cylinder(0.014 * k, 0.014 * k, 0.004 * k, 8), { color: '#ff8a3a', bone: B.head, emit: 2.2, matrix: mul(bowl, M(0, 0.019 * k, 0)) });
  }
  if (a.accessory === 'flower') {
    const onHat = a.hat !== 'none';
    const lift = onHat ? (a.hat === 'tophat' ? 0.07 : 0.045) * k : 0.03 * k;
    const m = onSurf(h, 1.05, onHat ? 0.42 : 0.3, R * 0.06 + lift, 0.3);
    const petal = rand() < 0.5 ? '#d94f45' : '#f2efe6';
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      g.add(ellipsoid(0.024 * k, 0.014 * k, 0.006 * k, 8, 5), {
        color: petal,
        bone: B.head,
        matrix: mul(m, M(Math.cos(ang) * 0.022 * k, Math.sin(ang) * 0.022 * k, 0, 0, 0, ang)),
      });
    }
    g.add(sphere(0.012 * k, 8, 6), { color: GOLD, bone: B.head, emit: 0.2, matrix: mul(m, M(0, 0, 0.004 * k)) });
    // two little leaves
    g.add(ellipsoid(0.022 * k, 0.01 * k, 0.004 * k, 6, 4), { color: '#2f6b3f', bone: B.head, matrix: mul(m, M(0.03 * k, -0.024 * k, -0.003 * k, 0, 0, -0.6)) });
  }
  void face;
  void INK;
  void CREAM;
}
