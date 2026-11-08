import * as THREE from 'three';

/** Colour helpers. All return linear THREE.Color (what vertex colours expect). */
const tmp = new THREE.Color();

export function col(c: string | THREE.Color): THREE.Color {
  return typeof c === 'string' ? new THREE.Color(c) : c.clone();
}

/** Lighter (k > 1) or darker (k < 1) — in HSL lightness, keeps the hue. */
export function shade(c: string | THREE.Color, k: number): THREE.Color {
  const out = col(c);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl);
  const l = k >= 1 ? hsl.l + (1 - hsl.l) * (k - 1) : hsl.l * k;
  return out.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, l)));
}

export function mix(a: string | THREE.Color, b: string | THREE.Color, t: number): THREE.Color {
  return col(a).lerp(tmp.set(b as any), t);
}

/** Shift saturation (k > 1 more vivid). */
export function saturate(c: string | THREE.Color, k: number): THREE.Color {
  const out = col(c);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl);
  return out.setHSL(hsl.h, Math.min(1, hsl.s * k), hsl.l);
}

/** Perceived luminance (0..1, sRGB-ish). */
export function luma(c: string | THREE.Color): number {
  const x = col(c);
  return 0.2126 * x.r + 0.7152 * x.g + 0.0722 * x.b;
}

/** A colour that contrasts with `c` but stays in the cosy palette. */
export function contrast(c: string | THREE.Color): THREE.Color {
  return luma(c) > 0.35 ? shade(c, 0.55) : mix(c, '#f3ead8', 0.75);
}

export const INK = '#2a1d17';
export const CREAM = '#f3ead8';
export const WOOD = '#8a5a3b';
export const LEATHER = '#6b4329';
export const GOLD = '#e2b34a';
