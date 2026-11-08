import * as THREE from 'three';
import type { Layout, PathShape } from '../layout';
import { PALETTE } from '../palette';
import { addMerged, type EnvKit } from './kit';
import { MOONLIGHT_DIR, patchSkyFog } from './skyShared';
import { fbm2, smoothstep, wrapAngle } from './util';

/**
 * The ground: flat inside the walkable circle (r 46), cobbled paths painted procedurally in the
 * shader (concentric fan paving, snow in the joints, frosty stones, soft snowy edges), glittering
 * snow, gentle hills rising toward the forest, a snowy road leaving south, and to the north a deep
 * valley with a frozen stream.
 */

export const FLAT_R = 46.8;

/** Road leaving the gate toward the south (beyond the walkable circle). */
export function roadX(z: number): number {
  return 5.5 * Math.sin((z - 44) * 0.035) * smoothstep(44, 70, z);
}

/** Angular weight of the north valley (1 = valley axis). */
export function valleyWeight(x: number, z: number): number {
  const theta = Math.atan2(x, z);
  const dn = Math.abs(wrapAngle(theta - Math.PI));
  return smoothstep(0.82, 0.42, dn);
}

export function createHeightFn() {
  return (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    if (r <= FLAT_R) return 0;
    const n = fbm2(x * 0.018, z * 0.018, 3);
    // village belt, then hills rising toward the forest and the mountains
    let h = smoothstep(FLAT_R, 54, r) * 0.6;
    h += smoothstep(52, 70, r) * (1.6 + n * 0.8);
    h += Math.max(0, r - 66) * 0.15 * smoothstep(66, 110, r);
    h += smoothstep(70, 160, r) * n * 9;
    // the road south stays gentle
    if (z > 40) {
      const d = Math.abs(x - roadX(z));
      const road = smoothstep(9, 3, d) * smoothstep(44, 52, z);
      const roadH = Math.max(0, r - FLAT_R) * 0.03;
      h = h + (roadH - h) * road;
    }
    // north valley: the land drops beyond the belvedere
    const v = valleyWeight(x, z);
    if (v > 0) {
      const t = r - FLAT_R;
      const depth = -74 * (1 - Math.exp(-t / 26)) + fbm2(x * 0.03, z * 0.03, 2) * 4 * smoothstep(20, 80, t);
      h = h + (depth - h) * v;
    }
    return h;
  };
}

const MASK_EXTENT = 104; // metres covered by the path mask (centred)

function drawShape(g: CanvasRenderingContext2D, s: PathShape, px: (m: number) => number, grow = 0) {
  const X = (x: number) => px(x + MASK_EXTENT / 2);
  const Z = (z: number) => px(z + MASK_EXTENT / 2);
  switch (s.kind) {
    case 'disk':
      g.beginPath();
      g.arc(X(s.center.x), Z(s.center.z), px(s.r + grow), 0, Math.PI * 2);
      g.fill();
      break;
    case 'ring':
      g.beginPath();
      g.arc(X(s.center.x), Z(s.center.z), px(s.r1 + grow), 0, Math.PI * 2);
      g.arc(X(s.center.x), Z(s.center.z), Math.max(0, px(s.r0 - grow)), 0, Math.PI * 2, true);
      g.fill('evenodd');
      break;
    case 'segment':
      g.lineCap = 'round';
      g.lineWidth = px(s.width + grow * 2);
      g.beginPath();
      g.moveTo(X(s.a.x), Z(s.a.z));
      g.lineTo(X(s.b.x), Z(s.b.z));
      g.stroke();
      break;
    case 'ellipse':
      g.beginPath();
      g.ellipse(X(s.center.x), Z(s.center.z), px(s.rx + grow), px(s.rz + grow), 0, 0, Math.PI * 2);
      g.fill();
      break;
  }
}

/** Separable box blur on one channel of an RGBA buffer (in place). */
function boxBlur(data: Uint8ClampedArray, W: number, H: number, ch: number, radius: number, passes: number) {
  const tmp = new Float32Array(W * H);
  const src = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) src[i] = data[i * 4 + ch];
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * W;
      for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc / (radius * 2 + 1);
        acc += src[row + Math.min(W - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        src[y * W + x] = acc / (radius * 2 + 1);
        acc += tmp[Math.min(H - 1, y + radius + 1) * W + x] - tmp[Math.max(0, y - radius) * W + x];
      }
    }
  }
  for (let i = 0; i < W * H; i++) data[i * 4 + ch] = src[i];
}

