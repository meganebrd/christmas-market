/**
 * DEV ONLY — standalone preview of the landmarks (not part of the game bundle).
 * Lets the landmarks be checked visually even while other modules are being rewritten.
 *   node scripts/shoot.mjs --page src/world/landmarks/preview/index.html --boot 4000 --shot "x|__givrelune.camera(...)|1500"
 */
import * as THREE from 'three';
import { loadMarket } from '../../../config/load';
import { createLayout } from '../../layout';
import { mat } from '../../materials';
import { PALETTE } from '../../palette';
import { EventBus } from '../../../core/events';
import { Colliders } from '../../../core/Colliders';
import { LightDirector } from '../../../core/LightDirector';
import { RenderPipeline } from '../../../core/RenderPipeline';
import { detectQuality } from '../../../core/quality';
import type { GameContext, GameEvents } from '../../../core/contracts';
import { buildLandmarks } from '../index';

const flags = new URLSearchParams(location.search);
const config = loadMarket();
const layout = createLayout(config);
const quality = detectQuality(flags.get('quality'));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const pipeline = new RenderPipeline(canvas, scene, camera, quality);
const events = new EventBus<GameEvents>();
const colliders = new Colliders();
const lights = new LightDirector();
const systems = new Set<(dt: number, t: number) => void>();
const clock = { elapsed: 0 };

// ── rough environment stand-in
scene.background = new THREE.Color(PALETTE.skyMid);
scene.fog = new THREE.Fog(PALETTE.fog, 45, 170);
scene.add(new THREE.HemisphereLight('#7f93d6', '#2e2844', 0.75));
const moon = new THREE.DirectionalLight('#c9d6ff', 0.6);
moon.position.set(30, 50, -20);
scene.add(moon);
const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), mat(PALETTE.snowShadow));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const stone = mat(PALETTE.cobble);
const ice = mat(PALETTE.ice);
const wood = mat(PALETTE.woodLight);
for (const p of layout.paths) {
  let g: THREE.BufferGeometry | null = null;
  let x = 0;
  let z = 0;
  let rot = 0;
  if (p.kind === 'disk') {
    g = new THREE.CircleGeometry(p.r, 48);
    x = p.center.x;
    z = p.center.z;
  } else if (p.kind === 'ring') {
    g = new THREE.RingGeometry(p.r0, p.r1, 96);
  } else if (p.kind === 'segment') {
    const len = Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z);
    g = new THREE.PlaneGeometry(p.width, len);
    x = (p.a.x + p.b.x) / 2;
    z = (p.a.z + p.b.z) / 2;
    rot = Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z);
  } else if (p.kind === 'ellipse') {
    g = new THREE.CircleGeometry(1, 48);
    g.scale(p.rx, p.rz, 1);
    x = p.center.x;
    z = p.center.z;
  }
  if (!g) continue;
  const m = new THREE.Mesh(g, p.surface === 'ice' ? ice : p.surface === 'wood' ? wood : stone);
  m.rotation.order = 'YXZ';
  m.rotation.set(-Math.PI / 2, rot, 0);
  m.position.set(x, p.surface === 'ice' ? 0.006 : 0.004, z);
  if (p.kind === 'ellipse') m.visible = false;
  scene.add(m);
}
for (const s of layout.stalls) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 2.6), mat('#8a5a3b'));
  b.position.set(s.position.x, 1.3, s.position.z);
  b.rotation.y = s.rotationY;
  scene.add(b);
}

let mode: GameContext['mode'] = 'loading';
const ctx = {
  config,
  layout,
  quality,
  scene,
  camera,
  renderer: pipeline.renderer,
  events,
  colliders,
  lights,
  clock,
  flags,
  get mode() {
    return mode;
  },
  setMode(m: GameContext['mode']) {
    mode = m;
  },
  addSystem(s: any) {
    const fn = typeof s === 'function' ? s : (dt: number, t: number) => s.update(dt, t);
    systems.add(fn);
    return () => systems.delete(fn);
  },
  post: { setWarmth() {}, setBloomBoost() {}, setExposure() {} },
} as unknown as GameContext;

const landmarks = buildLandmarks(ctx);
(ctx as any).landmarks = landmarks;
mode = 'explore';

// debug markers for anchors (?anchors)
if (flags.has('anchors')) {
  for (const [name, a] of landmarks.anchors) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), new THREE.MeshBasicMaterial({ color: name.endsWith('-spot') ? '#33ff66' : '#ff33aa' }));
    m.position.copy(a.position).setY(0.25);
    m.rotation.set(Math.PI / 2, 0, 0);
    const g = new THREE.Group();
    g.add(m);
    g.position.copy(a.position);
    m.position.set(0, 0.3, 0.2);
    g.rotation.y = a.yaw;
    scene.add(g);
  }
}

const look = new THREE.Vector3(0, 6, 0);
camera.position.set(0, 8, 30);
camera.lookAt(look);
pipeline.resize();
window.addEventListener('resize', () => pipeline.resize());

let last = performance.now();
const info = document.getElementById('info')!;
pipeline.renderer.info.autoReset = false;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pipeline.renderer.info.reset();
  const steps = Math.max(1, Math.round((window as any).__givrelune?.timeScale ?? 1));
  for (let k = 0; k < steps; k++) {
    clock.elapsed += dt;
    for (const fn of systems) fn(dt, clock.elapsed);
    lights.update(dt);
  }
  pipeline.render(clock.elapsed);
  const r = pipeline.renderer.info.render;
  info.textContent = `${r.calls} draws · ${Math.round(r.triangles / 1000)}k tris · ${quality.tier} · lights ${lights.count} · colliders ${colliders.count()}`;
}
requestAnimationFrame(frame);

(window as any).__givrelune = {
  ready: true,
  ctx,
  camera(px: number, py: number, pz: number, lx: number, ly: number, lz: number) {
    camera.position.set(px, py, pz);
    look.set(lx, ly, lz);
    camera.lookAt(look);
  },
  info: () => ({ ...pipeline.renderer.info.render, lights: lights.count, colliders: colliders.count() }),
  finale: () => events.emit('finale:start'),
  stats: () => {
    const out: Record<string, { meshes: number; tris: number }> = {};
    for (const g of scene.children) {
      if (!g.name) continue;
      let meshes = 0;
      let tris = 0;
      g.traverse((o: any) => {
        if (!o.isMesh && !o.isSprite) return;
        meshes++;
        if (o.isSprite) return (tris += 2);
        const geo = o.geometry as THREE.BufferGeometry;
        const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        const inst = o.isInstancedMesh ? o.count : (geo as any).isInstancedBufferGeometry ? (geo as any).instanceCount : 1;
        tris += n * inst;
      });
      out[g.name] = { meshes, tris: Math.round(tris) };
      if (flags.has('detail')) g.traverse((o: any) => {
        if (!o.isMesh) return;
        const geo = o.geometry as THREE.BufferGeometry;
        const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        const inst = o.isInstancedMesh ? o.count : (geo as any).isInstancedBufferGeometry ? (geo as any).instanceCount : 1;
        out['  ' + g.name + '/' + (o.name || '?') + '#' + o.id] = { meshes: inst, tris: Math.round(n * inst) };
      });
    }
    return out;
  },
  snapTree: (p: number) => {
    const prev = mode;
    mode = 'title';
    landmarks.setTreeLight(p);
    mode = prev;
  },
  setMode: (m: any) => (mode = m),
  wave: () => {
    lights.setAll(0);
    return lights.wave({ x: 0, z: 0 }, { speed: 14, startDelay: 0.5 });
  },
};
