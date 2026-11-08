import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE as P } from '../palette';
import { fontsReady } from '../textures';
import { canvasTexture } from './fx';
import { BOX, CONE, CYL, SPH, TOR, Kit, T, catenary, cyl, lathe, mul, pt, rng, tube, type Col } from './kit';

/** Small reusable props. Every builder takes the landmark's Kit and a base matrix (local frame of the prop). */

export const IRON = '#2c2a31';
export const SNOW = '#eef2fb';
export const SNOW_SHADE = '#d7def0';

const _v = new THREE.Vector3();

/** Lumpy smooth blob (snow mounds, bushes, coal heaps). */
export function lump(seed: number, detail = 1, amount = 0.18): THREE.BufferGeometry {
  const r = rng(seed * 7919 + 13);
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const k = 1 + (r() - 0.5) * 2 * amount;
    pos.setXYZ(i, _v.x * k, _v.y * k, _v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function snowMound(kit: Kit, m: THREE.Matrix4, r: number, h: number, seed = 1) {
  kit.body.add(lump(seed, 1, 0.14), SNOW, mul(m, T(0, 0, 0, 0, seed, 0, r, h, r * 0.85)));
}

// ───────────────────────────── lights ─────────────────────────────

/** A hanging lantern centred at the origin of `m` (≈0.45 m tall). Returns the flame centre. */
export function lantern(kit: Kit, m: THREE.Matrix4, s = 1, color: Col = P.candle): THREE.Vector3 {
  const b = kit.metal;
  b.add(BOX(), IRON, mul(m, T(0, -0.2 * s, 0, 0, 0, 0, 0.27 * s, 0.04 * s, 0.27 * s)));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.add(BOX(), IRON, mul(m, T(x * 0.115 * s, 0, z * 0.115 * s, 0, 0, 0, 0.03 * s, 0.38 * s, 0.03 * s)));
  b.add(CONE(4), IRON, mul(m, T(0, 0.26 * s, 0, 0, Math.PI / 4, 0, 0.23 * s, 0.16 * s, 0.23 * s)));
  b.add(TOR(1, 0.25, 4, 8), IRON, mul(m, T(0, 0.37 * s, 0, 0, 0, 0, 0.05 * s)));
  kit.lit.add(BOX(), color, mul(m, T(0, 0, 0, 0, 0, 0, 0.2 * s, 0.34 * s, 0.2 * s)), 1.9);
  const c = pt(m, 0, 0, 0);
  kit.halos.push({ pos: c, color: P.warm, size: 1.4 * s, k: 0.5 });
  return c;
}

/** Iron lamp post with a hanging lantern on a crook. */
export function lanternPost(kit: Kit, m: THREE.Matrix4, h = 2.3, pool = true): THREE.Vector3 {
  const b = kit.metal;
  b.add(cyl(0.05, 0.065, h, 8), IRON, mul(m, T(0, h / 2, 0)));
  b.add(cyl(0.12, 0.14, 0.18, 8), IRON, mul(m, T(0, 0.09, 0)));
  b.add(SPH(8, 6), IRON, mul(m, T(0, h + 0.04, 0, 0, 0, 0, 0.07)));
  // crook arm
  const arm = [new THREE.Vector3(0, h - 0.3, 0), new THREE.Vector3(0.12, h - 0.06, 0), new THREE.Vector3(0.35, h - 0.02, 0), new THREE.Vector3(0.5, h - 0.12, 0)].map((p) => p.applyMatrix4(m));
  b.add(tube(arm, 0.022, 5), IRON);
  b.add(BOX(), IRON, mul(m, T(0.5, h - 0.2, 0, 0, 0, 0, 0.015, 0.16, 0.015)));
  const c = lantern(kit, mul(m, T(0.5, h - 0.5, 0)), 0.85);
  if (pool) kit.pool(m, 0.4, 0, 1.6, P.warm2, 0.35);
  return c;
}

/** Bulbs (and a dark wire) along a sagging string. */
export function stringLights(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, sag: number, opts: { spacing?: number; colors?: Col[]; halo?: number; r?: number } = {}) {
  const len = a.distanceTo(b);
  const n = Math.max(4, Math.round(len / 0.32));
  const pts = catenary(a, b, sag, n);
  kit.body.add(tube(pts, 0.009, 3), '#1f1a1c');
  const curve = new THREE.CatmullRomCurve3(pts);
  const spacing = (opts.spacing ?? 0.42) * (kit.detail >= 0.9 ? 1 : kit.detail >= 0.7 ? 1.2 : 1.6);
  const count = Math.max(2, Math.floor(curve.getLength() / spacing));
  const colors = opts.colors ?? [P.warm];
  for (let i = 1; i < count; i++) {
    const p = curve.getPointAt(i / count);
    p.y -= 0.045;
    kit.bulb(p, colors[i % colors.length], opts.r ?? 0.045, i % 2 === 0 ? (opts.halo ?? 0.55) : 0);
  }
}

// ───────────────────────────── furniture ─────────────────────────────

export function bench(kit: Kit, m: THREE.Matrix4, len = 1.6, snow = true) {
  const w = kit.body;
  const seatY = 0.4;
  for (let i = 0; i < 3; i++) w.add(BOX(), i % 2 ? P.woodLight : '#a5774f', mul(m, T(0, seatY, -0.14 + i * 0.14, 0, 0, 0, len, 0.045, 0.12)));
  for (let i = 0; i < 2; i++) w.add(BOX(), '#a5774f', mul(m, T(0, 0.62 + i * 0.16, -0.25, -0.12, 0, 0, len, 0.1, 0.035)));
  for (const x of [-len / 2 + 0.15, len / 2 - 0.15]) {
    kit.metal.add(BOX(), IRON, mul(m, T(x, seatY / 2, -0.12, 0, 0, 0, 0.05, seatY, 0.05)));
    kit.metal.add(BOX(), IRON, mul(m, T(x, seatY / 2, 0.14, 0, 0, 0, 0.05, seatY, 0.05)));
    kit.metal.add(BOX(), IRON, mul(m, T(x, 0.62, -0.27, -0.12, 0, 0, 0.05, 0.5, 0.05)));
    kit.metal.add(BOX(), IRON, mul(m, T(x, 0.12, 0.01, 0, 0, 0, 0.04, 0.04, 0.3)));
  }
  if (snow) {
    w.add(SPH(10, 5), SNOW, mul(m, T(len * 0.12, seatY + 0.03, 0.02, 0, 0, 0, len * 0.36, 0.045, 0.17)));
    w.add(BOX(), SNOW, mul(m, T(0, 0.8, -0.27, -0.12, 0, 0, len * 0.96, 0.035, 0.05)));
  }
}

export function barrel(kit: Kit, m: THREE.Matrix4, h = 0.9, r = 0.36, wood: Col = '#7d5233') {
  kit.body.add(
    lathe(
      [
        [0.001, 0],
        [r * 0.86, 0],
        [r * 0.95, h * 0.18],
        [r, h * 0.5],
        [r * 0.95, h * 0.82],
        [r * 0.86, h],
        [0.001, h],
      ],
      14,
    ),
    wood,
    m,
  );
  for (const y of [0.1, 0.34, 0.66, 0.9]) {
    const rr = y < 0.2 || y > 0.8 ? r * 0.9 : r * 0.99;
    kit.metal.add(cyl(rr + 0.012, rr + 0.012, 0.045, 14, true), '#3d3638', mul(m, T(0, y * h, 0)));
  }
  kit.body.add(CYL(14), '#5e3c24', mul(m, T(0, h + 0.004, 0, 0, 0, 0, r * 0.8, 0.01, r * 0.8)));
}

export function stool(kit: Kit, m: THREE.Matrix4, h = 0.52) {
  kit.body.add(CYL(10), P.woodLight, mul(m, T(0, h, 0, 0, 0, 0, 0.17, 0.05, 0.17)));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    kit.body.add(BOX(), P.wood, mul(m, T(Math.sin(a) * 0.1, h / 2, Math.cos(a) * 0.1, Math.cos(a) * 0.12, a, 0, 0.035, h, 0.035)));
  }
  kit.body.add(SPH(8, 4), SNOW, mul(m, T(0.03, h + 0.03, 0, 0, 0, 0, 0.12, 0.025, 0.1)));
}

export function mug(kit: Kit, m: THREE.Matrix4, color: Col = P.cream, drink: Col = '#5a1a1a') {
  kit.body.add(cyl(0.045, 0.04, 0.1, 8), color, mul(m, T(0, 0.05, 0)));
  kit.body.add(TOR(1, 0.22, 3, 6, Math.PI * 1.3), color, mul(m, T(0.045, 0.05, 0, 0, 0, -Math.PI * 0.65, 0.032)));
  kit.body.add(CYL(8), drink, mul(m, T(0, 0.092, 0, 0, 0, 0, 0.038, 0.004, 0.038)));
}

export function crate(kit: Kit, m: THREE.Matrix4, w = 0.6, h = 0.4, d = 0.45, wood: Col = '#a07448') {
  kit.body.add(BOX(), wood, mul(m, T(0, h / 2, 0, 0, 0, 0, w, h, d)));
  const dark = '#6e4a2c';
  for (const y of [0.04, h - 0.04]) {
    kit.body.add(BOX(), dark, mul(m, T(0, y, d / 2 + 0.005, 0, 0, 0, w + 0.01, 0.06, 0.02)));
    kit.body.add(BOX(), dark, mul(m, T(0, y, -d / 2 - 0.005, 0, 0, 0, w + 0.01, 0.06, 0.02)));
  }
  kit.body.add(BOX(), dark, mul(m, T(0, h / 2, d / 2 + 0.006, 0, 0, Math.atan2(h, w), Math.hypot(w, h) * 0.95, 0.05, 0.02)));
}

export function gift(kit: Kit, m: THREE.Matrix4, w: number, h: number, d: number, color: Col, ribbon: Col) {
  kit.body.add(BOX(), color, mul(m, T(0, h / 2, 0, 0, 0, 0, w, h, d)));
  kit.body.add(BOX(), ribbon, mul(m, T(0, h / 2, 0, 0, 0, 0, w + 0.012, h + 0.012, Math.min(0.07, d * 0.18))));
  kit.body.add(BOX(), ribbon, mul(m, T(0, h / 2, 0, 0, 0, 0, Math.min(0.07, w * 0.18), h + 0.014, d + 0.012)));
  const s = Math.min(w, d) * 0.22;
  kit.body.add(TOR(1, 0.32, 4, 8), ribbon, mul(m, T(-s * 0.7, h + s * 0.55, 0, 0, 0.3, 0.5, s)));
  kit.body.add(TOR(1, 0.32, 4, 8), ribbon, mul(m, T(s * 0.7, h + s * 0.55, 0, 0, -0.3, -0.5, s)));
  kit.body.add(SPH(5, 3), ribbon, mul(m, T(0, h + 0.02, 0, 0, 0, 0, s * 0.4)));
}

/** Small decorative fir with snow (and optional warm bulbs). */
export function pine(kit: Kit, m: THREE.Matrix4, h = 2.2, opts: { lights?: Col[]; seed?: number; snow?: boolean } = {}) {
  const r = rng((opts.seed ?? 3) * 131);
  const tiers = 4;
  kit.body.add(cyl(0.06 * h, 0.09 * h, 0.3 * h, 6), P.woodDark, mul(m, T(0, 0.15 * h, 0)));
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const y = 0.16 * h + f * 0.62 * h;
    const rad = (0.36 - f * 0.22) * h;
    const th = (0.38 - f * 0.05) * h;
    const yaw = r() * 3;
    kit.flat.add(CONE(9), i % 2 ? P.pine : '#2f5f4d', mul(m, T(0, y + th / 2, 0, 0, yaw, 0, rad, th, rad)));
    if (opts.snow !== false) kit.flat.add(CONE(9), SNOW, mul(m, T(0, y + th * 0.72, 0, 0, yaw, 0, rad * 0.6, th * 0.58, rad * 0.6)));
  }
  if (opts.lights) {
    const n = Math.round(10 * h);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = 0.2 * h + t * 0.72 * h;
      const rad = (0.34 - t * 0.27) * h * 0.92;
      const a = t * Math.PI * 7 + r();
      kit.bulb(pt(m, Math.sin(a) * rad, y - 0.05, Math.cos(a) * rad), opts.lights[i % opts.lights.length], 0.035, i % 3 === 0 ? 0.35 : 0);
    }
    kit.bulb(pt(m, 0, h * 0.97, 0), P.warm, 0.07, 0.9);
  }
}

