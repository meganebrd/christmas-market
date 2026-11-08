import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../core/contracts';
import { mat, setGlow } from '../materials';
import { glowTexture } from '../textures';
import { Flames, Halos, Particles, duskEnv, type EmitterOpts, type FlameSpec, type HaloSpec } from './fx';

/**
 * Building blocks shared by every landmark:
 *  - `T()`      compact transform matrices
 *  - `Bucket`   collects primitives (with a baked vertex colour) and merges them into ONE mesh
 *  - `Kit`      the set of buckets of one landmark (diffuse, metal, glass, glow, dimmable lights, bulbs,
 *               halos, flames, particles) → a handful of draw calls per landmark
 *  - `Frame`    a zone's local frame (local +Z = front, toward the plaza): world transforms, colliders, anchors
 */

export type ColliderTag = Parameters<GameContext['colliders']['addCircle']>[3];
export type Anchors = Map<string, { position: THREE.Vector3; yaw: number }>;
export type Col = THREE.ColorRepresentation;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Transform: translate, rotate (Euler YXZ: yaw, then pitch, then roll), scale. */
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** a × b (a is the parent). */
export function mul(a: THREE.Matrix4, ...b: THREE.Matrix4[]): THREE.Matrix4 {
  const m = a.clone();
  for (const x of b) m.multiply(x);
  return m;
}

export function pt(m: THREE.Matrix4, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyMatrix4(m);
}

/** Deterministic pseudo random (so the market looks the same at every visit). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ───────────────────────────── shared unit primitives ─────────────────────────────

const prims = new Map<string, THREE.BufferGeometry>();
function prim(key: string, make: () => THREE.BufferGeometry) {
  let g = prims.get(key);
  if (!g) prims.set(key, (g = make()));
  return g;
}
/** Unit box (1×1×1, centred). */
export const BOX = () => prim('box', () => new THREE.BoxGeometry(1, 1, 1));
/** Unit cylinder (radius 1, height 1, centred). */
export const CYL = (seg = 10) => prim('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg));
export const CONE = (seg = 8) => prim('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg));
export const SPH = (w = 8, h = 6) => prim(`sph${w}_${h}`, () => new THREE.SphereGeometry(1, w, h));
export const ICO = (d = 1) => prim('ico' + d, () => new THREE.IcosahedronGeometry(1, d));
export const TOR = (r = 1, t = 0.1, rs = 6, ts = 16, arc = Math.PI * 2) =>
  prim(`tor${r}_${t}_${rs}_${ts}_${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));

export function cyl(rt: number, rb: number, h: number, seg = 10, open = false) {
  return prim(`c${rt}_${rb}_${h}_${seg}_${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

export function lathe(points: [number, number][], seg = 12) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
  );
}

/** Tube along points (Catmull-Rom). */
export function tube(points: THREE.Vector3[], radius: number, radial = 4, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return new THREE.TubeGeometry(curve, Math.max(2, Math.round(points.length * 1.2)), radius, radial, closed);
}

/** Points along a sagging wire between a and b. */
export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

// ───────────────────────────── Bucket ─────────────────────────────

export class Bucket {
  private parts: THREE.BufferGeometry[] = [];
  constructor(private keepUv = false) {}

  /**
   * Adds a primitive. `color` is baked into the vertex colours (multiplied by `k`, which may be > 1 for
   * glow buckets). Pass `color = null` to keep the geometry's own `color` attribute.
   */
  add(geo: THREE.BufferGeometry, color: Col | null, m?: THREE.Matrix4, k = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name === 'position' || name === 'normal' || name === 'color' || (this.keepUv && name === 'uv')) continue;
      g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (this.keepUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (m) g.applyMatrix4(m);
    if (color !== null || !g.attributes.color) {
      _c.set(color ?? '#ffffff');
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = _c.r * k;
        arr[i * 3 + 1] = _c.g * k;
        arr[i * 3 + 2] = _c.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    } else if (k !== 1) {
      const c = g.attributes.color;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
    }
    this.parts.push(g);
    return this;
  }

  get size() {
    return this.parts.length;
  }

  build(material: THREE.Material, name: string): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    return mesh;
  }
}

// ───────────────────────────── materials ─────────────────────────────

const own = new Map<string, THREE.Material>();
function cached<M extends THREE.Material>(key: string, make: () => M): M {
  let m = own.get(key) as M | undefined;
  if (!m) own.set(key, (m = make()));
  return m;
}

export const bodyMat = (flat = false) => mat('#ffffff', { vertexColors: true, flat });

export function metalMat(renderer: THREE.WebGLRenderer) {
  return cached('metal', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.34 });
    const env = duskEnv(renderer);
    if (env) {
      m.envMap = env;
      m.envMapIntensity = 1.25;
    } else m.metalness = 0.3;
    return m;
  });
}

