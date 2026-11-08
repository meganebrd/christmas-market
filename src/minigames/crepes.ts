import * as THREE from 'three';
import { glow, mat, std } from '../world/materials';
import { PALETTE } from '../world/palette';
import {
  anchor,
  canvasTexture,
  clamp,
  easeOutBack,
  easeOutCubic,
  own,
  probeCounter,
  rand,
  smooth,
  yawTo,
  zoneFrame,
  type MinigameDef,
  type Session,
} from './common';

/**
 * Les Crêpes de Paulette — pour, wait for the golden moment on the gauge, flip (Space / click / tap),
 * pick a topping (4 buttons or keys 1-4), fold in four, onto the plate. 5 crêpes, win with 3 "Bien" or better.
 */

const ROUNDS = 5;
const WIN = 3;
const R = 0.26;
const PERFECT = 0.075;
const GOOD = 0.19;
type Quality = 'parfait' | 'bien' | 'pale' | 'brulee';
type Topping = 'sucre' | 'chocolat' | 'confiture' | 'caramel';

const TOPPINGS: { id: Topping; label: string; color: string; line: string }[] = [
  { id: 'sucre', label: 'Sucre', color: '#f7f4ee', line: 'Le sucre : simple et parfait !' },
  { id: 'chocolat', label: 'Chocolat', color: '#5a3020', line: 'Du chocolat ? Excellent choix !' },
  { id: 'confiture', label: 'Confiture', color: '#b8233a', line: 'Confiture de fraises maison !' },
  { id: 'caramel', label: 'Caramel beurre salé', color: '#c98a2e', line: 'Caramel beurre salé, mon préféré !' },
];

interface Griddle {
  group: THREE.Group;
  /** Cooking on the food stand's own billig. */
  landmark: boolean;
  /** Where Paulette stands (crêpes are served to her when there is no plate), local. */
  cook: THREE.Vector3;
  top: number; // billig surface (local y)
  radius: number; // crêpe radius
  /** Where finished crêpes go (local), or null: Paulette takes them to serve. */
  plate: THREE.Vector3 | null;
  plateCount: number;
  spot: THREE.Vector3;
  griddleWorld: THREE.Vector3;
  rozell: THREE.Group;
}
const griddles = new WeakMap<Session, Griddle>();

function spots(ctx: Session['ctx']) {
  const f = zoneFrame(ctx, 'food');
  const griddle = anchor(ctx, 'food:griddle', () => ({ position: f.center.clone().addScaledVector(f.out, 0.7), yaw: 0 }));
  const spot = anchor(ctx, 'food:crepe-spot', () => {
    const p = f.center.clone().addScaledVector(f.out, -0.55);
    return { position: p, yaw: yawTo(p, griddle.position) };
  });
  return { griddle, spot };
}

// ───────────────────────── crêpe textures ─────────────────────────

function wavyDisc(g: CanvasRenderingContext2D, w: number, seed: number) {
  const c = w / 2;
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = c - 7 + Math.sin(a * 7 + seed) * 2.2 + Math.sin(a * 13 + seed * 2) * 1.4;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
}

