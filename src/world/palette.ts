/**
 * Givrelune's art direction, in one place. Cosy blue hour: cool blue snow and sky,
 * warm amber lights, honey wood, deep pine greens, a few berry reds.
 * Use these instead of inventing colours so the whole market feels like one picture.
 */
export const PALETTE = {
  // sky & atmosphere
  skyTop: '#0b1130',
  skyMid: '#1d2a5a',
  skyLow: '#43507f',
  horizon: '#e0956f',
  horizonGlow: '#f7c58f',
  fog: '#2a3463',
  moon: '#fff4dc',
  aurora1: '#5fe3b0',
  aurora2: '#7b8cff',
  star: '#fdf6e3',

  // snow & ground
  snow: '#e9eef9',
  snowShadow: '#b9c4e0',
  snowDeep: '#9aa8cf',
  ice: '#bfe0f0',
  iceDeep: '#7fb3d1',
  cobble: '#7b7d8f',
  cobbleDark: '#5c5e70',
  stone: '#9a9aa6',

  // wood
  woodLight: '#b0845a',
  wood: '#8a5a3b',
  woodDark: '#5c3a26',
  woodDeep: '#3d2618',
  roof: '#5a3a2a',
  roofSlate: '#3f4a5c',

  // vegetation
  pine: '#2c5848',
  pineDark: '#1c3d34',
  pineLight: '#3f7660',
  holly: '#2f6b3f',
  berry: '#c0392b',

  // lights (use as emissive / basic colours, multiplied above 1 for bloom)
  warm: '#ffc56b',
  warm2: '#ffa24c',
  candle: '#ffd89a',
  window: '#ffcf7e',
  cold: '#bcd8ff',

  // accents
  red: '#b8413a',
  redDark: '#8b2c2a',
  gold: '#e2b34a',
  cream: '#f3ead8',
  green: '#2f5d50',
  blue: '#3c5a8a',
  plum: '#6c4a7d',
  ink: '#2a1d17',
} as const;

export type PaletteKey = keyof typeof PALETTE;