export function glossMat(renderer: THREE.WebGLRenderer) {
  return cached('gloss', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.16 });
    const env = duskEnv(renderer);
    if (env) {
      m.envMap = env;
      m.envMapIntensity = 1.4;
    }
    return m;
  });
}

/**
 * Lambert + vertex colours with an extra warm "bounce" proportional to the albedo: fakes the light of
 * many bulbs (carousel canopy, lit interiors) without real lights.
 */
export function warmLitMat(k = 0.35, tint = '#ffb46a') {
  return cached(`warmlit|${k}|${tint}`, () => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const c = new THREE.Color(tint).multiplyScalar(k);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWarmLit = { value: c };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uWarmLit;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uWarmLit;');
    };
    m.customProgramCacheKey = () => `warmlit|${k}|${tint}`;
    m.userData.warm = c;
    return m;
  });
}

/** Static glow (vertex colours carry the intensity). */
export const glowVC = () => cached('glowVC', () => new THREE.MeshBasicMaterial({ vertexColors: true }));

/** Dimmable glow: one per light set. `color` scalar = level. */
export function litVC() {
  return new THREE.MeshBasicMaterial({ vertexColors: true });
}

export function poolMat() {
  return new THREE.MeshBasicMaterial({
    map: glowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

// ───────────────────────────── Kit ─────────────────────────────

export interface BulbSpec {
  p: THREE.Vector3;
  c: Col;
  /** radius */
  r: number;
  k?: number;
}

export interface KitParts {
  meshes: THREE.Object3D[];
  bulbs: THREE.InstancedMesh | null;
  bulbMat: THREE.MeshBasicMaterial | null;
  lit: THREE.MeshBasicMaterial | null;
  pools: THREE.MeshBasicMaterial | null;
  halos: Halos | null;
  /** Sets the landmark's lamps level (0 off → 1 on). */
  setLevel(k: number): void;
}

export class Kit {
  readonly body = new Bucket();
  readonly flat = new Bucket();
  readonly metal = new Bucket();
  readonly gloss = new Bucket();
  readonly glow = new Bucket();
  readonly lit = new Bucket();
  readonly pools = new Bucket(true);
  readonly bulbs: BulbSpec[] = [];
  readonly halos: HaloSpec[] = [];
  readonly flames: FlameSpec[] = [];

  constructor(readonly ctx: GameContext) {}

  get detail() {
    return this.ctx.quality.detail;
  }

  bulb(p: THREE.Vector3, c: Col, r = 0.045, halo = 0) {
    this.bulbs.push({ p, c, r });
    if (halo > 0) this.halos.push({ pos: p, color: c, size: halo, k: 0.26 });
  }

  /** Warm pool of light on the ground (additive decal). */
  pool(m: THREE.Matrix4, x: number, z: number, r: number, color: Col, k = 0.5) {
    this.pools.add(new THREE.PlaneGeometry(r * 2, r * 2), color, mul(m, T(x, 0.025, z, -Math.PI / 2)), k);
  }

  /** Builds the meshes and adds them to `parent`. */
  finish(parent: THREE.Object3D, name: string, opts: { twinkle?: number; offLevel?: number; bodyMaterial?: THREE.Material } = {}): KitParts {
    const ctx = this.ctx;
    const shadows = ctx.quality.shadows;
    const meshes: THREE.Object3D[] = [];
    const push = (m: THREE.Object3D | null, cast = false, receive = false) => {
      if (!m) return;
      if (m instanceof THREE.Mesh) {
        m.castShadow = shadows && cast;
        m.receiveShadow = shadows && receive;
      }
      parent.add(m);
      meshes.push(m);
    };
    push(this.body.build(opts.bodyMaterial ?? bodyMat(false), name + '-body'), true, true);
    push(this.flat.build(bodyMat(true), name + '-flat'), true, true);
    push(this.metal.build(metalMat(ctx.renderer), name + '-metal'), true, false);
    push(this.gloss.build(glossMat(ctx.renderer), name + '-gloss'), false, false);
    push(this.glow.build(glowVC(), name + '-glow'));
    const lit = this.lit.size ? litVC() : null;
    if (lit) push(this.lit.build(lit, name + '-lit'));
    const pools = this.pools.size ? poolMat() : null;
    if (pools) push(this.pools.build(pools, name + '-pools'));

    let bulbs: THREE.InstancedMesh | null = null;
    let bulbMat: THREE.MeshBasicMaterial | null = null;
    if (this.bulbs.length) {
      bulbMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      bulbs = new THREE.InstancedMesh(ICO(0), bulbMat, this.bulbs.length);
      bulbs.name = name + '-bulbs';
      const m = new THREE.Matrix4();
      this.bulbs.forEach((b, i) => {
        m.makeScale(b.r, b.r * 1.25, b.r).setPosition(b.p);
        bulbs!.setMatrixAt(i, m);
        _c.set(b.c).multiplyScalar(2.15 * (b.k ?? 1));
        bulbs!.setColorAt(i, _c);
      });
      bulbs.instanceMatrix.needsUpdate = true;
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
      bulbs.computeBoundingSphere();
      push(bulbs);
    }
    let halos: Halos | null = null;
    if (this.halos.length) {
      halos = new Halos(this.halos, { twinkle: opts.twinkle ?? 0.25 });
      push(halos.mesh);
    }
    if (this.flames.length) push(new Flames(this.flames).mesh);

    const off = opts.offLevel ?? 0.07;
    const setLevel = (k: number) => {
      const l = off + (1 - off) * k;
      if (lit) lit.color.setScalar(l);
      if (bulbMat) bulbMat.color.setScalar(l);
      if (pools) pools.color.setScalar(k);
      if (halos) halos.level = k;
    };
    return { meshes, bulbs, bulbMat, lit, pools, halos, setLevel };
  }
}

/** Adds an emitter mesh to a parent (helper so each landmark keeps one line per effect). */
export function emitter(parent: THREE.Object3D, origins: THREE.Vector3[], o: EmitterOpts): Particles | null {
  if (!origins.length || o.count < 1) return null;
  const p = new Particles(origins, o);
  parent.add(p.mesh);
  return p;
}

export { setGlow };

// ───────────────────────────── Frame ─────────────────────────────

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Frame {
  readonly group = new THREE.Group();
  private readonly c: number;
  private readonly s: number;

  constructor(
    readonly ctx: GameContext,
    readonly anchors: Anchors,
    readonly cx: number,
    readonly cz: number,
    readonly yaw: number,
    name: string,
  ) {
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
    this.group.name = name;
    this.group.position.set(cx, 0, cz);
    this.group.rotation.y = yaw;
    ctx.scene.add(this.group);
    this.group.updateMatrixWorld(true);
  }

  /** Local (x, z) → world (x, z). */
  w(lx: number, lz: number) {
    return { x: this.cx + lx * this.c + lz * this.s, z: this.cz - lx * this.s + lz * this.c };
  }

  v(lx: number, ly: number, lz: number) {
    const p = this.w(lx, lz);
    return new THREE.Vector3(p.x, ly, p.z);
  }

  circle(lx: number, lz: number, r: number, tag: ColliderTag = 'prop') {
    const p = this.w(lx, lz);
    return this.ctx.colliders.addCircle(p.x, p.z, r, tag);
  }

  box(lx: number, lz: number, hw: number, hd: number, localYaw = 0, tag: ColliderTag = 'prop') {
    const p = this.w(lx, lz);
    return this.ctx.colliders.addBox(p.x, p.z, hw, hd, this.yaw + localYaw, tag);
  }

  /** `localYaw` 0 = facing the front (toward the plaza / customers), π = facing the back. */
  anchor(name: string, lx: number, lz: number, localYaw: number, y = 0) {
    this.anchors.set(name, { position: this.v(lx, y, lz), yaw: wrapAngle(this.yaw + localYaw) });
  }

  /** Registers a lamp set in the light director. */
  light(lx: number, ly: number, lz: number, set: (k: number) => void, group = 'landmark', delay?: number) {
    return this.ctx.lights.register({ position: this.v(lx, ly, lz), set, group, delay });
  }
}
