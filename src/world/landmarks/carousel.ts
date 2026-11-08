import * as THREE from 'three';
import { PALETTE as P } from '../palette';
import { fontsReady } from '../textures';
import type { LandmarkEnv } from './index';
import { canvasTexture } from './fx';
import { BOX, CONE, CYL, SPH, TOR, Bucket, Frame, Kit, T, bodyMat, cyl, mul, pt, rng, tube, warmLitMat } from './kit';
import { IRON, SNOW, lantern, signMesh, snowMound } from './props';

/**
 * Le Manège des Songes — a vintage carousel. The whole top (platform, mirrored column, poles, canopy,
 * bulbs) rotates in the group `carousel-platform` (userData.speed rad/s, default 0.35). Riders:
 * `carousel-horse-<i>` groups (bobbing up and down on golden poles, drawn by one InstancedMesh) and two
 * sleighs. A static arm `carousel-pompon-arm` reaches over the riders for the pompon mini-game.
 * Frame: local +Z faces the plaza.
 */

const RED = '#b8413a';
const CREAM = '#f3e6c8';
const GOLD = '#e2b34a';

function horseGeometry(): THREE.BufferGeometry {
  const b = new Bucket();
  const body = '#ffffff';
  const mane = '#e0b062';
  // body & chest & rump
  b.add(SPH(10, 7), body, T(0, -0.14, -0.02, 0, 0, 0, 0.22, 0.24, 0.5));
  b.add(SPH(9, 6), body, T(0, -0.08, 0.3, 0, 0, 0, 0.21, 0.24, 0.24));
  b.add(SPH(9, 6), body, T(0, -0.1, -0.34, 0, 0, 0, 0.22, 0.23, 0.22));
  // neck & head
  b.add(cyl(0.1, 0.15, 0.5, 10), body, T(0, 0.18, 0.47, 0.55, 0, 0));
  b.add(SPH(9, 6), body, T(0, 0.45, 0.62, -0.55, 0, 0, 0.12, 0.13, 0.23));
  b.add(SPH(8, 6), body, T(0, 0.33, 0.8, -0.6, 0, 0, 0.085, 0.09, 0.12));
  b.add(SPH(6, 4), '#c98a8a', T(0, 0.31, 0.9, 0, 0, 0, 0.05, 0.04, 0.03));
  for (const s of [-1, 1]) {
    b.add(CONE(5), body, T(s * 0.06, 0.6, 0.56, -0.2, 0, s * 0.2, 0.035, 0.1, 0.03));
    b.add(SPH(6, 4), '#2a1d17', T(s * 0.095, 0.47, 0.7, 0, 0, 0, 0.022));
  }
  // mane & forelock & tail
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    b.add(SPH(6, 4), mane, T(0, 0.04 + t * 0.52, 0.33 + t * 0.25, 0.5, 0, 0, 0.055, 0.14, 0.09));
  }
  b.add(SPH(6, 4), mane, T(0, 0.56, 0.66, -0.4, 0, 0, 0.05, 0.05, 0.08));
  b.add(SPH(6, 4), mane, T(0, -0.06, -0.57, -0.5, 0, 0, 0.06, 0.12, 0.07));
  b.add(SPH(6, 4), mane, T(0, -0.24, -0.66, -0.15, 0, 0, 0.06, 0.14, 0.065));
  // legs (gallop: front folded, back stretched)
  for (const s of [-1, 1]) {
    b.add(cyl(0.045, 0.055, 0.3, 5), body, T(s * 0.11, -0.34, 0.42, -1.0, 0, 0));
    b.add(cyl(0.035, 0.045, 0.28, 5), body, T(s * 0.11, -0.43, 0.6, 0.6, 0, 0));
    b.add(cyl(0.045, 0.045, 0.04, 6), GOLD, T(s * 0.11, -0.54, 0.54, 0.6, 0, 0));
    b.add(cyl(0.045, 0.06, 0.34, 5), body, T(s * 0.11, -0.4, -0.45, 0.65, 0, 0));
    b.add(cyl(0.035, 0.045, 0.3, 5), body, T(s * 0.11, -0.58, -0.68, 1.15, 0, 0));
    b.add(cyl(0.045, 0.045, 0.04, 6), GOLD, T(s * 0.11, -0.66, -0.8, 1.15, 0, 0));
  }
  // saddle, blanket, stirrups, bridle
  b.add(SPH(9, 5), RED, T(0, 0.08, -0.02, 0, 0, 0, 0.2, 0.06, 0.24));
  b.add(TOR(1, 0.15, 3, 10), GOLD, T(0, 0.09, -0.02, Math.PI / 2, 0, 0, 0.2, 0.24, 0.2));
  b.add(BOX(), '#3c5a8a', T(0, -0.04, -0.03, 0, 0, 0, 0.47, 0.2, 0.34));
  b.add(BOX(), GOLD, T(0, -0.145, -0.03, 0, 0, 0, 0.475, 0.025, 0.345));
  for (const s of [-1, 1]) b.add(TOR(1, 0.25, 3, 6), GOLD, T(s * 0.25, -0.22, 0, 0, Math.PI / 2, 0, 0.045));
  b.add(TOR(1, 0.12, 3, 8), GOLD, T(0, 0.38, 0.78, 0.9, 0, 0, 0.1, 0.11, 0.1));
  b.add(BOX(), GOLD, T(0, 0.3, 0.45, 0.9, 0, 0, 0.21, 0.015, 0.28));
  const g = b.build(new THREE.MeshBasicMaterial(), 'horse')!.geometry;
  return g;
}