/**
 * Gable roof along local X (ridge parallel to X), eaves at y=0 of `m`, ridge at `rise`.
 * Snow on both slopes, a rounded snow lip and icicles on the eaves.
 */
export function gableRoof(
  kit: Kit,
  m: THREE.Matrix4,
  w: number,
  d: number,
  rise: number,
  opts: { color?: Col; overhang?: number; snow?: boolean; icicles?: boolean; seed?: number; thickness?: number; snowCover?: number } = {},
) {
  const cover = opts.snowCover ?? 0.96;
  const o = opts.overhang ?? 0.3;
  const th = opts.thickness ?? 0.09;
  const half = d / 2 + o;
  const ang = Math.atan2(rise, d / 2);
  const slope = half / Math.cos(ang);
  const color = opts.color ?? P.roof;
  const r = rng((opts.seed ?? 1) * 977);
  for (const side of [-1, 1]) {
    const cz = (side * half) / 2;
    const cy = rise - (rise * (half / 2)) / (d / 2);
    const rot = side * ang;
    kit.body.add(BOX(), color, mul(m, T(0, cy, cz, rot, 0, 0, w + o * 2, th, slope)));
    // shingle rows (subtle)
    for (let k = 1; k < 4; k++) {
      const f = k / 4 - 0.5;
      kit.body.add(BOX(), '#4b2f22', mul(m, T(0, cy, cz, rot), T(0, 0, f * slope, 0, 0, 0, w + o * 2 + 0.01, th + 0.012, 0.03)));
    }
    if (opts.snow !== false) {
      const sl = slope * cover;
      kit.body.add(BOX(), SNOW, mul(m, T(0, cy, cz, rot, 0, 0, 1, 1, 1), T(0, th * 0.5 + 0.045, -side * (0.04 + (slope - sl) / 2), 0, 0, 0, w + o * 2 - 0.06, 0.09, sl)));
      const ez = side * half * 0.985;
      const ey = rise - (rise * (half * 0.985)) / (d / 2) + 0.06;
      if (cover > 0.9) {
        // rounded lip at the eave
        kit.body.add(CYL(8), SNOW, mul(m, T(0, ey, ez, 0, 0, Math.PI / 2, 0.07, w + o * 2 - 0.04, 0.07)));
      } else {
        // soft rounded lower edge of the snow
        const t = 1 - cover;
        const lz = side * half * (t + 0.02);
        const ly = rise - (rise * Math.abs(lz)) / (d / 2) + th * 0.5 + 0.06;
        kit.body.add(CYL(8), SNOW, mul(m, T(0, ly, lz, 0, 0, Math.PI / 2, 0.06, w + o * 2 - 0.08, 0.06)));
      }
      if (opts.icicles !== false) {
        const n = Math.round((w + o * 2) / 0.22);
        for (let i = 0; i < n; i++) {
          if (r() < 0.35) continue;
          const x = -w / 2 - o + 0.1 + (i / n) * (w + o * 2 - 0.2) + (r() - 0.5) * 0.08;
          const L = 0.08 + r() * 0.22;
          kit.gloss.add(CONE(5), P.ice, mul(m, T(x, ey - 0.04 - L / 2, ez, Math.PI, 0, 0, 0.025, L, 0.025)));
        }
      }
    }
  }
  // ridge cap
  kit.body.add(BOX(), '#4b2f22', mul(m, T(0, rise + th * 0.4, 0, Math.PI / 4, 0, 0, w + o * 2 + 0.04, 0.12, 0.12)));
  if (opts.snow !== false) kit.body.add(CYL(8), SNOW, mul(m, T(0, rise + th + 0.06, 0, 0, 0, Math.PI / 2, 0.1, w + o * 2, 0.1)));
}

