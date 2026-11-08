import * as THREE from 'three';

/**
 * GeoBuilder: every visible part of a character is a small primitive, transformed into the character's
 * bind pose, painted with vertex colours and rigidly bound to one (or two, blended) bone(s). Everything is
 * merged into ONE BufferGeometry → one SkinnedMesh → one draw call per character.
 */
export type ColorLike = string | THREE.Color;
/** Bone binding: a bone index, or a function of the bind-pose position → [boneA, boneB, weightOfB]. */
export type BoneRef = number | ((p: THREE.Vector3) => [number, number, number]);

export interface AddOpts {
  /** Per-vertex colour, or function of (position, normal). */
  color: ColorLike | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color);
  /** Per-face colour (crisp patterns: knit bands, stripes). Converts the part to non-indexed. */
  faceColor?: (centroid: THREE.Vector3, normal: THREE.Vector3) => THREE.Color;
  bone: BoneRef;
  /** Self-illumination (0 = lit, 1 = self-lit, > 1 = blooms). */
  emit?: number | ((p: THREE.Vector3) => number);
  matrix?: THREE.Matrix4;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _cen = new THREE.Vector3();
const _fn = new THREE.Vector3();

export class GeoBuilder {
  /** Debug: called with the triangle count of every added part. */
  static trace: ((tris: number) => void) | null = null;
  private pos: number[] = [];
  private nor: number[] = [];
  private colr: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private em: number[] = [];
  private idx: number[] = [];
  private count = 0;

  add(geometry: THREE.BufferGeometry, o: AddOpts): this {
    let geo = geometry;
    if (o.matrix) geo.applyMatrix4(o.matrix);
    if (o.faceColor && geo.index) {
      const ni = geo.toNonIndexed();
      geo.dispose();
      geo = ni;
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const N = geo.getAttribute('normal') as THREE.BufferAttribute;
    const n = P.count;
    const base = this.count;
    const constColor = typeof o.color === 'string' || o.color instanceof THREE.Color ? new THREE.Color(o.color as any) : null;
    const faceCols: THREE.Color[] = [];
    if (o.faceColor) {
      for (let i = 0; i < n; i += 3) {
        _a.fromBufferAttribute(P, i);
        _b.fromBufferAttribute(P, i + 1);
        _c.fromBufferAttribute(P, i + 2);
        _cen.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
        _fn.fromBufferAttribute(N, i).add(_n.fromBufferAttribute(N, i + 1)).add(_n.fromBufferAttribute(N, i + 2)).normalize();
        faceCols.push(o.faceColor(_cen, _fn));
      }
    }
    for (let i = 0; i < n; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      let c: THREE.Color;
      if (o.faceColor) c = faceCols[Math.floor(i / 3)];
      else if (constColor) c = constColor;
      else c = (o.color as (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)(_p, _n);
      this.colr.push(c.r, c.g, c.b);
      if (typeof o.bone === 'number') {
        this.si.push(o.bone, 0, 0, 0);
        this.sw.push(1, 0, 0, 0);
      } else {
        const [ba, bb, w] = o.bone(_p);
        this.si.push(ba, bb, 0, 0);
        this.sw.push(1 - w, w, 0, 0);
      }
      const e = o.emit === undefined ? 0 : typeof o.emit === 'number' ? o.emit : o.emit(_p);
      this.em.push(e);
    }
    if (geo.index) {
      const I = geo.index;
      for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
    } else {
      for (let i = 0; i < n; i++) this.idx.push(base + i);
    }
    this.count += n;
    GeoBuilder.trace?.((geo.index ? geo.index.count : n) / 3);
    geo.dispose();
    return this;
  }

  get vertexCount() {
    return this.count;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('emit', new THREE.Float32BufferAttribute(this.em, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Static (non-skinned) geometry for props: drops skinning attributes. */
  buildStatic(): THREE.BufferGeometry {
    const g = this.build();
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    return g;
  }
}

// ───────────────────────────── transforms ─────────────────────────────

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a matrix: translate, rotate (XYZ euler), scale. */
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_v.set(px, py, pz), _q.setFromEuler(_e.set(rx, ry, rz, 'XYZ')), _s.set(sx, sy, sz));
}

/** Same with a YXZ euler (yaw first: handy to place things on a head/body surface). */
export function MY(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_v.set(px, py, pz), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}

export function mul(...ms: THREE.Matrix4[]): THREE.Matrix4 {
  const out = new THREE.Matrix4();
  for (const m of ms) out.multiply(m);
  return out;
}

// ───────────────────────────── primitives ─────────────────────────────

export function seg(n: number, detail: number, min = 3) {
  return Math.max(min, Math.round(n * detail));
}

export function sphere(r: number, ws: number, hs: number) {
  return stripUv(new THREE.SphereGeometry(r, ws, hs));
}

export function ellipsoid(rx: number, ry: number, rz: number, ws: number, hs: number) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return stripUv(g);
}

export function cylinder(rt: number, rb: number, h: number, rs: number, open = false, hs = 1) {
  return stripUv(new THREE.CylinderGeometry(rt, rb, h, rs, hs, open));
}

export function capsule(r: number, len: number, cap: number, rs: number) {
  return stripUv(new THREE.CapsuleGeometry(r, len, cap, rs, 1));
}

export function torus(r: number, tube: number, rs: number, ts: number, arc = Math.PI * 2) {
  return stripUv(new THREE.TorusGeometry(r, tube, rs, ts, arc));
}

export function box(w: number, h: number, d: number) {
  return stripUv(new THREE.BoxGeometry(w, h, d));
}

/** Lathe around Y from [radius, y] points (bottom → top). phi = 0 is +Z (the front). */
export function lathe(pts: [number, number][], segs: number, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
    segs,
    phiStart,
    phiLength,
  );
  return stripUv(g);
}

/** Tube along points (scarf tails, straps, poles). */
export function tube(points: THREE.Vector3[], radius: number, segs: number, radial: number, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return stripUv(new THREE.TubeGeometry(curve, segs, radius, radial, closed));
}

/**
 * Sphere whose radius is modulated by direction: `radius(d)` returns the radius for unit direction d.
 * Used for hair caps, hoods, beards (directions not covered are pulled inside the head → invisible).
 */
export function shell(radius: (d: THREE.Vector3) => number, ws: number, hs: number, scale = new THREE.Vector3(1, 1, 1), hiddenBelow = 0) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  const rs = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    d.fromBufferAttribute(P, i).normalize();
    const r = radius(d);
    rs[i] = r;
    P.setXYZ(i, d.x * r * scale.x, d.y * r * scale.y, d.z * r * scale.z);
  }
  g.computeVertexNormals();
  fixSeamNormals(g);
  // drop the faces that are entirely tucked inside the head (never visible): big triangle savings
  if (hiddenBelow > 0 && g.index) {
    const I = g.index;
    const keep: number[] = [];
    for (let i = 0; i < I.count; i += 3) {
      const a = I.getX(i);
      const b = I.getX(i + 1);
      const c = I.getX(i + 2);
      if (rs[a] < hiddenBelow && rs[b] < hiddenBelow && rs[c] < hiddenBelow) continue;
      keep.push(a, b, c);
    }
    g.setIndex(keep);
  }
  return stripUv(g);
}

