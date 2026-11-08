import * as THREE from 'three';
import type { GameContext } from '../core/contracts';

/**
 * Story FX toolkit: one pooled additive particle system (sparks, trails, snow gusts, fireworks)
 * rendered as a single THREE.Points draw call, plus a few canvas textures (lens flare, star icon).
 * Colours are LINEAR and may exceed 1 so the bloom picks them up.
 */

// ───────────────────────────── shared points shader ─────────────────────────────

const pointScale = { value: 400 };

/** Additive soft-dot material. Size attribute in metres (world-space), colour = rgb·intensity + alpha. */
export function createPointsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: pointScale },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec4 aColor;
      uniform float uScale;
      varying vec4 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // sparks brushing past the lens would blow out the frame: fade them
        vColor.a *= smoothstep(1.2, 5.0, -mv.z);
        gl_PointSize = clamp(aSize * uScale / max(0.2, -mv.z), 0.0, 160.0);
        if (vColor.a <= 0.001) gl_PointSize = 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        float core = smoothstep(0.22, 0.0, r);
        float halo = (1.0 - r);
        halo *= halo;
        gl_FragColor = vec4(vColor.rgb * (core * 0.9 + halo * 0.45), vColor.a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Textured points (icons), normal blending, size in metres. */
export function createIconPointsMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: pointScale, uMap: { value: tex } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec4 aColor;
      uniform float uScale;
      varying vec4 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / max(0.2, -mv.z), 0.0, 128.0);
        if (aColor.a <= 0.001) gl_PointSize = 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec4 vColor;
      void main() {
        vec4 t = texture2D(uMap, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
        if (t.a < 0.02) discard;
        gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/** Must be called every frame (cheap): keeps point sizes in metres whatever the resolution / FOV. */
const bufferSize = new THREE.Vector2();
export function updatePointScale(ctx: GameContext) {
  const v = ctx.renderer.getDrawingBufferSize(bufferSize);
  const fov = (ctx.camera.fov * Math.PI) / 180;
  pointScale.value = v.y / (2 * Math.tan(fov / 2));
}

// ───────────────────────────── Sparks (pooled particles) ─────────────────────────────

export interface SparkOpts {
  /** Linear colour (may be > 1 for bloom). */
  color: THREE.Color;
  /** Seconds. */
  life: number;
  /** Metres. */
  size: number;
  sizeEnd?: number;
  /** Velocity damping per second (0 = none, 2 = strong). */
  drag?: number;
  /** m/s² (negative = falls). */
  gravity?: number;
  /** Random flicker toward the end of life (glitter). */
  twinkle?: boolean;
  /** Starts white-hot and cools to `color`. */
  hot?: boolean;
  /** Fade-in time fraction (0..1), default 0.05. */
  fadeIn?: number;
  /** Emits a faint trail spark every N seconds (willows). 0 = none. */
  trail?: number;
}

const F_TWINKLE = 1;
const F_HOT = 2;

export class Sparks {
  readonly points: THREE.Points;
  readonly capacity: number;
  private count = 0;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private base: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private flags: Uint8Array;
  private fadeIn: Float32Array;
  private trail: Float32Array;
  private trailT: Float32Array;
  private trailColor = new THREE.Color();

  constructor(capacity: number) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.base = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.fadeIn = new Float32Array(capacity);
    this.trail = new Float32Array(capacity);
    this.trailT = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.points = new THREE.Points(this.geo, createPointsMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.visible = false;
    this.points.name = 'story-sparks';
  }

  get alive() {
    return this.count;
  }

  /** Free slots left. */
  get room() {
    return this.capacity - this.count;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: SparkOpts): boolean {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.base[i3] = o.color.r;
    this.base[i3 + 1] = o.color.g;
    this.base[i3 + 2] = o.color.b;
    this.life[i] = this.maxLife[i] = Math.max(0.05, o.life);
    this.size0[i] = o.size;
    this.size1[i] = o.sizeEnd ?? o.size * 0.4;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.flags[i] = (o.twinkle ? F_TWINKLE : 0) | (o.hot ? F_HOT : 0);
    this.fadeIn[i] = o.fadeIn ?? 0.05;
    this.trail[i] = o.trail ?? 0;
    this.trailT[i] = 0;
    this.writeVisual(i, 0);
    return true;
  }

  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
    this.points.visible = false;
  }

  private writeVisual(i: number, age01: number) {
    const i3 = i * 3;
    const i4 = i * 4;
    const f = this.flags[i];
    let r = this.base[i3];
    let g = this.base[i3 + 1];
    let b = this.base[i3 + 2];
    if (f & F_HOT) {
      // white-hot at birth, cooling to the colour
      const h = Math.max(0, 1 - age01 * 3.5);
      const m = Math.max(r, g, b, 1);
      r += (m - r) * h;
      g += (m - g) * h;
      b += (m - b) * h;
    }
    const fi = this.fadeIn[i];
    let a = age01 < fi ? age01 / fi : 1 - Math.pow((age01 - fi) / (1 - fi), 2);
    if (f & F_TWINKLE && age01 > 0.45) a *= Math.random() < 0.45 ? 0.15 : 1.2;
    this.col[i4] = r;
    this.col[i4 + 1] = g;
    this.col[i4 + 2] = b;
    this.col[i4 + 3] = Math.max(0, Math.min(1.2, a));
    this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * age01;
  }

  private kill(i: number) {
    const last = --this.count;
    if (i === last) return;
    // move the last particle into slot i
    const i3 = i * 3;
    const l3 = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k];
      this.vel[i3 + k] = this.vel[l3 + k];
      this.base[i3 + k] = this.base[l3 + k];
    }
    for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.col[last * 4 + k];
    this.size[i] = this.size[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size0[i] = this.size0[last];
    this.size1[i] = this.size1[last];
    this.drag[i] = this.drag[last];
    this.grav[i] = this.grav[last];
    this.flags[i] = this.flags[last];
    this.fadeIn[i] = this.fadeIn[last];
    this.trail[i] = this.trail[last];
    this.trailT[i] = this.trailT[last];
  }

  update(dt: number) {
    if (this.count === 0) {
      if (this.points.visible) this.points.visible = false;
      return;
    }
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const d = this.drag[i];
      if (d > 0) {
        const k = Math.exp(-d * dt);
        this.vel[i3] *= k;
        this.vel[i3 + 1] *= k;
        this.vel[i3 + 2] *= k;
      }
      this.vel[i3 + 1] += this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const age01 = 1 - this.life[i] / this.maxLife[i];
      this.writeVisual(i, age01);
      // sub-emission: faint falling trail (willows)
      if (this.trail[i] > 0 && age01 < 0.85) {
        this.trailT[i] += dt;
        if (this.trailT[i] >= this.trail[i] && this.count < this.capacity * 0.92) {
          this.trailT[i] = 0;
          this.trailColor.setRGB(this.base[i3] * 0.6, this.base[i3 + 1] * 0.5, this.base[i3 + 2] * 0.35);
          this.emit(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2], 0, -0.4, 0, {
            color: this.trailColor,
            life: 0.55,
            size: this.size[i] * 0.7,
            sizeEnd: 0.02,
            drag: 1,
          });
        }
      }
    }
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = this.count > 0;
  }

  // ── helpers ──

  /** Sphere burst of sparkles (pick-up, landing on the tree). */
  burst(at: THREE.Vector3, n: number, color: THREE.Color, opts: { speed?: number; life?: number; size?: number; gravity?: number } = {}) {
    const speed = opts.speed ?? 2.5;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      this.emit(at.x, at.y, at.z, Math.cos(th) * s * v, u * v + 0.4, Math.sin(th) * s * v, {
        color,
        life: (opts.life ?? 0.9) * (0.6 + Math.random() * 0.6),
        size: (opts.size ?? 0.16) * (0.6 + Math.random() * 0.8),
        sizeEnd: 0.01,
        drag: 2.2,
        gravity: opts.gravity ?? -1.2,
        twinkle: true,
        hot: true,
      });
    }
  }
}

