import * as THREE from 'three';
import type { EnvKit } from './kit';
import { MOON_DIR, MOONLIGHT_DIR, SKY_GLSL, skyUniforms } from './skyShared';
import { noise2, smoothstep, TAU, wrapAngle } from './util';

/**
 * Distant mountains (r 250–450): three faceted ridges, snow caps, moonlit faces, and an
 * atmospheric haze computed with the sky model so their feet melt into the horizon.
 * Lower in the west (the warm glow stays visible) and under the moon (east), majestic in the
 * north beyond the valley.
 */
interface Layer {
  R: number;
  base: number;
  amp: number;
  seed: number;
  haze: number;
}

function ridged(x: number, z: number) {
  const n = 1 - Math.abs(noise2(x, z));
  return n * n;
}

export function buildMountains(kit: EnvKit) {
  const layers: Layer[] = [
    { R: 265, base: 10, amp: 28, seed: 1.7, haze: 0.5 },
    { R: 340, base: 18, amp: 44, seed: 5.3, haze: 0.62 },
    { R: 430, base: 26, amp: 66, seed: 9.1, haze: 0.74 },
  ];
  const moonAz = Math.atan2(MOON_DIR.x, MOON_DIR.z);
  const N = Math.round(90 + 60 * kit.detail);
  const K = 7;
  const positions: number[] = [];
  const hazeAttr: number[] = [];
  const snowAttr: number[] = [];
  const index: number[] = [];

  for (const L of layers) {
    const ridge: number[] = [];
    const northOf: number[] = [];
    for (let i = 0; i <= N; i++) {
      const th = ((i % N) / N) * TAU;
      const cx = Math.cos(th);
      const sz = Math.sin(th);
      let h =
        ridged(cx * 1.6 + L.seed, sz * 1.6 - L.seed) * 0.6 +
        ridged(cx * 3.7 - L.seed, sz * 3.7 + L.seed * 2) * 0.3 +
        ridged(cx * 8 + L.seed * 3, sz * 8) * 0.1;
      // shape by direction (compass angle: 0 = south, π = north, −π/2 = west)
      const north = Math.max(0, Math.cos(wrapAngle(th - Math.PI)));
      const west = Math.max(0, Math.cos(wrapAngle(th + Math.PI / 2)));
      const moon = Math.max(0, Math.cos(wrapAngle(th - moonAz)));
      const k = 1 + 0.15 * Math.pow(north, 3) - 0.5 * Math.pow(west, 2) - 0.45 * Math.pow(moon, 6);
      // the great peak beyond the valley
      const gp = wrapAngle(th - (Math.PI + 0.16));
      if (L.R === 340) h += Math.exp(-(gp * gp) / 0.008) * 0.5;
      const ridgeH = L.base * (0.6 + 0.4 * k) + L.amp * h * k;
      ridge.push(Math.max(6, ridgeH));
      northOf.push(north);
    }
    const base = positions.length / 3;
    for (let i = 0; i <= N; i++) {
      const ii = i % N;
      const H = ridge[i];
      const nn = northOf[i] * northOf[i];
      // the north valley runs deeper and further before the mountains rise
      const Y0 = -90 - 25 * nn;
      const R = L.R + 50 * nn;
      const depth = (H - Y0) * (1.25 - 0.45 * nn);
      for (let k2 = 0; k2 <= K; k2++) {
        const t = k2 / K;
        const th = ((ii + (k2 === K ? 0 : noise2(ii * 1.3 + L.seed, k2 * 2.1) * 0.4)) / N) * TAU;
        const jitter = k2 === K || k2 === 0 ? 0 : noise2(ii * 0.9 + L.seed * 7, k2 * 1.7) * 0.035;
        const tt = Math.min(1, Math.max(0, t + jitter));
        const y = Y0 + (H - Y0) * Math.pow(tt, 1.35);
        const r = R - depth * (1 - tt) + noise2(ii * 0.7, k2 + L.seed) * 6 * (1 - tt);
        positions.push(Math.sin(th) * r, y, Math.cos(th) * r);
        hazeAttr.push(L.haze);
        snowAttr.push(smoothstep(H * 0.15, H * 0.5, y + noise2(ii * 0.5, k2 * 2 + L.seed) * H * 0.15));
      }
    }
    const row = K + 1;
    for (let i = 0; i < N; i++) {
      for (let k2 = 0; k2 < K; k2++) {
        const a = base + i * row + k2;
        const b = a + row;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aHaze', new THREE.Float32BufferAttribute(hazeAttr, 1));
  geo.setAttribute('aSnow', new THREE.Float32BufferAttribute(snowAttr, 1));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uMoonL: { value: MOONLIGHT_DIR },
      uRock: { value: new THREE.Color('#262c4e') },
      uSnowLit: { value: new THREE.Color('#b4c2ea') },
      uSnowShade: { value: new THREE.Color('#5d6a9e') },
    },
    vertexShader: /* glsl */ `
      attribute float aHaze;
      attribute float aSnow;
      varying vec3 vN;
      varying vec3 vW;
      varying float vHaze;
      varying float vSnow;
      void main() {
        vN = normal;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vHaze = aHaze;
        vSnow = aSnow;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoonL, uRock, uSnowLit, uSnowShade;
      varying vec3 vN;
      varying vec3 vW;
      varying float vHaze;
      varying float vSnow;
      ${SKY_GLSL}
      void main() {
        vec3 nf = normalize(cross(dFdx(vW), dFdy(vW)));
        vec3 ns = normalize(vN);
        if (dot(nf, ns) < 0.0) nf = -nf;
        vec3 n = normalize(mix(ns, nf, 0.3));
        float lit = max(dot(n, uMoonL), 0.0);
        float flatness = smoothstep(0.25, 0.7, n.y);
        float snow = clamp(vSnow * (0.35 + 0.65 * flatness) + flatness * 0.15, 0.0, 1.0);
        vec3 snowC = mix(uSnowShade, uSnowLit, smoothstep(0.05, 0.8, lit));
        vec3 rock = uRock * (0.7 + 0.5 * lit);
        vec3 col = mix(rock, snowC, snow) * 0.4;
        vec3 dir = normalize(vW - cameraPosition);
        float low = smoothstep(70.0, -50.0, vW.y);
        float haze = clamp(vHaze + low * 0.6, 0.0, 1.0);
        col = mix(col, hazeColor(dir), haze);
        gl_FragColor = vec4(col, 1.0);
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env:mountains';
  mesh.renderOrder = -50;
  mesh.matrixAutoUpdate = false;
  kit.root.add(mesh);
  return { mesh };
}
