import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Small toolbox shared by the environment builders: deterministic randomness, noise, and a
 * `MeshBuilder` that accumulates coloured primitives and merges them into ONE geometry with
 * vertex colours (one draw call for hundreds of props).
 */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm2(x: number, z: number, octaves = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    s += noise2(x * f + i * 17.3, z * f - i * 9.1) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

/** Compass position (θ=0 → south/+Z, θ=π/2 → east/+X), same convention as layout.ts. */
export function polarXZ(angle: number, r: number) {
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Uniform scale or [sx, sy, sz]. */
  s?: number | [number, number, number];
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function matrixOf(p: Place = {}, out = new THREE.Matrix4()): THREE.Matrix4 {
  _e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  const s = p.s ?? 1;
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return out.compose(_p, _q, _s);
}

export interface PartOpts {
  /** Vertices whose (world) normal.y is above this get the snow colour (0.55 = fairly flat tops). */
  snow?: number;
  snowColor?: THREE.ColorRepresentation;
  /** Random brightness variation of the whole part (0.1 = ±10%). */
  jitter?: number;
  /** Multiply the colour (> 1 for glowing parts in a glow builder). */
  intensity?: number;
}

type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, out: THREE.Color) => void;

const unitCache = new Map<string, THREE.BufferGeometry>();
function unit(key: string, make: () => THREE.BufferGeometry) {
  let g = unitCache.get(key);
  if (!g) {
    g = make();
    g.deleteAttribute('uv');
    unitCache.set(key, g);
  }
  return g;
}

/** Snow white used on roofs, sills and props. */
export const SNOW_HEX = '#eef2fb';
const SNOW = new THREE.Color(SNOW_HEX);

/**
 * Accumulates coloured primitives and merges them into a single indexed geometry with
 * `position`, `normal` and `color`. Supports a transform stack so a house/prop can be built
 * in its local frame and placed anywhere.
 */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private stack: THREE.Matrix4[] = [];
  private base = new THREE.Matrix4();
  private tmpM = new THREE.Matrix4();
  private col = new THREE.Color();
  private rand: () => number;
  vertexCount = 0;

  constructor(seed = 7) {
    this.rand = rng(seed);
  }

  /** Enter a local frame (relative to the current one). */
  push(p: Place | THREE.Matrix4) {
    this.stack.push(this.base.clone());
    const m = p instanceof THREE.Matrix4 ? p : matrixOf(p);
    this.base = this.base.clone().multiply(m);
    return this;
  }

  pop() {
    const m = this.stack.pop();
    if (m) this.base = m;
    return this;
  }

  /** Current frame (world matrix of the local origin). */
  get matrix(): THREE.Matrix4 {
    return this.base.clone();
  }

  /** Local point → world point (current frame). */
  world(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.base);
  }

  /** Local placement → world matrix (current frame), e.g. for instanced parts. */
  worldMatrix(p: Place): THREE.Matrix4 {
    return this.base.clone().multiply(matrixOf(p));
  }

  /**
   * Adds a geometry (cloned) with a solid colour, a per-vertex colour function, or 'vertex' to keep
   * the geometry's own `color` attribute.
   */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn | 'vertex', place?: Place | THREE.Matrix4, opts: PartOpts = {}) {
    let g = geo.clone();
    const own = color === 'vertex' ? (g.attributes.color as THREE.BufferAttribute | undefined) : undefined;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const local = place ? (place instanceof THREE.Matrix4 ? place : matrixOf(place, this.tmpM)) : null;
    const m = local ? this.base.clone().multiply(local) : this.base;
    g.applyMatrix4(m);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const n = pos.count;
    const colors = new Float32Array(n * 3);
    const k = (opts.intensity ?? 1) * (opts.jitter ? 1 + (this.rand() * 2 - 1) * opts.jitter : 1);
    const snowC = opts.snowColor !== undefined ? new THREE.Color(opts.snowColor) : SNOW;
    const solid = typeof color === 'function' || color === 'vertex' ? null : new THREE.Color(color as THREE.ColorRepresentation);
    for (let i = 0; i < n; i++) {
      if (solid) this.col.copy(solid);
      else if (own) this.col.setRGB(own.getX(i), own.getY(i), own.getZ(i));
      else if (typeof color === 'function') color(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), this.col);
      else this.col.setRGB(1, 1, 1);
      if (opts.snow !== undefined && nor.getY(i) > opts.snow) this.col.copy(snowC);
      colors[i * 3] = this.col.r * k;
      colors[i * 3 + 1] = this.col.g * k;
      colors[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!g.index) {
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    this.parts.push(g);
    this.vertexCount += n;
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation | ColorFn, place: Place = {}, opts?: PartOpts) {
    const g = unit('box', () => new THREE.BoxGeometry(1, 1, 1));
    const s = scaleOf(place);
    return this.add(g, color, { ...place, s: [w * s[0], h * s[1], d * s[2]] }, opts);
  }

  /** Cylinder centred like THREE.CylinderGeometry (y from -h/2 to h/2). */
  cyl(rTop: number, rBot: number, h: number, seg: number, color: THREE.ColorRepresentation | ColorFn, place: Place = {}, opts?: PartOpts & { open?: boolean }) {
    const r = Math.max(rTop, rBot, 1e-4);
    const a = Math.round((rTop / r) * 1000) / 1000;
    const b = Math.round((rBot / r) * 1000) / 1000;
    const g = unit(`cyl|${a}|${b}|${seg}|${opts?.open ? 1 : 0}`, () => new THREE.CylinderGeometry(a, b, 1, seg, 1, opts?.open ?? false));
    const s = scaleOf(place);
    return this.add(g, color, { ...place, s: [r * s[0], h * s[1], r * s[2]] }, opts);
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation | ColorFn, place: Place = {}, opts?: PartOpts) {
    const g = unit(`cone|${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1));
    const s = scaleOf(place);
    return this.add(g, color, { ...place, s: [r * s[0], h * s[1], r * s[2]] }, opts);
  }

  sphere(r: number, wSeg: number, hSeg: number, color: THREE.ColorRepresentation | ColorFn, place: Place = {}, opts?: PartOpts) {
    const g = unit(`sph|${wSeg}|${hSeg}`, () => new THREE.SphereGeometry(1, wSeg, hSeg));
    const s = scaleOf(place);
    return this.add(g, color, { ...place, s: [r * s[0], r * s[1], r * s[2]] }, opts);
  }

  /** Low-poly lump (icosahedron) — snowbanks, rocks. */
  lump(r: number, color: THREE.ColorRepresentation | ColorFn, place: Place = {}, opts?: PartOpts, detail = 1) {
    // detail 1: soft low sphere (snow lumps), detail 0: tiny faceted bits (baubles, coal)
    const g = unit(`lump|${detail}`, () => (detail >= 1 ? new THREE.SphereGeometry(1, 7, 5) : new THREE.IcosahedronGeometry(1, 0)));
    const s = scaleOf(place);
    return this.add(g, color, { ...place, s: [r * s[0], r * s[1], r * s[2]] }, opts);
  }

  get count() {
    return this.parts.length;
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (merged) merged.computeBoundingSphere();
    return merged;
  }
}

function scaleOf(p: Place): [number, number, number] {
  const s = p.s ?? 1;
  return typeof s === 'number' ? [s, s, s] : s;
}

/** A triangular prism (gable): width along X, height along Y (apex at top), depth along Z, base at y=0. */
export function gableGeometry(): THREE.BufferGeometry {
  return unit('gable', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  });
}

/** Quadratic sag curve between two points (good catenary approximation for garlands & wires). */
export function sagPoints(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

/** Linear colour helper (sRGB hex → linear THREE.Color, optionally scaled). */
export function lin(hex: THREE.ColorRepresentation, k = 1): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Mixes two hex colours. */
export function mixHex(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}