function buildMask(layout: Layout, size: number): THREE.DataTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const px = (m: number) => (m / MASK_EXTENT) * size;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);

  // G: trodden snow — wide soft area around everything people walk on
  g.fillStyle = g.strokeStyle = 'rgb(0,190,0)';
  for (const s of layout.paths) drawShape(g, s, px, 1.4);
  for (const st of layout.stalls) {
    g.beginPath();
    g.arc(px(st.customerPoint.x + MASK_EXTENT / 2), px(st.customerPoint.z + MASK_EXTENT / 2), px(2.6), 0, Math.PI * 2);
    g.fill();
  }
  // a few footpaths wandering across the snow
  g.strokeStyle = 'rgb(0,150,0)';
  g.lineCap = 'round';
  g.lineWidth = px(0.9);
  const trails = [
    [22.5, 24, 41],
    [67.5, 24, 40],
    [112.5, 24, 41],
    [-22.5, 24, 42],
    [-67.5, 24, 40],
    [-112.5, 24, 41],
    [157, 24, 40],
    [-157, 24, 40],
  ];
  for (const [deg, r0, r1] of trails) {
    g.beginPath();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const a = (deg * Math.PI) / 180 + Math.sin(t * 5 + deg) * 0.05;
      const r = r0 + (r1 - r0) * t;
      const x = Math.sin(a) * r + MASK_EXTENT / 2;
      const z = Math.cos(a) * r + MASK_EXTENT / 2;
      if (i === 0) g.moveTo(px(x), px(z));
      else g.lineTo(px(x), px(z));
    }
    g.stroke();
  }
  const imgG = g.getImageData(0, 0, size, size);

  // R: stone (cobbles) — every paved surface (ice and wood are built on top by the landmarks)
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = g.strokeStyle = '#f00';
  for (const s of layout.paths) drawShape(g, s, px, 0);
  const imgR = g.getImageData(0, 0, size, size);

  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = imgR.data[i * 4];
    data[i * 4 + 1] = imgG.data[i * 4 + 1];
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const k = size / 512;
  boxBlur(data, size, size, 0, Math.max(1, Math.round(1.5 * k)), 2);
  boxBlur(data, size, size, 1, Math.max(2, Math.round(5 * k)), 2);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const GROUND_PARS = /* glsl */ `
uniform sampler2D uMask;
uniform float uMaskExtent;
uniform vec3 uSnow, uSnowShadow, uSnowDeep, uTrodden, uCobble, uCobbleDark, uIce, uMoonDir;
uniform float uSparkle;
varying vec3 vGWorld;
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float roadCenter(float z) { return 5.5 * sin((z - 44.0) * 0.035) * smoothstep(44.0, 70.0, z); }
vec3 cobbles(vec2 p, vec3 joint) {
  float r = length(p);
  float th = atan(p.x, p.y);
  const float RH = 0.3;
  const float SL = 0.38;
  float u = r / RH;
  float row = floor(u);
  float fu = fract(u);
  float rr = (row + 0.5) * RH;
  float N = max(8.0, floor(6.2831853 * rr / SL));
  float v = (th / 6.2831853 + 0.5) * N + gHash(vec2(row, 3.7)) * 17.0;
  float col = floor(v);
  float fv = fract(v);
  float cid = mod(col, N);
  float id = gHash(vec2(row, cid));
  float id2 = gHash(vec2(cid + 11.3, row * 1.7));
  float cw = 6.2831853 * rr / N;
  vec2 q = vec2((fv - 0.5) * cw, (fu - 0.5) * RH);
  q += (vec2(id, id2) - 0.5) * 0.04;
  // each sett is a little rotated and has its own size: irregular joints
  float ang = (id2 - 0.5) * 0.22;
  q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
  vec2 hs = vec2(cw, RH) * 0.5 - vec2(0.02 + 0.035 * id, 0.018 + 0.03 * id2);
  float sd = sdRoundBox(q, hs, 0.07 + 0.04 * id2);
  float aa = max(fwidth(r) * 1.2, 0.004);
  float stone = 1.0 - smoothstep(-aa, aa, sd);
  // granite setts: blue-grey, warm grey and a few dark ones
  vec3 warmStone = vec3(0.42, 0.36, 0.3);
  vec3 sc = id < 0.4 ? mix(uCobbleDark, uCobble, 0.5 + id) : id < 0.82 ? mix(uCobble, warmStone, 0.6 + 0.3 * id2) : uCobbleDark * 0.85;
  sc *= 0.85 + 0.25 * id2;
  // domed tops: lighter in the middle, darker at the rim
  vec2 qn = q / max(hs, vec2(0.01));
  sc *= 0.8 + 0.28 * (1.0 - clamp(dot(qn, qn), 0.0, 1.0)) + 0.06 * qn.y;
  float frost = smoothstep(0.52, 0.86, gNoise(p * 1.3) * 0.6 + gNoise(p * 5.5) * 0.4);
  sc = mix(sc, uSnowShadow, frost * 0.55);
  // crisp dark rim where the sett meets the joint
  sc *= 1.0 - 0.25 * smoothstep(-0.05, 0.0, sd);
  vec3 c = mix(joint, sc, stone);
  // far away: average out the pattern (no shimmering)
  float far = smoothstep(0.012, 0.06, fwidth(r));
  return mix(c, mix(joint, mix(uCobbleDark, uCobble, 0.7), 0.7), far);
}
`;