function paintBatter(g: CanvasRenderingContext2D, w: number, seed: number) {
  g.clearRect(0, 0, w, w);
  g.save();
  wavyDisc(g, w, seed);
  g.clip();
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, '#f8ecc8');
  r.addColorStop(1, '#efdba8');
  g.fillStyle = r;
  g.fillRect(0, 0, w, w);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.ellipse(rand(40, w - 40), rand(40, w - 40), rand(10, 26), rand(5, 12), rand(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function paintCooked(g: CanvasRenderingContext2D, w: number, q: Quality, seed: number, light = false) {
  g.clearRect(0, 0, w, w);
  g.save();
  wavyDisc(g, w, seed);
  g.clip();
  const base = light ? '#efd49a' : { parfait: '#e4ad55', bien: '#e9bf72', pale: '#f1dcab', brulee: '#9c5c2c' }[q];
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, base);
  r.addColorStop(0.85, base);
  r.addColorStop(1, light ? '#d9a95e' : q === 'brulee' ? '#5a3216' : '#c98a3e');
  g.fillStyle = r;
  g.fillRect(0, 0, w, w);
  // golden mottling (soft blobs) + a fine lace of tiny rings, denser toward the crispy edge
  const lace = light ? 50 : { parfait: 260, bien: 150, pale: 24, brulee: 60 }[q];
  for (let i = 0; i < lace; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 0.6) * (w / 2 - 12);
    const x = w / 2 + Math.cos(a) * d;
    const y = w / 2 + Math.sin(a) * d;
    const pale = q === 'pale' && !light;
    if (i % 3) {
      g.fillStyle = pale ? 'rgba(205,160,90,0.14)' : `rgba(${150 + Math.random() * 40},${80 + Math.random() * 30},30,${rand(0.1, 0.22)})`;
      g.beginPath();
      g.ellipse(x, y, rand(4, 13), rand(3, 9), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    } else {
      g.lineWidth = 1.2;
      g.strokeStyle = pale ? 'rgba(200,150,80,0.2)' : 'rgba(150,84,30,0.32)';
      g.beginPath();
      g.arc(x, y, rand(1.5, 4), 0, Math.PI * 2);
      g.stroke();
    }
  }
  if (q === 'brulee' && !light) {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${40 + Math.random() * 30},${22 + Math.random() * 15},10,${rand(0.45, 0.8)})`;
      g.beginPath();
      g.ellipse(rand(30, w - 30), rand(30, w - 30), rand(6, 22), rand(5, 16), rand(0, 3), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function paintTopping(g: CanvasRenderingContext2D, w: number, t: Topping, seed: number) {
  const c = w / 2;
  g.save();
  wavyDisc(g, w, seed);
  g.clip();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (t === 'sucre') {
    const glaze = g.createRadialGradient(c, c, 0, c, c, c * 0.8);
    glaze.addColorStop(0, 'rgba(255,255,255,0.35)');
    glaze.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glaze;
    g.fillRect(0, 0, w, w);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 520; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * c * 0.78;
      g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, rand(1.2, 2.6), rand(1.2, 2.6));
    }
  } else if (t === 'confiture') {
    g.strokeStyle = 'rgba(176,28,52,0.92)';
    g.lineWidth = 17;
    g.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.12) {
      const d = 6 + a * 4.4;
      g.lineTo(c + Math.cos(a) * d, c + Math.sin(a) * d);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,140,150,0.45)';
    g.lineWidth = 4;
    g.stroke();
  } else {
    const dark = t === 'chocolat' ? '#47220f' : '#b8772a';
    const hi = t === 'chocolat' ? 'rgba(140,80,50,0.8)' : 'rgba(255,214,140,0.85)';
    for (const [col, lw] of [
      [dark, t === 'chocolat' ? 8 : 6],
      [hi, 2],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = c - 78 + i * 19.5;
        const x0 = c - Math.sqrt(Math.max(0, 88 * 88 - (y - c) ** 2));
        const x1 = 2 * c - x0;
        g.moveTo(x0, y);
        for (let x = x0; x <= x1; x += 8) g.lineTo(x, y + Math.sin(x * 0.11 + i) * 5);
      }
      g.stroke();
    }
  }
  g.restore();
}

// ───────────────────────── crêpe mesh (4 hinged quarters, 2 sides) ─────────────────────────

interface Side {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshLambertMaterial;
}

class Crepe {
  readonly flipper = new THREE.Group(); // flip animation
  readonly root = new THREE.Group(); // folds live inside
  readonly hingeA = new THREE.Group(); // fold 1 (−x, +z)
  readonly hingeB = new THREE.Group(); // fold 2 (back half)
  readonly hingeC = new THREE.Group(); // fold 1 inside fold 2
  up: Side;
  down: Side;
  readonly seed = Math.random() * 10;
  private geos: THREE.BufferGeometry[] = [];
  /** Stacking offsets used once folding starts (flat & seamless before). */
  private layers: { mesh: THREE.Mesh; y: number }[] = [];

  constructor(R: number) {
    const side = () => {
      const tex = canvasTexture(256, 256, () => {});
      const canvas = tex.image as HTMLCanvasElement;
      const g = canvas.getContext('2d')!;
      const m = own(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, emissive: '#ffcf8a', emissiveMap: tex, emissiveIntensity: 0.38 }));
      return { canvas, g, tex, mat: m };
    };
    this.up = side();
    this.down = side();
    paintBatter(this.up.g, 256, this.seed);
    paintCooked(this.down.g, 256, 'bien', this.seed);
    this.up.tex.needsUpdate = this.down.tex.needsUpdate = true;
    // final stack after the two folds (bottom → top): (+x+z), (−x+z), (−x−z), (+x−z) — the golden side outside
    const E = 0.003;
    const quarter = (sx: number, sz: number, parent: THREE.Object3D, y: number) => {
      for (const face of [1, -1]) {
        // XY quadrant that lands on (sx, sz) once rotated to the XZ plane
        const sy = face === 1 ? -sz : sz;
        const start = sx > 0 ? (sy > 0 ? 0 : Math.PI * 1.5) : sy > 0 ? Math.PI / 2 : Math.PI;
        const geo = new THREE.CircleGeometry(R, 14, start, Math.PI / 2);
        geo.rotateX(face === 1 ? -Math.PI / 2 : Math.PI / 2);
        this.geos.push(geo);
        const mesh = new THREE.Mesh(geo, face === 1 ? this.up.mat : this.down.mat);
        this.layers.push({ mesh, y });
        parent.add(mesh);
      }
    };
    this.flipper.add(this.root);
    this.root.add(this.hingeA, this.hingeB);
    this.hingeB.add(this.hingeC);
    quarter(1, 1, this.root, 0);
    quarter(-1, 1, this.hingeA, -E);
    quarter(1, -1, this.hingeB, -3 * E);
    quarter(-1, -1, this.hingeC, 2 * E);
  }

  prepareFold() {
    for (const l of this.layers) l.mesh.position.y = l.y;
  }

  /** After a flip: the side that was down is now up. */
  swapSides() {
    const a = this.up.mat.map;
    this.up.mat.map = this.down.mat.map;
    this.down.mat.map = a;
    this.up.mat.needsUpdate = this.down.mat.needsUpdate = true;
    // keep the canvases with their textures: `up` is always what faces the sky
    const ma = this.up.mat;
    const mb = this.down.mat;
    const t = this.up;
    this.up = { ...this.down, mat: ma };
    this.down = { ...t, mat: mb };
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.up.tex.dispose();
    this.down.tex.dispose();
    this.up.mat.dispose();
    this.down.mat.dispose();
  }
}

// ───────────────────────── game ─────────────────────────

export const crepes: MinigameDef = {
  id: 'crepes',
  title: 'Les Crêpes de Paulette',
  zone: 'food',
  keeper: { role: 'cook', title: 'Crêpière' },
  rules:
    'À toi de jouer, mon petit ! Quand le curseur passe dans la zone dorée, retourne la crêpe. Ensuite, choisis la garniture. Réussis trois crêpes sur cinq et je te confie mon secret !',
  hint: (d) =>
    d === 'touch' ? 'Touche l’écran quand le curseur est dans l’or' : d === 'pointer' ? 'Clique quand le curseur est dans l’or' : 'Espace quand le curseur est dans l’or',

  spot(ctx) {
    return spots(ctx).spot;
  },

  setup(s) {
    const { ctx } = s;
    const { griddle, spot } = spots(ctx);
    const Gp = griddle.position.clone().setY(0);
    const Sp = spot.position.clone().setY(0);
    const group = new THREE.Group();
    group.name = 'mg-crepes-griddle';
    group.position.copy(Gp);
    group.rotation.y = yawTo(Gp, Sp);
    s.scope.add(group);
    group.updateMatrixWorld(true);
    const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
    const axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    const found = probeCounter(ctx, Gp, axisX, axisZ, [group]);
    const ext = found ? Math.min(found.x1 - found.x0, found.z1 - found.z0) : 0;
    if (found && ext > 0.25 && ext < 0.8) {
      // the stand already has a griddle here: cook right on it
      setupOnLandmark(s, group, found.top, clamp(ext / 2 - 0.015, 0.15, R), Gp, Sp);
      return;
    }
    let base: number;
    if (found) base = found.top;
    else {
      base = 0.78;
      buildCart(s, group, base);
    }
    // the billig (cast-iron griddle) with a warm glow under its rim
    const billig = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.33, 0.05, 40), std('#2b2a30', { metalness: 0.55, roughness: 0.45 }));
    billig.position.y = base + 0.025;
    group.add(billig);
    const heat = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.012, 6, 48), glow('#ff8a3a', 1.6));
    heat.rotation.x = Math.PI / 2;
    heat.position.y = base + 0.004;
    group.add(heat);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 24), mat('#3a3a42'));
    foot.position.y = base - 0.0;
    if (!found) group.add(foot);
    const top = base + 0.051;
    // plate
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.02, 32), mat('#f6f1e6'));
    const platePos = new THREE.Vector3(0.56, base + 0.01, 0.06);
    plate.position.copy(platePos);
    group.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.008, 6, 32), mat('#3c5a8a'));
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(platePos).setY(base + 0.021);
    group.add(rim);
    // bowl of batter + 4 topping jars
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.1, 24, 1, true), mat('#d9774a', { side: THREE.DoubleSide }));
    bowl.position.set(-0.55, base + 0.05, -0.02);
    group.add(bowl);
    const batter = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), mat('#f3e3b8'));
    batter.rotation.x = -Math.PI / 2;
    batter.position.set(-0.55, base + 0.08, -0.02);
    group.add(batter);
    TOPPINGS.forEach((t, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 14), mat(t.color));
      jar.position.set(-0.24 + i * 0.16, base + 0.055, -0.42);
      group.add(jar);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.025, 14), mat(i % 2 ? PALETTE.red : PALETTE.gold));
      lid.position.set(-0.24 + i * 0.16, base + 0.12, -0.42);
      group.add(lid);
    });
    const rozell = makeRozell(group);
    placeCook(s, Sp, Gp);
    const g: Griddle = { group, top, radius: R, plate: platePos.clone().setY(base + 0.022), plateCount: 0, spot: Sp, griddleWorld: Gp, rozell, landmark: false, cook: new THREE.Vector3(0, top + 0.3, -0.8) };
    griddles.set(s, g);
    closeUp(s, g);
  },

  async play(s) {
    const { ctx } = s;
    const gr = griddles.get(s)!;
    const auto = s.auto;
    let good = 0;
    let perfect = 0;
    let points = 0;
    const tmp = new THREE.Vector3();
    const local = (x: number, y: number, z: number) => gr.group.localToWorld(tmp.set(x, y, z)).clone();
    const hint = s.def.hint;

    // gentle steam all game long (the food stand already has its own)
    const steamRate = gr.landmark ? 0.08 : 0.35;
    s.every(() => {
      if (Math.random() < steamRate) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * gr.radius;
        s.fx.steam(local(Math.cos(a) * d, gr.top + 0.02, Math.sin(a) * d), 1, 0.02, 0.18);
      }
    });

    // gauge
    const panel = s.ui.el('div', 'gmg-panel hidden');
    const label = s.ui.el('div', 'gmg-label', 'Attends le moment doré…', panel);
    const gauge = s.ui.el('div', 'gmg-gauge', '', panel);
    const goodEl = s.ui.el('div', 'good', '', gauge);
    goodEl.style.left = `${(0.5 - GOOD) * 100}%`;
    goodEl.style.width = `${GOOD * 200}%`;
    const perfEl = s.ui.el('div', 'perfect', '', gauge);
    perfEl.style.left = `${(0.5 - PERFECT) * 100}%`;
    perfEl.style.width = `${PERFECT * 200}%`;
    const cursor = s.ui.el('div', 'cursor', '', gauge);
    s.ui.el('div', 'tag', 'pâle', gauge).style.left = '9%';
    s.ui.el('div', 'tag', 'doré', gauge).style.left = '50%';
    s.ui.el('div', 'tag', 'brûlé', gauge).style.left = '91%';
    void label;

    const finished: Crepe[] = [];
    s.scope.onDispose(() => finished.forEach((c) => c.dispose()));

    for (let round = 0; round < ROUNDS; round++) {
      s.hud({ score: `Crêpe ${round + 1}/${ROUNDS} · ${good} réussie${good > 1 ? 's' : ''}`, hint: hint(s.device) });
      const crepe = new Crepe(gr.radius);
      finished.push(crepe);
      crepe.flipper.position.set(0, gr.top + 0.004, 0);
      crepe.flipper.rotation.y = rand(0, Math.PI * 2);
      gr.group.add(crepe.flipper);
      // 1 · pour & spread
      s.sfx('pour', { volume: 0.7 });
      gr.rozell.visible = true;
      let t = 0;
      await s.loop((dt) => {
        t += dt;
        const k = easeOutCubic(t / 0.9);
        crepe.root.scale.setScalar(0.12 + 0.88 * k);
        gr.rozell.position.set(Math.sin(t * 9) * 0.04 * k, gr.top + 0.03, Math.cos(t * 9) * 0.04 * k);
        gr.rozell.rotation.y = t * 7;
        return t >= 0.95;
      });
      gr.rozell.visible = false;
      s.sfx('sizzle', { volume: 0.6 });
      // 2 · the golden gauge
      const P = [1.25, 1.12, 1.02, 0.95, 0.9][round];
      panel.classList.remove('hidden');
      let gt = 0;
      let u = 0;
      let sizzleT = 1.2;
      let q: Quality | null = null;
      let prevU = 0;
      const dry = new THREE.Color('#ffffff');
      await s.loop((dt) => {
        gt += dt;
        const ph = (gt / P) % 2;
        u = ph < 1 ? ph : 2 - ph;
        cursor.style.left = `${u * 100}%`;
        crepe.up.mat.color.copy(dry.setRGB(1, 1, 1).lerp(new THREE.Color('#f1e3c4'), clamp(gt / 4, 0, 1)));
        sizzleT -= dt;
        if (sizzleT <= 0) {
          sizzleT = rand(1.3, 1.9);
          s.sfx('sizzle', { volume: 0.35, pitch: rand(0.9, 1.1) });
        }
        if (Math.random() < (gr.landmark ? 0.15 : 0.5)) s.fx.steam(local(rand(-0.18, 0.18), gr.top + 0.02, rand(-0.18, 0.18)), 1, 0.05, gr.landmark ? 0.14 : 0.22);
        let press = s.pressed();
        if (auto) {
          // test hook: press as the cursor crosses the centre (win) or the burnt end (lose), even with coarse frames
          const crossed = (prevU - 0.5) * (u - 0.5) <= 0 && gt > P * 0.3;
          press = auto.outcome === 'lose' ? u > 0.86 && gt > P : crossed;
          if (press && auto.outcome !== 'lose') u = 0.5;
        }
        prevU = u;
        if (press) {
          const d = Math.abs(u - 0.5);
          q = d < PERFECT ? 'parfait' : d < GOOD ? 'bien' : u < 0.5 ? 'pale' : 'brulee';
          return true;
        }
        if (gt > P * 6) {
          q = 'brulee';
          return true;
        }
        return false;
      });
      const quality: Quality = (q as Quality | null) ?? 'brulee';
      cursor.classList.remove('flash');
      void cursor.offsetWidth;
      cursor.classList.add('flash');
      paintCooked(crepe.down.g, 256, quality, crepe.seed);
      crepe.down.tex.needsUpdate = true;
      setTimeout(() => panel.classList.add('hidden'), 260);
      // 3 · flip!
      s.sfx('whoosh', { volume: 0.6, pitch: quality === 'parfait' ? 1.2 : 1 });
      const turns = quality === 'parfait' ? 3 : 1;
      const dur = quality === 'parfait' ? 0.95 : 0.75;
      const height = quality === 'parfait' ? 0.36 : 0.26;
      const wob = quality === 'brulee' || quality === 'pale' ? 0.35 : 0;
      t = 0;
      await s.loop((dt) => {
        t += dt;
        const k = clamp(t / dur, 0, 1);
        crepe.flipper.position.y = gr.top + 0.004 + Math.sin(k * Math.PI) * height;
        crepe.flipper.rotation.x = smooth(k) * Math.PI * turns;
        crepe.flipper.rotation.z = Math.sin(k * Math.PI) * wob;
        if (quality === 'parfait') s.fx.trail(crepe.flipper.position.clone().applyMatrix4(gr.group.matrixWorld), '#ffd27a', 0.05, 2.5, 0.4);
        return k >= 1;
      });
      crepe.flipper.rotation.set(0, crepe.flipper.rotation.y, 0);
      crepe.flipper.position.y = gr.top + 0.004;
      crepe.swapSides();
      paintCooked(crepe.down.g, 256, 'bien', crepe.seed, true);
      crepe.down.tex.needsUpdate = true;
      crepe.up.mat.color.set('#ffffff');
      s.sfx('pop', { volume: 0.6 });
      s.sfx('sizzle', { volume: 0.7 });
      const center = local(0, gr.top + 0.03, 0);
      s.fx.steam(center, gr.landmark ? 8 : 14, 0.2, gr.landmark ? 0.2 : 0.3);
      if (!ctx.save.data.settings.reducedMotion) ctx.cameraRig.shake(0.02, 0.15);
      // landing squash
      t = 0;
      void s.loop((dt) => {
        t += dt;
        const k = clamp(t / 0.3, 0, 1);
        const sq = 1 + Math.sin(k * Math.PI) * 0.06;
        crepe.root.scale.set(sq, 1, sq);
        return k >= 1;
      });
      if (quality === 'parfait') {
        perfect++;
        good++;
        points += 2;
        s.fx.sparkle(local(0, gr.top + 0.1, 0), ['#ffd27a', '#fff1c2'], 34, 0.7);
        s.sfx('chime', { volume: 0.7, pitch: 1.5 });
        s.ui.float(local(0, gr.top + 0.12, 0), 'Parfait !', { cls: 'big' });
        s.cheer('love');
      } else if (quality === 'bien') {
        good++;
        points += 1;
        s.fx.sparkle(local(0, gr.top + 0.08, 0), '#ffd9a0', 14, 0.5);
        s.sfx('chime', { volume: 0.55, pitch: 1.12 });
        s.ui.float(local(0, gr.top + 0.12, 0), 'Bien !', { cls: 'big warm' });
        s.cheer('happy');
      } else {
        s.ui.float(local(0, gr.top + 0.12, 0), quality === 'brulee' ? 'Un peu brûlée…' : 'Un peu pâle…', { cls: 'dim' });
        if (quality === 'brulee') s.fx.soft.emit(center, { count: 14, color: '#5a5560', alpha: 0.5, speed: [0.05, 0.25], up: 0.4, gravity: -0.2, life: [1, 1.8], size: [0.08, 0.15], sizeEnd: 2.5, spread: 0.12 });
      }
      s.hud({ score: `Crêpe ${round + 1}/${ROUNDS} · ${good} réussie${good > 1 ? 's' : ''}` });
      await s.wait(0.45);
      // 4 · topping
      s.hud({ hint: s.device === 'keyboard' ? 'Choisis la garniture : touches 1 à 4' : 'Choisis la garniture' });
      const topping = await chooseTopping(s);
      s.sfx(topping.id === 'sucre' ? 'pop' : 'pour', { volume: 0.6 });
      s.ui.float(local(0, gr.top + 0.16, -0.05), topping.line, { cls: 'warm' });
      s.bubble(topping.line);
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = baseCanvas.height = 256;
      baseCanvas.getContext('2d')!.drawImage(crepe.up.canvas, 0, 0);
      const topCanvas = document.createElement('canvas');
      topCanvas.width = topCanvas.height = 256;
      paintTopping(topCanvas.getContext('2d')!, 256, topping.id, crepe.seed);
      t = 0;
      await s.loop((dt) => {
        t += dt;
        const k = clamp(t / 0.65, 0, 1);
        const g = crepe.up.g;
        g.clearRect(0, 0, 256, 256);
        g.drawImage(baseCanvas, 0, 0);
        g.globalAlpha = k;
        g.drawImage(topCanvas, 0, 0);
        g.globalAlpha = 1;
        crepe.up.tex.needsUpdate = true;
        const tp = local(rand(-0.15, 0.15), gr.top + 0.25, rand(-0.15, 0.15));
        if (topping.id === 'sucre') s.fx.glint.emit(tp, { count: 2, color: '#ffffff', intensity: 2, speed: [0, 0.1], gravity: 2.5, drag: 0.5, life: [0.25, 0.4], size: [0.03, 0.05], twinkle: true });
        else s.fx.soft.emit(tp, { count: 1, color: topping.color, alpha: 0.9, speed: [0, 0.05], gravity: 3, drag: 0.2, life: [0.2, 0.3], size: [0.025, 0.04], sizeEnd: 1 });
        return k >= 1;
      });
      // 5 · fold in four
      crepe.prepareFold();
      for (const step of [0, 1]) {
        s.sfx('whoosh', { volume: 0.3, pitch: 1.4 + step * 0.2 });
        t = 0;
        await s.loop((dt) => {
          t += dt;
          const k = smooth(t / 0.38);
          if (step === 0) crepe.hingeA.rotation.z = crepe.hingeC.rotation.z = -Math.PI * k;
          else crepe.hingeB.rotation.x = Math.PI * k;
          return t >= 0.38;
        });
      }
      // 6 · onto the plate (or Paulette takes it to a customer)
      const from = crepe.flipper.position.clone();
      const to = gr.plate
        ? gr.plate.clone().add(new THREE.Vector3(-0.07, 0.006 + gr.plateCount * 0.014, -0.07))
        : gr.cook.clone();
      const rotFrom = crepe.flipper.rotation.y;
      const rotTo = rand(-0.5, 0.5) + Math.PI * 0.25;
      t = 0;
      await s.loop((dt) => {
        t += dt;
        const k = clamp(t / (gr.plate ? 0.5 : 0.65), 0, 1);
        const e = gr.plate ? easeOutBack(k) : smooth(k);
        crepe.flipper.position.lerpVectors(from, to, Math.min(1, e));
        crepe.flipper.position.y += Math.sin(k * Math.PI) * 0.14;
        crepe.flipper.rotation.y = rotFrom + (rotTo - rotFrom) * k;
        if (!gr.plate) crepe.flipper.scale.setScalar(1 - 0.6 * k);
        return k >= 1;
      });
      gr.plateCount++;
      s.sfx('pop', { volume: 0.4, pitch: 1.3 });
      if (!gr.plate) {
        s.fx.sparkle(crepe.flipper.getWorldPosition(new THREE.Vector3()), '#ffe3a1', 14, 0.6);
        crepe.flipper.visible = false;
        if (round === 0) s.ui.float(crepe.flipper.getWorldPosition(new THREE.Vector3()), 'Servie !', { cls: 'warm' });
      }
      s.hud({ hint: hint(s.device) });
      await s.wait(0.25);
    }
    panel.remove();
    const won = good >= WIN;
    if (won) {
      s.fx.confetti(local(0.4, gr.top + 0.3, 0), 36);
      s.cheer('clap');
    }
    await s.wait(0.8);
    const name = s.keeper.cast?.name ?? 'La crêpière';
    return {
      won,
      score: points,
      text: won
        ? `${good} crêpes dorées sur ${ROUNDS}${perfect ? `, dont ${perfect} parfaite${perfect > 1 ? 's' : ''}` : ''} ! ${name} est fière de toi : tu as la main du crêpier.`
        : `${good} crêpe${good > 1 ? 's' : ''} réussie${good > 1 ? 's' : ''} sur ${ROUNDS}… il en fallait ${WIN}. ${name} te réchauffe une louche de pâte pour réessayer !`,
    };
  },

  exit(s) {
    const g = griddles.get(s);
    return g ? { position: g.spot.clone(), yaw: yawTo(g.spot, g.griddleWorld) } : null;
  },
};

function makeRozell(group: THREE.Group) {
  const rozell = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.025), mat(PALETTE.woodLight));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), mat(PALETTE.woodLight));
  handle.position.y = 0.08;
  rozell.add(bar, handle);
  rozell.visible = false;
  group.add(rozell);
  return rozell;
}

function placeCook(s: Session, Sp: THREE.Vector3, Gp: THREE.Vector3) {
  s.ctx.player.teleport(Sp, yawTo(Sp, Gp));
  try {
    s.ctx.player.rig.play('cook');
  } catch {
    /* ignore */
  }
}

/** Close-up on the griddle from the visitor's side (scaled with the griddle). */
function closeUp(s: Session, g: Griddle) {
  s.cam.k = 2.4;
  s.cam.to(g.group.localToWorld(new THREE.Vector3(0.06, g.top + 0.98, 0.92)), g.group.localToWorld(new THREE.Vector3(0.02, g.top - 0.02, 0.1)), 40);
  s.cam.snap();
}

/** The food stand's own billig: no extra props; finished crêpes are handed to the cook (who serves them). */
function setupOnLandmark(s: Session, group: THREE.Group, top: number, radius: number, Gp: THREE.Vector3, Sp: THREE.Vector3) {
  const ctx = s.ctx;
  // a clean, hot surface: hide whatever decoration sits on the stand's billig under an iron disc
  const cover = new THREE.Mesh(new THREE.CircleGeometry(radius + 0.012, 40), std('#2a2628', { metalness: 0.55, roughness: 0.45 }));
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = top + 0.0015;
  group.add(cover);
  const rozell = makeRozell(group);
  placeCook(s, Sp, Gp);
  const cookAnchor = ctx.landmarks?.anchors?.get('food:cook');
  const cook = cookAnchor ? group.worldToLocal(cookAnchor.position.clone()).setY(top + 0.45) : new THREE.Vector3(0, top + 0.4, -0.7);
  const g: Griddle = { group, top: top + 0.003, radius, plate: null, plateCount: 0, spot: Sp, griddleWorld: Gp, rozell, landmark: true, cook };
  griddles.set(s, g);
  closeUp(s, g);
}

/** Four big buttons (mouse/touch) + keys 1-4 (and ←/→ + Space). */
function chooseTopping(s: Session): Promise<(typeof TOPPINGS)[number]> {
  return new Promise((resolve) => {
    const panel = s.ui.el('div', 'gmg-panel');
    s.ui.el('div', 'gmg-label', 'Quelle garniture ?', panel);
    const row = s.ui.el('div', 'gmg-btns', '', panel);
    let sel = 0;
    let done = false;
    const btns = TOPPINGS.map((t, i) => {
      const b = s.ui.el('button', 'gmg-btn', `<span class="ico" style="background:${t.color}"></span>${t.label}<kbd>${i + 1}</kbd>`, row);
      b.type = 'button';
      b.style.animationDelay = `${i * 50}ms`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => finish(i));
      return b;
    });
    const finish = (i: number) => {
      if (done) return;
      done = true;
      s.sfx('ui-select', { volume: 0.7 });
      panel.remove();
      resolve(TOPPINGS[i]);
    };
    let t = 0;
    void s.loop((dt) => {
      if (done) return true;
      t += dt;
      const j = s.justDown;
      for (let i = 0; i < 4; i++) if (j.has(`Digit${i + 1}`) || j.has(`Numpad${i + 1}`)) finish(i);
      if (j.has('ArrowLeft')) sel = (sel + 3) % 4;
      if (j.has('ArrowRight')) sel = (sel + 1) % 4;
      if (j.has('ArrowLeft') || j.has('ArrowRight')) btns[sel].focus({ preventScroll: true });
      if (s.ctx.input.pressed('interact') && document.activeElement && btns.includes(document.activeElement as HTMLButtonElement)) finish(btns.indexOf(document.activeElement as HTMLButtonElement));
      if (s.auto && t > 0.45) finish(Math.floor(Math.random() * 4));
      if (t > 14) finish(Math.floor(Math.random() * 4));
      return done;
    });
  });
}

/** A little wooden crêpe cart (when the landmark has no counter at the griddle anchor). */
function buildCart(s: Session, group: THREE.Group, top: number) {
  const W = 1.5;
  const D = 0.8;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), mat(PALETTE.woodLight));
  body.position.y = top - 0.03;
  group.add(body);
  for (const [x, z] of [
    [-W / 2 + 0.07, -D / 2 + 0.07],
    [W / 2 - 0.07, -D / 2 + 0.07],
    [-W / 2 + 0.07, D / 2 - 0.07],
    [W / 2 - 0.07, D / 2 - 0.07],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, top - 0.06, 0.06), mat(PALETTE.wood));
    leg.position.set(x, (top - 0.06) / 2, z);
    group.add(leg);
  }
  const cloth = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.02, 0.22, D + 0.02),
    own(
      new THREE.MeshLambertMaterial({
        map: s.track(canvasTexture(128, 32, (g, w, h) => {
          for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 4; j++) {
              g.fillStyle = (i + j) % 2 ? '#f3ead8' : '#c0453a';
              g.fillRect((i * w) / 16, (j * h) / 4, w / 16 + 1, h / 4 + 1);
            }
          }
        })),
      }),
    ),
  );
  cloth.position.y = top - 0.15;
  group.add(cloth);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.04, D - 0.1), mat(PALETTE.wood));
  shelf.position.y = 0.22;
  group.add(shelf);
}
