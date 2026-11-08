import * as THREE from 'three';

/**
 * GPU effects for the landmarks. Everything animates in the vertex shader from a shared time uniform,
 * so a whole landmark's halos / steam / embers / flames cost one draw call each and ~zero CPU per frame.
 *
 *   Halos      soft additive light halos (billboards), optional twinkle / 4-ray sparkle
 *   Particles  looping emitters (steam, smoke, embers, sparks) or one-shot bursts
 *   Flames     cylindrical-billboard procedural flames
 */

/** Shared time uniform for every landmark FX material (updated once per frame by index.ts). */
export const fxTime = { value: 0 };

let quad: THREE.PlaneGeometry | null = null;
function baseQuad() {
  return (quad ??= new THREE.PlaneGeometry(1, 1));
}

function instancedQuads(count: number, attrs: Record<string, [Float32Array, number]>): THREE.InstancedBufferGeometry {
  const q = baseQuad();
  const g = new THREE.InstancedBufferGeometry();
  g.index = q.index;
  g.setAttribute('position', q.attributes.position);
  g.setAttribute('uv', q.attributes.uv);
  for (const [k, [arr, size]] of Object.entries(attrs)) g.setAttribute(k, new THREE.InstancedBufferAttribute(arr, size));
  g.instanceCount = count;
  return g;
}

function sphereAround(points: THREE.Vector3[], pad: number): THREE.Sphere {
  const box = new THREE.Box3();
  for (const p of points) box.expandByPoint(p);
  const s = new THREE.Sphere();
  if (box.isEmpty()) return s;
  box.getBoundingSphere(s);
  s.radius += pad;
  return s;
}

const _c = new THREE.Color();

// ───────────────────────────── Halos ─────────────────────────────

export interface HaloSpec {
  pos: THREE.Vector3;
  color: THREE.ColorRepresentation;
  /** World size of the billboard (diameter, metres). */
  size: number;
  /** 0..1 brightness multiplier. */
  k?: number;
  /** 0..1 how much this one twinkles. */
  twinkle?: number;
}