/** Triangle gable wall (in the XY plane of `m`, base on y=0, apex at `rise`), thickness along z. */
export function gableWall(kit: Kit, m: THREE.Matrix4, w: number, rise: number, color: Col, t = 0.08) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  kit.body.add(g, color, m);
}

/** Horizontal-log wall along local X (length L, height H), centred on x. */
export function logWall(kit: Kit, m: THREE.Matrix4, L: number, H: number, wood: Col = P.wood, seed = 1) {
  const r = 0.11;
  const n = Math.ceil(H / (r * 1.8));
  const rn = rng(seed * 31);
  for (let i = 0; i < n; i++) {
    const shade = new THREE.Color(wood).multiplyScalar(0.88 + rn() * 0.22);
    kit.body.add(CYL(7), shade, mul(m, T(0, r + i * r * 1.8, 0, 0, 0, Math.PI / 2, r, L + 0.3, r)));
    // cut ends
    for (const sx of [-1, 1]) kit.body.add(cyl(r * 0.82, r * 0.82, 0.01, 6), '#c79a6a', mul(m, T(sx * (L / 2 + 0.151), r + i * r * 1.8, 0, 0, 0, Math.PI / 2)));
  }
}

/** Plank wall: vertical boards along local X. */
export function plankWall(kit: Kit, m: THREE.Matrix4, L: number, H: number, wood: Col = P.wood, seed = 1, t = 0.07) {
  const rn = rng(seed * 53);
  const n = Math.max(2, Math.round(L / 0.22));
  const bw = L / n;
  for (let i = 0; i < n; i++) {
    const shade = new THREE.Color(wood).multiplyScalar(0.86 + rn() * 0.26);
    kit.body.add(BOX(), shade, mul(m, T(-L / 2 + bw * (i + 0.5), H / 2, 0, 0, 0, 0, bw - 0.012, H, t)));
  }
}