const GROUND_COLOR = /* glsl */ `
  vec2 gp = vGWorld.xz;
  vec2 muv = gp / uMaskExtent + 0.5;
  vec4 mk = (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) ? texture2D(uMask, muv) : vec4(0.0);
  float gn1 = gNoise(gp * 0.21);
  float gn2 = gNoise(gp * 1.7);
  float gn3 = gNoise(gp * 7.3);
  // fresh snow with soft drifts
  vec3 gcol = mix(uSnowShadow, uSnow, clamp(0.45 + 0.55 * (gn1 * 0.65 + gn2 * 0.35), 0.0, 1.0));
  // hollows of the hills catch a bluer tint
  gcol = mix(gcol, uSnowDeep, smoothstep(0.62, 0.95, gn1) * 0.25);
  // the road leaving south: packed snow with sled tracks
  float trod = mk.g;
  if (vGWorld.z > 40.0) {
    float d = abs(gp.x - roadCenter(gp.y));
    float road = smoothstep(2.6, 1.6, d + (gn2 - 0.5) * 0.6) * smoothstep(43.0, 47.0, gp.y);
    float tracks = exp(-pow((d - 0.7) / 0.09, 2.0)) * road;
    trod = max(trod, road * 0.85);
    gcol = mix(gcol, uSnowShadow * 0.85, tracks * 0.5);
  }
  gcol = mix(gcol, uTrodden, clamp(trod, 0.0, 1.0) * (0.5 + 0.35 * gn2));
  // cobbles
  float edgeN = (gn2 - 0.5) * 0.42 + (gn3 - 0.5) * 0.16;
  float stoneK = smoothstep(0.38, 0.62, mk.r + edgeN);
  // fresh snow pushed aside along the paths, with a soft shadow line at the edge
  float edgeV = mk.r + edgeN;
  float berm = smoothstep(0.12, 0.32, edgeV) * smoothstep(0.6, 0.4, edgeV);
  gcol *= 1.0 + 0.07 * berm;
  if (stoneK > 0.002) {
    vec3 joint = mix(uTrodden * 0.72, uSnowShadow * 0.9, 0.15 + 0.4 * gn3);
    gcol = mix(gcol, cobbles(gp, joint), stoneK);
    gcol *= 1.0 - 0.12 * smoothstep(0.35, 0.5, edgeV) * smoothstep(0.75, 0.5, edgeV);
  }
  // frozen stream at the bottom of the north valley
  if (vGWorld.y < -50.0) {
    float rx = 18.0 * sin(gp.y * 0.018) + 8.0 * sin(gp.y * 0.051 + 1.0);
    float rv = smoothstep(5.5, 3.5, abs(gp.x - rx) + (gn2 - 0.5) * 2.0) * smoothstep(-56.0, -64.0, vGWorld.y);
    gcol = mix(gcol, uIce, rv * 0.8);
  }
  diffuseColor.rgb *= gcol;
  float gSnowAmt = 1.0 - stoneK;
`;

