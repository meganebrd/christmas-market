import * as THREE from 'three';
import type { EnvKit } from './kit';
import { SKY_FOG_APPLY, SKY_GLSL, skyUniforms } from './skyShared';
import { rng } from './util';

/** Soft chimney smoke for every chimney, one Points draw call animated in the vertex shader. */
export function buildSmoke(kit: EnvKit, chimneys: THREE.Vector3[]) {
  if (!chimneys.length) return null;
  const per = Math.max(6, Math.round(16 * kit.detail));
  const n = chimneys.length * per;
  const r = rng(5);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 2);
  chimneys.forEach((c, ci) => {
    const off = r();
    for (let j = 0; j < per; j++) {
      const i = ci * per + j;
      pos.set([c.x, c.y, c.z], i * 3);
      seed[i * 2] = (j / per + off) % 1;
      seed[i * 2 + 1] = r();
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uScale: { value: 400 },
      uColor: { value: new THREE.Color('#8f98bd') },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime, uScale;
      varying float vA;
      varying vec3 vW;
      void main() {
        float life = 7.0;
        float age = fract(uTime / life + aSeed.x);
        vec3 p = position;
        p.y += age * 6.5 - age * age * 1.5;
        p.x += age * 2.2 + age * age * 4.5 + sin(age * 5.0 + aSeed.y * 6.0 + uTime * 0.3) * 0.5 * age;
        p.z += age * 1.4 + cos(age * 4.0 + aSeed.y * 9.0) * 0.45 * age;
        vW = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = 0.6 + age * 3.4;
        gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 1.0, 160.0);
        vA = smoothstep(0.0, 0.15, age) * pow(1.0 - age, 1.5) * 0.26;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      varying vec3 vW;
      ${SKY_GLSL}
      ${SKY_FOG_APPLY}
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c)) * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(applySkyFog(uColor, vW, 1.0), a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'env:smoke';
  pts.renderOrder = 8;
  kit.root.add(pts);
  const size = new THREE.Vector2();
  kit.onUpdate.push(() => {
    kit.ctx.renderer.getDrawingBufferSize(size);
    mat.uniforms.uScale.value = size.y / (2 * Math.tan((kit.ctx.camera.fov * Math.PI) / 360));
  });
  return pts;
}