// ───────────────────────────── colours ─────────────────────────────

/** Linear colour from an sRGB hex, multiplied (for bloom). */
export function hot(hex: string, k = 1): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

// ───────────────────────────── canvas textures ─────────────────────────────

const texCache = new Map<string, THREE.Texture>();

/** Four-pointed lens flare (the "glint" that catches the eye). */
export function flareTexture(): THREE.Texture {
  const key = 'flare';
  if (texCache.has(key)) return texCache.get(key)!;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const h = S / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.5)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.06)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const ray = (w: number, len: number, rot: number) => {
    g.save();
    g.translate(h, h);
    g.rotate(rot);
    const lg = g.createLinearGradient(-len, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(-len, 0);
    g.quadraticCurveTo(0, -w, len, 0);
    g.quadraticCurveTo(0, w, -len, 0);
    g.fill();
    g.restore();
  };
  ray(5, h, 0);
  ray(5, h, Math.PI / 2);
  ray(2.5, h * 0.55, Math.PI / 4);
  ray(2.5, h * 0.55, -Math.PI / 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Soft five-pointed star icon (floating markers above people who know where a star is). */
export function starIconTexture(): THREE.Texture {
  const key = 'staricon';
  if (texCache.has(key)) return texCache.get(key)!;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const h = S / 2;
  const halo = g.createRadialGradient(h, h, 0, h, h, h);
  halo.addColorStop(0, 'rgba(255,240,200,0.55)');
  halo.addColorStop(0.5, 'rgba(255,220,150,0.12)');
  halo.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? h * 0.62 : h * 0.27;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = h + Math.cos(a) * r;
    const y = h + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(255,214,130,1)';
  g.stroke();
  const fill = g.createLinearGradient(0, h * 0.3, 0, h * 1.6);
  fill.addColorStop(0, '#fffaf0');
  fill.addColorStop(1, '#ffd88a');
  g.fillStyle = fill;
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Additive sprite with a given texture. */
export function additiveSprite(tex: THREE.Texture, color: string | THREE.Color, scale: number, opacity = 1): THREE.Sprite {
  const m = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}