const HALO_VS = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec3 aColor;
  attribute vec3 aData; // size, phase, twinkle
  uniform float uTime;
  uniform float uLevel;
  uniform float uTwinkle;
  varying vec2 vUv;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    float ph = aData.y;
    float tw = 0.5 + 0.5 * sin(uTime * (1.7 + fract(ph * 7.31) * 3.2) + ph * 40.0);
    tw = tw * tw;
    vColor = aColor * uLevel * (1.0 - uTwinkle * aData.z * (1.0 - tw));
    vec4 mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
    float s = aData.x * (1.0 + uTwinkle * aData.z * 0.25 * (tw - 0.5));
    mvPosition.xy += position.xy * s;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const HALO_FS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float g = exp(-r * r * 6.0) * 0.75 + exp(-r * r * 38.0) * 0.55;
    #ifdef SPARKLE
      float ray = max(0.0, 1.0 - abs(d.x) * 26.0) * max(0.0, 1.0 - abs(d.y) * 2.1)
                + max(0.0, 1.0 - abs(d.y) * 26.0) * max(0.0, 1.0 - abs(d.x) * 2.1);
      g = g * 0.6 + ray * 0.9;
    #endif
    g *= 1.0 - smoothstep(0.75, 1.0, r);
    vec3 col = vColor * g;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      col *= 1.0 - 0.7 * fogFactor;
    #endif
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Halos {
  readonly mesh: THREE.Mesh;
  readonly uniforms: { uTime: { value: number }; uLevel: { value: number }; uTwinkle: { value: number } };
  private colors: Float32Array;
  private base: THREE.Color[];
  private attr: THREE.InstancedBufferAttribute;

  constructor(items: HaloSpec[], opts: { twinkle?: number; sparkle?: boolean; level?: number } = {}) {
    const n = Math.max(1, items.length);
    const off = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const data = new Float32Array(n * 3);
    this.base = [];
    items.forEach((h, i) => {
      off.set([h.pos.x, h.pos.y, h.pos.z], i * 3);
      _c.set(h.color);
      this.base.push(_c.clone());
      const k = h.k ?? 1;
      col.set([_c.r * k, _c.g * k, _c.b * k], i * 3);
      data.set([h.size, Math.random(), h.twinkle ?? 0], i * 3);
    });
    this.colors = col;
    const geo = instancedQuads(items.length, { aOffset: [off, 3], aColor: [col, 3], aData: [data, 3] });
    this.attr = geo.getAttribute('aColor') as THREE.InstancedBufferAttribute;
    const maxSize = items.reduce((m, h) => Math.max(m, h.size), 0);
    geo.boundingSphere = sphereAround(
      items.map((h) => h.pos),
      maxSize,
    );
    this.uniforms = { uTime: fxTime, uLevel: { value: opts.level ?? 1 }, uTwinkle: { value: opts.twinkle ?? 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: HALO_VS,
      fragmentShader: HALO_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      defines: opts.sparkle ? { SPARKLE: 1 } : {},
    });
    Object.assign(m.uniforms, this.uniforms);
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.name = 'halos';
    this.mesh.renderOrder = 2;
    this.mesh.visible = items.length > 0;
  }

  set level(k: number) {
    this.uniforms.uLevel.value = k;
    this.mesh.visible = k > 0.003 && this.base.length > 0;
  }

  /** Move one halo (local position). Call `commitPositions()` once after a batch. */
  setPos(i: number, x: number, y: number, z: number) {
    const a = this.mesh.geometry.getAttribute('aOffset') as THREE.InstancedBufferAttribute;
    a.setXYZ(i, x, y, z);
  }

  commitPositions() {
    (this.mesh.geometry.getAttribute('aOffset') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** Change one halo's brightness (k) and optionally its colour. Cheap: flags the attribute for upload. */
  setOne(i: number, k: number, color?: THREE.ColorRepresentation) {
    if (i < 0 || i >= this.base.length) return;
    if (color !== undefined) this.base[i].set(color);
    const c = this.base[i];
    this.colors[i * 3] = c.r * k;
    this.colors[i * 3 + 1] = c.g * k;
    this.colors[i * 3 + 2] = c.b * k;
    this.attr.needsUpdate = true;
  }
}

// ───────────────────────────── Particles ─────────────────────────────

export interface EmitterOpts {
  /** Particles per origin. */
  count: number;
  /** Seconds of one particle's life. */
  life: number;
  /** Base velocity (m/s, local). */
  vel: [number, number, number];
  /** Horizontal spread over the life (m) — or burst speed (m/s) when `burst`. */
  spread: number;
  /** Spawn jitter radius around the origin (m). */
  jitter?: number;
  gravity?: number;
  wobble?: number;
  size: [number, number];
  color: [THREE.ColorRepresentation, THREE.ColorRepresentation];
  opacity?: number;
  additive?: boolean;
  /** Gaussian sharpness of the sprite (2 = very soft smoke, 10 = spark). */
  sharp?: number;
  /** One-shot spherical burst triggered with `fire()`. */
  burst?: boolean;
}

const PART_VS = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aData; // phase, r1, r2, r3
  uniform float uTime, uLife, uSpread, uGravity, uWobble, uLevel, uOpacity, uBurst;
  uniform vec2 uSize;
  uniform vec3 uVel, uColor0, uColor1;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vUv = uv;
    float alive = 1.0;
    #ifdef BURST
      float age = uTime - uBurst;
      float life = age / (uLife * (0.55 + 0.45 * aData.w));
      alive = step(0.0, life) * step(life, 1.0);
      life = clamp(life, 0.0, 1.0);
      float th = aData.y * 6.2831853;
      float ph = acos(2.0 * aData.z - 1.0);
      vec3 dir = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
      float a = max(age, 0.0);
      vec3 p = aOffset + dir * uSpread * a * (0.45 + 0.55 * aData.w) + uVel * a - vec3(0.0, uGravity * a * a, 0.0);
    #else
      float life = fract(uTime / uLife + aData.x);
      float age = life * uLife;
      float th = aData.y * 6.2831853;
      vec3 dir = vec3(cos(th), 0.0, sin(th)) * (0.25 + 0.75 * aData.z);
      vec3 p = aOffset + dir * uSpread * life + uVel * age * (0.7 + 0.6 * aData.w) - vec3(0.0, uGravity * age * age, 0.0);
      p.x += sin(uTime * 1.7 + aData.y * 20.0) * uWobble * life;
      p.z += cos(uTime * 1.3 + aData.z * 20.0) * uWobble * life;
    #endif
    float size = mix(uSize.x, uSize.y, life) * (0.7 + 0.6 * aData.w);
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.5, 1.0, life)) * uOpacity * uLevel * alive;
    vColor = mix(uColor0, uColor1, life);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    mvPosition.xy += position.xy * size * alive;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PART_FS = /* glsl */ `
  uniform float uSharp;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = exp(-r * r * uSharp) * (1.0 - smoothstep(0.8, 1.0, r));
    #ifdef ADDITIVE
      gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
    #else
      gl_FragColor = vec4(vColor, a * vAlpha);
    #endif
  }
`;

export class Particles {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, { value: any }>;

