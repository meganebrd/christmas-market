import * as THREE from 'three';
import { SKY_FOG_APPLY, SKY_GLSL, patchSkyFog, skyUniforms } from './skyShared';

/**
 * Cheap fake lights, all in a handful of draw calls:
 *  - GlowField('billboard'): additive soft halos (lamp heads, windows, distant hamlet lights)
 *  - GlowField('ground'):    warm light pools painted on the snow (multiply-add blending)
 *  - InstancedGlow:          glowing bulbs / lantern glass (instanced unlit meshes, bloom)
 * Every item has its own brightness `k` (0..1) so the LightDirector can switch them one by one.
 */

interface GlowItem {
  x: number;
  y: number;
  z: number;
  size: number;
  r: number;
  g: number;
  b: number;
  k: number;
}

const billboardVert = /* glsl */ `
attribute vec3 iPos;
attribute float iSize;
attribute vec3 iColor;
varying vec2 vUv;
varying vec3 vCol;
${SKY_GLSL}
${SKY_FOG_APPLY}
void main() {
  vUv = position.xy * 2.0;
  vec4 wp = modelMatrix * vec4(iPos, 1.0);
  vec4 mv = viewMatrix * wp;
  float dist = length(mv.xyz);
  // pull the quad toward the camera so it does not cut into the wall behind the light
  mv.xyz += (-mv.xyz / max(dist, 1e-3)) * min(iSize * 0.4, dist * 0.5);
  // keep far lights at least ~1.5 px wide so they do not shimmer
  float minSize = dist * 0.0025;
  mv.xy += position.xy * max(iSize, minSize);
  gl_Position = projectionMatrix * mv;
  vCol = iColor * skyFogFade(wp.xyz, 0.75) * (iSize >= minSize ? 1.0 : iSize / minSize);
}`;

const billboardFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = exp(-r * r * 5.0) * 0.75 + pow(1.0 - r, 3.0) * 0.25;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

const groundVert = /* glsl */ `
attribute vec3 iPos;
attribute float iSize;
attribute vec3 iColor;
varying vec2 vUv;
varying vec3 vCol;
${SKY_GLSL}
${SKY_FOG_APPLY}
void main() {
  vUv = position.xy * 2.0;
  vec4 wp = modelMatrix * vec4(iPos + vec3(position.x, 0.0, position.y) * iSize, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  vCol = iColor * skyFogFade(wp.xyz, 1.0);
}`;

const groundFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r);
  a = a * a * (0.65 + 0.35 * a);
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

export class GlowField {
  readonly mesh: THREE.Mesh;
  private items: GlowItem[] = [];
  private colorAttr: THREE.InstancedBufferAttribute | null = null;
  private geo: THREE.InstancedBufferGeometry;
  private dirty = false;

  constructor(
    readonly mode: 'billboard' | 'ground',
    opts: { renderOrder?: number } = {},
  ) {
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    const isGround = mode === 'ground';
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...skyUniforms },
      vertexShader: isGround ? groundVert : billboardVert,
      fragmentShader: isGround ? groundFrag : billboardFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    if (isGround) {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? (isGround ? 1 : 5);
    this.mesh.name = isGround ? 'env:light-pools' : 'env:halos';
  }

  /** Returns the item index. `color` is linear, `intensity` multiplies it. */
  add(x: number, y: number, z: number, size: number, color: THREE.Color, intensity = 1): number {
    this.items.push({ x, y, z, size, r: color.r * intensity, g: color.g * intensity, b: color.b * intensity, k: 1 });
    return this.items.length - 1;
  }

  set(i: number, k: number) {
    const it = this.items[i];
    if (!it) return;
    it.k = k;
    if (this.colorAttr) {
      const a = this.colorAttr.array as Float32Array;
      a[i * 3] = it.r * k;
      a[i * 3 + 1] = it.g * k;
      a[i * 3 + 2] = it.b * k;
      this.dirty = true;
    }
  }

  get count() {
    return this.items.length;
  }

  finalize() {
    const n = this.items.length;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const col = new Float32Array(n * 3);
    this.items.forEach((it, i) => {
      pos.set([it.x, it.y, it.z], i * 3);
      size[i] = it.size;
      col.set([it.r * it.k, it.g * it.k, it.b * it.k], i * 3);
    });
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    this.geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 1));
    this.colorAttr = new THREE.InstancedBufferAttribute(col, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iColor', this.colorAttr);
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  /** Call once per frame (uploads changed brightness). */
  flush() {
    if (this.dirty && this.colorAttr) {
      this.colorAttr.needsUpdate = true;
      this.dirty = false;
    }
  }
}

interface InstItem {
  m: THREE.Matrix4;
  c: THREE.Color;
  k: number;
}

/** Instanced unlit meshes whose colour (× intensity × k) blooms: bulbs, lantern glass, stars on trees. */
export class InstancedGlow {
  mesh: THREE.InstancedMesh | null = null;
  private items: InstItem[] = [];
  private dirty = false;
  private tmp = new THREE.Color();

  constructor(
    private geometry: THREE.BufferGeometry,
    private name: string,
    private offLevel = 0.06,
    private fogStrength = 0.55,
  ) {}

  add(matrix: THREE.Matrix4, color: THREE.Color, intensity = 2.5): number {
    this.items.push({ m: matrix.clone(), c: color.clone().multiplyScalar(intensity), k: 1 });
    return this.items.length - 1;
  }

  set(i: number, k: number) {
    const it = this.items[i];
    if (!it) return;
    it.k = k;
    if (this.mesh) {
      this.tmp.copy(it.c).multiplyScalar(this.offLevel + (1 - this.offLevel) * k);
      this.mesh.setColorAt(i, this.tmp);
      this.dirty = true;
    }
  }

  get count() {
    return this.items.length;
  }

  finalize(): THREE.InstancedMesh | null {
    if (!this.items.length) return null;
    const mat = patchSkyFog(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.fogStrength);
    const mesh = new THREE.InstancedMesh(this.geometry, mat, this.items.length);
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      this.tmp.copy(it.c).multiplyScalar(this.offLevel + (1 - this.offLevel) * it.k);
      mesh.setColorAt(i, this.tmp);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.computeBoundingSphere();
    mesh.name = this.name;
    this.mesh = mesh;
    return mesh;
  }

  flush() {
    if (this.dirty && this.mesh?.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.dirty = false;
    }
  }
}

/** Collects several (field, index) pairs so one LightDirector handle can drive them together. */
export class LightBundle {
  private parts: { set: (k: number) => void }[] = [];
  add(field: { set(i: number, k: number): void }, index: number, curve: (k: number) => number = (k) => k) {
    this.parts.push({ set: (k) => field.set(index, curve(k)) });
    return this;
  }
  fn(f: (k: number) => void) {
    this.parts.push({ set: f });
    return this;
  }
  set(k: number) {
    for (const p of this.parts) p.set(k);
  }
  get size() {
    return this.parts.length;
  }
}