const GROUND_SPARKLE = /* glsl */ `
  #include <emissivemap_fragment>
  #ifdef GROUND_SPARKLE
  {
    vec2 gc = floor(gp * 16.0);
    float gh = gHash(gc);
    vec2 gf = fract(gp * 16.0) - 0.5 - (vec2(gHash(gc + 1.3), gHash(gc + 7.1)) - 0.5) * 0.5;
    vec3 fn = normalize(vec3(gHash(gc + 3.7) - 0.5, 0.55, gHash(gc + 9.1) - 0.5));
    vec3 V = normalize(cameraPosition - vGWorld);
    vec3 H = normalize(V + uMoonDir);
    float spec = pow(max(dot(fn, H), 0.0), 80.0);
    float camD = length(cameraPosition - vGWorld);
    float dotm = smoothstep(0.2, 0.0, length(gf));
    float sp = step(0.7, gh) * spec * dotm * gSnowAmt * smoothstep(26.0, 5.0, camD);
    totalEmissiveRadiance += vec3(0.8, 0.88, 1.0) * sp * uSparkle;
  }
  #endif
`;

export function buildTerrain(kit: EnvKit, layout: Layout) {
  const { detail } = kit;
  const heightAt = kit.heightAt;

  // ── geometry: polar grid, dense near the market, coarse far away ───
  const radii: number[] = [0, 4, 9, 15, 21, 27, 33, 39, 43, 45.5, FLAT_R, 47.6, 48.6, 50];
  for (let r = 52; r <= 70; r += 2) radii.push(r);
  for (let r = 73; r <= 100; r += 3) radii.push(r);
  for (let r = 105; r <= 160; r += 5) radii.push(r);
  for (let r = 168; r <= 280; r += 8) radii.push(r);
  const SEG = Math.round(160 + 64 * detail);
  const pos: number[] = [];
  for (const r of radii) {
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      pos.push(x, heightAt(x, z), z);
    }
  }
  const idx: number[] = [];
  const row = SEG + 1;
  for (let j = 0; j < radii.length - 1; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * row + i;
      const b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // flat inside: exact up normals (no shading seams at the centre)
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let j = 0; j < radii.length; j++) {
    if (radii[j] > FLAT_R - 0.01) break;
    for (let i = 0; i <= SEG; i++) nor.setXYZ(j * row + i, 0, 1, 0);
  }
  geo.computeBoundingSphere();

  // ── material: Lambert + procedural ground ───────────────────────────
  const mask = buildMask(layout, detail >= 0.95 ? 1024 : 512);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.name = 'env:ground';
  const uniforms = {
    uMask: { value: mask },
    uMaskExtent: { value: MASK_EXTENT },
    uSnow: { value: new THREE.Color(PALETTE.snow) },
    uSnowShadow: { value: new THREE.Color(PALETTE.snowShadow) },
    uSnowDeep: { value: new THREE.Color(PALETTE.snowDeep) },
    uTrodden: { value: new THREE.Color('#c4c8d8') },
    uCobble: { value: new THREE.Color('#9a979c') },
    uCobbleDark: { value: new THREE.Color('#6c6b72') },
    uIce: { value: new THREE.Color(PALETTE.iceDeep) },
    uMoonDir: { value: MOONLIGHT_DIR },
    uSparkle: { value: 1.6 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_PARS)
      .replace('#include <color_fragment>', GROUND_COLOR)
      .replace('#include <emissivemap_fragment>', GROUND_SPARKLE);
  };
  const sparkle = detail >= 0.75;
  if (sparkle) mat.defines = { GROUND_SPARKLE: '' };
  mat.customProgramCacheKey = () => 'givrelune-ground-v2' + (sparkle ? 's' : '');
  patchSkyFog(mat);

  const mesh = addMerged(kit, geo, mat, 'env:ground', { receive: true });
  if (mesh) mesh.renderOrder = -10;
  return { mesh };
}
