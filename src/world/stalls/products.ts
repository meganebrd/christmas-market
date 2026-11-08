import * as THREE from 'three';
import type { ResolvedProduct, ResolvedStall } from '../../config/types';
import { loadImageTexture } from '../textures';
import { PALETTE } from '../palette';
import { D } from './dims';
import { GOLD } from './chalet';
import { Atlas } from './atlas';
import { Kit, hashStr, mixC, pickOf, tint, toColor } from './kit';

/**
 * Product displays. Up to 8 products (in config order): featured ones stand on the counter on little
 * wooden easels, the others are framed on the back shelves. Each shows its image (painted into the
 * chalet atlas) with a tiny price tag. When an image is missing or cannot be loaded (CORS…), a cute
 * procedural item replaces it (gift, jar, bottle, parcel, folded knits, bauble) — deterministic per product.
 */

export const MAX_PRODUCTS = 8;

export interface ProductSpot {
  kind: 'counter' | 'shelf';
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Cell index in the atlas. */
  cell: number;
}

export interface PlacedProduct {
  product: ResolvedProduct;
  spot: ProductSpot;
}

const COUNTER_X = [-0.52, 0.52, 0];
const SHELF_X = [-1.02, -0.5, 0.5, 1.02];

export function layoutProducts(products: ResolvedProduct[]): PlacedProduct[] {
  const visible = products.slice(0, MAX_PRODUCTS);
  const counter = COUNTER_X.map((x) => ({ kind: 'counter' as const, x, y: D.cy, z: 0.86, yaw: -x * 0.35 }));
  const shelves: Omit<ProductSpot, 'cell'>[] = [];
  for (const y of [D.shelfY[1], D.shelfY[0]]) for (const x of SHELF_X) shelves.push({ kind: 'shelf', x, y, z: D.zb + D.pt + 0.075, yaw: 0 });
  const out: PlacedProduct[] = [];
  const take = (pool: Omit<ProductSpot, 'cell'>[]) => pool.shift();
  const featured = visible.filter((p) => p.featured);
  const others = visible.filter((p) => !p.featured);
  for (const p of featured) {
    const s = take(counter) ?? take(shelves);
    if (s) out.push({ product: p, spot: { ...s, cell: out.length } });
  }
  // the counter is what visitors see from the path: fill its side spots first (keep the centre free
  // for the keeper unless a third product is featured), then the back shelves
  for (const p of others) {
    const side = counter.length > 0 && counter[0].x !== 0 ? counter : null;
    const s = (side ? take(side) : undefined) ?? take(shelves) ?? take(counter);
    if (s) out.push({ product: p, spot: { ...s, cell: out.length } });
  }
  return out;
}

const hitGeo = new THREE.BoxGeometry(1, 1, 1);
const hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** Invisible (but raycastable) box around a display, used as the clickable object. */
export function hitBox(spot: ProductSpot): THREE.Mesh {
  const m = new THREE.Mesh(hitGeo, hitMat);
  m.visible = false;
  if (spot.kind === 'counter') {
    m.position.set(spot.x, spot.y + 0.25, spot.z + 0.05);
    m.scale.set(0.46, 0.52, 0.38);
  } else {
    m.position.set(spot.x, spot.y + 0.16, spot.z + 0.03);
    m.scale.set(0.36, 0.34, 0.24);
  }
  m.rotation.y = spot.yaw;
  m.name = 'product-hit';
  return m;
}

