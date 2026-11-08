import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterRig } from '../core/contracts';
import type { ResolvedStall } from '../config/types';
import { RenderPipeline } from '../core/RenderPipeline';
import { profileFor } from '../core/quality';
import { buildChalet, type ChaletBuild } from '../world/stalls';
import { createCharacter } from '../characters';
import { CHALET } from '../world/layout';
import { PALETTE } from '../world/palette';
import { glowTexture } from '../world/textures';

/**
 * Live 3D preview of the stall being edited: a small snowy diorama at blue hour (snow disc, pines,
 * sky gradient, falling snow, far market lights, bloom), the chalet from `buildChalet()` and the keeper
 * from `createCharacter()` behind the counter.
 *
 * `setStall()` compares what changed and rebuilds only the chalet and/or the character
 * (old ones are disposed). Rendering pauses when the tab is hidden or the preview is collapsed.
 */

export type CameraPreset = 'face' | 'three' | 'character';

const PRESETS: Record<CameraPreset, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  face: { pos: new THREE.Vector3(0, 2.0, 9.4), target: new THREE.Vector3(0, 1.5, 0.3) },
  three: { pos: new THREE.Vector3(6.3, 3.3, 7.6), target: new THREE.Vector3(0, 1.4, 0.1) },
  character: { pos: new THREE.Vector3(0.7, 1.9, 3.55), target: new THREE.Vector3(0, 1.1, 0.3) },
};
/** Where the keeper poses in front of the chalet (Personnage tab). */
const FRONT_Z = 2.35;

const KEEPER_Y = 0.14;

