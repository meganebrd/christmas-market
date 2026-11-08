import * as THREE from 'three';

/**
 * Pooled GPU particles for the mini-games (one draw call per system):
 *   glint → additive 4-point star sparkles      glow → additive soft dots (trails, embers)
 *   soft  → normal-blended puffs (snow, steam, confetti)
 * Positions are world space. Colours are linear (THREE.Color), multiplied by `intensity` to bloom.
 */

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 1.0, 320.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = vColor.a * t.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
}`;

const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

export function dotTexture(): THREE.Texture {
  return canvasTex('mg-dot', 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
}

export function puffTexture(): THREE.Texture {
  return canvasTex('mg-puff', 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.95)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    r.addColorStop(0.8, 'rgba(255,255,255,0.15)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
}

export function glintTexture(): THREE.Texture {
  return canvasTex('mg-glint', 64, (g, s) => {
    const c = s / 2;
    const core = g.createRadialGradient(c, c, 0, c, c, c * 0.45);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [
      [s, s * 0.09],
      [s * 0.09, s],
    ]) {
      const grd = g.createRadialGradient(c, c, 0, c, c, c);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(c, c, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export type ColorLike = THREE.ColorRepresentation;

export interface EmitOpts {
  count?: number;
  color?: ColorLike | ColorLike[];
  /** Colour multiplier (> 1 blooms). */
  intensity?: number;
  alpha?: number;
  speed?: number | [number, number];
  /** Main direction (normalised). Omitted → random sphere. */
  dir?: THREE.Vector3;
  /** 0 = exactly `dir`, 1 = very wide. */
  cone?: number;
  /** Base velocity added to every particle. */
  vel?: THREE.Vector3;
  /** Extra upward velocity. */
  up?: number;
  /** m/s², positive pulls down, negative floats up. */
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
  life?: number | [number, number];
  size?: number | [number, number];
  /** Size multiplier at the end of life. */
  sizeEnd?: number;
  /** Spawn jitter radius. */
  spread?: number;
  /** Flicker (sparkles). */
  twinkle?: boolean;
}

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const range = (v: number | [number, number] | undefined, def: number) =>
  v === undefined ? def : typeof v === 'number' ? v : v[0] + Math.random() * (v[1] - v[0]);

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geo: THREE.BufferGeometry;
  private n = 0;
  private readonly cap: number;
  // state (structure of arrays)
  private p: Float32Array;
  private v: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private sizeEnd: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private seed: Float32Array;
  private twk: Uint8Array;
  // GPU buffers
  private aPos: THREE.BufferAttribute;
  private aCol: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;

  constructor(map: THREE.Texture, blending: THREE.Blending, cap = 900) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.sizeEnd = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    this.twk = new Uint8Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'mg-particles';
  }

  get alive() {
    return this.n;
  }

  emit(pos: THREE.Vector3, o: EmitOpts = {}) {
    const count = o.count ?? 12;
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    const inten = o.intensity ?? 1;
    for (let k = 0; k < count; k++) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      const spread = o.spread ?? 0;
      // random unit vector
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      tmpV.set(sq * Math.cos(th), u, sq * Math.sin(th));
      const rr = spread * Math.cbrt(Math.random());
      this.p[i * 3] = pos.x + tmpV.x * rr;
      this.p[i * 3 + 1] = pos.y + tmpV.y * rr;
      this.p[i * 3 + 2] = pos.z + tmpV.z * rr;
      // velocity
      const sp = range(o.speed, 1);
      let dx = tmpV.x;
      let dy = tmpV.y;
      let dz = tmpV.z;
      if (o.dir) {
        const c = o.cone ?? 0.4;
        dx = o.dir.x + (Math.random() * 2 - 1) * c;
        dy = o.dir.y + (Math.random() * 2 - 1) * c;
        dz = o.dir.z + (Math.random() * 2 - 1) * c;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
      }
      this.v[i * 3] = dx * sp + (o.vel?.x ?? 0);
      this.v[i * 3 + 1] = dy * sp + (o.vel?.y ?? 0) + (o.up ?? 0);
      this.v[i * 3 + 2] = dz * sp + (o.vel?.z ?? 0);
      tmpC.set(colors[(Math.random() * colors.length) | 0]).multiplyScalar(inten);
      this.col[i * 4] = tmpC.r;
      this.col[i * 4 + 1] = tmpC.g;
      this.col[i * 4 + 2] = tmpC.b;
      this.col[i * 4 + 3] = o.alpha ?? 1;
      const life = range(o.life, 0.8);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = range(o.size, 0.08);
      this.sizeEnd[i] = o.sizeEnd ?? 0.3;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
      this.seed[i] = Math.random() * 100;
      this.twk[i] = o.twinkle ? 1 : 0;
    }
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    for (let a = 0; a < 3; a++) {
      this.p[i * 3 + a] = this.p[j * 3 + a];
      this.v[i * 3 + a] = this.v[j * 3 + a];
    }
    for (let a = 0; a < 4; a++) this.col[i * 4 + a] = this.col[j * 4 + a];
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.size[i] = this.size[j];
    this.sizeEnd[i] = this.sizeEnd[j];
    this.grav[i] = this.grav[j];
    this.drag[i] = this.drag[j];
    this.seed[i] = this.seed[j];
    this.twk[i] = this.twk[j];
  }

  update(dt: number, t: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    const h = renderer.domElement.height || 800;
    this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const damp = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= damp;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * damp - this.grav[i] * dt;
      this.v[i * 3 + 2] *= damp;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      i++;
    }
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const siz = this.aSize.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const r = this.life[k] / this.maxLife[k]; // 1 → 0
      const age = 1 - r;
      pos[k * 3] = this.p[k * 3];
      pos[k * 3 + 1] = this.p[k * 3 + 1];
      pos[k * 3 + 2] = this.p[k * 3 + 2];
      let a = this.col[k * 4 + 3] * Math.min(1, age * 8) * Math.min(1, r * 2.2);
      if (this.twk[k]) a *= 0.55 + 0.45 * Math.sin(t * 22 + this.seed[k]);
      col[k * 4] = this.col[k * 4];
      col[k * 4 + 1] = this.col[k * 4 + 1];
      col[k * 4 + 2] = this.col[k * 4 + 2];
      col[k * 4 + 3] = a;
      siz[k] = this.size[k] * (this.sizeEnd[k] + (1 - this.sizeEnd[k]) * r);
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}

/** The three particle systems + a few cosy presets. */
export class Fx {
  readonly glint = new ParticleSystem(glintTexture(), THREE.AdditiveBlending, 500);
  readonly glow = new ParticleSystem(dotTexture(), THREE.AdditiveBlending, 1200);
  readonly soft = new ParticleSystem(puffTexture(), THREE.NormalBlending, 700);
  private attached: THREE.Object3D | null = null;

  attach(parent: THREE.Object3D) {
    if (this.attached === parent) return;
    this.detach();
    parent.add(this.glint.points, this.glow.points, this.soft.points);
    this.attached = parent;
  }

  detach() {
    for (const s of [this.glint, this.glow, this.soft]) {
      s.points.removeFromParent();
      s.clear();
    }
    this.attached = null;
  }

  update(dt: number, t: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.glint.update(dt, t, camera, renderer);
    this.glow.update(dt, t, camera, renderer);
    this.soft.update(dt, t, camera, renderer);
  }

  /** Celebration sparkle burst (stars + glow). */
  sparkle(pos: THREE.Vector3, color: ColorLike | ColorLike[] = '#ffd27a', n = 22, scale = 1) {
    this.glint.emit(pos, { count: Math.ceil(n * 0.5), color, intensity: 3, speed: [1.2 * scale, 3.2 * scale], gravity: 1.2, drag: 2.2, life: [0.5, 1.1], size: [0.12 * scale, 0.26 * scale], sizeEnd: 0.2, twinkle: true });
    this.glow.emit(pos, { count: n, color, intensity: 2.4, speed: [0.6 * scale, 2.4 * scale], gravity: 0.6, drag: 2, life: [0.4, 0.9], size: [0.05 * scale, 0.12 * scale], sizeEnd: 0.1 });
  }

  /** Snow puff (snowball hits). */
  puff(pos: THREE.Vector3, n = 16, scale = 1, color: ColorLike = '#f4f7ff') {
    this.soft.emit(pos, { count: n, color, alpha: 0.9, speed: [0.4 * scale, 1.8 * scale], gravity: 2.5, drag: 3, life: [0.35, 0.8], size: [0.08 * scale, 0.2 * scale], sizeEnd: 1.6, spread: 0.04 * scale });
    this.glow.emit(pos, { count: Math.ceil(n / 3), color: '#cfe0ff', intensity: 1.2, speed: [0.5, 1.5], gravity: 1.5, drag: 2, life: [0.3, 0.6], size: [0.03, 0.06] });
  }

  /** One trail particle. */
  trail(pos: THREE.Vector3, color: ColorLike = '#ffd27a', size = 0.1, intensity = 2.2, life = 0.55) {
    this.glow.emit(pos, { count: 1, color, intensity, speed: [0.02, 0.15], drag: 1, life: [life * 0.7, life], size: [size * 0.7, size], sizeEnd: 0.1, spread: 0.02 });
  }

  /** Rising steam wisps. */
  steam(pos: THREE.Vector3, n = 1, spread = 0.2, alpha = 0.22) {
    this.soft.emit(pos, { count: n, color: '#eef2ff', alpha, speed: [0.05, 0.2], up: 0.35, gravity: -0.15, drag: 0.8, life: [1.2, 2.2], size: [0.08, 0.16], sizeEnd: 3, spread });
  }

  /** Warm embers floating up. */
  embers(pos: THREE.Vector3, n = 1, spread = 0.05) {
    this.glow.emit(pos, { count: n, color: ['#ffb347', '#ff8a2a', '#ffd27a'], intensity: 3, speed: [0.1, 0.5], up: 0.4, gravity: -0.3, drag: 1.2, life: [0.6, 1.4], size: [0.025, 0.05], sizeEnd: 0.2, spread, twinkle: true });
  }

  /** Festive confetti (soft, coloured, falling). */
  confetti(pos: THREE.Vector3, n = 40) {
    this.soft.emit(pos, { count: n, color: ['#c0392b', '#e2b34a', '#2f8a5b', '#f3ead8', '#3c7ac0', '#d9577a'], alpha: 1, speed: [1.5, 4], up: 1.5, gravity: 3.2, drag: 1.6, life: [1.2, 2], size: [0.05, 0.09], sizeEnd: 0.8, spread: 0.1 });
    this.glint.emit(pos, { count: Math.ceil(n / 3), color: '#ffe3a1', intensity: 3, speed: [1, 3], up: 1, gravity: 1.5, drag: 2, life: [0.6, 1.2], size: [0.1, 0.22], twinkle: true });
  }

  dispose() {
    this.detach();
    this.glint.dispose();
    this.glow.dispose();
    this.soft.dispose();
  }
}