function sleighGeometry(): THREE.BufferGeometry {
  const b = new Bucket();
  for (const s of [-1, 1]) {
    const pts = [
      new THREE.Vector3(s * 0.34, 0.06, -0.62),
      new THREE.Vector3(s * 0.34, 0.04, 0.1),
      new THREE.Vector3(s * 0.34, 0.08, 0.55),
      new THREE.Vector3(s * 0.34, 0.3, 0.78),
      new THREE.Vector3(s * 0.34, 0.52, 0.7),
      new THREE.Vector3(s * 0.34, 0.5, 0.56),
    ];
    b.add(tube(pts, 0.03, 5), GOLD);
    for (const z of [-0.4, 0.25]) b.add(BOX(), GOLD, T(s * 0.34, 0.15, z, 0, 0, 0, 0.03, 0.2, 0.03));
  }
  b.add(BOX(), RED, T(0, 0.38, -0.05, 0, 0, 0, 0.74, 0.32, 1.05));
  b.add(BOX(), GOLD, T(0, 0.55, -0.05, 0, 0, 0, 0.78, 0.04, 1.08));
  b.add(BOX(), RED, T(0, 0.72, -0.5, -0.15, 0, 0, 0.74, 0.55, 0.12));
  b.add(TOR(1, 0.18, 5, 12, Math.PI), GOLD, T(0, 1.0, -0.53, -0.15, 0, 0, 0.3, 0.16, 0.3));
  b.add(BOX(), CREAM, T(0, 0.58, -0.2, 0, 0, 0, 0.64, 0.08, 0.5));
  b.add(SPH(9, 6), RED, T(0, 0.46, 0.5, 0, 0, 0, 0.36, 0.22, 0.22));
  b.add(TOR(1, 0.2, 5, 12, Math.PI * 1.3), GOLD, T(0, 0.62, 0.62, 0, Math.PI / 2, 0, 0.14));
  for (const s of [-1, 1]) b.add(SPH(8, 6), GOLD, T(s * 0.25, 0.42, 0.48, 0, 0, 0, 0.05));
  return b.build(new THREE.MeshBasicMaterial(), 'sleigh')!.geometry;
}

function mirrorTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    const n = 8;
    const pw = w / n;
    const r = rng(77);
    for (let i = 0; i < n; i++) {
      const x0 = i * pw;
      const grd = g.createLinearGradient(x0, 0, x0 + pw, h);
      grd.addColorStop(0, '#1f2744');
      grd.addColorStop(0.45, '#5d6a92');
      grd.addColorStop(0.6, '#8995bb');
      grd.addColorStop(1, '#1c223c');
      g.fillStyle = '#8a6a2a';
      g.fillRect(x0, 0, pw, h);
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(x0 + 10, 14, pw - 20, h - 28, 40);
      g.fill();
      for (let k = 0; k < 9; k++) {
        const bx = x0 + 18 + r() * (pw - 36);
        const by = 24 + r() * (h - 48);
        const br = 6 + r() * 16;
        const rg = g.createRadialGradient(bx, by, 0, bx, by, br);
        rg.addColorStop(0, 'rgba(255,226,160,0.95)');
        rg.addColorStop(1, 'rgba(255,190,100,0)');
        g.fillStyle = rg;
        g.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.moveTo(x0 + 24, 20);
      g.lineTo(x0 + 54, 20);
      g.lineTo(x0 + 20, h - 30);
      g.closePath();
      g.fill();
    }
  });
}

