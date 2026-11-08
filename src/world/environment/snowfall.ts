import * as THREE from 'three';
import type { EnvKit } from './kit';
import { rng } from './util';

/**
 * Falling snow, fully animated on the GPU: each flake falls and sways in the wind inside a box
 * that wraps around the camera, so the snow is always there wherever you look.
 */
export function buildSnowfall(kit: EnvKit, density: number) {
  const { ctx } = kit;
  const count = Math.round((ctx.quality.snowCount ?? 2000) * density);
  if (count <= 0) return null;
  const BOX = new THREE.Vector3(56, 26, 56);
  const r = rng(99);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = r() * BOX.x;
    pos[i * 3 + 1] = r() * BOX.y;
    pos[i * 3 + 2] = r() * BOX.z;
    seed[i * 2] = r();
    seed[i * 2 + 1] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBox: { value: BOX },
      uCam: { value: new THREE.Vector3() },
      uScale: { value: 400 },
      uWind: { value: new THREE.Vector2(0.55, 0.18) },
      uColor: { value: new THREE.Color('#e8eeff') },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime, uScale;
      uniform vec3 uBox, uCam;
      uniform vec2 uWind;
      varying float vAlpha;
      void main() {
        float speed = 0.55 + aSeed.x * 0.55;
        float t = uTime;
        vec3 p = position;
        p.y -= t * speed;
        p.x += t * uWind.x * (0.7 + aSeed.y * 0.6) + sin(t * (0.6 + aSeed.y) + aSeed.x * 30.0) * 0.6;
        p.z += t * uWind.y + cos(t * (0.5 + aSeed.x * 0.8) + aSeed.y * 20.0) * 0.5;
        // wrap inside a box centred on the camera
        vec3 origin = uCam - uBox * vec3(0.5, 0.45, 0.5);
        p = mod(p - origin, uBox) + origin;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        float size = (0.035 + aSeed.y * 0.045);
        gl_PointSize = clamp(size * uScale / max(d, 0.1), 1.0, 26.0);
        // fade near the camera and at the box borders (no popping)
        vec3 rel = (p - origin) / uBox;
        float edge = smoothstep(0.0, 0.08, rel.x) * smoothstep(1.0, 0.92, rel.x) * smoothstep(0.0, 0.08, rel.z) * smoothstep(1.0, 0.92, rel.z) * smoothstep(1.0, 0.85, rel.y) * smoothstep(0.0, 0.06, rel.y);
        vAlpha = edge * smoothstep(0.6, 2.5, d) * (0.55 + 0.45 * aSeed.x);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, r) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a * 0.85);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.name = 'env:snowfall';
  kit.root.add(points);
  const size = new THREE.Vector2();
  kit.onUpdate.push((_dt, t) => {
    mat.uniforms.uTime.value = t;
    mat.uniforms.uCam.value.copy(ctx.camera.position);
    ctx.renderer.getDrawingBufferSize(size);
    // pixels per metre at 1 m distance
    mat.uniforms.uScale.value = size.y / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
  });
  return points;
}
