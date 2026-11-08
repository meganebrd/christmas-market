import * as THREE from 'three';
import { coreGeometry, glassMaterial, starGeometry } from './starMesh';
import { createPointsMaterial } from './fx';

/**
 * The found stars, back on their branches of the Grand Sapin. One slot per socket, filled in the order
 * the stars are found (so they match the tree's own light thresholds). Instanced: 3 draw calls for all
 * (glass bodies, glowing cores, halos).
 */
export class TreeStars {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private cores: THREE.InstancedMesh;
  private halos: THREE.Points;
  private haloColor: Float32Array;
  private haloSize: Float32Array;
  private shown: number[];
  private tints: THREE.Color[];
  private pops: { i: number; t: number }[] = [];
  private coreMat: THREE.MeshBasicMaterial;
  private glow = 1;
  private glowTarget = 1;
  private dummy = new THREE.Object3D();
  private warmWhite = new THREE.Color('#fff2d0');

  constructor(readonly sockets: THREE.Vector3[], private scale = 0.85) {
    const n = Math.max(1, sockets.length);
    this.group.name = 'story-tree-stars';
    this.tints = sockets.map(() => new THREE.Color('#ffffff'));
    this.bodies = new THREE.InstancedMesh(starGeometry(), glassMaterial('#ffffff', 1), n);
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.6) });
    this.cores = new THREE.InstancedMesh(coreGeometry(), this.coreMat, n);
    this.bodies.renderOrder = 12;
    this.cores.renderOrder = 11;
    for (let i = 0; i < n; i++) {
      this.bodies.setColorAt(i, this.tints[i] ?? new THREE.Color('#ffffff'));
      this.cores.setColorAt(i, new THREE.Color('#ffffff'));
    }
    this.bodies.frustumCulled = false;
    this.cores.frustumCulled = false;
    const pos = new Float32Array(n * 3);
    sockets.forEach((s, i) => s.toArray(pos, i * 3));
    this.haloColor = new Float32Array(n * 4);
    this.haloSize = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.haloColor, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.haloSize, 1));
    this.halos = new THREE.Points(g, createPointsMaterial());
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 10;
    this.group.add(this.cores, this.bodies, this.halos);
    this.shown = sockets.map(() => 0);
    for (let i = 0; i < n; i++) this.write(i, 0);
    this.refreshAttrs();
    this.group.visible = false;
  }

  get size() {
    return this.sockets.length;
  }

  /** Show a star of this tint in slot `i` (null = empty socket). */
  set(i: number, tint: string | null) {
    if (i < 0 || i >= this.sockets.length) return;
    this.shown[i] = tint ? 1 : 0;
    if (tint) {
      this.tints[i].set(tint);
      this.bodies.setColorAt(i, this.tints[i]);
      this.cores.setColorAt(i, this.tints[i].clone().lerp(this.warmWhite, 0.55));
    }
    this.write(i, this.shown[i]);
    this.refreshAttrs();
    this.group.visible = this.shown.some((x) => x > 0);
  }

  /** Fill slots 0..n-1 with these tints, empty the rest. */
  fill(tints: (string | null)[]) {
    for (let i = 0; i < this.sockets.length; i++) this.set(i, tints[i] ?? null);
  }

  /** A star lands: little pop. */
  pop(i: number) {
    if (i < 0 || i >= this.sockets.length) return;
    this.pops.push({ i, t: 0 });
  }

  /** Finale: everything brighter (1 = normal). */
  setGlow(k: number) {
    this.glowTarget = k;
  }

  private write(i: number, scale: number) {
    const p = this.sockets[i];
    if (!p) return;
    const d = this.dummy;
    d.position.copy(p);
    const out = new THREE.Vector3(p.x, 0, p.z);
    if (out.lengthSq() < 1e-4) out.set(0, 0, 1);
    out.normalize();
    d.lookAt(p.x + out.x, p.y + 0.3, p.z + out.z);
    d.scale.setScalar(Math.max(0.0001, scale * this.scale));
    d.updateMatrix();
    this.bodies.setMatrixAt(i, d.matrix);
    this.cores.setMatrixAt(i, d.matrix);
  }

  private refreshAttrs() {
    this.bodies.instanceMatrix.needsUpdate = true;
    this.cores.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.cores.instanceColor) this.cores.instanceColor.needsUpdate = true;
  }

  update(dt: number, t: number) {
    this.glow += (this.glowTarget - this.glow) * Math.min(1, dt * 1.5);
    let dirty = false;
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const p = this.pops[k];
      p.t += dt;
      const x = Math.min(1, p.t / 0.55);
      const s = x < 1 ? 1 + Math.sin(x * Math.PI) * 0.5 * (1 - x * 0.3) : 1;
      this.write(p.i, s * this.shown[p.i]);
      dirty = true;
      if (x >= 1) this.pops.splice(k, 1);
    }
    if (dirty) this.refreshAttrs();
    this.coreMat.color.setScalar(2.2 * (0.85 + 0.15 * Math.sin(t * 2.1)) * this.glow);
    for (let i = 0; i < this.sockets.length; i++) {
      const c = this.tints[i];
      const tw = 0.75 + 0.25 * Math.sin(t * 2.6 + i * 1.9);
      const on = this.shown[i];
      this.haloColor[i * 4] = (c.r * 0.6 + 0.4) * 0.8 * this.glow;
      this.haloColor[i * 4 + 1] = (c.g * 0.6 + 0.4) * 0.75 * this.glow;
      this.haloColor[i * 4 + 2] = (c.b * 0.6 + 0.35) * 0.65 * this.glow;
      this.haloColor[i * 4 + 3] = on * tw * 0.8;
      this.haloSize[i] = on * (1.2 + 0.3 * tw) * (0.8 + 0.2 * this.glow);
    }
    const g = this.halos.geometry;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}