export class Preview {
  readonly canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 220);
  private pipeline: RenderPipeline;
  private controls: OrbitControls;
  private chalet: ChaletBuild | null = null;
  private rig: CharacterRig | null = null;
  private chaletKey = '';
  private charKey = '';
  private clock = new THREE.Timer();
  private elapsed = 0;
  private raf = 0;
  private running = false;
  private visible = true;
  private lastInput = performance.now();
  private flight: { t: number; start: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3 } | null = null;
  private lookPoint = new THREE.Vector3();
  private snow!: { points: THREE.Points; speed: Float32Array; phase: Float32Array };
  private disposables: { dispose(): void }[] = [];
  private ro: ResizeObserver;
  private talkTimer = 0;
  private keeperFront = false;
  private charKeyWasSet = false;
  private popT = 1;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private pendingStall: ResolvedStall | null = null;
  private building = false;
  onError: ((msg: string) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ed-preview__canvas';
    this.canvas.setAttribute('aria-label', 'Aperçu 3D de ta cabane. Fais glisser pour tourner autour, molette ou pincement pour zoomer.');
    this.canvas.setAttribute('role', 'img');
    host.appendChild(this.canvas);

    const q = profileFor('high');
    q.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.pipeline = new RenderPipeline(this.canvas, this.scene, this.camera, q);
    this.pipeline.setBloom(0.6, 0.5, 0.85);
    this.pipeline.gradeUniforms.uVignette.value = 0.26;
    this.pipeline.renderer.shadowMap.enabled = true;
    this.pipeline.renderer.info.autoReset = false;

    this.controls = new OrbitControls(this.camera, this.canvas);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.minDistance = 2.2;
    c.maxDistance = 12;
    c.minPolarAngle = 0.42;
    c.maxPolarAngle = 1.5;
    c.minAzimuthAngle = -1.55;
    c.maxAzimuthAngle = 1.55;
    c.rotateSpeed = 0.7;
    c.zoomSpeed = 0.8;
    c.autoRotateSpeed = 0.45;
    c.addEventListener('start', () => {
      this.lastInput = performance.now();
      this.flight = null;
      c.autoRotate = false;
    });
    c.addEventListener('end', () => (this.lastInput = performance.now()));
    this.jump('three');

    this.buildWorld();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.start();
  }

  // ───────────────────────────── world ─────────────────────────────

  private buildWorld() {
    const scene = this.scene;
    scene.fog = new THREE.Fog(PALETTE.fog, 16, 46);
    scene.background = new THREE.Color(PALETTE.skyMid);

    // sky dome: deep blue on top, warm afterglow low on the west (left of the chalet)
    const skyGeo = new THREE.SphereGeometry(90, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(PALETTE.skyTop) },
        uMid: { value: new THREE.Color(PALETTE.skyMid) },
        uLow: { value: new THREE.Color(PALETTE.skyLow) },
        uWarm: { value: new THREE.Color(PALETTE.horizon) },
        uGlow: { value: new THREE.Color(PALETTE.horizonGlow) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uLow, uWarm, uGlow;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.28, y));
          c = mix(c, uTop, smoothstep(0.25, 0.85, y));
          float west = pow(max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(-0.75, 0.0, -0.66)))), 3.0);
          float band = exp(-max(y, 0.0) * 9.0) * (0.35 + 0.65 * west);
          c = mix(c, uWarm, band * 0.62);
          c += uGlow * band * west * 0.22;
          if (y < 0.0) c = mix(uLow, vec3(0.16, 0.19, 0.34), clamp(-y * 6.0, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    this.disposables.push(skyGeo, skyMat);

    // stars
    {
      const n = 260;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const y = 0.18 + Math.pow(Math.random(), 0.7) * 0.8;
        const r = Math.sqrt(1 - y * y);
        pos.set([Math.cos(a) * r * 80, y * 80, Math.sin(a) * r * 80], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: PALETTE.star, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false });
      const stars = new THREE.Points(g, m);
      stars.renderOrder = -9;
      scene.add(stars);
      this.disposables.push(g, m);
    }

    // lights (same mood as the market)
    const hemi = new THREE.HemisphereLight('#8a9ce0', '#6a5560', 1.75);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight('#b4c3ff', 1.15);
    moon.position.set(-5.5, 9, 7);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera;
    sc.left = -5.5;
    sc.right = 5.5;
    sc.top = 5.5;
    sc.bottom = -4;
    sc.near = 1;
    sc.far = 30;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    moon.shadow.radius = 3;
    scene.add(moon, moon.target);
    const fill = new THREE.DirectionalLight('#ffb98a', 0.34);
    fill.position.set(7, 3, -5);
    scene.add(fill, fill.target);
    const warm = new THREE.PointLight('#ffc56b', 0.9, 6, 2);
    warm.position.set(0, 2.1, 2.6);
    scene.add(warm);

    // snow ground: a soft disc, flat around the chalet, gentle drifts further away
    {
      const g = new THREE.CircleGeometry(34, 96, 0, Math.PI * 2);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(p.count * 3);
      const base = new THREE.Color(PALETTE.snow);
      const shade = new THREE.Color(PALETTE.snowShadow);
      const tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const r = Math.hypot(x, z);
        const k = THREE.MathUtils.smoothstep(r, 4.2, 10);
        const y = k * (0.22 * Math.sin(x * 0.55 + 1.3) * Math.cos(z * 0.47) + 0.18 * Math.sin(x * 0.21 - z * 0.33));
        p.setY(i, y);
        tmp.copy(base).lerp(shade, 0.18 + 0.4 * THREE.MathUtils.smoothstep(r, 6, 26));
        colors.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      const m = new THREE.MeshLambertMaterial({ vertexColors: true });
      const ground = new THREE.Mesh(g, m);
      ground.receiveShadow = true;
      scene.add(ground);
      this.disposables.push(g, m);
    }

    // trodden path in front of the counter
    {
      const g = new THREE.CircleGeometry(1, 40);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshLambertMaterial({ color: '#c9d1e8', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const path = new THREE.Mesh(g, m);
      path.scale.set(2.4, 1, 1.5);
      path.position.set(0, 0.004, 2.75);
      path.receiveShadow = true;
      scene.add(path);
      this.disposables.push(g, m);
    }

    // pines + snow mounds, merged in one mesh (vertex colours)
    {
      const parts: THREE.BufferGeometry[] = [];
      const color = (g: THREE.BufferGeometry, c: string) => {
        const col = new THREE.Color(c);
        const n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return g;
      };
      const pine = (x: number, z: number, s: number, tint: string) => {
        const trunk = new THREE.CylinderGeometry(0.08 * s, 0.11 * s, 0.5 * s, 6).toNonIndexed();
        trunk.translate(x, 0.25 * s, z);
        parts.push(color(trunk, PALETTE.woodDark));
        const tiers = [
          [0.95, 1.25, 0.45],
          [0.75, 1.05, 1.1],
          [0.52, 0.9, 1.7],
        ];
        tiers.forEach(([r, hgt, y], i) => {
          const cone = new THREE.ConeGeometry(r * s, hgt * s, 9, 1).toNonIndexed();
          cone.rotateY(i * 0.7 + x);
          cone.translate(x, (y + hgt / 2) * s, z);
          parts.push(color(cone, tint));
          const cap = new THREE.ConeGeometry(r * s * 0.62, hgt * s * 0.42, 9, 1).toNonIndexed();
          cap.rotateY(i * 0.7 + x + 0.3);
          cap.translate(x, (y + hgt - hgt * 0.21 + 0.02) * s, z);
          parts.push(color(cap, '#eef2fb'));
        });
      };
      const pines: [number, number, number, string][] = [
        [-4.6, -2.2, 1.35, PALETTE.pine],
        [-6.3, 0.6, 1.1, PALETTE.pineDark],
        [-3.6, -4.6, 1.7, PALETTE.pineDark],
        [4.4, -2.8, 1.5, PALETTE.pine],
        [6.2, 0.2, 1.05, PALETTE.pineLight],
        [2.4, -5.4, 1.9, PALETTE.pineDark],
        [-1.2, -6.6, 2.1, PALETTE.pine],
        [-8.5, -4.5, 2.2, PALETTE.pineDark],
        [8.8, -3.6, 2.0, PALETTE.pineDark],
        [-3.9, 3.3, 0.7, PALETTE.pineLight],
        [11, 3, 1.8, PALETTE.pineDark],
        [-11.5, 2, 1.9, PALETTE.pine],
      ];
      for (const p of pines) pine(...p);
      const mounds: [number, number, number, number][] = [
        [-3.1, 1.2, 0.9, 0.32],
        [3.3, 1.6, 0.75, 0.26],
        [-2.6, -1.9, 0.8, 0.3],
        [5.2, 3.6, 1.1, 0.3],
        [-5.4, 4.4, 1.2, 0.34],
      ];
      for (const [x, z, r, hh] of mounds) {
        const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
        g.scale(r * 1.3, hh, r);
        g.translate(x, -0.02, z);
        parts.push(color(g, '#e4eaf7'));
      }
      const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
      parts.forEach((g) => g.dispose());
      if (merged) {
        merged.computeVertexNormals();
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        const mesh = new THREE.Mesh(merged, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        this.disposables.push(merged, m);
      }
    }

    // far market lights (bokeh)
    {
      const tex = glowTexture();
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.95 + (i / (n - 1)) * Math.PI * 0.9 + (Math.random() - 0.5) * 0.08;
        const r = 15 + Math.random() * 9;
        const m = new THREE.SpriteMaterial({ map: tex, color: i % 5 === 0 ? '#ffd9a0' : PALETTE.warm, transparent: true, opacity: 0.55 + Math.random() * 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        const sp = new THREE.Sprite(m);
        sp.position.set(Math.cos(a) * r, 0.6 + Math.random() * 1.6, Math.sin(a) * r);
        sp.scale.setScalar(0.5 + Math.random() * 0.9);
        scene.add(sp);
        this.disposables.push(m);
      }
    }

    // falling snow
    {
      const n = 900;
      const pos = new Float32Array(n * 3);
      const speed = new Float32Array(n);
      const phase = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos.set([(Math.random() - 0.5) * 18, Math.random() * 9, -7 + Math.random() * 16], i * 3);
        speed[i] = 0.35 + Math.random() * 0.45;
        phase[i] = Math.random() * Math.PI * 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ map: glowTexture(), color: '#ffffff', size: 0.09, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
      const points = new THREE.Points(g, m);
      points.frustumCulled = false;
      scene.add(points);
      this.disposables.push(g, m);
      this.snow = { points, speed, phase };
    }
  }

  // ───────────────────────────── stall ─────────────────────────────

  /** Rebuilds what changed. Cheap to call often (the editor debounces it anyway). */
  setStall(stall: ResolvedStall) {
    this.pendingStall = stall;
    if (this.building) return;
    this.building = true;
    try {
      while (this.pendingStall) {
        const s = this.pendingStall;
        this.pendingStall = null;
        this.applyStall(s);
      }
    } finally {
      this.building = false;
    }
  }

  private applyStall(stall: ResolvedStall) {
    const chaletKey = JSON.stringify([stall.id, stall.name, stall.chalet, stall.decorations, stall.products.map((p) => [p.id, p.name, p.image, p.priceLabel, p.featured, p.description])]);
    const charKey = JSON.stringify(stall.owner.appearance);
    if (chaletKey !== this.chaletKey) {
      this.chaletKey = chaletKey;
      this.chalet?.dispose();
      this.chalet = null;
      try {
        const ch = buildChalet(stall, { detail: 1, shadows: true });
        for (const l of ch.lights) l.set(1);
        ch.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.name === 'chalet-structure') o.castShadow = true;
        });
        this.scene.add(ch.group);
        this.chalet = ch;
      } catch (err) {
        console.error('[atelier] chalet', err);
        this.onError?.('La cabane n’a pas pu être construite avec ces réglages.');
      }
    }
    if (charKey !== this.charKey) {
      this.charKey = charKey;
      const wasTalking = this.talkTimer > 0;
      this.rig?.dispose();
      this.rig = null;
      try {
        const rig = createCharacter(stall.owner.appearance, { detail: 1 });
        rig.root.rotation.y = 0;
        rig.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        rig.play('idle', { loop: true });
        rig.lookAt(this.lookPoint);
        if (wasTalking) rig.setTalking(true);
        this.scene.add(rig.root);
        const first = !this.charKeyWasSet;
        this.charKeyWasSet = true;
        this.rig = rig;
        this.placeKeeper();
        if (!first) this.popT = 0; // a little bounce when re-dressed
      } catch (err) {
        console.error('[atelier] character', err);
        this.onError?.('Le personnage n’a pas pu être habillé avec ces réglages.');
      }
    }
  }

  /** Mouth moving + little head bob. `seconds` auto-stops (safety net). */
  setTalking(on: boolean, seconds = 30) {
    this.talkTimer = on ? seconds : 0;
    try {
      this.rig?.setTalking(on);
    } catch {
      /* ignore */
    }
  }

  emote(kind: 'happy' | 'surprised' | 'love' | 'note' | 'sweat' | 'idea') {
    try {
      this.rig?.emote(kind);
    } catch {
      /* ignore */
    }
  }

  wave() {
    try {
      this.rig?.play('wave', { loop: false });
    } catch {
      /* ignore */
    }
  }

  // ───────────────────────────── camera ─────────────────────────────

  private jump(p: CameraPreset) {
    this.camera.position.copy(PRESETS[p].pos);
    this.controls.target.copy(PRESETS[p].target);
    this.controls.update();
  }

  /** In front of the chalet (full body, to dress them) or behind the counter (as in the market). */
  setKeeperFront(front: boolean) {
    if (front === this.keeperFront) return;
    this.keeperFront = front;
    this.placeKeeper();
    this.emote('happy');
  }

  private placeKeeper() {
    const r = this.rig;
    if (!r) return;
    if (this.keeperFront) r.root.position.set(0, 0, FRONT_Z);
    else r.root.position.set(0, KEEPER_Y, CHALET.keeperZ);
  }

  private currentPreset: CameraPreset = 'three';

  preset(p: CameraPreset, instant = false) {
    this.currentPreset = p;
    const keeperH = this.rig?.height ?? 1.05;
    const pr = PRESETS[p];
    const target = pr.target.clone();
    const pos = pr.pos.clone();
    if (p === 'character') {
      if (this.keeperFront) {
        target.set(0, keeperH * 0.56, FRONT_Z);
        pos.set(1.15, keeperH * 0.56 + 0.55, FRONT_Z + 3.3);
      } else {
        target.y = KEEPER_Y + keeperH * 0.8;
        pos.y = target.y + 0.82;
      }
    }
    this.lastInput = performance.now();
    this.controls.autoRotate = false;
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.flight = null;
      return;
    }
    this.flight = { t: 0, start: performance.now(), dur: 1.1, p0: this.camera.position.clone(), p1: pos, t0: this.controls.target.clone(), t1: target };
  }

  // ───────────────────────────── loop ─────────────────────────────

  setVisible(v: boolean) {
    this.visible = v;
    if (v) this.start();
    else this.stop();
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private start() {
    if (this.running || document.hidden || !this.visible) return;
    this.running = true;
    this.clock.update();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resize() {
    const w = this.host.clientWidth;
    const hgt = this.host.clientHeight;
    if (w < 2 || hgt < 2) return;
    this.pipeline.resize();
    this.camera.fov = w / hgt < 0.9 ? 46 : 36;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.frame(0);
  }

  private frame(forced?: number) {
    if (forced === undefined) this.clock.update();
    const dt = forced ?? Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    const t = this.elapsed;

    // camera flight / idle sway
    if (this.flight) {
      const f = this.flight;
      // wall-clock based: the camera arrives on time even when frames are slow
      f.t = Math.min(1, (performance.now() - f.start) / (f.dur * 1000));
      const k = f.t >= 1 ? 1 : f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      this.camera.position.lerpVectors(f.p0, f.p1, k);
      this.controls.target.lerpVectors(f.t0, f.t1, k);
      if (f.t >= 1) this.flight = null;
    } else if (performance.now() - this.lastInput > 9000 && !this.reducedMotion.matches) {
      const c = this.controls;
      if (!c.autoRotate) c.autoRotate = true;
      const az = c.getAzimuthalAngle();
      if (az > 0.85) c.autoRotateSpeed = Math.abs(c.autoRotateSpeed);
      else if (az < -0.85) c.autoRotateSpeed = -Math.abs(c.autoRotateSpeed);
    }
    this.controls.update(dt);

    // the keeper looks at the visitor (camera), softly
    this.lookPoint.lerp(this.camera.position, 1 - Math.exp(-dt * 3));
    if (this.talkTimer > 0) {
      this.talkTimer -= dt;
      if (this.talkTimer <= 0) this.rig?.setTalking(false);
    }

    // snow
    const pos = this.snow.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const { speed, phase } = this.snow;
    for (let i = 0; i < speed.length; i++) {
      const j = i * 3;
      arr[j + 1] -= speed[i] * dt;
      arr[j] += Math.sin(t * 0.8 + phase[i]) * 0.12 * dt;
      arr[j + 2] += Math.cos(t * 0.6 + phase[i]) * 0.06 * dt;
      if (arr[j + 1] < 0) {
        arr[j + 1] = 8.5 + Math.random();
        arr[j] = (Math.random() - 0.5) * 18;
        arr[j + 2] = -7 + Math.random() * 16;
      }
    }
    pos.needsUpdate = true;

    this.chalet?.update(dt, t);
    this.rig?.update(dt);
    if (this.popT < 1 && this.rig) {
      this.popT = Math.min(1, this.popT + dt * 3.2);
      const k = this.popT;
      const sc = 1 + Math.sin(k * Math.PI) * 0.07 * (1 - k * 0.5);
      this.rig.root.scale.set(1 / Math.sqrt(sc), sc, 1 / Math.sqrt(sc));
      if (k >= 1) this.rig.root.scale.set(1, 1, 1);
    }
    this.pipeline.renderer.info.reset();
    this.pipeline.render(t);
  }

  /** For screenshots/tests. */
  info() {
    const r = this.pipeline.renderer.info;
    return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
  }

  dispose() {
    this.stop();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.controls.dispose();
    this.chalet?.dispose();
    this.rig?.dispose();
    for (const d of this.disposables) d.dispose();
    this.pipeline.composer?.dispose();
    this.pipeline.renderer.dispose();
    this.canvas.remove();
  }
}
