import * as THREE from 'three';

/** Procedural textures (canvas). Cached when the same parameters are requested twice. */
const cache = new Map<string, THREE.Texture>();

/** Soft radial glow, for additive sprites (lamp halos, light pools on the snow, sparkles). */
export function glowTexture(size = 128): THREE.Texture {
  const key = 'glow' + size;
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Additive glow sprite (cheap fake light). */
export function glowSprite(color: string, scale = 1, opacity = 0.8): THREE.Sprite {
  const m = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

export interface TextTextureOpts {
  width?: number;
  height?: number;
  font?: string;
  /** px */
  size?: number;
  color?: string;
  background?: string | null;
  /** Rounded wooden plank look. */
  plank?: boolean;
  border?: string | null;
  padding?: number;
  weight?: number;
}

/** Text painted on a canvas — chalet signs, zone signs, chalkboards. */
export function textTexture(text: string, o: TextTextureOpts = {}): THREE.CanvasTexture {
  const W = o.width ?? 512;
  const H = o.height ?? 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  if (o.background) {
    g.fillStyle = o.background;
    const r = H * 0.18;
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, r);
    g.fill();
    if (o.plank) {
      g.globalAlpha = 0.12;
      g.strokeStyle = '#000';
      for (let y = H * 0.33; y < H; y += H * 0.33) {
        g.beginPath();
        g.moveTo(10, y);
        g.lineTo(W - 10, y);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (o.border) {
      g.lineWidth = 6;
      g.strokeStyle = o.border;
      g.stroke();
    }
  }
  const pad = o.padding ?? 24;
  let size = o.size ?? Math.round(H * 0.5);
  const family = o.font ?? '"Fraunces", Georgia, serif';
  const weight = o.weight ?? 700;
  g.font = `${weight} ${size}px ${family}`;
  while (g.measureText(text).width > W - pad * 2 && size > 10) {
    size -= 2;
    g.font = `${weight} ${size}px ${family}`;
  }
  g.fillStyle = o.color ?? '#3a2416';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Loads an image as a texture; tries CORS first; resolves null on failure (caller shows a fallback). */
export function loadImageTexture(url: string): Promise<THREE.Texture | null> {
  if (cache.has('img|' + url)) return Promise.resolve(cache.get('img|' + url)!);
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        cache.set('img|' + url, t);
        resolve(t);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/** Fonts are loaded by CSS; wait for them before painting signs. */
export async function fontsReady(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 40px "Fraunces"'), document.fonts.load('700 40px "Nunito"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* ignore */
  }
}