  constructor(origins: THREE.Vector3[], o: EmitterOpts) {
    const per = Math.max(1, Math.round(o.count));
    const n = origins.length * per;
    const off = new Float32Array(n * 3);
    const data = new Float32Array(n * 4);
    const j = o.jitter ?? 0.05;
    let i = 0;
    for (const p of origins) {
      for (let k = 0; k < per; k++, i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * j;
        off.set([p.x + Math.cos(a) * rr, p.y, p.z + Math.sin(a) * rr], i * 3);
        data.set([(k + Math.random() * 0.6) / per, Math.random(), Math.random(), Math.random()], i * 4);
      }
    }
    const geo = instancedQuads(n, { aOffset: [off, 3], aData: [data, 4] });
    const reach = Math.abs(o.vel[1]) * o.life + o.spread * (o.burst ? o.life : 1) + o.size[1] + (o.wobble ?? 0) + 1;
    geo.boundingSphere = sphereAround(origins, reach);
    this.uniforms = {
      uTime: fxTime,
      uLife: { value: o.life },
      uSpread: { value: o.spread },
      uGravity: { value: o.gravity ?? 0 },
      uWobble: { value: o.wobble ?? 0 },
      uLevel: { value: 1 },
      uOpacity: { value: o.opacity ?? 1 },
      uBurst: { value: -1e4 },
      uSize: { value: new THREE.Vector2(o.size[0], o.size[1]) },
      uVel: { value: new THREE.Vector3(...o.vel) },
      uColor0: { value: new THREE.Color(o.color[0]) },
      uColor1: { value: new THREE.Color(o.color[1]) },
      uSharp: { value: o.sharp ?? 4 },
    };
    const defines: Record<string, number> = {};
    if (o.additive) defines.ADDITIVE = 1;
    if (o.burst) defines.BURST = 1;
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines,
    });
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.name = 'particles';
    this.mesh.renderOrder = 3;
    if (o.burst) this.mesh.visible = false;
  }

  set level(k: number) {
    this.uniforms.uLevel.value = k;
  }

  /** Starts a one-shot burst (emitters created with `burst: true`). */
  fire(life?: number) {
    this.uniforms.uBurst.value = fxTime.value;
    this.mesh.visible = true;
    const l = life ?? this.uniforms.uLife.value;
    setTimeout(() => {
      if (fxTime.value - this.uniforms.uBurst.value >= l - 0.05) this.mesh.visible = false;
    }, l * 1000 + 300);
  }
}

// ───────────────────────────── Flames ─────────────────────────────

export interface FlameSpec {
  pos: THREE.Vector3;
  w: number;
  h: number;
  /** Brightness (2..3 blooms nicely). */
  k?: number;
}

const FLAME_VS = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aData; // w, h, phase, k
  uniform float uTime, uLevel;
  varying vec2 vUv;
  varying float vPhase;
  varying float vK;
  void main() {
    vec4 wc = modelMatrix * vec4(aOffset, 1.0);
    vec3 toCam = cameraPosition - wc.xyz;
    toCam.y = 0.0;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam + vec3(1e-4, 0.0, 1e-4)));
    float flick = 1.0 + 0.1 * sin(uTime * 13.0 + aData.z * 7.0) + 0.07 * sin(uTime * 23.0 + aData.z * 3.0);
    vec3 wp = wc.xyz + right * position.x * aData.x + vec3(0.0, (position.y + 0.5) * aData.y * flick, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = uv;
    vPhase = aData.z;
    vK = aData.w * uLevel;
  }
`;

const FLAME_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColA, uColB, uColC;
  varying vec2 vUv;
  varying float vPhase;
  varying float vK;
  void main() {
    float y = vUv.y;
    float t = uTime;
    float sway = sin(y * 6.0 - t * 7.0 + vPhase * 6.0) * 0.11 * y + sin(y * 13.0 - t * 12.0 + vPhase * 3.0) * 0.05 * y;
    float x = (vUv.x - 0.5 - sway) * 2.0;
    float w = 1.55 * sqrt(max(y, 0.0)) * pow(max(1.0 - y, 0.0), 1.05) + 0.02;
    float d = abs(x) / w;
    float body = 1.0 - smoothstep(0.5, 1.0, d);
    float core = (1.0 - smoothstep(0.0, 0.55, d)) * (1.0 - smoothstep(0.15, 0.6, y));
    vec3 col = mix(uColA, uColB, smoothstep(0.1, 0.9, 1.0 - d) * (1.0 - y * 0.6));
    col = mix(col, uColC, core * 0.85);
    float a = body * (1.0 - smoothstep(0.7, 1.0, y)) * smoothstep(0.0, 0.06, y);
    a *= 0.85 + 0.15 * sin(t * 17.0 + vPhase * 11.0 + y * 9.0);
    gl_FragColor = vec4(col * a * vK, 1.0);
  }
`;

