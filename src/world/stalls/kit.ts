import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * The chalet "kit": a tiny procedural modelling toolbox that batches every part of a chalet into a
 * handful of merged geometries (one per material), with vertex colours and *baked fake lighting*.
 *
 *  - solids  → MeshLambert + vertex colours + per-vertex warm light from the lamps (aGlowA/aGlowB)
 *  - glows   → unlit emissive parts (bulbs, lantern glass, flames, windows), one channel per light
 *  - quads   → textured quads mapped into the chalet's canvas atlas (product images, tags, chalk text)
 *  - halos   → additive soft billboards / light pools on the ground
 *
 * Everything is expressed in the chalet's local frame (front = +Z, origin on the ground at the centre).
 */

export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;
export type Paint = string | THREE.Color | ColorFn;
export type V3 = [number, number, number];

export interface Xf {
  /** Euler rotation (XYZ) or a yaw only. */
  r?: V3 | number;
  /** Scale multiplier (after the size of the primitive). */
  s?: number | V3;
  /** Colour jitter amount (0..0.2). */
  j?: number;
  /** Segment count override. */
  seg?: number;
}

// ───────────────────────────── colours ─────────────────────────────

const colorCache = new Map<string, THREE.Color>();
/** Linear colour from a CSS hex (cached, do not mutate). */
export function col(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}
export function toColor(p: string | THREE.Color): THREE.Color {
  return typeof p === 'string' ? col(p).clone() : p.clone();
}
/** Multiply (linear) — k < 1 darkens, k > 1 brightens (clamped). */
export function tint(p: string | THREE.Color, k: number): THREE.Color {
  const c = toColor(p).multiplyScalar(k);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return c;
}
export function mixC(a: string | THREE.Color, b: string | THREE.Color, t: number): THREE.Color {
  return toColor(a).lerp(toColor(b), t);
}
export function jitterColor(c: THREE.Color, amount: number, rand: () => number): THREE.Color {
  if (amount <= 0) return c;
  const out = c.clone();
  out.offsetHSL((rand() - 0.5) * amount * 0.12, (rand() - 0.5) * amount * 0.3, 0);
  out.multiplyScalar(1 + (rand() - 0.5) * 2 * amount);
  return out;
}

// ───────────────────────────── random ─────────────────────────────

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickOf<T>(arr: readonly T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
}

// ───────────────────────────── transforms ─────────────────────────────

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export function xf(x: number, y: number, z: number, r?: V3 | number, s?: number | V3, out = new THREE.Matrix4()): THREE.Matrix4 {
  _p.set(x, y, z);
  if (r === undefined) _q.identity();
  else if (typeof r === 'number') _q.setFromEuler(_e.set(0, r, 0));
  else _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  if (s === undefined) _s.set(1, 1, 1);
  else if (typeof s === 'number') _s.setScalar(s);
  else _s.set(s[0], s[1], s[2]);
  return out.compose(_p, _q, _s);
}

function scaleOf(s: number | V3 | undefined): V3 {
  if (s === undefined) return [1, 1, 1];
  if (typeof s === 'number') return [s, s, s];
  return s;
}

