import * as THREE from 'three';
import { ease, smoothstep } from './util';

/**
 * Little floating icons above the head — heart, music note, sparkles, sweat drop, "!" and the lightbulb.
 * Painted once on canvases, shown as sprites that pop in (overshoot), float up, wobble and fade.
 */
export type EmoteKind = 'happy' | 'surprised' | 'love' | 'note' | 'sweat' | 'idea';
type Icon = 'heart' | 'note' | 'note2' | 'sparkle' | 'drop' | 'bang' | 'bulb' | 'puff';

const textures = new Map<Icon, THREE.Texture>();

function paint(icon: Icon): THREE.Texture {
  const cached = textures.get(icon);
  if (cached) return cached;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const outline = (fill: string, stroke = '#3a2416', lw = 9) => {
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 14;
    g.lineWidth = lw + 8;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
    g.fillStyle = fill;
    g.fill();
  };
  switch (icon) {
    case 'heart': {
      g.beginPath();
      g.moveTo(64, 108);
      g.bezierCurveTo(14, 74, 14, 30, 42, 26);
      g.bezierCurveTo(56, 24, 62, 34, 64, 42);
      g.bezierCurveTo(66, 34, 72, 24, 86, 26);
      g.bezierCurveTo(114, 30, 114, 74, 64, 108);
      g.closePath();
      outline('#ef5a6f', '#7a1f2e');
      g.beginPath();
      g.ellipse(44, 46, 9, 6, -0.6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fill();
      break;
    }
    case 'note':
    case 'note2': {
      g.beginPath();
      if (icon === 'note') {
        g.ellipse(46, 92, 20, 15, -0.4, 0, Math.PI * 2);
        g.moveTo(62, 90);
        g.lineTo(62, 22);
        g.quadraticCurveTo(80, 40, 96, 44);
        g.lineTo(96, 58);
        g.quadraticCurveTo(80, 52, 70, 44);
        g.lineTo(70, 90);
      } else {
        g.ellipse(34, 92, 16, 12, -0.4, 0, Math.PI * 2);
        g.ellipse(86, 82, 16, 12, -0.4, 0, Math.PI * 2);
        g.rect(44, 28, 8, 64);
        g.rect(96, 18, 8, 64);
        g.moveTo(44, 28);
        g.lineTo(104, 14);
        g.lineTo(104, 30);
        g.lineTo(44, 44);
      }
      outline('#f3d27a', '#4a2c1a', 7);
      break;
    }
    case 'sparkle': {
      const star = (cx: number, cy: number, r: number) => {
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 ? r * 0.3 : r;
          g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.closePath();
      };
      star(64, 64, 52);
      outline('#ffe08a', '#a06a1a', 6);
      break;
    }
    case 'drop': {
      g.beginPath();
      g.moveTo(64, 14);
      g.bezierCurveTo(70, 40, 100, 62, 100, 82);
      g.arc(64, 82, 36, 0, Math.PI, false);
      g.bezierCurveTo(28, 62, 58, 40, 64, 14);
      g.closePath();
      outline('#8fd0ff', '#1f4f7a', 7);
      g.beginPath();
      g.ellipse(52, 82, 7, 12, 0.3, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fill();
      break;
    }
    case 'bang': {
      g.beginPath();
      g.moveTo(50, 14);
      g.lineTo(78, 14);
      g.lineTo(72, 80);
      g.lineTo(56, 80);
      g.closePath();
      g.moveTo(78, 102);
      g.arc(64, 102, 14, 0, Math.PI * 2);
      outline('#ffb648', '#7a2e12', 8);
      break;
    }
    case 'bulb': {
      g.beginPath();
      g.arc(64, 52, 32, Math.PI * 0.8, Math.PI * 2.2);
      g.lineTo(78, 92);
      g.lineTo(50, 92);
      g.closePath();
      outline('#ffe36e', '#7a5a12', 7);
      g.beginPath();
      g.roundRect(50, 94, 28, 18, 5);
      g.fillStyle = '#9aa0a8';
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#3a3a44';
      g.stroke();
      g.strokeStyle = '#ffe36e';
      g.lineWidth = 7;
      for (const [x1, y1, x2, y2] of [
        [64, 4, 64, 12],
        [18, 22, 26, 28],
        [110, 22, 102, 28],
        [8, 56, 18, 56],
        [120, 56, 110, 56],
      ]) {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.beginPath();
      g.ellipse(52, 44, 6, 10, 0.4, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fill();
      break;
    }
    case 'puff': {
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 62);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(icon, t);
  return t;
}

export function puffTexture() {
  return paint('puff');
}

interface Live {
  sprite: THREE.Sprite;
  t: number;
  delay: number;
  life: number;
  x: number;
  z: number;
  drift: number;
  size: number;
  rise: number;
  wobble: number;
  slide?: boolean;
}

const RECIPES: Record<EmoteKind, { icon: Icon; x: number; z?: number; delay: number; size: number; drift?: number; rise?: number; slide?: boolean }[]> = {
  happy: [
    { icon: 'sparkle', x: -0.2, delay: 0, size: 0.2 },
    { icon: 'sparkle', x: 0.22, delay: 0.12, size: 0.26 },
    { icon: 'sparkle', x: 0.02, delay: 0.25, size: 0.17 },
  ],
  surprised: [{ icon: 'bang', x: 0.05, delay: 0, size: 0.36, rise: 0.12 }],
  love: [
    { icon: 'heart', x: 0, delay: 0, size: 0.32 },
    { icon: 'heart', x: 0.2, delay: 0.35, size: 0.2, drift: 0.12 },
    { icon: 'heart', x: -0.18, delay: 0.6, size: 0.17, drift: -0.1 },
  ],
  note: [
    { icon: 'note', x: 0.14, delay: 0, size: 0.26, drift: 0.18 },
    { icon: 'note2', x: -0.12, delay: 0.55, size: 0.24, drift: -0.15 },
  ],
  sweat: [{ icon: 'drop', x: 0.27, z: 0.08, delay: 0, size: 0.17, rise: -0.25, slide: true }],
  idea: [
    { icon: 'bulb', x: 0, delay: 0, size: 0.36, rise: 0.1 },
    { icon: 'sparkle', x: 0.22, delay: 0.2, size: 0.13 },
  ],
};

export class Emotes {
  private live: Live[] = [];
  constructor(
    private parent: THREE.Object3D,
    private height: number,
  ) {}

  spawn(kind: EmoteKind) {
    for (const r of RECIPES[kind]) {
      const mat = new THREE.SpriteMaterial({ map: paint(r.icon), transparent: true, depthWrite: false, opacity: 0, color: 0xc8c8c8 });
      const s = new THREE.Sprite(mat);
      s.raycast = () => {};
      s.renderOrder = 10;
      s.scale.setScalar(0.0001);
      this.parent.add(s);
      this.live.push({
        sprite: s,
        t: 0,
        delay: r.delay,
        life: r.slide ? 1.4 : 1.8,
        x: r.x,
        z: r.z ?? 0.05,
        drift: r.drift ?? 0,
        size: r.size,
        rise: r.rise ?? 0.32,
        wobble: Math.random() * 6,
        slide: r.slide,
      });
    }
  }

  get active() {
    return this.live.length > 0;
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.t += dt;
      const t = e.t - e.delay;
      const s = e.sprite;
      if (t < 0) continue;
      const u = t / e.life;
      if (u >= 1) {
        s.removeFromParent();
        (s.material as THREE.SpriteMaterial).dispose();
        this.live.splice(i, 1);
        continue;
      }
      const pop = ease.outBack(Math.min(1, t / 0.28));
      const fade = 1 - smoothstep(0.7, 1, u);
      const y0 = e.slide ? this.height - 0.12 : this.height + 0.12;
      s.position.set(e.x + e.drift * u + Math.sin(t * 5 + e.wobble) * 0.025, y0 + e.rise * ease.outCubic(u), e.z);
      s.scale.setScalar(e.size * pop * (1 + 0.06 * Math.sin(t * 9 + e.wobble)));
      (s.material as THREE.SpriteMaterial).opacity = Math.min(1, t / 0.12) * fade;
      (s.material as THREE.SpriteMaterial).rotation = 0.15 * Math.sin(t * 4 + e.wobble);
    }
  }

  dispose() {
    for (const e of this.live) {
      e.sprite.removeFromParent();
      (e.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.live = [];
  }
}