// ───────────────────────────── signs ─────────────────────────────

export interface SignStyle {
  bg?: string;
  fg?: string;
  border?: string | null;
  sub?: string;
  font?: string;
  /** Canvas px width (height follows the aspect). */
  px?: number;
  /** Ornaments on both sides of the title. */
  stars?: boolean;
  /** Painted wood grain. */
  grain?: boolean;
  /** Emissive multiplier: > 1 makes the sign glow (lit sign). 0 = lit by the scene (Lambert). */
  lit?: number;
  /** Rounded corners ratio. */
  round?: number;
  /** Line-art drawing in the corners / custom painter after the text. */
  paint?: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Multi-line body (chalkboard). */
  lines?: string[];
  chalk?: boolean;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export function paintSign(text: string, w: number, h: number, s: SignStyle) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    const rad = Math.min(W, H) * (s.round ?? 0.16);
    if (s.bg) {
      g.fillStyle = s.bg;
      g.beginPath();
      g.roundRect(3, 3, W - 6, H - 6, rad);
      g.fill();
      if (s.grain) {
        g.save();
        g.clip();
        g.globalAlpha = 0.1;
        g.strokeStyle = '#000';
        const r = rng(text.length * 17 + 3);
        for (let i = 0; i < 26; i++) {
          g.lineWidth = 1 + r() * 2;
          const y = r() * H;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 10, W * 0.7, y + (r() - 0.5) * 10, W, y + (r() - 0.5) * 6);
          g.stroke();
        }
        g.restore();
      }
      if (s.chalk) {
        g.save();
        g.globalAlpha = 0.06;
        g.fillStyle = '#fff';
        const r = rng(99);
        for (let i = 0; i < 40; i++) g.fillRect(r() * W, r() * H, 30 + r() * 80, 2 + r() * 6);
        g.restore();
      }
    }
    if (s.border) {
      g.lineWidth = Math.max(4, H * 0.045);
      g.strokeStyle = s.border;
      g.beginPath();
      const inset = g.lineWidth * 1.4;
      g.roundRect(inset, inset, W - inset * 2, H - inset * 2, rad * 0.75);
      g.stroke();
    }
    const family = s.font ?? '"Fraunces", Georgia, serif';
    g.fillStyle = s.fg ?? '#3a2416';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const hasSub = !!s.sub;
    const lines = s.lines ?? [];
    const titleY = lines.length ? H * 0.17 : hasSub ? H * 0.42 : H * 0.53;
    let size = Math.round(H * (lines.length ? 0.17 : hasSub ? 0.42 : 0.55));
    const maxW = W * (s.stars || s.paint ? 0.72 : 0.88);
    g.font = `700 ${size}px ${family}`;
    while (g.measureText(text).width > maxW && size > 10) {
      size -= 2;
      g.font = `700 ${size}px ${family}`;
    }
    g.fillText(text, W / 2, titleY);
    if (s.stars) {
      const tw = g.measureText(text).width;
      const r = size * 0.24;
      star(g, W / 2 - tw / 2 - r * 2.6, titleY, r);
      star(g, W / 2 + tw / 2 + r * 2.6, titleY, r);
    }
    if (hasSub) {
      let ss = Math.round(H * 0.17);
      g.font = `600 ${ss}px "Nunito", system-ui, sans-serif`;
      while (g.measureText(s.sub!).width > W * 0.84 && ss > 8) {
        ss -= 1;
        g.font = `600 ${ss}px "Nunito", system-ui, sans-serif`;
      }
      g.globalAlpha = 0.9;
      g.fillText(s.sub!, W / 2, H * 0.76);
      g.globalAlpha = 1;
    }
    if (lines.length) {
      const lh = (H * 0.74) / Math.max(lines.length, 4);
      lines.forEach((line, i) => {
        let ls = Math.round(lh * 0.7);
        g.font = `600 ${ls}px ${s.chalk ? '"Nunito", system-ui, sans-serif' : family}`;
        while (g.measureText(line).width > W * 0.86 && ls > 8) {
          ls -= 1;
          g.font = `600 ${ls}px "Nunito", system-ui, sans-serif`;
        }
        g.fillText(line, W / 2, H * 0.34 + lh * (i + 0.5));
      });
    }
    s.paint?.(g, W, H);
  };
}

