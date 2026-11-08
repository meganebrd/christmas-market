import * as THREE from 'three';
import { SKY_FOG_APPLY, SKY_GLSL, skyUniforms } from './skyShared';

/**
 * Lit windows of the village, all in ONE instanced draw call. The pane pattern (mullions,
 * curtains, a paper star, stained glass) is drawn in the shader; each window has its own
 * brightness so a house can light up during the intro wave.
 */
export const WinKind = {
  Cross: 0,
  Six: 1,
  Curtains: 2,
  Star: 3,
  Stained: 4,
  Round: 5,
  Clock: 6,
} as const;
export type WinKind = (typeof WinKind)[keyof typeof WinKind];

interface Win {
  m: THREE.Matrix4;
  kind: number;
  color: THREE.Color;
  k: number;
  seed: number;
}

export class WindowField {
  mesh: THREE.InstancedMesh | null = null;
  private items: Win[] = [];
  private dirty = false;
  private tmp = new THREE.Color();

  /** `matrix` places a unit quad (facing +Z) — scale it to the window size. */
  add(matrix: THREE.Matrix4, kind: WinKind, color: THREE.Color, intensity: number, seed = Math.random()): number {
    this.items.push({ m: matrix.clone(), kind, color: color.clone().multiplyScalar(intensity), k: 1, seed });
    return this.items.length - 1;
  }

  set(i: number, k: number) {
    const it = this.items[i];
    if (!it) return;
    it.k = k;
    if (this.mesh) {
      this.tmp.copy(it.color).multiplyScalar(0.02 + 0.98 * k);
      this.mesh.setColorAt(i, this.tmp);
      this.dirty = true;
    }
  }

  flush() {
    if (this.dirty && this.mesh?.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.dirty = false;
    }
  }

  get count() {
    return this.items.length;
  }

  finalize(): THREE.InstancedMesh | null {
    const n = this.items.length;
    if (!n) return null;
    const geo = new THREE.PlaneGeometry(1, 1);
    const kinds = new Float32Array(n * 2);
    this.items.forEach((it, i) => {
      kinds[i * 2] = it.kind;
      kinds[i * 2 + 1] = it.seed;
    });
    geo.setAttribute('aWin', new THREE.InstancedBufferAttribute(kinds, 2));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...skyUniforms, uGlass: { value: new THREE.Color('#1b2240') } },
      vertexShader: /* glsl */ `
        attribute vec2 aWin;
        varying vec2 vUv;
        varying vec2 vWin;
        varying vec3 vCol;
        varying vec3 vW;
        varying vec2 vSize;
        void main() {
          vUv = uv;
          vWin = aWin;
          #ifdef USE_INSTANCING_COLOR
            vCol = instanceColor;
          #else
            vCol = vec3(1.0);
          #endif
          vSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uGlass;
        varying vec2 vUv;
        varying vec2 vWin;
        varying vec3 vCol;
        varying vec3 vW;
        varying vec2 vSize;
        ${SKY_GLSL}
        ${SKY_FOG_APPLY}
        float bar(float x, float c, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(x) * 1.2, abs(x - c)); }
        void main() {
          vec2 uv = vUv;
          float kind = vWin.x;
          float seed = vWin.y;
          // warm interior light: brighter low and in the middle
          float glow = 0.72 + 0.4 * (1.0 - uv.y) * (1.0 - abs(uv.x - 0.5));
          vec3 col = vCol * glow;
          float bw = 0.09 / max(vSize.x, 0.3);
          float bh = 0.09 / max(vSize.y, 0.3);
          float frame = 0.0;
          if (kind < 0.5) {
            frame = max(bar(uv.x, 0.5, bw), bar(uv.y, 0.55, bh));
          } else if (kind < 1.5) {
            frame = max(bar(uv.x, 0.5, bw), max(bar(uv.y, 0.36, bh), bar(uv.y, 0.68, bh)));
          } else if (kind < 2.5) {
            frame = max(bar(uv.x, 0.5, bw), bar(uv.y, 0.55, bh));
            float drape = 0.16 + 0.1 * smoothstep(0.75, 0.35, uv.y) * smoothstep(0.0, 0.35, uv.y);
            float c = smoothstep(drape, drape - 0.03, uv.x) + smoothstep(1.0 - drape, 1.0 - drape + 0.03, uv.x);
            col = mix(col, vCol * vec3(0.95, 0.45, 0.32) * 0.55, clamp(c, 0.0, 1.0));
          } else if (kind < 3.5) {
            frame = max(bar(uv.x, 0.5, bw), bar(uv.y, 0.55, bh));
            vec2 p = (uv - vec2(0.5, 0.72)) * vec2(vSize.x / max(vSize.y, 0.01), 1.0);
            float a = atan(p.y, p.x);
            float r = length(p);
            float star = smoothstep(0.012, 0.0, r - (0.07 + 0.045 * cos(a * 5.0 + seed * 6.0)));
            col += vCol * star * 1.4;
          } else if (kind < 4.5) {
            // stained glass (church): lead lines and coloured cells
            vec2 g = floor(uv * vec2(3.0, 7.0));
            float h = fract(sin(dot(g, vec2(12.9898, 78.233)) + seed * 13.0) * 43758.5453);
            vec3 tint = h < 0.25 ? vec3(1.0, 0.35, 0.25) : h < 0.5 ? vec3(0.35, 0.55, 1.0) : h < 0.75 ? vec3(1.0, 0.8, 0.35) : vec3(0.45, 0.9, 0.55);
            col = vCol * tint * glow;
            vec2 f = fract(uv * vec2(3.0, 7.0));
            frame = max(smoothstep(0.1, 0.0, min(f.x, 1.0 - f.x)), smoothstep(0.1, 0.0, min(f.y, 1.0 - f.y))) * 0.8;
            // arched top
            vec2 q = (uv - vec2(0.5, 0.78)) * vec2(vSize.x / max(vSize.y, 0.01) * 2.0, 1.0);
            if (uv.y > 0.78 && length(q * vec2(1.0, 4.5)) > 1.0) discard;
          } else if (kind < 5.5) {
            float r = length(uv - 0.5) * 2.0;
            if (r > 1.0) discard;
            frame = max(bar(uv.x, 0.5, bw), bar(uv.y, 0.5, bh));
          } else {
            // clock face: cream disc, dark rim and hour marks
            vec2 p = uv - 0.5;
            float r = length(p) * 2.0;
            if (r > 1.0) discard;
            col = vCol * (0.9 + 0.1 * (1.0 - r));
            float a = atan(p.y, p.x) * 6.0 / 3.14159265;
            float tick = smoothstep(0.12, 0.0, abs(fract(a + 0.5) - 0.5)) * step(0.74, r) * step(r, 0.88);
            frame = max(smoothstep(0.9, 0.94, r), tick);
          }
          col = mix(col, vec3(0.05, 0.035, 0.03), frame);
          // unlit: dark glass with a faint sky reflection
          col = max(col, uGlass * (0.6 + 0.4 * uv.y));
          gl_FragColor = vec4(applySkyFog(col, vW, 0.55), 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      this.tmp.copy(it.color).multiplyScalar(0.02 + 0.98 * it.k);
      mesh.setColorAt(i, this.tmp);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    mesh.computeBoundingSphere();
    mesh.name = 'env:windows';
    this.mesh = mesh;
    return mesh;
  }
}