export class Flames {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, { value: any }>;
  constructor(items: FlameSpec[], colors: [string, string, string] = ['#ff4a12', '#ffa733', '#fff1c4']) {
    const n = items.length;
    const off = new Float32Array(n * 3);
    const data = new Float32Array(n * 4);
    items.forEach((f, i) => {
      off.set([f.pos.x, f.pos.y, f.pos.z], i * 3);
      data.set([f.w, f.h, Math.random() * 10, f.k ?? 2.4], i * 4);
    });
    const geo = instancedQuads(n, { aOffset: [off, 3], aData: [data, 4] });
    geo.boundingSphere = sphereAround(
      items.map((f) => f.pos),
      items.reduce((m, f) => Math.max(m, f.h), 0) + 0.5,
    );
    this.uniforms = {
      uTime: fxTime,
      uLevel: { value: 1 },
      uColA: { value: new THREE.Color(colors[0]) },
      uColB: { value: new THREE.Color(colors[1]) },
      uColC: { value: new THREE.Color(colors[2]) },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FLAME_VS,
      fragmentShader: FLAME_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.name = 'flames';
    this.mesh.renderOrder = 3;
  }
}

// ───────────────────────────── Canvas textures ─────────────────────────────

let raysTex: THREE.Texture | null = null;
/** Star rays (for the radiant top star). */
export function raysTexture(): THREE.Texture {
  if (raysTex) return raysTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const len = (i % 2 ? 0.62 : 0.98) * (S / 2);
    const w = i % 2 ? 0.05 : 0.075;
    const grd = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * 10, Math.sin(a - w) * 10);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a + w) * 10, Math.sin(a + w) * 10);
    g.closePath();
    g.fill();
  }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.3);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(-S / 2, -S / 2, S, S);
  raysTex = new THREE.CanvasTexture(c);
  raysTex.colorSpace = THREE.SRGBColorSpace;
  return raysTex;
}

/** Generic canvas texture painter. */
export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────────────────────── Dusk environment map ─────────────────────────────

let envTex: THREE.Texture | null | undefined;
let envTarget: THREE.WebGLRenderTarget | null = null;

/**
 * A tiny pre-filtered environment of the blue-hour sky with warm market lights on the horizon.
 * Only used by the landmarks' metals, glass and ice (never set as scene.environment).
 */
export function duskEnv(renderer: THREE.WebGLRenderer): THREE.Texture | null {
  if (envTex !== undefined) return envTex;
  try {
    envTarget = renderDuskEnv(renderer);
    envTex = envTarget.texture;
  } catch (err) {
    console.warn('[landmarks] env map failed', err);
    envTex = null;
  }
  return envTex;
}

/**
 * The env map lives only on the GPU: after a WebGL context loss its pixels are gone (metals and ice
 * would turn dark). Render it again and hand the new texture to every material of `root` using it.
 */
export function refreshDuskEnv(renderer: THREE.WebGLRenderer, root: THREE.Object3D) {
  if (!envTex || !envTarget) return;
  const old = envTex;
  const oldTarget = envTarget;
  try {
    envTarget = renderDuskEnv(renderer);
  } catch (err) {
    console.warn('[landmarks] env map refresh failed', err);
    return;
  }
  envTex = envTarget.texture;
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      if ((x as THREE.MeshStandardMaterial).envMap === old) (x as THREE.MeshStandardMaterial).envMap = envTex!;
    }
  });
  oldTarget.dispose();
}

function renderDuskEnv(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#0b1130') },
        mid: { value: new THREE.Color('#2a3a78') },
        hor: { value: new THREE.Color('#e0956f') },
        low: { value: new THREE.Color('#9aa8cf') },
        deep: { value: new THREE.Color('#2a3463') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 top, mid, hor, low, deep; varying vec3 vP;
        void main(){
          float y = vP.y;
          vec3 c = mix(mid, top, smoothstep(0.15, 0.9, y));
          c = mix(hor * (0.7 + 0.5 * smoothstep(0.0, -1.0, vP.x)), c, smoothstep(0.0, 0.22, y));
          vec3 g = mix(low * 0.55, deep, smoothstep(0.0, -0.6, y));
          c = y < 0.0 ? mix(hor * 0.6, g, smoothstep(0.0, -0.12, y)) : c;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  const dot = new THREE.SphereGeometry(0.9, 8, 6);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc56b').multiplyScalar(6) });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
    const y = -1 + Math.random() * 6;
    const m = new THREE.Mesh(dot, warm);
    m.position.set(Math.sin(a) * 40, y, Math.cos(a) * 40);
    m.scale.setScalar(0.6 + Math.random() * 0.8);
    scene.add(m);
  }
  const moon = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4dc').multiplyScalar(4) }));
  moon.position.set(30, 22, -14);
  moon.scale.setScalar(2.4);
  scene.add(moon);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.035);
  pm.dispose();
  sky.geometry.dispose();
  (sky.material as THREE.Material).dispose();
  dot.dispose();
  warm.dispose();
  (moon.material as THREE.Material).dispose();
  return rt;
}
