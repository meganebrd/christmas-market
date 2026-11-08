import * as THREE from 'three';
import type { UVRect } from './kit';

/**
 * One canvas texture per chalet holding every small picture of the stall, so they all render in a
 * single draw call: 8 product images, 8 price tags, 2 chalkboard texts and 2 small plank texts.
 *
 *   y   0..255  products (4 × 2 cells of 128²)
 *   y 256..319  price tags (4 × 2 cells of 128 × 32)
 *   y 320..447  chalk texts (2 cells of 256 × 128)
 *   y 448..511  plank texts (2 cells of 256 × 64)
 */
const S = 512;

interface TextCell {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: 'chalk' | 'plank';
  used: boolean;
}

export interface TagStyle {
  paper: string;
  ink: string;
}

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private cells: TextCell[] = [
    { x: 0, y: 320, w: 256, h: 128, text: '', style: 'chalk', used: false },
    { x: 256, y: 320, w: 256, h: 128, text: '', style: 'chalk', used: false },
    { x: 0, y: 448, w: 256, h: 64, text: '', style: 'plank', used: false },
    { x: 256, y: 448, w: 256, h: 64, text: '', style: 'plank', used: false },
  ];

  /** `size` = real canvas size (512 on high/medium, 256 on low); drawing happens in a 512 logical space. */
  constructor(private plankColor = '#c99a64', size = S) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(size / S, size / S);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  private uv(x: number, y: number, w: number, h: number, inset = 1.5): UVRect {
    return { u0: (x + inset) / S, u1: (x + w - inset) / S, v0: 1 - (y + h - inset) / S, v1: 1 - (y + inset) / S };
  }

  productCell(i: number): UVRect {
    return this.uv((i % 4) * 128, Math.floor(i / 4) * 128, 128, 128, 2);
  }

  tagCell(i: number): UVRect {
    return this.uv((i % 4) * 128, 256 + Math.floor(i / 4) * 32, 128, 32, 1);
  }

  /** Reserve a text cell; the text is painted by `paintTexts()` (after the fonts are loaded). */
  allocText(text: string, style: 'chalk' | 'plank'): UVRect | null {
    const c = this.cells.find((c) => c.style === style && !c.used);
    if (!c) return null;
    c.used = true;
    c.text = text;
    // paint the background right away (the board does not look empty before the fonts arrive)
    this.paintCellBackground(c);
    this.texture.needsUpdate = true;
    return this.uv(c.x, c.y, c.w, c.h, 1.5);
  }

  private paintCellBackground(c: TextCell) {
    const g = this.g;
    g.save();
    g.clearRect(c.x, c.y, c.w, c.h);
    if (c.style === 'chalk') {
      g.fillStyle = '#27322e';
      g.fillRect(c.x, c.y, c.w, c.h);
      // chalk dust smudges
      for (let i = 0; i < 14; i++) {
        const x = c.x + ((i * 73) % c.w);
        const y = c.y + ((i * 41) % c.h);
        const grd = g.createRadialGradient(x, y, 0, x, y, 26);
        grd.addColorStop(0, 'rgba(255,255,255,0.05)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(x - 26, y - 26, 52, 52);
      }
    } else {
      g.fillStyle = this.plankColor;
      g.fillRect(c.x, c.y, c.w, c.h);
      g.globalAlpha = 0.14;
      g.strokeStyle = '#3a2416';
      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = c.y + 6 + i * (c.h / 6);
        g.beginPath();
        g.moveTo(c.x, y);
        g.bezierCurveTo(c.x + c.w * 0.3, y + 3, c.x + c.w * 0.6, y - 3, c.x + c.w, y + 1);
        g.stroke();
      }
    }
    g.restore();
  }

  paintTexts() {
    for (const c of this.cells) {
      if (!c.used) continue;
      this.paintCellBackground(c);
      if (c.style === 'chalk') this.paintChalk(c);
      else this.paintPlank(c);
    }
    this.texture.needsUpdate = true;
  }

  private paintChalk(c: TextCell) {
    const g = this.g;
    g.save();
    const lines = wrap(c.text, 16);
    const family = '"Nunito", "Trebuchet MS", sans-serif';
    let size = lines.length > 1 ? 40 : 46;
    g.font = `800 ${size}px ${family}`;
    const maxW = c.w - 30;
    while (size > 14 && Math.max(...lines.map((l) => g.measureText(l).width)) > maxW) {
      size -= 2;
      g.font = `800 ${size}px ${family}`;
    }
    g.fillStyle = 'rgba(246,243,233,0.94)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = size * 1.08;
    const y0 = c.y + c.h / 2 - ((lines.length - 1) * lh) / 2 - 4;
    lines.forEach((l, i) => g.fillText(l, c.x + c.w / 2, y0 + i * lh));
    // little doodles
    g.strokeStyle = 'rgba(246,243,233,0.7)';
    g.lineWidth = 2;
    const flake = (x: number, y: number, r: number) => {
      for (let a = 0; a < 3; a++) {
        const t = (a * Math.PI) / 3;
        g.beginPath();
        g.moveTo(x - Math.cos(t) * r, y - Math.sin(t) * r);
        g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
        g.stroke();
      }
    };
    flake(c.x + 14, c.y + 14, 7);
    flake(c.x + c.w - 15, c.y + c.h - 15, 6);
    g.beginPath();
    const uy = y0 + (lines.length - 1) * lh + size * 0.62;
    g.moveTo(c.x + c.w * 0.3, uy);
    g.quadraticCurveTo(c.x + c.w * 0.5, uy + 6, c.x + c.w * 0.7, uy - 1);
    g.stroke();
    g.restore();
  }

  private paintPlank(c: TextCell) {
    const g = this.g;
    g.save();
    const family = '"Fraunces", Georgia, serif';
    let size = 38;
    g.font = `800 ${size}px ${family}`;
    while (size > 12 && g.measureText(c.text).width > c.w - 20) {
      size -= 2;
      g.font = `800 ${size}px ${family}`;
    }
    g.fillStyle = '#3a2416';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(c.text, c.x + c.w / 2, c.y + c.h / 2 + 2);
    g.restore();
  }

  paintTag(i: number, label: string, style: TagStyle) {
    const g = this.g;
    const x = (i % 4) * 128;
    const y = 256 + Math.floor(i / 4) * 32;
    g.save();
    g.clearRect(x, y, 128, 32);
    g.fillStyle = style.paper;
    g.beginPath();
    g.moveTo(x + 18, y + 2);
    g.lineTo(x + 124, y + 2);
    g.lineTo(x + 124, y + 30);
    g.lineTo(x + 18, y + 30);
    g.lineTo(x + 4, y + 16);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(x + 15, y + 16, 3.2, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    const family = '"Nunito", "Trebuchet MS", sans-serif';
    let size = 24;
    g.font = `800 ${size}px ${family}`;
    while (size > 10 && g.measureText(label).width > 98) {
      size -= 1;
      g.font = `800 ${size}px ${family}`;
    }
    g.fillStyle = style.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x + 72, y + 17);
    g.restore();
    this.texture.needsUpdate = true;
  }

  paintProduct(i: number, img: CanvasImageSource, mat = '#fbf6ea') {
    const g = this.g;
    const x = (i % 4) * 128;
    const y = Math.floor(i / 4) * 128;
    g.save();
    g.fillStyle = mat;
    g.fillRect(x, y, 128, 128);
    const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width || 128;
    const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height || 128;
    // cover-fit
    const k = Math.max(128 / iw, 128 / ih);
    const w = iw * k;
    const h = ih * k;
    try {
      g.beginPath();
      g.rect(x, y, 128, 128);
      g.clip();
      g.drawImage(img, x + (128 - w) / 2, y + (128 - h) / 2, w, h);
    } catch {
      /* broken image: keep the mat */
    }
    g.restore();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.canvas.width = this.canvas.height = 1;
  }
}

function wrap(text: string, max: number): string[] {
  const words = text.trim().split(/\s+/);
  if (text.length <= max || words.length < 2) return [text];
  // best split into two balanced lines
  let best = [text];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (score < bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  return best;
}

/** Wait for the fonts used on the stall (signs, chalk, tags) — never longer than `ms`. */
export async function stallFontsReady(ms = 3000): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('800 60px "Fraunces"'),
        document.fonts.load('800 40px "Nunito"'),
      ]),
      new Promise((r) => setTimeout(r, ms)),
    ]);
  } catch {
    /* ignore */
  }
}
