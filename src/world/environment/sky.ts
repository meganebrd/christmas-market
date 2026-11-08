import * as THREE from 'three';
import { PALETTE } from '../palette';
import type { EnvKit } from './kit';
import { MOON_DIR, SKY_GLSL, skyUniforms, type TimeOfDay } from './skyShared';
import { rng } from './util';

/**
 * The sky: gradient dome (blue hour, warm west horizon), twinkling stars with a faint Milky Way,
 * the full moon rising in the east with its halo, a discreet aurora over the north valley and an
 * occasional shooting star. Everything lives in a group that follows the camera.
 */
export function buildSky(kit: EnvKit, tod: TimeOfDay, aurora: boolean) {
  const { ctx } = kit;
  const group = new THREE.Group();
  group.name = 'env:sky';
  ctx.scene.add(group);
  const night = tod === 'night';
  const starK = night ? 1.15 : 0.75;
  const bandN = new THREE.Vector3(0.55, 0.35, 0.76).normalize();

  // ── dome ────────────────────────────────────────────────────────────
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uMoonDir: { value: MOON_DIR },
      uMoonCol: { value: new THREE.Color(PALETTE.moon) },
      uStarK: { value: starK },
      uBandN: { value: bandN },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uMoonDir, uMoonCol, uBandN;
      uniform float uStarK;
      ${SKY_GLSL}
      float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vnoise3(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyColor(d);
        float md = max(dot(d, uMoonDir), 0.0);
        c += uMoonCol * (pow(md, 900.0) * 0.25 + pow(md, 90.0) * 0.07 + pow(md, 10.0) * 0.03);
        float band = exp(-pow(dot(d, uBandN) / 0.17, 2.0));
        float n = vnoise3(d * 7.0) * 0.55 + vnoise3(d * 19.0) * 0.45;
        c += vec3(0.5, 0.56, 0.85) * band * n * n * 0.05 * uStarK * smoothstep(0.08, 0.6, d.y);
        c += (hash3(vec3(gl_FragCoord.xy, 3.1)) - 0.5) / 400.0;
        gl_FragColor = vec4(max(c, 0.0), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 64, 32), domeMat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  dome.name = 'env:sky-dome';
  group.add(dome);

  // ── stars ───────────────────────────────────────────────────────────
  const r = rng(42);
  const nStars = Math.round((night ? 2600 : 1900) * kit.detail);
  const sPos = new Float32Array(nStars * 3);
  const sSize = new Float32Array(nStars);
  const sPhase = new Float32Array(nStars);
  const sTint = new Float32Array(nStars * 3);
  const tints = [new THREE.Color('#fdf6e3'), new THREE.Color('#cfe0ff'), new THREE.Color('#ffe2b8'), new THREE.Color('#e6ecff')];
  const v = new THREE.Vector3();
  const bandU = new THREE.Vector3().crossVectors(bandN, new THREE.Vector3(0, 1, 0)).normalize();
  const bandV = new THREE.Vector3().crossVectors(bandN, bandU).normalize();
  for (let i = 0; i < nStars; i++) {
    if (i % 3 === 0) {
      // Milky Way band
      const a = r() * Math.PI * 2;
      const off = (r() + r() + r() - 1.5) * 0.22;
      v.copy(bandU).multiplyScalar(Math.cos(a)).addScaledVector(bandV, Math.sin(a)).addScaledVector(bandN, off).normalize();
      if (v.y < 0) v.multiplyScalar(-1);
    } else {
      // denser toward the zenith
      const h = 1 - Math.pow(r(), 1.5);
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(1 - h * h);
      v.set(Math.cos(a) * rr, h, Math.sin(a) * rr);
    }
    v.multiplyScalar(700);
    sPos.set([v.x, v.y, v.z], i * 3);
    const big = r();
    sSize[i] = big > 0.985 ? 3.4 + r() * 1.4 : big > 0.9 ? 2.2 + r() : 1.1 + r() * 1.1;
    sPhase[i] = r();
    const t = tints[Math.floor(r() * tints.length)];
    const k = big > 0.985 ? 1.9 : big > 0.9 ? 1.1 : 0.55 + r() * 0.4;
    sTint.set([t.r * k, t.g * k, t.b * k], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(sTint, 3));
  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uMoonDir: { value: MOON_DIR },
      uStarK: { value: starK },
      uPixelRatio: { value: ctx.renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aTint;
      uniform float uTime, uStarK, uPixelRatio, uGlowK;
      uniform vec3 uMoonDir;
      uniform vec2 uSunDir;
      varying vec3 vCol;
      void main() {
        vec3 d = normalize(position);
        float tw = 0.62 + 0.38 * sin(uTime * (0.9 + aPhase * 2.4) + aPhase * 40.0);
        tw *= 0.85 + 0.15 * sin(uTime * 6.1 + aPhase * 91.0);
        float hfade = smoothstep(0.03, 0.4, d.y);
        float az = dot(normalize(d.xz + 1e-4), uSunDir);
        float glowFade = 1.0 - clamp(pow(clamp(az * 0.5 + 0.5, 0.0, 1.0), 3.0) * exp(-max(d.y, 0.0) * 3.0) * uGlowK * 1.1, 0.0, 1.0);
        float moonFade = smoothstep(0.996, 0.95, dot(d, uMoonDir));
        vCol = aTint * tw * hfade * glowFade * moonFade * uStarK;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (0.85 + 0.3 * tw);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, r);
        gl_FragColor = vec4(vCol * a * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -90;
  stars.name = 'env:stars';
  group.add(stars);

  // ── moon ────────────────────────────────────────────────────────────
  const moonMat = new THREE.SpriteMaterial({
    map: moonTexture(),
    color: new THREE.Color(PALETTE.moon).multiplyScalar(night ? 1.45 : 1.25),
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const moon = new THREE.Sprite(moonMat);
  moon.position.copy(MOON_DIR).multiplyScalar(600);
  moon.scale.setScalar(34);
  moon.renderOrder = -80;
  moon.name = 'env:moon';
  group.add(moon);

  // ── aurora ──────────────────────────────────────────────────────────
  let auroraMat: THREE.ShaderMaterial | null = null;
  if (aurora) {
    const ribbons = [
      { a0: Math.PI - 1.05, a1: Math.PI - 0.05, e: 0.2, h: 0.3, seed: 0.13 },
      { a0: Math.PI - 0.35, a1: Math.PI + 0.75, e: 0.26, h: 0.24, seed: 0.57 },
      { a0: Math.PI + 0.2, a1: Math.PI + 1.0, e: 0.17, h: 0.2, seed: 0.91 },
    ];
    const SEG = 72;
    const params: number[] = [];
    const pos: number[] = [];
    const idx: number[] = [];
    let base = 0;
    for (const rb of ribbons) {
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const az = rb.a0 + (rb.a1 - rb.a0) * u;
        const e = rb.e + Math.sin(u * 4.1 + rb.seed * 9) * 0.035;
        for (let row = 0; row < 2; row++) {
          params.push(az, e + row * rb.h, u, row, rb.seed);
          pos.push(Math.sin(az) * 500, (e + row * rb.h) * 500, Math.cos(az) * 500);
        }
        if (i < SEG) {
          const a = base + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      base += (SEG + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pa = new Float32Array(params);
    const ib = new THREE.InterleavedBuffer(pa, 5);
    g.setAttribute('aAz', new THREE.InterleavedBufferAttribute(ib, 1, 0));
    g.setAttribute('aEl', new THREE.InterleavedBufferAttribute(ib, 1, 1));
    g.setAttribute('aUv', new THREE.InterleavedBufferAttribute(ib, 2, 2));
    g.setAttribute('aSeed', new THREE.InterleavedBufferAttribute(ib, 1, 4));
    g.setIndex(idx);
    auroraMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: skyUniforms.uTime,
        uA1: { value: new THREE.Color(PALETTE.aurora1) },
        uA2: { value: new THREE.Color(PALETTE.aurora2) },
        uAurora: { value: night ? 0.5 : 0.3 },
      },
      vertexShader: /* glsl */ `
        attribute float aAz;
        attribute float aEl;
        attribute vec2 aUv;
        attribute float aSeed;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          vUv = aUv;
          vSeed = aSeed;
          float u = aUv.x;
          float az = aAz + 0.045 * sin(u * 8.0 + uTime * 0.11 + aSeed * 20.0) + 0.018 * sin(u * 21.0 - uTime * 0.17 + aSeed * 7.0);
          float el = aEl + aUv.y * 0.02 * sin(u * 13.0 + uTime * 0.2);
          float R = 500.0 * (1.0 + 0.06 * sin(u * 6.0 + uTime * 0.07 + aSeed * 3.0));
          vec3 p = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)) * R;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAurora;
        uniform vec3 uA1, uA2;
        varying vec2 vUv;
        varying float vSeed;
        float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
        float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
        void main() {
          float u = vUv.x;
          float v = vUv.y;
          float rays = n1(u * 110.0 + uTime * 0.5 + vSeed * 10.0) * 0.55 + n1(u * 37.0 - uTime * 0.22 + vSeed * 3.0) * 0.45;
          rays = pow(rays, 1.8);
          float base = smoothstep(0.0, 0.06, v) * pow(1.0 - v, 1.6);
          float ends = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u);
          float pulse = 0.6 + 0.4 * sin(uTime * 0.21 + vSeed * 6.0 + u * 5.0);
          float a = base * (0.25 + 0.75 * rays) * ends * pulse * uAurora;
          vec3 col = mix(uA1, uA2, smoothstep(0.1, 0.8, v));
          col += uA1 * 0.8 * exp(-pow((v - 0.05) / 0.04, 2.0));
          gl_FragColor = vec4(col * a * 0.55, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, auroraMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -85;
    mesh.name = 'env:aurora';
    group.add(mesh);
  }

  // ── shooting star ───────────────────────────────────────────────────
  const shootGeo = new THREE.BufferGeometry();
  const shootPos = new Float32Array(4 * 3);
  shootGeo.setAttribute('position', new THREE.BufferAttribute(shootPos, 3));
  shootGeo.setAttribute('aT', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1));
  shootGeo.setIndex([0, 1, 2, 1, 3, 2]);
  const shootMat = new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aT;
      varying float vT;
      void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      varying float vT;
      void main() { gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * pow(vT, 2.5) * 2.2 * uFade, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shoot = new THREE.Mesh(shootGeo, shootMat);
  shoot.frustumCulled = false;
  shoot.visible = false;
  shoot.renderOrder = -84;
  shoot.name = 'env:shooting-star';
  group.add(shoot);
  const sr = rng(7);
  let nextShoot = 6 + sr() * 8;
  let shootT = -1;
  const sA = new THREE.Vector3();
  const sB = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const side = new THREE.Vector3();
  let shootDur = 1;

  const pr = { value: ctx.renderer.getPixelRatio() };
  kit.onUpdate.push((dt, t) => {
    group.position.copy(ctx.camera.position);
    skyUniforms.uTime.value = t;
    const p = ctx.renderer.getPixelRatio();
    if (p !== pr.value) starMat.uniforms.uPixelRatio.value = pr.value = p;
    // shooting star
    if (shootT < 0) {
      nextShoot -= dt;
      if (nextShoot <= 0) {
        shootT = 0;
        shootDur = 0.7 + sr() * 0.6;
        const az = sr() * Math.PI * 2;
        const el = 0.16 + sr() * 0.38;
        sA.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        // tangent to the sky sphere, heading down toward the horizon
        const dir = new THREE.Vector3().crossVectors(sA, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(sr() < 0.5 ? 1 : -1);
        dir.y -= 0.35 + sr() * 0.4;
        sB.copy(sA).addScaledVector(dir.normalize(), 0.2 + sr() * 0.12).normalize();
        sA.multiplyScalar(650);
        sB.multiplyScalar(650);
        shoot.visible = true;
      }
    } else {
      shootT += dt / shootDur;
      if (shootT >= 1) {
        shootT = -1;
        shoot.visible = false;
        nextShoot = 9 + sr() * 16;
      } else {
        const head = tmp.lerpVectors(sA, sB, Math.min(1, shootT * 1.15));
        const tail = new THREE.Vector3().lerpVectors(sA, sB, Math.max(0, shootT * 1.15 - 0.35));
        side.crossVectors(new THREE.Vector3().subVectors(head, tail), head).normalize().multiplyScalar(0.9);
        shootPos.set([tail.x - side.x * 0.2, tail.y - side.y * 0.2, tail.z - side.z * 0.2, tail.x + side.x * 0.2, tail.y + side.y * 0.2, tail.z + side.z * 0.2], 0);
        shootPos.set([head.x - side.x, head.y - side.y, head.z - side.z, head.x + side.x, head.y + side.y, head.z + side.z], 6);
        shootGeo.attributes.position.needsUpdate = true;
        shootMat.uniforms.uFade.value = Math.sin(Math.PI * shootT);
      }
    }
  });

  return { group };
}

/** Painted full moon: soft limb, a few grey "seas", crisp edge. */
function moonTexture(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const R = S * 0.36;
  const cx = S / 2;
  // outer soft glow
  const glow = g.createRadialGradient(cx, cx, R * 0.9, cx, cx, S / 2);
  glow.addColorStop(0, 'rgba(255,244,220,0.35)');
  glow.addColorStop(1, 'rgba(255,244,220,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // disc
  const disc = g.createRadialGradient(cx - R * 0.25, cx - R * 0.3, R * 0.1, cx, cx, R);
  disc.addColorStop(0, '#ffffff');
  disc.addColorStop(0.75, '#fbf1dc');
  disc.addColorStop(1, '#e8d9bd');
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fillStyle = disc;
  g.fill();
  // maria
  g.save();
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.clip();
  const r = rng(3);
  const seas: [number, number, number][] = [
    [-0.25, -0.2, 0.32],
    [0.12, -0.32, 0.22],
    [0.25, 0.05, 0.26],
    [-0.05, 0.22, 0.18],
    [-0.38, 0.18, 0.14],
  ];
  for (const [x, y, s] of seas) {
    const gx = cx + x * R * 1.4;
    const gy = cx + y * R * 1.4;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, s * R * 1.3);
    gr.addColorStop(0, 'rgba(150,140,140,0.42)');
    gr.addColorStop(0.7, 'rgba(160,150,150,0.25)');
    gr.addColorStop(1, 'rgba(160,150,150,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(gx, gy, s * R * 1.3, s * R * (0.9 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R * 0.9;
    g.fillStyle = `rgba(140,130,130,${0.1 + r() * 0.12})`;
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 1 + r() * 4, 0, Math.PI * 2);
    g.fill();
  }
  // limb darkening
  const limb = g.createRadialGradient(cx, cx, R * 0.6, cx, cx, R);
  limb.addColorStop(0, 'rgba(120,100,90,0)');
  limb.addColorStop(1, 'rgba(120,100,90,0.25)');
  g.fillStyle = limb;
  g.fillRect(0, 0, S, S);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