/**
 * A painted sign: a plane w × h (metres) facing local +Z. Repaints once the web fonts are loaded.
 * Returns the mesh; its material is a MeshBasicMaterial when `lit` (dimmable through `.color`).
 */
export function signMesh(text: string, w: number, h: number, s: SignStyle = {}): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial | THREE.MeshLambertMaterial> {
  const W = s.px ?? 512;
  const H = Math.max(32, Math.round((W * h) / w));
  const make = () => canvasTexture(W, H, paintSign(text, w, h, s));
  const tex = make();
  const transparent = !s.bg;
  const material = s.lit
    ? new THREE.MeshBasicMaterial({ map: tex, transparent, alphaTest: transparent ? 0.05 : 0 })
    : new THREE.MeshLambertMaterial({ map: tex, transparent, alphaTest: transparent ? 0.05 : 0 });
  if (s.lit && material instanceof THREE.MeshBasicMaterial) {
    material.color.setScalar(s.lit);
    material.userData.lit = s.lit;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.name = 'sign';
  fontsReady().then(() => {
    const t = make();
    material.map = t;
    material.needsUpdate = true;
    tex.dispose();
  });
  return mesh;
}

/** Dims a lit sign made by signMesh (k 0..1). */
export function setSignLevel(mesh: THREE.Mesh, k: number, off = 0.25) {
  const m = mesh.material as THREE.MeshBasicMaterial;
  const lit = m.userData?.lit as number | undefined;
  if (!lit) return;
  m.color.setScalar(lit * (off + (1 - off) * k));
}

/** Wooden board behind a sign (+ two hanging chains). */
export function signBoard(kit: Kit, m: THREE.Matrix4, w: number, h: number, opts: { wood?: Col; chains?: number; depth?: number } = {}) {
  const d = opts.depth ?? 0.06;
  kit.body.add(BOX(), opts.wood ?? P.woodDark, mul(m, T(0, 0, -d / 2 - 0.004, 0, 0, 0, w + 0.1, h + 0.1, d)));
  if (opts.chains) {
    for (const sx of [-1, 1]) kit.metal.add(BOX(), '#8c7a52', mul(m, T(sx * w * 0.38, h / 2 + opts.chains / 2, -d / 2, 0, 0, 0, 0.02, opts.chains, 0.02)));
  }
}