/** Loads a product image (CORS); resolves null on failure or after `ms`. */
export function loadProductImage(url: string | undefined, ms = 20000): Promise<CanvasImageSource | null> {
  if (!url) return Promise.resolve(null);
  return Promise.race([
    loadImageTexture(url).then((t) => (t?.image as CanvasImageSource | undefined) ?? null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]).catch(() => null);
}

type ItemKind = 'jar' | 'bottle' | 'gift' | 'parcel' | 'knit' | 'bauble' | 'candle';

const KEYWORDS: [ItemKind, RegExp][] = [
  ['candle', /bougie|candle|cierge|fondant|wax/i],
  ['jar', /miel|honey|confiture|jam|pot\b|crème|creme|cream|sel\b|épice|epice|thé|the\b|tea|tartinade|pesto|sirop/i],
  ['bottle', /hydromel|vin\b|wine|huile|oil|liqueur|bière|biere|beer|jus\b|juice|parfum|eau\b|cidre|limonade|bouteille|bottle/i],
  ['knit', /bonnet|écharpe|echarpe|chaussette|moufle|gant|pull|laine|tricot|scarf|sock|mitten|beanie|plaid|snood|châle|chale/i],
  ['parcel', /pain|nougat|biscuit|chocolat|savon|soap|livre|book|carte|card|calendrier|sachet|tablette|gâteau|gateau|bredele/i],
  ['bauble', /boule|bauble|ornement|ornament|verre|glass|suspension|étoile|etoile|ange/i],
];

const TINTS = [PALETTE.red, PALETTE.green, PALETTE.gold, PALETTE.blue, PALETTE.plum, '#d06a5a', '#4b7d8f', PALETTE.cream];

function itemKind(p: ResolvedProduct): ItemKind {
  const text = `${p.name} ${p.description ?? ''}`;
  for (const [k, re] of KEYWORDS) if (re.test(p.name)) return k;
  for (const [k, re] of KEYWORDS) if (re.test(text)) return k;
  return pickOf(['gift', 'parcel', 'jar', 'gift'] as const, (hashStr(p.id) % 1000) / 1000);
}

/** Procedural stand-in for a product without image (origin on the surface, faces +Z). ~0.25 m tall. */
export function fallbackItem(k: Kit, p: ResolvedProduct, accent: string) {
  const h = hashStr(p.id + p.name);
  const r = () => ((h * 9301 + 49297) % 233280) / 233280;
  const tintC = TINTS[h % TINTS.length];
  const kind = itemKind(p);
  const label = PALETTE.cream;
  switch (kind) {
    case 'candle':
    case 'jar': {
      const content = kind === 'candle' ? mixC(tintC, PALETTE.cream, 0.55) : toColor(/miel|honey/i.test(p.name) ? '#d6912a' : tintC);
      const lid = kind === 'candle' ? GOLD : pickOf([PALETTE.red, GOLD, PALETTE.green, '#f3ead8'], r());
      k.cyl(0.072, 0.07, 0.13, content, 0, 0.065, 0, { seg: k.seg(12, 7) });
      k.cyl(0.074, 0.074, 0.012, tint(content, 1.15), 0, 0.128, 0, { seg: k.seg(12, 7) });
      k.cyl(0.077, 0.077, 0.032, lid, 0, 0.15, 0, { seg: k.seg(12, 7) });
      if (kind === 'jar') {
        // gingham cloth cap + string
        k.cyl(0.098, 0.083, 0.022, lid, 0, 0.158, 0, { seg: 8 });
        k.cyl(0.079, 0.079, 0.008, '#e8dcc0', 0, 0.142, 0, { seg: 8 });
      }
      k.box(0.08, 0.055, 0.006, label, 0, 0.07, 0.071);
      k.box(0.06, 0.008, 0.007, accent, 0, 0.082, 0.072);
      break;
    }
    case 'bottle': {
      const glass = toColor(pickOf(['#2f5d3a', '#6b3a1f', '#3c5a8a', '#7a2b33'], r()));
      k.cyl(0.05, 0.05, 0.17, glass, 0, 0.085, 0, { seg: k.seg(10, 6) });
      k.sphere(0.05, glass, 0, 0.17, 0, { s: [1, 0.55, 1], seg: 8 });
      k.cyl(0.018, 0.02, 0.07, glass, 0, 0.22, 0, { seg: 6 });
      k.cyl(0.02, 0.02, 0.025, pickOf([GOLD, PALETTE.red, '#c9a57a'], r()), 0, 0.265, 0, { seg: 6 });
      k.box(0.075, 0.07, 0.006, label, 0, 0.09, 0.05);
      k.box(0.05, 0.01, 0.007, accent, 0, 0.1, 0.051);
      break;
    }
    case 'knit': {
      const cols = [tintC, PALETTE.cream, TINTS[(h >>> 3) % TINTS.length]];
      for (let i = 0; i < 3; i++) k.rbox(0.22 - i * 0.015, 0.04, 0.16 - i * 0.01, 0.015, cols[i], (i - 1) * 0.008, 0.02 + i * 0.041, 0, { r: (i - 1) * 0.08 });
      k.sphere(0.035, cols[1], 0.06, 0.155, 0.02, { seg: 7 });
      k.torus(0.03, 0.006, tint(cols[1], 0.8), 0.06, 0.155, 0.02, { r: [0.4, 0.3, 0], ts: 10, rs: 3 });
      break;
    }
    case 'parcel': {
      const kraft = '#c69c6d';
      k.box(0.2, 0.1, 0.15, kraft, 0, 0.05, 0);
      k.box(0.205, 0.103, 0.012, '#efe4cc', 0, 0.05, 0);
      k.box(0.012, 0.103, 0.155, '#efe4cc', 0, 0.05, 0);
      k.sphere(0.018, PALETTE.red, 0, 0.105, 0, { s: [1.4, 0.6, 1], seg: 6 });
      k.box(0.06, 0.035, 0.004, label, 0.055, 0.103, 0.04, { r: [-Math.PI / 2, 0, 0.3] });
      break;
    }
    case 'bauble': {
      k.cyl(0.08, 0.09, 0.04, tint(accent, 0.8), 0, 0.02, 0, { seg: 8 });
      k.sphere(0.075, tintC, 0, 0.115, 0, { seg: k.seg(12, 7) });
      k.cyl(0.018, 0.018, 0.022, GOLD, 0, 0.195, 0, { seg: 6 });
      k.torus(0.012, 0.003, GOLD, 0, 0.214, 0, { ts: 8, rs: 3 });
      k.sphere(0.02, '#ffffff', -0.025, 0.14, 0.06, { s: [1, 1.4, 0.5], seg: 5 });
      break;
    }
    default: {
      const rib = tintC === PALETTE.cream || tintC === PALETTE.gold ? PALETTE.red : PALETTE.cream;
      k.box(0.18, 0.15, 0.16, tintC, 0, 0.075, 0);
      k.box(0.184, 0.154, 0.025, rib, 0, 0.075, 0);
      k.box(0.025, 0.154, 0.164, rib, 0, 0.075, 0);
      for (const sx of [-1, 1]) k.sphere(0.035, rib, sx * 0.03, 0.165, 0, { s: [1, 0.6, 0.5], r: [0, 0, sx * 0.5], seg: 7 });
    }
  }
}

export interface DisplayOpts {
  stall: ResolvedStall;
  atlas: Atlas;
  /** Index (in `placed`) → image (null = fallback). */
  images: (CanvasImageSource | null)[];
}

/** Builds the displays (solids + atlas quads) into `k`. Paints images and tags into the atlas. */
export function buildDisplays(k: Kit, placed: PlacedProduct[], o: DisplayOpts) {
  const ch = o.stall.chalet;
  const woodDark = tint(ch.wood, 0.45);
  const frames = [ch.accent, '#5c3a26', PALETTE.cream, GOLD];
  const tagStyle = { paper: '#fbf3e0', ink: '#4a2c1a' };
  placed.forEach(({ product, spot }, i) => {
    const img = o.images[i];
    const h = hashStr(product.id);
    const frameC = frames[h % frames.length];
    const tag = product.priceLabel ? o.atlas.tagCell(spot.cell) : null;
    if (product.priceLabel) o.atlas.paintTag(spot.cell, product.priceLabel, tagStyle);
    if (img) o.atlas.paintProduct(spot.cell, img);
    k.with(spot.x, spot.y, spot.z, spot.yaw, undefined, () => {
      if (spot.kind === 'counter') {
        if (img) {
          for (const sx of [-1, 1]) k.box(0.02, 0.46, 0.02, woodDark, sx * 0.15, 0.22, -0.02, { r: [-0.3, 0, sx * 0.08] });
          k.box(0.02, 0.44, 0.02, woodDark, 0, 0.2, -0.16, { r: [0.42, 0, 0] });
          k.box(0.37, 0.024, 0.06, woodDark, 0, 0.075, 0.05);
          k.with(0, 0.088, 0.055, [-0.2, 0, 0], undefined, () => {
            k.box(0.41, 0.41, 0.024, frameC, 0, 0.205, 0, { j: 0.03 });
            k.quad(0.35, 0.35, o.atlas.productCell(spot.cell), 0, 0.205, 0.0125);
          });
        } else {
          k.with(0, 0, 0.0, 0, 1.55, () => fallbackItem(k, product, ch.accent));
        }
        if (tag) {
          k.with(0.0, 0.0, 0.215, [-0.55, 0, 0], undefined, () => {
            k.box(0.19, 0.056, 0.005, '#d9c7a2', 0, 0.028, -0.004);
            k.quad(0.19, 0.0475, tag, 0, 0.028, 0.0);
          });
        }
      } else {
        if (img) {
          k.with(0, 0, -0.02, [-0.13, 0, 0], undefined, () => {
            k.box(0.28, 0.28, 0.02, frameC, 0, 0.14, 0, { j: 0.03 });
            k.quad(0.235, 0.235, o.atlas.productCell(spot.cell), 0, 0.14, 0.0105);
          });
        } else {
          k.with(0, 0, 0.03, 0, 1.25, () => fallbackItem(k, product, ch.accent));
        }
        if (tag) {
          const fz = D.zb + D.pt + D.shelfD - spot.z + 0.004;
          k.box(0.15, 0.044, 0.004, '#d9c7a2', 0, -0.036, fz - 0.003);
          k.quad(0.15, 0.0375, tag, 0, -0.036, fz);
        }
      }
    });
  });
}