/** A fluffy ball (pompoms, earmuffs, fur trims): sphere with smooth bumpy noise. */
export function fluffy(r: number, ws: number, hs: number, amp = 0.12, freq = 9, seed = 0) {
  return shell(
    (d) => r * (1 + amp * (Math.sin(d.x * freq + seed) * Math.sin(d.y * freq * 1.13 + seed * 2.1) * Math.sin(d.z * freq * 0.91 + seed * 0.7))),
    ws,
    hs,
  );
}

/** Ring of a fluffy torus (fur trims around a hood or boots). */
export function fluffyTorus(r: number, tube: number, rs: number, ts: number, amp = 0.25, freq = 14) {
  const g = new THREE.TorusGeometry(r, tube, rs, ts);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    const a = Math.atan2(p.y, p.x);
    c.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    const off = p.clone().sub(c);
    const k = 1 + amp * Math.sin(a * freq) * Math.cos(Math.atan2(off.z, off.length()) * 3);
    p.copy(c).addScaledVector(off, k);
    P.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return stripUv(g);
}

/** Knitted rib bumps on an open cylinder (brims, cuffs, hems). */
export function ribbed(rTop: number, rBot: number, h: number, rs: number, ribs: number, amp: number) {
  const g = cylinder(rTop, rBot, h, rs, true, 2);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const z = P.getZ(i);
    const a = Math.atan2(x, z);
    const k = 1 + amp * Math.cos(a * ribs);
    P.setXYZ(i, x * k, P.getY(i), z * k);
  }
  g.computeVertexNormals();
  fixSeamNormals(g);
  return g;
}

/** Reverse the winding & normals (inside faces of capes). */
export function flip<T extends THREE.BufferGeometry>(g: T): T {
  const I = g.index;
  if (I) {
    for (let i = 0; i < I.count; i += 3) {
      const b = I.getX(i + 1);
      I.setX(i + 1, I.getX(i + 2));
      I.setX(i + 2, b);
    }
  }
  const N = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  return g;
}

/**
 * Lathe whose vertices for which `mask(phi, y)` is true are pulled inward by `inset` (hidden under the
 * garment below) → openings with soft edges (V-necks, cape fronts).
 */
export function latheMasked(pts: [number, number][], segs: number, mask: (phi: number, y: number) => boolean, inset = 0.85) {
  const g = lathe(pts, segs);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const z = P.getZ(i);
    const y = P.getY(i);
    if (mask(Math.atan2(x, z), y)) P.setXYZ(i, x * inset, y, z * inset);
  }
  g.computeVertexNormals();
  fixSeamNormals(g);
  return g;
}

function stripUv<T extends THREE.BufferGeometry>(g: T): T {
  g.deleteAttribute('uv');
  g.deleteAttribute('uv1');
  return g;
}

/** SphereGeometry duplicates the seam vertices: average their normals so lighting has no crack. */
export function fixSeamNormals(g: THREE.BufferGeometry) {
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const N = g.getAttribute('normal') as THREE.BufferAttribute;
  const map = new Map<string, number[]>();
  for (let i = 0; i < P.count; i++) {
    const k = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
    let a = map.get(k);
    if (!a) map.set(k, (a = []));
    a.push(i);
  }
  const n = new THREE.Vector3();
  for (const ids of map.values()) {
    if (ids.length < 2) continue;
    n.set(0, 0, 0);
    for (const i of ids) n.x += N.getX(i), n.y += N.getY(i), n.z += N.getZ(i);
    n.normalize();
    for (const i of ids) N.setXYZ(i, n.x, n.y, n.z);
  }
}