function roundingBoardTexture(title: string) {
  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = '#7a2324';
    g.fillRect(0, 0, w, h);
    g.fillStyle = GOLD;
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    const reps = 1;
    const seg = w / reps;
    for (let k = 0; k < reps; k++) {
      const cx = seg * k + seg / 2;
      g.font = `700 ${Math.round(h * 0.56)}px "Fraunces", Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffe2a0';
      g.fillText(title, cx, h * 0.54);
      const tw = g.measureText(title).width;
      // painted medallions between the titles
      for (const dx of [-1, 1]) {
        const mx = cx + dx * (tw / 2 + (seg - tw) / 4);
        g.fillStyle = GOLD;
        g.beginPath();
        g.ellipse(mx, h / 2, h * 0.34, h * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2f4f7a';
        g.beginPath();
        g.ellipse(mx, h / 2, h * 0.27, h * 0.23, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff4dc';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 ? h * 0.06 : h * 0.15;
          g.lineTo(mx + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
        }
        g.fill();
      }
    }
  };
  return {
    make: () => {
      const t = canvasTexture(2048, 128, paint);
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(4, 1);
      return t;
    },
  };
}

/** Striped tent roof: 16 alternating panels from the rim to the apex, slightly sagging. */
function canopyGeometry(R: number, rimY: number, apexY: number, n = 16): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const cR = new THREE.Color(RED);
  const cC = new THREE.Color(CREAM);
  const rings = 4;
  const at = (a: number, t: number) => {
    const r = R * t;
    const y = apexY + (rimY - apexY) * t - Math.sin(Math.PI * t) * 0.16;
    return [Math.sin(a) * r, y, Math.cos(a) * r];
  };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const c = i % 2 ? cR : cC;
    for (let j = 0; j < rings; j++) {
      const t0 = j / rings;
      const t1 = (j + 1) / rings;
      const p00 = at(a0, t0);
      const p01 = at(a1, t0);
      const p10 = at(a0, t1);
      const p11 = at(a1, t1);
      pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildCarousel(env: LandmarkEnv, f: Frame) {
  const { ctx } = env;
  const kitS = new Kit(ctx);
  const kitR = new Kit(ctx);
  const title = ctx.layout.zones.carousel.name || 'Le Manège des Songes';
  const PLAT_Y = 0.3;
  const R_PLAT = 4.55;
  const R_CANOPY = 4.8;
  const BOARD_Y0 = 3.5;
  const BOARD_Y1 = 3.95;
  const APEX = 5.75;

  // ───────── static base
  kitS.body.add(cyl(5.05, 5.12, 0.12, 48), '#8a8a96', T(0, 0.06, 0));
  kitS.body.add(cyl(4.72, 4.8, 0.2, 48), '#6c4a7d', T(0, 0.2, 0));
  kitS.metal.add(TOR(1, 0.02, 4, 64), GOLD, T(0, 0.29, 0, Math.PI / 2, 0, 0, 4.74));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    kitS.metal.add(SPH(6, 4), GOLD, T(Math.sin(a) * 4.79, 0.2, Math.cos(a) * 4.79, 0, 0, 0, 0.035));
  }
  // entrance steps at the front
  kitS.body.add(BOX(), '#9a9aa6', T(0, 0.05, 5.2, 0, 0, 0, 1.6, 0.1, 0.5));
  f.circle(0, 0, 5.05, 'solid');

  // ───────── rotating top
  const platform = new THREE.Group();
  platform.name = 'carousel-platform';
  platform.userData.speed = 0.35;
  platform.position.y = PLAT_Y;
  f.group.add(platform);

  const R = kitR;
  R.body.add(cyl(R_PLAT, R_PLAT, 0.08, 40), '#c49a6c', T(0, 0.0, 0));
  R.body.add(cyl(1.6, 1.6, 0.01, 40), '#8a2c2a', T(0, 0.045, 0));
  R.body.add(cyl(R_PLAT - 0.15, R_PLAT - 0.15, 0.008, 40, true), GOLD, T(0, 0.045, 0));
  R.metal.add(TOR(1, 0.025, 4, 72), GOLD, T(0, 0.04, 0, Math.PI / 2, 0, 0, R_PLAT));
  R.body.add(cyl(R_PLAT + 0.02, R_PLAT + 0.02, 0.22, 40, true), RED, T(0, -0.07, 0));
  // painted floor rays
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    R.body.add(BOX(), '#d9b483', T(Math.sin(a) * 3.05, 0.044, Math.cos(a) * 3.05, 0, a, 0, 0.05, 0.004, 2.7));
  }
  // centre column: pedestal, mirrors, crown
  R.body.add(cyl(1.1, 1.2, 0.5, 16), '#6c4a7d', T(0, 0.29, 0));
  R.metal.add(TOR(1, 0.04, 4, 32), GOLD, T(0, 0.55, 0, Math.PI / 2, 0, 0, 1.08));
  const mirrorMat = new THREE.MeshBasicMaterial({ map: mirrorTexture(), color: new THREE.Color(1, 0.98, 0.95) });
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 2.7, 8, 1, true), mirrorMat);
  mirror.position.y = 0.55 + 1.35;
  mirror.rotation.y = Math.PI / 8;
  mirror.name = 'carousel-mirrors';
  platform.add(mirror);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    R.metal.add(BOX(), GOLD, T(Math.sin(a) * 0.87, 1.9, Math.cos(a) * 0.87, 0, a, 0, 0.07, 2.7, 0.05));
  }
  R.body.add(cyl(0.98, 1.08, 0.3, 16), '#6c4a7d', T(0, 3.4, 0));
  R.metal.add(TOR(1, 0.04, 4, 32), GOLD, T(0, 3.25, 0, Math.PI / 2, 0, 0, 1.0));
  // ceiling under the canopy (radial stripes)
  {
    const n = 24;
    const pos: number[] = [];
    const col: number[] = [];
    const c1 = new THREE.Color(CREAM);
    const c2 = new THREE.Color('#e9c98f');
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      pos.push(0, BOARD_Y0, 0, Math.sin(a1) * R_CANOPY, BOARD_Y0, Math.cos(a1) * R_CANOPY, Math.sin(a0) * R_CANOPY, BOARD_Y0, Math.cos(a0) * R_CANOPY);
      const c = i % 2 ? c1 : c2;
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    R.body.add(g, null);
  }
  // canopy roof, ribs, crown, finial, pennant
  R.body.add(canopyGeometry(R_CANOPY + 0.15, BOARD_Y1, APEX), null);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const r = (R_CANOPY + 0.15) * t;
      pts.push(new THREE.Vector3(Math.sin(a) * r, APEX + (BOARD_Y1 - APEX) * t - Math.sin(Math.PI * t) * 0.16 + 0.02, Math.cos(a) * r));
    }
    R.metal.add(tube(pts, 0.03, 4), GOLD);
    // bulbs along the rib
    for (let k = 1; k <= 5; k++) {
      const p = pts[k].clone();
      p.y += 0.05;
      R.bulb(p, k % 2 ? P.warm : P.candle, 0.05, k === 3 ? 0.6 : 0);
    }
  }
  R.body.add(cyl(0.5, 0.6, 0.5, 16), RED, T(0, APEX - 0.05, 0));
  R.metal.add(TOR(1, 0.06, 4, 24), GOLD, T(0, APEX + 0.2, 0, Math.PI / 2, 0, 0, 0.52));
  R.body.add(SPH(16, 8), CREAM, T(0, APEX + 0.2, 0, 0, 0, 0, 0.5, 0.42, 0.5));
  R.metal.add(cyl(0.03, 0.05, 0.9, 6), GOLD, T(0, APEX + 0.95, 0));
  R.metal.add(SPH(8, 6), GOLD, T(0, APEX + 0.68, 0, 0, 0, 0, 0.12));
  {
    const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.62, -0.15, 0)]);
    flag.computeVertexNormals();
    R.body.add(flag, RED, T(0.03, APEX + 1.35, 0));
    R.body.add(flag, RED, T(0.03, APEX + 1.35, 0, 0, Math.PI, 0, 1, 1, 1));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    R.bulb(new THREE.Vector3(Math.sin(a) * 0.62, APEX + 0.25, Math.cos(a) * 0.62), P.warm, 0.05, i % 3 === 0 ? 0.5 : 0);
  }
  // rounding board (text), valance scallops, bulbs on the board edges
  const board = roundingBoardTexture(title);
  const boardMat = new THREE.MeshBasicMaterial({ map: board.make(), color: new THREE.Color(1, 1, 1) });
  boardMat.userData.lit = 1.0;
  const boardMesh = new THREE.Mesh(new THREE.CylinderGeometry(R_CANOPY, R_CANOPY, BOARD_Y1 - BOARD_Y0, 64, 1, true), boardMat);
  boardMesh.position.y = (BOARD_Y0 + BOARD_Y1) / 2;
  boardMesh.name = 'carousel-rounding-board';
  platform.add(boardMesh);
  fontsReady().then(() => {
    const old = boardMat.map;
    boardMat.map = board.make();
    boardMat.needsUpdate = true;
    old?.dispose();
  });
  const nV = 36;
  for (let i = 0; i < nV; i++) {
    const a = ((i + 0.5) / nV) * Math.PI * 2;
    const c = i % 2 ? RED : CREAM;
    R.body.add(CYL(12), c, T(Math.sin(a) * (R_CANOPY - 0.03), BOARD_Y0 + 0.01, Math.cos(a) * (R_CANOPY - 0.03), Math.PI / 2, a, 0, 0.42, 0.02, 0.2));
    R.metal.add(SPH(6, 4), GOLD, T(Math.sin(a) * (R_CANOPY - 0.03), BOARD_Y0 - 0.2, Math.cos(a) * (R_CANOPY - 0.03), 0, 0, 0, 0.03));
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    for (const y of [BOARD_Y1 - 0.04, BOARD_Y0 + 0.05]) R.bulb(new THREE.Vector3(Math.sin(a) * (R_CANOPY + 0.05), y, Math.cos(a) * (R_CANOPY + 0.05)), y > 3.7 ? P.warm : P.candle, 0.04, i % 4 === 0 && y > 3.7 ? 0.5 : 0);
  }
  // ceiling bulbs in two rings
  for (const [rr, n] of [
    [2.2, 18],
    [3.6, 28],
  ] as [number, number][]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr;
      R.bulb(new THREE.Vector3(Math.sin(a) * rr, BOARD_Y0 - 0.06, Math.cos(a) * rr), P.candle, 0.045, i % 3 === 0 ? 0.45 : 0);
    }
  }

  // ───────── riders
  const OUTER = 3.45;
  const INNER = 2.15;
  const slots: { a: number; r: number; sleigh: boolean }[] = [];
  for (let k = 0; k < 8; k++) slots.push({ a: (k / 8) * Math.PI * 2, r: OUTER, sleigh: k === 2 || k === 6 });
  for (let k = 0; k < 4; k++) slots.push({ a: ((k + 0.5) / 4) * Math.PI * 2, r: INNER, sleigh: false });
  const horseSlots = slots.filter((s) => !s.sleigh);
  const sleighSlots = slots.filter((s) => s.sleigh);
  const tints = ['#ffffff', '#ffe8d2', '#ffdbe4', '#dfe8ff', '#fff1c7', '#e9f4ea', '#f2e4ff', '#ffffff', '#ffe8d2', '#dfe8ff'];
  const warm = warmLitMat(0.42);
  const horseMesh = new THREE.InstancedMesh(horseGeometry(), warm, horseSlots.length);
  horseMesh.name = 'carousel-horses';
  horseMesh.frustumCulled = false;
  const horses: THREE.Group[] = [];
  const tmpC = new THREE.Color();
  const SEAT = 1.25;
  horseSlots.forEach((s, i) => {
    const g = new THREE.Group();
    g.name = `carousel-horse-${i}`;
    g.position.set(Math.sin(s.a) * s.r, SEAT, Math.cos(s.a) * s.r);
    g.rotation.order = 'YXZ';
    g.rotation.y = Math.atan2(Math.cos(s.a), -Math.sin(s.a));
    g.userData.baseY = SEAT;
    g.userData.phase = s.a * 2 + (s.r < 3 ? 1.3 : 0);
    /** Local seat point (where a rider sits), relative to the horse group. */
    g.userData.seat = new THREE.Vector3(0, 0.12, -0.02);
    platform.add(g);
    horses.push(g);
    horseMesh.setColorAt(i, tmpC.set(tints[i % tints.length]));
    // golden pole through the saddle
    R.metal.add(cyl(0.035, 0.035, BOARD_Y0, 8), GOLD, T(g.position.x, BOARD_Y0 / 2, g.position.z));
    for (const y of [0.35, BOARD_Y0 - 0.35]) R.metal.add(SPH(8, 6), GOLD, T(g.position.x, y, g.position.z, 0, 0, 0, 0.07));
    R.metal.add(cyl(0.12, 0.05, 0.12, 8), GOLD, T(g.position.x, BOARD_Y0 - 0.08, g.position.z));
  });
  platform.add(horseMesh);
  const sleighMesh = new THREE.InstancedMesh(sleighGeometry(), warm, sleighSlots.length);
  sleighMesh.name = 'carousel-sleighs';
  const sm = new THREE.Matrix4();
  sleighSlots.forEach((s, i) => {
    const yaw = Math.atan2(Math.cos(s.a), -Math.sin(s.a));
    sm.compose(new THREE.Vector3(Math.sin(s.a) * s.r, 0.04, Math.cos(s.a) * s.r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1.1, 1.1, 1.1));
    sleighMesh.setMatrixAt(i, sm);
    sleighMesh.setColorAt(i, tmpC.set(i ? '#ffffff' : '#ffe2c0'));
  });
  sleighMesh.computeBoundingSphere();
  platform.add(sleighMesh);

  // ───────── static: ticket kiosk, lever, lanterns, pompon arm
  {
    const km = T(-4.7, 0, 3.9, 0, 0.75, 0);
    kitS.body.add(cyl(0.62, 0.66, 1.9, 6), '#2f4f7a', mul(km, T(0, 0.95, 0)));
    kitS.body.add(cyl(0.67, 0.67, 0.12, 6), GOLD, mul(km, T(0, 1.9, 0)));
    kitS.lit.add(BOX(), '#ffc98a', mul(km, T(0, 1.25, 0.56, 0, 0, 0, 0.52, 0.5, 0.02)), 0.9);
    kitS.body.add(BOX(), CREAM, mul(km, T(0, 0.98, 0.6, 0, 0, 0, 0.62, 0.06, 0.16)));
    kitS.body.add(canopyGeometry(0.82, 1.96, 2.62, 8), null, km);
    kitS.metal.add(SPH(8, 6), GOLD, mul(km, T(0, 2.78, 0, 0, 0, 0, 0.09)));
    const tickets = signMesh('Billets', 0.6, 0.2, { bg: CREAM, fg: '#7a2324', px: 256, round: 0.25 });
    tickets.position.copy(pt(km, 0, 1.68, 0.625));
    tickets.rotation.y = 0.75;
    f.group.add(tickets);
    kitS.body.add(SPH(8, 4), SNOW, mul(km, T(0, 2.68, 0, 0, 0, 0, 0.3, 0.05, 0.3)));
    f.circle(-4.7, 3.9, 0.75, 'prop');
  }
  {
    // brass control lever on a little pedestal
    const lm = T(-2.75, 0, 5.15, 0, 0.3, 0);
    kitS.body.add(cyl(0.18, 0.24, 0.85, 8), '#6c4a7d', mul(lm, T(0, 0.425, 0)));
    kitS.metal.add(cyl(0.22, 0.22, 0.06, 8), GOLD, mul(lm, T(0, 0.88, 0)));
    kitS.metal.add(CYL(6), GOLD, mul(lm, T(0, 1.08, 0.05, 0.5, 0, 0, 0.02, 0.42, 0.02)));
    kitS.body.add(SPH(8, 6), RED, mul(lm, T(0, 1.27, 0.16, 0, 0, 0, 0.06)));
    f.circle(-2.75, 5.15, 0.26, 'prop');
  }
  // lantern posts at the entrance
  const lanternPos: [number, number][] = [
    [1.6, 5.6],
    [-5.6, 1.4],
    [5.6, -1.6],
  ];
  for (const [x, z] of lanternPos) {
    const m = T(x, 0, z, 0, Math.atan2(x, z) + Math.PI / 2, 0);
    kitS.metal.add(cyl(0.05, 0.065, 2.3, 8), IRON, mul(m, T(0, 1.15, 0)));
    lantern(kitS, mul(m, T(0, 2.55, 0)), 0.9);
    kitS.pool(m, 0, 0, 1.6, P.warm2, 0.3);
    f.circle(x, z, 0.12, 'prop');
  }
  // pompon arm (static, at the edge, over the outer riders)
  const arm = new THREE.Group();
  arm.name = 'carousel-pompon-arm';
  {
    const a = (58 * Math.PI) / 180;
    const PR = 5.45;
    const px = Math.sin(a) * PR;
    const pz = Math.cos(a) * PR;
    const tipR = 3.55;
    const armY = 3.25;
    const b = new Bucket();
    b.add(cyl(0.07, 0.09, armY + 0.25, 10), '#6c4a7d', T(px, (armY + 0.25) / 2, pz));
    b.add(cyl(0.16, 0.2, 0.3, 10), '#6c4a7d', T(px, 0.15, pz));
    b.add(SPH(8, 6), GOLD, T(px, armY + 0.32, pz, 0, 0, 0, 0.12));
    const tip = new THREE.Vector3(Math.sin(a) * tipR, armY, Math.cos(a) * tipR);
    const base = new THREE.Vector3(px, armY, pz);
    const mid = base.clone().lerp(tip, 0.5);
    const len = base.distanceTo(tip);
    b.add(BOX(), GOLD, T(mid.x, armY, mid.z, 0, a, 0, 0.07, 0.07, len));
    const brace = [new THREE.Vector3(px, armY - 0.75, pz), base.clone().lerp(tip, 0.25).setY(armY - 0.25), base.clone().lerp(tip, 0.5).setY(armY - 0.03)];
    b.add(tube(brace, 0.025, 5), GOLD);
    b.add(TOR(1, 0.22, 5, 12), GOLD, T(tip.x, armY - 0.06, tip.z, 0, a + Math.PI / 2, 0, 0.08));
    b.add(cyl(0.03, 0.06, 0.08, 8), GOLD, T(tip.x, armY - 0.15, tip.z));
    const mesh = b.build(bodyMat(false), 'carousel-pompon-arm-mesh')!;
    arm.add(mesh);
    const tipObj = new THREE.Object3D();
    tipObj.name = 'carousel-pompon-tip';
    tipObj.position.set(tip.x, armY - 0.18, tip.z);
    arm.add(tipObj);
    f.group.add(arm);
    f.group.updateMatrixWorld(true);
    arm.userData.tip = tipObj.getWorldPosition(new THREE.Vector3());
    f.circle(px, pz, 0.22, 'prop');
  }
  snowMound(kitS, T(-5.8, 0, -2.2), 1.0, 0.3, 3);
  snowMound(kitS, T(5.4, 0, -3.6), 1.2, 0.34, 5);
  snowMound(kitS, T(-3.4, 0, -5.4), 0.9, 0.28, 7);
  // light spill around the carousel
  kitS.pool(T(), 0, 0, 7.5, P.warm, 0.16);

  const partsS = kitS.finish(f.group, 'carousel-static');
  const partsR = kitR.finish(platform, 'carousel', { twinkle: 0.3, bodyMaterial: warm });
  f.light(0, 3, 0, (k) => {
    partsS.setLevel(k);
    partsR.setLevel(k);
    boardMat.color.setScalar(0.45 + 0.55 * k);
    mirrorMat.color.setScalar(0.55 + 0.45 * k);
    (warm.userData.warm as THREE.Color).set('#ffb46a').multiplyScalar(0.1 + 0.32 * k);
  });

  f.anchor('carousel:keeper', -2.1, 5.55, 0.15);
  f.anchor('carousel:board-spot', 0, 5.75, Math.PI);
  f.anchor('carousel:center', 0, 0, 0);

  const m4 = new THREE.Matrix4();
  return (dt: number) => {
    const speed = Number(platform.userData.speed);
    platform.rotation.y += (Number.isFinite(speed) ? speed : 0) * dt;
    const rot = platform.rotation.y;
    for (let i = 0; i < horses.length; i++) {
      const h = horses[i];
      const ph = rot * 3 + h.userData.phase;
      h.position.y = h.userData.baseY + Math.sin(ph) * 0.22;
      h.rotation.x = Math.cos(ph) * 0.07;
      h.updateMatrix();
      m4.copy(h.matrix);
      horseMesh.setMatrixAt(i, m4);
    }
    horseMesh.instanceMatrix.needsUpdate = true;
  };
}
