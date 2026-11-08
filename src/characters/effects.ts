import * as THREE from 'three';
import type { GameContext } from '../core/contracts';
import { puffTexture } from './emotes';
import { PALETTE } from '../world/palette';
import type { CosyRig } from './rig';

/**
 * Shared, pooled little effects for every character — 3 draw calls in total:
 *  - soft particles (breath puffs in the cold air, snow kicked up when running, steam from mugs, pipe smoke),
 *  - footprints in the snow that slowly fade (instanced quads),
 *  - soft blob shadows under everyone (instanced quads; real shadows are only on "high").
 */
const PARTICLES = 420;
const PRINTS = 180;
const SHADOWS = 72;

const particleVert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = aAlpha;
  vColor = aColor;
  #include <fog_vertex>
}`;
const particleFrag = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <fog_fragment>
}`;

const decalVert = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const decalFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vAlpha;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(uMap, vUv).a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}`;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  // particles
  private pPos = new Float32Array(PARTICLES * 3);
  private pVel = new Float32Array(PARTICLES * 3);
  private pSize = new Float32Array(PARTICLES);
  private pAlpha = new Float32Array(PARTICLES);
  private pCol = new Float32Array(PARTICLES * 3);
  private pAge = new Float32Array(PARTICLES);
  private pLife = new Float32Array(PARTICLES);
  private pGrow = new Float32Array(PARTICLES);
  private pBase = new Float32Array(PARTICLES);
  private pGrav = new Float32Array(PARTICLES);
  private pNext = 0;
  private pAlive = 0;
  private points: THREE.Points;
  private pUniforms: { uScale: { value: number }; uMap: { value: THREE.Texture } };

  // footprints
  private prints: THREE.InstancedMesh;
  private printAge = new Float32Array(PRINTS).fill(999);
  private printAlpha: THREE.InstancedBufferAttribute;
  private printNext = 0;
  private printsAlive = 0;

  // blob shadows
  private shadows: THREE.InstancedMesh;
  private shadowRigs = new Set<CosyRig>();

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private col = new THREE.Color();
  private size = new THREE.Vector2();

  constructor(private ctx: GameContext) {
    // ── particles
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.pUniforms = { uScale: { value: 400 }, uMap: { value: puffTexture() } };
    const pm = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    Object.assign(pm.uniforms, this.pUniforms);
    this.points = new THREE.Points(pg, pm);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.name = 'character-particles';
    ctx.scene.add(this.points);

    // ── footprints
    const printTex = canvasTex(64, (g, S) => {
      const grd = g.createRadialGradient(S / 2, S * 0.42, 2, S / 2, S * 0.5, S * 0.5);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.7)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(S / 2, S * 0.36, S * 0.3, S * 0.3, 0, 0, Math.PI * 2);
      g.ellipse(S / 2, S * 0.74, S * 0.22, S * 0.2, 0, 0, Math.PI * 2);
      g.fill();
    });
    const printGeo = new THREE.PlaneGeometry(0.13, 0.19);
    printGeo.rotateX(-Math.PI / 2);
    this.printAlpha = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS), 1);
    this.printAlpha.setUsage(THREE.DynamicDrawUsage);
    printGeo.setAttribute('aAlpha', this.printAlpha);
    const printMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#4a5788') } }]),
      vertexShader: decalVert,
      fragmentShader: decalFrag,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    printMat.uniforms.uMap = { value: printTex };
    this.prints = new THREE.InstancedMesh(printGeo, printMat, PRINTS);
    this.prints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.prints.frustumCulled = false;
    this.prints.count = 0;
    this.prints.renderOrder = 1;
    this.prints.name = 'footprints';
    ctx.scene.add(this.prints);

    // ── blob shadows
    const shadowTex = canvasTex(64, (g, S) => {
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.85)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    });
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    const sa = new THREE.InstancedBufferAttribute(new Float32Array(SHADOWS).fill(1), 1);
    sg.setAttribute('aAlpha', sa);
    const sm = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#0d1230') } }]),
      vertexShader: decalVert,
      fragmentShader: decalFrag.replace('gl_FragColor = vec4(uColor, a);', 'gl_FragColor = vec4(uColor, a * 0.42);'),
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    sm.uniforms.uMap = { value: shadowTex };
    this.shadows = new THREE.InstancedMesh(sg, sm, SHADOWS);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.shadows.renderOrder = 2;
    this.shadows.name = 'blob-shadows';
    ctx.scene.add(this.shadows);

    ctx.addSystem((dt) => this.update(dt));
  }

  // ───────────────────────────── particles ─────────────────────────────

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, alpha: number, grow: number, grav: number, color: THREE.Color) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % PARTICLES;
    if (this.pAge[i] < this.pLife[i]) this.pAlive--;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    this.pSize[i] = size;
    this.pAge[i] = 0;
    this.pLife[i] = life;
    this.pBase[i] = alpha;
    this.pGrow[i] = grow;
    this.pGrav[i] = grav;
    this.pCol[i * 3] = color.r;
    this.pCol[i * 3 + 1] = color.g;
    this.pCol[i * 3 + 2] = color.b;
    this.pAlive++;
  }

  /** A little cloud of breath in the cold air. */
  breath(pos: THREE.Vector3, forward: THREE.Vector3, k = 1) {
    this.col.set('#eef3ff');
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const sp = 0.25 + Math.random() * 0.2;
      this.emit(
        pos.x + (Math.random() - 0.5) * 0.03,
        pos.y + (Math.random() - 0.5) * 0.03,
        pos.z + (Math.random() - 0.5) * 0.03,
        forward.x * sp + (Math.random() - 0.5) * 0.08,
        0.06 + Math.random() * 0.08,
        forward.z * sp + (Math.random() - 0.5) * 0.08,
        0.085 * k,
        1.2 + Math.random() * 0.6,
        0.55,
        0.3,
        -0.02,
        this.col,
      );
    }
  }

  /** Snow kicked up by a running foot. */
  snowKick(pos: THREE.Vector3, back: THREE.Vector3, k = 1) {
    this.col.set(PALETTE.snow);
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const sp = 0.6 + Math.random() * 0.8;
      this.emit(
        pos.x,
        0.04,
        pos.z,
        back.x * sp + (Math.random() - 0.5) * 0.6,
        0.7 + Math.random() * 0.8,
        back.z * sp + (Math.random() - 0.5) * 0.6,
        0.05 * k + Math.random() * 0.03,
        0.55 + Math.random() * 0.25,
        0.75,
        0.08,
        3.6,
        this.col,
      );
    }
  }

  /** Fine ice spray when skating. */
  iceSpray(pos: THREE.Vector3, side: THREE.Vector3) {
    this.col.set('#dff2ff');
    for (let i = 0; i < 4; i++) {
      this.emit(pos.x, 0.03, pos.z, side.x * (0.8 + Math.random()) + (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, side.z * (0.8 + Math.random()) + (Math.random() - 0.5) * 0.3, 0.035, 0.45, 0.6, 0.05, 2.5, this.col);
    }
  }

  /** Big soft burst (snowball impact). */
  snowBurst(pos: THREE.Vector3, k = 1) {
    this.col.set('#f4f7ff');
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 1.2;
      this.emit(pos.x, pos.y, pos.z, Math.cos(a) * sp, 0.4 + Math.random() * 1.4, Math.sin(a) * sp, 0.07 * k, 0.6 + Math.random() * 0.4, 0.85, 0.12, 4, this.col);
    }
  }

  /** Steam rising from a mug, smoke from a pipe, a puff of warmth. */
  steam(pos: THREE.Vector3, color = '#f2f2f6', k = 1) {
    this.col.set(color);
    for (let i = 0; i < 2; i++) {
      this.emit(pos.x + (Math.random() - 0.5) * 0.03, pos.y, pos.z + (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.05, 0.22 + Math.random() * 0.1, (Math.random() - 0.5) * 0.05, 0.05 * k, 1.4 + Math.random() * 0.5, 0.28, 0.22, -0.04, this.col);
    }
  }

  // ───────────────────────────── footprints ─────────────────────────────

  footprint(pos: THREE.Vector3, yaw: number, k = 1) {
    const i = this.printNext;
    this.printNext = (this.printNext + 1) % PRINTS;
    this.printAge[i] = 0;
    this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.s.set(k, 1, k);
    this.v.set(pos.x, 0.012, pos.z);
    this.m.compose(this.v, this.q, this.s);
    this.prints.setMatrixAt(i, this.m);
    this.prints.instanceMatrix.needsUpdate = true;
    this.printsAlive = Math.min(PRINTS, this.printsAlive + 1);
    this.prints.count = Math.max(this.prints.count, Math.min(PRINTS, i + 1));
  }

  // ───────────────────────────── shadows ─────────────────────────────

  addShadow(rig: CosyRig) {
    this.shadowRigs.add(rig);
  }

  removeShadow(rig: CosyRig) {
    this.shadowRigs.delete(rig);
  }

  // ───────────────────────────── update ─────────────────────────────

  update(dt: number) {
    const cam = this.ctx.camera;
    this.ctx.renderer.getDrawingBufferSize(this.size);
    this.pUniforms.uScale.value = this.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));

    // particles
    if (this.pAlive > 0) {
      let alive = 0;
      for (let i = 0; i < PARTICLES; i++) {
        const life = this.pLife[i];
        if (this.pAge[i] >= life) {
          this.pAlpha[i] = 0;
          continue;
        }
        const age = (this.pAge[i] += dt);
        if (age >= life) {
          this.pAlpha[i] = 0;
          continue;
        }
        alive++;
        const j = i * 3;
        this.pVel[j + 1] -= this.pGrav[i] * dt;
        const drag = 1 - Math.min(1, dt * 1.6);
        this.pVel[j] *= drag;
        this.pVel[j + 2] *= drag;
        this.pPos[j] += this.pVel[j] * dt;
        this.pPos[j + 1] = Math.max(0.01, this.pPos[j + 1] + this.pVel[j + 1] * dt);
        this.pPos[j + 2] += this.pVel[j + 2] * dt;
        const u = age / life;
        this.pAlpha[i] = this.pBase[i] * Math.min(1, u * 6) * (1 - u) * (1 - u);
        this.pSize[i] += this.pGrow[i] * dt;
      }
      this.pAlive = alive;
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
    }

    // footprints fade
    if (this.printsAlive > 0) {
      let any = 0;
      const arr = this.printAlpha.array as Float32Array;
      for (let i = 0; i < this.prints.count; i++) {
        const a = (this.printAge[i] += dt);
        const k = a < 0.3 ? a / 0.3 : a < 9 ? 1 : Math.max(0, 1 - (a - 9) / 7);
        arr[i] = 0.8 * k;
        if (k > 0) any++;
      }
      this.printsAlive = any;
      this.printAlpha.needsUpdate = true;
    }

    // blob shadows
    let n = 0;
    const camPos = cam.position;
    for (const rig of this.shadowRigs) {
      if (n >= SHADOWS) break;
      const r = rig.root;
      if (!r.visible || !r.parent) continue;
      const p = r.position;
      if ((p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 > 70 * 70) continue;
      const lift = Math.max(0, rig.footLift);
      const d = rig.dims;
      const w = (0.5 + 0.12 * d.b) * d.h * Math.max(0.55, 1 - lift * 1.6) * (rig.sitting ? 1.3 : 1);
      this.v.set(p.x, 0.016, p.z);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r.rotation.y);
      this.s.set(w * 0.95, 1, w * 0.8);
      this.m.compose(this.v, this.q, this.s);
      this.shadows.setMatrixAt(n++, this.m);
    }
    this.shadows.count = n;
    if (n) this.shadows.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.prints.removeFromParent();
    this.shadows.removeFromParent();
  }
}

let shared: Effects | null = null;
let sharedCtx: GameContext | null = null;

/** One Effects instance per game (player and NPCs share it). */
export function getEffects(ctx: GameContext): Effects {
  if (!shared || sharedCtx !== ctx) {
    shared = new Effects(ctx);
    sharedCtx = ctx;
  }
  return shared;
}