// ───────────────────────────── geometry templates ─────────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Cached, non-indexed template geometry (position + normal + uv). Never dispose these. */
export function tpl(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    const raw = make();
    g = raw.index ? raw.toNonIndexed() : raw;
    if (g !== raw) raw.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return g;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export const G = {
  box: () => tpl('box', () => new THREE.BoxGeometry(1, 1, 1)),
  plane: () => tpl('plane', () => new THREE.PlaneGeometry(1, 1)),
  sphere: (w: number, h: number) => tpl(`sph|${w}|${h}`, () => new THREE.SphereGeometry(1, w, h)),
  /** Unit-height cylinder whose largest radius is 1. */
  cyl: (rt: number, rb: number, seg: number, open = false, ts = 0, tl = Math.PI * 2) => {
    const m = Math.max(rt, rb) || 1;
    const a = r2(rt / m);
    const b = r2(rb / m);
    return tpl(`cyl|${a}|${b}|${seg}|${open ? 1 : 0}|${r2(ts)}|${r2(tl)}`, () => new THREE.CylinderGeometry(a, b, 1, seg, 1, open, ts, tl));
  },
  cone: (seg: number) => tpl(`cone|${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
  torus: (ratio: number, rs: number, ts: number, arc = Math.PI * 2) =>
    tpl(`tor|${r2(ratio)}|${rs}|${ts}|${r2(arc)}`, () => new THREE.TorusGeometry(1, r2(ratio), rs, ts, arc)),
  ico: (d = 0) => tpl(`ico|${d}`, () => new THREE.IcosahedronGeometry(1, d)),
  dodeca: () => tpl('dod', () => new THREE.DodecahedronGeometry(1, 0)),
  octa: () => tpl('oct', () => new THREE.OctahedronGeometry(1, 0)),
  rbox: (w: number, h: number, d: number, r: number, seg = 2) =>
    tpl(`rbox|${r2(w)}|${r2(h)}|${r2(d)}|${r2(r)}|${seg}`, () => new RoundedBoxGeometry(r2(w), r2(h), r2(d), seg, r2(r))),
  /** Five-pointed star, extruded along +Z (depth 1), outer radius 1. */
  star: (inner = 0.45, points = 5) =>
    tpl(`star|${r2(inner)}|${points}`, () => {
      const s = new THREE.Shape();
      for (let i = 0; i < points * 2; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / points;
        const r = i % 2 === 0 ? 1 : inner;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    }),
  /** Flat star (single face toward +Z). */
  starFace: (inner = 0.45, points = 5) =>
    tpl(`starf|${r2(inner)}|${points}`, () => {
      const s = new THREE.Shape();
      for (let i = 0; i < points * 2; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / points;
        const r = i % 2 === 0 ? 1 : inner;
        if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      s.closePath();
      return new THREE.ShapeGeometry(s);
    }),
  /** Heart, extruded along +Z (depth 1), ~1 wide. */
  heart: () =>
    tpl('heart', () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.5);
      s.bezierCurveTo(-0.15, -0.32, -0.5, -0.12, -0.5, 0.14);
      s.bezierCurveTo(-0.5, 0.38, -0.24, 0.5, 0, 0.3);
      s.bezierCurveTo(0.24, 0.5, 0.5, 0.38, 0.5, 0.14);
      s.bezierCurveTo(0.5, -0.12, 0.15, -0.32, 0, -0.5);
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 });
    }),
  /** Holly leaf, flat-ish extruded along +Z, pointing +Y, length 1. */
  holly: () =>
    tpl('holly', () => {
      const s = new THREE.Shape();
      const pts: [number, number][] = [
        [0, 0], [0.16, 0.12], [0.3, 0.12], [0.24, 0.3], [0.34, 0.45], [0.2, 0.55], [0.24, 0.74], [0.08, 0.78], [0, 1],
        [-0.08, 0.78], [-0.24, 0.74], [-0.2, 0.55], [-0.34, 0.45], [-0.24, 0.3], [-0.3, 0.12], [-0.16, 0.12],
      ];
      s.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    }),
  /** Bell (lathe), height 1 from y=0 (mouth) to y=1 (top), max radius 1. */
  bell: (seg: number) =>
    tpl(`bell|${seg}`, () => {
      const pts = [
        new THREE.Vector2(0.001, 1),
        new THREE.Vector2(0.32, 0.98),
        new THREE.Vector2(0.48, 0.86),
        new THREE.Vector2(0.55, 0.62),
        new THREE.Vector2(0.66, 0.32),
        new THREE.Vector2(0.88, 0.1),
        new THREE.Vector2(1.0, 0.02),
        new THREE.Vector2(0.92, 0),
      ];
      return new THREE.LatheGeometry(pts, seg);
    }),
};

// ───────────────────────────── kit ─────────────────────────────

export interface Halo {
  pos: THREE.Vector3;
  /** Half extents (billboard: x/y in view space · flat: x/z on the ground). */
  sx: number;
  sy: number;
  color: THREE.Color;
  chan: number;
  flat: boolean;
  push: number;
}

export interface BakeLight {
  pos: THREE.Vector3;
  color: THREE.Color;
  radius: number;
  chan: number;
  /** Only lights surfaces inside the chalet. */
  interior: boolean;
  wrap: number;
}

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export class Kit {
  solids: THREE.BufferGeometry[] = [];
  /** Fine details (hidden at a distance): filled while `layer === 1`. */
  details: THREE.BufferGeometry[] = [];
  /** 0 = core geometry, 1 = fine details (LOD). */
  layer: 0 | 1 = 0;
  glows: THREE.BufferGeometry[] = [];
  quads: THREE.BufferGeometry[] = [];
  halos: Halo[] = [];
  lights: BakeLight[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private tmp = new THREE.Matrix4();

  constructor(
    readonly detail: number,
    readonly rand: () => number,
  ) {}

  get top(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  /** Enter a sub-frame (translation, rotation, uniform or per-axis scale). Always pair with pop(). */
  at(x: number, y: number, z: number, r?: V3 | number, s?: number | V3): this {
    this.stack.push(this.top.clone().multiply(xf(x, y, z, r, s)));
    return this;
  }
  pushMatrix(m: THREE.Matrix4): this {
    this.stack.push(this.top.clone().multiply(m));
    return this;
  }
  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  /** Run `fn` inside a sub-frame. */
  with(x: number, y: number, z: number, r: V3 | number | undefined, s: number | V3 | undefined, fn: () => void): void {
    this.at(x, y, z, r, s);
    try {
      fn();
    } finally {
      this.pop();
    }
  }

  /** Largest scale of the current frame. */
  get scale(): number {
    return this.top.getMaxScaleOnAxis();
  }

  /** Segment count scaled by detail. */
  seg(n: number, min = 3): number {
    return Math.max(min, Math.round(n * (0.55 + 0.45 * this.detail)));
  }

  /** Point of the current frame → chalet space. */
  point(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.top);
  }

  // ── solids ──

  add(template: THREE.BufferGeometry, paint: Paint, local?: THREE.Matrix4, jitter = 0): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', template.attributes.position.clone());
    g.setAttribute('normal', template.attributes.normal.clone());
    const m = local ? this.tmp.multiplyMatrices(this.top, local) : this.top;
    g.applyMatrix4(m);
    if (m.determinant() < 0) flipWinding(g);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    if (typeof paint === 'function') {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const p = new THREE.Vector3();
      const nn = new THREE.Vector3();
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        p.fromBufferAttribute(pos, i);
        nn.fromBufferAttribute(nor, i);
        paint(p, nn, c);
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
    } else {
      const c = jitterColor(toColor(paint), jitter, this.rand);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (this.layer ? this.details : this.solids).push(g);
  }

  /** Run `fn` with the detail layer on. */
  detailed(fn: () => void): void {
    const prev = this.layer;
    this.layer = 1;
    try {
      fn();
    } finally {
      this.layer = prev;
    }
  }

  box(w: number, h: number, d: number, paint: Paint, x: number, y: number, z: number, o: Xf = {}): void {
    const s = scaleOf(o.s);
    this.add(G.box(), paint, xf(x, y, z, o.r, [w * s[0], h * s[1], d * s[2]]), o.j ?? 0);
  }
  rbox(w: number, h: number, d: number, radius: number, paint: Paint, x: number, y: number, z: number, o: Xf = {}): void {
    this.add(G.rbox(w, h, d, radius, o.seg ?? 1), paint, xf(x, y, z, o.r, o.s), o.j ?? 0);
  }
  sphere(r: number, paint: Paint, x: number, y: number, z: number, o: Xf = {}): void {
    const s = scaleOf(o.s);
    const w = o.seg ?? this.seg(8, 5);
    this.add(G.sphere(w, Math.max(3, Math.round(w * 0.65))), paint, xf(x, y, z, o.r, [r * s[0], r * s[1], r * s[2]]), o.j ?? 0);
  }
  /** Very cheap tuft (octahedron) — pine ropes, wreath needles. */
  tuft(r: number, paint: Paint, x: number, y: number, z: number, o: Xf = {}): void {
    const s = scaleOf(o.s);
    this.add(G.octa(), paint, xf(x, y, z, o.r, [r * s[0], r * s[1], r * s[2]]), o.j ?? 0);
  }
  /** Cheap blob (icosahedron) — fluffy greenery, snow lumps, apples at a distance. */
  blob(r: number, paint: Paint, x: number, y: number, z: number, o: Xf = {}): void {
    const s = scaleOf(o.s);
    this.add(G.ico(0), paint, xf(x, y, z, o.r, [r * s[0], r * s[1], r * s[2]]), o.j ?? 0);
  }
  cyl(rt: number, rb: number, h: number, paint: Paint, x: number, y: number, z: number, o: Xf & { open?: boolean } = {}): void {
    const m = Math.max(rt, rb) || 1;
    const s = scaleOf(o.s);
    this.add(G.cyl(rt, rb, o.seg ?? this.seg(8, 4), o.open), paint, xf(x, y, z, o.r, [m * s[0], h * s[1], m * s[2]]), o.j ?? 0);
  }
  cone(r: number, h: number, paint: Paint, x: number, y: number, z: number, o: Xf = {}): void {
    const s = scaleOf(o.s);
    this.add(G.cone(o.seg ?? this.seg(8, 4)), paint, xf(x, y, z, o.r, [r * s[0], h * s[1], r * s[2]]), o.j ?? 0);
  }
  torus(R: number, tube: number, paint: Paint, x: number, y: number, z: number, o: Xf & { arc?: number; rs?: number; ts?: number } = {}): void {
    const s = scaleOf(o.s);
    this.add(
      G.torus(tube / R, o.rs ?? this.seg(5, 3), o.ts ?? this.seg(12, 6), o.arc),
      paint,
      xf(x, y, z, o.r, [R * s[0], R * s[1], R * s[2]]),
      o.j ?? 0,
    );
  }
  /** Rod (cylinder) between two points of the current frame. */
  rod(a: V3, b: V3, r: number, paint: Paint, seg = 5): void {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    const len = d.length();
    if (len < 1e-5) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const mid = va.add(vb).multiplyScalar(0.5);
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r, len, r));
    this.add(G.cyl(1, 1, seg), paint, m);
  }

  // ── glows ──

  glowAdd(template: THREE.BufferGeometry, color: string | THREE.Color, intensity: number, chan: number, local?: THREE.Matrix4): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', template.attributes.position.clone());
    g.setAttribute('normal', template.attributes.normal.clone());
    const m = local ? this.tmp.multiplyMatrices(this.top, local) : this.top;
    g.applyMatrix4(m);
    if (m.determinant() < 0) flipWinding(g);
    const n = g.attributes.position.count;
    const c = toColor(color).multiplyScalar(intensity);
    const arr = new Float32Array(n * 3);
    const ch = new Float32Array(n).fill(chan);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('aChan', new THREE.BufferAttribute(ch, 1));
    this.glows.push(g);
  }
  glowSphere(r: number, color: string, intensity: number, chan: number, x: number, y: number, z: number, o: Xf = {}): void {
    const s = scaleOf(o.s);
    const w = o.seg ?? this.seg(8, 5);
    this.glowAdd(G.sphere(w, Math.max(3, Math.round(w * 0.65))), color, intensity, chan, xf(x, y, z, o.r, [r * s[0], r * s[1], r * s[2]]));
  }
  glowBox(w: number, h: number, d: number, color: string, intensity: number, chan: number, x: number, y: number, z: number, o: Xf = {}): void {
    this.glowAdd(G.box(), color, intensity, chan, xf(x, y, z, o.r, [w, h, d]));
  }

  // ── quads (atlas) ──

  quad(w: number, h: number, rect: UVRect, x: number, y: number, z: number, r?: V3 | number): void {
    const t = G.plane();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', t.attributes.position.clone());
    g.setAttribute('normal', t.attributes.normal.clone());
    const uv = (t.attributes.uv as THREE.BufferAttribute).clone();
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    }
    g.setAttribute('uv', uv);
    g.applyMatrix4(this.tmp.multiplyMatrices(this.top, xf(x, y, z, r, [w, h, 1])));
    this.quads.push(g);
  }

  // ── lights ──

  /** Soft billboard glow. `size` = full width (scaled by the frame). */
  halo(x: number, y: number, z: number, size: number, color: string, intensity: number, chan: number, push = 0.2): void {
    const s = (size * this.scale) / 2;
    this.halos.push({ pos: this.point(x, y, z), sx: s, sy: s, color: toColor(color).multiplyScalar(intensity), chan, flat: false, push: push * this.scale });
  }
  /** Warm light pool on the ground (chalet y = 0), below the frame point (x, z). */
  pool(x: number, z: number, radius: number, color: string, intensity: number, chan: number, rz?: number): void {
    const p = this.point(x, 0, z);
    p.y = 0.03;
    const s = this.scale;
    this.halos.push({ pos: p, sx: radius * s, sy: (rz ?? radius) * s, color: toColor(color).multiplyScalar(intensity), chan, flat: true, push: 0 });
  }
  /** Baked fake point light (warms nearby surfaces of this chalet). */
  light(x: number, y: number, z: number, color: string, intensity: number, radius: number, chan: number, interior = false, wrap = 0.3): THREE.Vector3 {
    const p = this.point(x, y, z);
    this.lights.push({ pos: p, color: toColor(color).multiplyScalar(intensity), radius: radius * this.scale, chan, interior, wrap });
    return p;
  }
}

function flipWinding(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (const a of [pos, nor]) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
}

// ───────────────────────────── finalisation ─────────────────────────────

export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  for (const p of list) p.dispose();
  list.length = 0;
  return g;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Ambient occlusion (darker near the ground and inside the cabin) + baked warm light. Each vertex keeps
 * the two strongest light channels so lights can be switched/flickered independently in the shader.
 */
export function bakeLighting(geo: THREE.BufferGeometry, lights: BakeLight[], inside: (p: THREE.Vector3) => boolean): void {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const colA = geo.attributes.color as THREE.BufferAttribute;
  const n = pos.count;
  const A = new Float32Array(n * 4);
  const B = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const l = new THREE.Vector3();
  const sums = new Float32Array(8 * 3);
  const mags = new Float32Array(8);
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    nn.fromBufferAttribute(nor, i);
    const inner = inside(p);
    let k = 0.66 + 0.34 * smooth(0.0, 0.8, p.y);
    if (inner) k *= 0.6;
    colA.setXYZ(i, colA.getX(i) * k, colA.getY(i) * k, colA.getZ(i) * k);
    sums.fill(0);
    mags.fill(0);
    for (const L of lights) {
      if (L.interior && !inner) continue;
      l.subVectors(L.pos, p);
      const d = l.length();
      if (d >= L.radius) continue;
      if (d > 1e-5) l.divideScalar(d);
      const ndl = (nn.dot(l) + L.wrap) / (1 + L.wrap);
      if (ndl <= 0) continue;
      const f = Math.pow(1 - d / L.radius, 1.7) * ndl;
      const c = L.chan & 7;
      sums[c * 3] += L.color.r * f;
      sums[c * 3 + 1] += L.color.g * f;
      sums[c * 3 + 2] += L.color.b * f;
      mags[c] += f * (L.color.r + L.color.g + L.color.b);
    }
    let a = -1;
    let b = -1;
    for (let c = 0; c < 8; c++) {
      if (mags[c] <= 0) continue;
      if (a < 0 || mags[c] > mags[a]) {
        b = a;
        a = c;
      } else if (b < 0 || mags[c] > mags[b]) b = c;
    }
    if (a >= 0) {
      A[i * 4] = sums[a * 3];
      A[i * 4 + 1] = sums[a * 3 + 1];
      A[i * 4 + 2] = sums[a * 3 + 2];
      A[i * 4 + 3] = a;
    }
    if (b >= 0) {
      B[i * 4] = sums[b * 3];
      B[i * 4 + 1] = sums[b * 3 + 1];
      B[i * 4 + 2] = sums[b * 3 + 2];
      B[i * 4 + 3] = b;
    }
  }
  colA.needsUpdate = true;
  geo.setAttribute('aGlowA', new THREE.BufferAttribute(A, 4));
  geo.setAttribute('aGlowB', new THREE.BufferAttribute(B, 4));
}

/** One indexed quad per halo; the shader turns them into billboards / ground pools. */
export function haloGeometry(halos: Halo[]): THREE.BufferGeometry | null {
  if (!halos.length) return null;
  const n = halos.length;
  const pos = new Float32Array(n * 12);
  const corner = new Float32Array(n * 8);
  const size = new Float32Array(n * 8);
  const color = new Float32Array(n * 12);
  const chan = new Float32Array(n * 4);
  const flat = new Float32Array(n * 4);
  const push = new Float32Array(n * 4);
  const index: number[] = [];
  const C = [-1, -1, 1, -1, 1, 1, -1, 1];
  halos.forEach((h, i) => {
    for (let v = 0; v < 4; v++) {
      const j = i * 4 + v;
      pos[j * 3] = h.pos.x;
      pos[j * 3 + 1] = h.pos.y;
      pos[j * 3 + 2] = h.pos.z;
      corner[j * 2] = C[v * 2];
      corner[j * 2 + 1] = C[v * 2 + 1];
      size[j * 2] = h.sx;
      size[j * 2 + 1] = h.sy;
      color[j * 3] = h.color.r;
      color[j * 3 + 1] = h.color.g;
      color[j * 3 + 2] = h.color.b;
      chan[j] = h.chan;
      flat[j] = h.flat ? 1 : 0;
      push[j] = h.push;
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aChan', new THREE.BufferAttribute(chan, 1));
  g.setAttribute('aFlat', new THREE.BufferAttribute(flat, 1));
  g.setAttribute('aPush', new THREE.BufferAttribute(push, 1));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0.4), 4.5);
  return g;
}
