import type { DecorationType } from '../config/types';
import { s } from '../ui/dom';

/** Line icons (24×24, stroke = currentColor) and small flat illustrations of the decorations (32×32). */

type Shape = string | { c: [number, number, number]; fill?: boolean } | { r: [number, number, number, number, number?] };

const LINE: Record<string, Shape[]> = {
  tag: ['M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z', { c: [7.5, 7.5, 1.4], fill: true }],
  user: [{ c: [12, 8, 4] }, 'M4 21c0-4 3.6-7 8-7s8 3 8 7'],
  home: ['M2.5 11.5 12 4l9.5 7.5', 'M5 10v10h14V10', 'M10 20v-5.5h4V20'],
  tree: ['M12 2.5l5 7h-3l4.5 6h-3.2l3.2 4.5H5.5l3.2-4.5H5.5l4.5-6H7z', 'M12 20v2.5'],
  gift: [{ r: [3, 8, 18, 4, 1] }, 'M5 12v9h14v-9', 'M12 8v13', 'M12 8C10 4 6.5 4 6.5 6.2S9.5 8 12 8c2.5 0 5.5-.3 5.5-1.8S14 4 12 8z'],
  book: ['M4 19V5a2 2 0 0 1 2-2h14v14', 'M6 17h14v4H6a2 2 0 0 1 0-4z', 'M9 7h7', 'M9 10.5h5'],
  chat: ['M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.6A8.5 8.5 0 1 1 21 11.5z', { c: [8.5, 11.5, 1], fill: true }, { c: [12.5, 11.5, 1], fill: true }, { c: [16.5, 11.5, 1], fill: true }],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', { c: [12, 12, 3] }],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 20.5h14'],
  copy: [{ r: [8, 8, 12, 12, 2] }, 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  open: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6', 'M12 18v-6', 'M9 15l3-3 3 3'],
  dice: [{ r: [3.5, 3.5, 17, 17, 4] }, { c: [8.5, 8.5, 1.3], fill: true }, { c: [15.5, 15.5, 1.3], fill: true }, { c: [12, 12, 1.3], fill: true }, { c: [15.5, 8.5, 1.3], fill: true }, { c: [8.5, 15.5, 1.3], fill: true }],
  grip: [{ c: [9, 6, 1.5], fill: true }, { c: [15, 6, 1.5], fill: true }, { c: [9, 12, 1.5], fill: true }, { c: [15, 12, 1.5], fill: true }, { c: [9, 18, 1.5], fill: true }, { c: [15, 18, 1.5], fill: true }],
  up: ['M6 15l6-6 6 6'],
  down: ['M6 9l6 6 6-6'],
  trash: ['M3.5 6h17', 'M9 6V4h6v2', 'M6 6l1 14h10l1-14', 'M10 10.5v6', 'M14 10.5v6'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  alert: ['M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9.5v4', { c: [12, 17, 1], fill: true }],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  search: [{ c: [11, 11, 7] }, 'M20.5 20.5l-4.5-4.5'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  send: ['M3.5 11.5 20.5 4l-5 16.5-4-7.5z', 'M11.5 13 20.5 4'],
  star: ['M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z'],
  image: [{ r: [3, 4, 18, 16, 2.5] }, { c: [9, 10, 2] }, 'M21 16.5l-5-5-9.5 8.5'],
  chevron: ['M6 9l6 6 6-6'],
  market: ['M3 9.5 5 4h14l2 5.5', 'M4.5 9.5V20h15V9.5', 'M3 9.5h18', 'M9.5 20v-5.5h5V20'],
  flake: ['M12 2.5v19', 'M3.8 7.2l16.4 9.6', 'M3.8 16.8l16.4-9.6', 'M9.6 4.4 12 6.8l2.4-2.4', 'M9.6 19.6 12 17.2l2.4 2.4', 'M3.5 10.6l3.3-.9-.9-3.3', 'M20.5 13.4l-3.3.9.9 3.3', 'M5.9 17.6l.9-3.3-3.3-.9', 'M18.1 6.4l-.9 3.3 3.3.9'],
  info: [{ c: [12, 12, 9] }, 'M12 11v5.5', { c: [12, 7.8, 1.1], fill: true }],
  undo: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  wand: ['M4 20 15 9', 'M14 4.5V2.5', 'M19.5 10h2', 'M17.8 6.2l1.4-1.4', 'M18 13.5l1.4 1.4', 'M10.5 6.2 9.1 4.8', { r: [13.6, 7.6, 2.8, 2.8, 0.6] }],
  camera: ['M3 8.5A1.5 1.5 0 0 1 4.5 7h2.8L9 4.5h6L16.7 7h2.8A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z', { c: [12, 13, 3.6] }],
  minimize: ['M6 15l6-6 6 6'],
  maximize: ['M6 9l6 6 6-6'],
  clock: [{ c: [12, 12, 9] }, 'M12 7v5l3 2'],
};

export function icon(name: keyof typeof LINE | string, size = 20, cls = ''): SVGSVGElement {
  const shapes = LINE[name] ?? LINE.info;
  const svg = s('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: ('ed-icon ' + cls).trim(),
  });
  for (const sh of shapes) {
    if (typeof sh === 'string') svg.appendChild(s('path', { d: sh }));
    else if ('c' in sh) svg.appendChild(s('circle', { cx: sh.c[0], cy: sh.c[1], r: sh.c[2], fill: sh.fill ? 'currentColor' : 'none', stroke: sh.fill ? 'none' : undefined }));
    else svg.appendChild(s('rect', { x: sh.r[0], y: sh.r[1], width: sh.r[2], height: sh.r[3], rx: sh.r[4] ?? 0 }));
  }
  return svg;
}

// ───────────────────────────── decoration illustrations ─────────────────────────────

type Art = [tag: 'path' | 'circle' | 'ellipse' | 'rect', attrs: Record<string, string | number>][];

const G1 = '#2f6b3f';
const G2 = '#3f7660';
const RED = '#c0392b';
const RED2 = '#8b2c2a';
const GOLD = '#e2b34a';
const GOLD2 = '#c98a2e';
const CREAM = '#f3ead8';
const INK = '#2a1d17';
const WOOD = '#8a5a3b';
const WOOD2 = '#5e3d27';
const FLAME = '#ffcf6a';

function star(cx: number, cy: number, R: number, r: number, n = 5): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
  }
  return d + 'Z';
}

const flag = (cx: number, y: number, fill: string): Art[number] => ['path', { d: `M${cx - 3} ${y} L${cx + 3} ${y + 0.4} L${cx} ${y + 8} Z`, fill }];

const ART: Record<DecorationType, Art> = {
  wreath: [
    ['circle', { cx: 16, cy: 14.5, r: 9, fill: 'none', stroke: G1, 'stroke-width': 6 }],
    ['circle', { cx: 16, cy: 14.5, r: 9, fill: 'none', stroke: G2, 'stroke-width': 2.2, 'stroke-dasharray': '2.5 3.5' }],
    ['circle', { cx: 9.2, cy: 9.5, r: 1.5, fill: RED }],
    ['circle', { cx: 23, cy: 10.5, r: 1.5, fill: RED }],
    ['circle', { cx: 22, cy: 20, r: 1.3, fill: RED }],
    ['path', { d: 'M16 24 L10 20 L10.5 28 Z', fill: RED }],
    ['path', { d: 'M16 24 L22 20 L21.5 28 Z', fill: RED }],
    ['circle', { cx: 16, cy: 24, r: 2.2, fill: RED2 }],
  ],
  garland: [
    ['path', { d: 'M3 8 Q16 26 29 8', fill: 'none', stroke: G1, 'stroke-width': 5, 'stroke-linecap': 'round' }],
    ['path', { d: 'M3 8 Q16 26 29 8', fill: 'none', stroke: G2, 'stroke-width': 1.8, 'stroke-dasharray': '2 3' }],
    ['circle', { cx: 9.5, cy: 14.5, r: 1.4, fill: FLAME }],
    ['circle', { cx: 22.5, cy: 14.5, r: 1.4, fill: FLAME }],
    ['path', { d: 'M3 8 L-0.5 5.5 L0 11 Z M3 8 L6.5 5.5 L6 11 Z', fill: RED }],
    ['path', { d: 'M29 8 L25.5 5.5 L26 11 Z M29 8 L32.5 5.5 L32 11 Z', fill: RED }],
    ['path', { d: 'M16 17 L12.5 14.5 L13 20 Z M16 17 L19.5 14.5 L19 20 Z', fill: RED }],
    ['circle', { cx: 16, cy: 17, r: 1.5, fill: RED2 }],
  ],
  lantern: [
    ['circle', { cx: 16, cy: 18, r: 12, fill: FLAME, opacity: 0.2 }],
    ['circle', { cx: 16, cy: 4.5, r: 2, fill: 'none', stroke: '#3a3a44', 'stroke-width': 1.6 }],
    ['path', { d: 'M9 11.5 L16 6 L23 11.5 Z', fill: '#3a3a44' }],
    ['rect', { x: 10, y: 11, width: 12, height: 14, rx: 1.5, fill: '#3a3a44' }],
    ['rect', { x: 12, y: 13, width: 8, height: 10, rx: 1, fill: FLAME }],
    ['ellipse', { cx: 16, cy: 19, rx: 1.6, ry: 2.6, fill: '#fff4dc' }],
    ['rect', { x: 9, y: 25, width: 14, height: 3, rx: 1, fill: '#3a3a44' }],
  ],
  'mini-tree': [
    ['rect', { x: 14, y: 25, width: 4, height: 4.5, rx: 0.8, fill: WOOD2 }],
    ['path', { d: 'M16 4 L22.5 13 L19.5 13 L25 20 L21.5 20 L27 26.5 L5 26.5 L10.5 20 L7 20 L12.5 13 L9.5 13 Z', fill: '#2c5848' }],
    ['circle', { cx: 13.5, cy: 16, r: 1.6, fill: RED }],
    ['circle', { cx: 19, cy: 19.5, r: 1.6, fill: GOLD }],
    ['circle', { cx: 12, cy: 23.5, r: 1.6, fill: '#5b7fc7' }],
    ['circle', { cx: 21, cy: 24, r: 1.6, fill: RED }],
    ['circle', { cx: 16.5, cy: 11, r: 1.3, fill: CREAM }],
    ['path', { d: star(16, 4.5, 3.6, 1.5), fill: GOLD }],
  ],
  candles: [
    ['circle', { cx: 16, cy: 10, r: 10, fill: FLAME, opacity: 0.18 }],
    ['rect', { x: 5.5, y: 15, width: 6.5, height: 13.5, rx: 1.2, fill: CREAM }],
    ['rect', { x: 12.8, y: 10, width: 6.5, height: 18.5, rx: 1.2, fill: '#fbf4e4' }],
    ['rect', { x: 20, y: 17, width: 6.5, height: 11.5, rx: 1.2, fill: CREAM }],
    ['ellipse', { cx: 8.75, cy: 11.6, rx: 1.6, ry: 2.6, fill: FLAME }],
    ['ellipse', { cx: 16.05, cy: 6.6, rx: 1.6, ry: 2.6, fill: FLAME }],
    ['ellipse', { cx: 23.25, cy: 13.6, rx: 1.6, ry: 2.6, fill: FLAME }],
    ['rect', { x: 4, y: 28, width: 24, height: 2, rx: 1, fill: GOLD2 }],
  ],
  'gift-pile': [
    ['rect', { x: 3.5, y: 13.5, width: 15, height: 15, rx: 1.6, fill: RED }],
    ['rect', { x: 10, y: 13.5, width: 2.2, height: 15, fill: GOLD }],
    ['circle', { cx: 8.6, cy: 12.2, r: 2.3, fill: 'none', stroke: GOLD, 'stroke-width': 1.6 }],
    ['circle', { cx: 13.6, cy: 12.2, r: 2.3, fill: 'none', stroke: GOLD, 'stroke-width': 1.6 }],
    ['rect', { x: 17.5, y: 18.5, width: 11, height: 10, rx: 1.6, fill: '#2f5d50' }],
    ['rect', { x: 17.5, y: 22.4, width: 11, height: 2, fill: CREAM }],
    ['rect', { x: 22, y: 18.5, width: 2, height: 10, fill: CREAM }],
  ],
  snowman: [
    ['circle', { cx: 16, cy: 22, r: 7.8, fill: '#f6f8fc', stroke: '#b9c4e0', 'stroke-width': 1 }],
    ['circle', { cx: 16, cy: 11.5, r: 5.5, fill: '#f6f8fc', stroke: '#b9c4e0', 'stroke-width': 1 }],
    ['rect', { x: 12.5, y: 1.5, width: 7, height: 5.5, rx: 0.6, fill: INK }],
    ['rect', { x: 10.5, y: 6.4, width: 11, height: 1.7, rx: 0.8, fill: INK }],
    ['rect', { x: 10.5, y: 15.2, width: 11, height: 3, rx: 1.5, fill: RED }],
    ['rect', { x: 18, y: 16.2, width: 3, height: 6.5, rx: 1, fill: RED }],
    ['path', { d: 'M16 11.6 L21.5 12.7 L16 13.4 Z', fill: '#e8833a' }],
    ['circle', { cx: 14, cy: 10, r: 0.85, fill: INK }],
    ['circle', { cx: 18, cy: 10, r: 0.85, fill: INK }],
    ['circle', { cx: 16, cy: 21.5, r: 0.9, fill: INK }],
    ['circle', { cx: 16, cy: 25, r: 0.9, fill: INK }],
  ],
  'star-sign': [
    ['circle', { cx: 16, cy: 16, r: 13, fill: FLAME, opacity: 0.22 }],
    ['path', { d: star(16, 16.5, 12, 5.2), fill: GOLD, stroke: GOLD2, 'stroke-width': 1, 'stroke-linejoin': 'round' }],
    ['path', { d: star(16, 16.5, 5.5, 2.4), fill: '#fff4dc' }],
  ],
  pinecones: [
    ['ellipse', { cx: 11.5, cy: 19.5, rx: 5.2, ry: 7.5, fill: '#7a4e33' }],
    ['path', { d: 'M7 16 Q11.5 18.5 16 16 M6.6 20 Q11.5 22.5 16.4 20 M7.6 24 Q11.5 26.2 15.4 24', fill: 'none', stroke: WOOD2, 'stroke-width': 1.3 }],
    ['ellipse', { cx: 21.5, cy: 21, rx: 4.6, ry: 6.6, fill: WOOD }],
    ['path', { d: 'M17.6 18 Q21.5 20.2 25.4 18 M17.2 21.6 Q21.5 23.8 25.8 21.6 M18.2 25 Q21.5 26.8 24.8 25', fill: 'none', stroke: WOOD2, 'stroke-width': 1.2 }],
    ['path', { d: 'M16 11 L11.5 8 L12 14 Z M16 11 L20.5 8 L20 14 Z', fill: RED }],
    ['circle', { cx: 16, cy: 11, r: 1.6, fill: RED2 }],
  ],
  ribbon: [
    ['ellipse', { cx: 10, cy: 12.5, rx: 7, ry: 4.8, fill: RED, transform: 'rotate(-22 10 12.5)' }],
    ['ellipse', { cx: 22, cy: 12.5, rx: 7, ry: 4.8, fill: RED, transform: 'rotate(22 22 12.5)' }],
    ['ellipse', { cx: 10.5, cy: 12.5, rx: 3, ry: 1.7, fill: RED2, transform: 'rotate(-22 10.5 12.5)' }],
    ['ellipse', { cx: 21.5, cy: 12.5, rx: 3, ry: 1.7, fill: RED2, transform: 'rotate(22 21.5 12.5)' }],
    ['path', { d: 'M14.6 15 L9.5 28.5 L13 27.2 L15.2 29.5 L16.6 16.5 Z', fill: RED2 }],
    ['path', { d: 'M17.4 15 L22.5 28.5 L19 27.2 L16.8 29.5 L15.4 16.5 Z', fill: RED2 }],
    ['rect', { x: 13.3, y: 10, width: 5.4, height: 6.5, rx: 2.2, fill: '#d24a40' }],
  ],
  teddy: [
    ['circle', { cx: 9, cy: 7.5, r: 3.6, fill: '#a8744a' }],
    ['circle', { cx: 23, cy: 7.5, r: 3.6, fill: '#a8744a' }],
    ['circle', { cx: 9, cy: 7.5, r: 1.8, fill: '#d6a77a' }],
    ['circle', { cx: 23, cy: 7.5, r: 1.8, fill: '#d6a77a' }],
    ['ellipse', { cx: 16, cy: 24.5, rx: 8.2, ry: 6.5, fill: '#a8744a' }],
    ['ellipse', { cx: 16, cy: 25.5, rx: 4.2, ry: 3.8, fill: '#d6a77a' }],
    ['circle', { cx: 16, cy: 13.5, r: 7.6, fill: '#a8744a' }],
    ['ellipse', { cx: 16, cy: 16, rx: 3.6, ry: 2.7, fill: '#e6c79f' }],
    ['ellipse', { cx: 16, cy: 15, rx: 1.4, ry: 1, fill: '#3a2416' }],
    ['circle', { cx: 13, cy: 12, r: 1, fill: '#3a2416' }],
    ['circle', { cx: 19, cy: 12, r: 1, fill: '#3a2416' }],
    ['path', { d: 'M16 20.5 L12.5 18.6 L12.5 22.4 Z M16 20.5 L19.5 18.6 L19.5 22.4 Z', fill: RED }],
  ],
  nutcracker: [
    ['rect', { x: 11, y: 1.5, width: 10, height: 7.5, rx: 1.2, fill: INK }],
    ['rect', { x: 11, y: 7, width: 10, height: 1.8, fill: GOLD }],
    ['rect', { x: 11.5, y: 8.8, width: 9, height: 7, rx: 1.4, fill: '#f6d7c3' }],
    ['rect', { x: 11.5, y: 13.4, width: 9, height: 2.8, rx: 1, fill: '#f2efe6' }],
    ['circle', { cx: 14, cy: 11, r: 0.9, fill: INK }],
    ['circle', { cx: 18, cy: 11, r: 0.9, fill: INK }],
    ['rect', { x: 10, y: 16, width: 12, height: 8.5, rx: 1.6, fill: RED }],
    ['rect', { x: 10, y: 21.2, width: 12, height: 1.6, fill: INK }],
    ['circle', { cx: 16, cy: 18.2, r: 0.9, fill: GOLD }],
    ['rect', { x: 11.5, y: 24, width: 3.6, height: 5, fill: INK }],
    ['rect', { x: 16.9, y: 24, width: 3.6, height: 5, fill: INK }],
    ['rect', { x: 9, y: 28.5, width: 14, height: 2.2, rx: 1, fill: WOOD2 }],
  ],
  holly: [
    ['path', { d: 'M16 17 C11.5 11.5 6.5 13.5 2.5 9.5 C4.5 14.5 3 18 6 21.5 C9.5 20.5 12.5 20.5 16 17 Z', fill: G1 }],
    ['path', { d: 'M16 17 C20.5 11.5 25.5 13.5 29.5 9.5 C27.5 14.5 29 18 26 21.5 C22.5 20.5 19.5 20.5 16 17 Z', fill: G2 }],
    ['path', { d: 'M15 17 C11 15.5 7.5 14.5 4.5 12 M17 17 C21 15.5 24.5 14.5 27.5 12', fill: 'none', stroke: '#1c3d34', 'stroke-width': 0.9, 'stroke-linecap': 'round' }],
    ['circle', { cx: 13.6, cy: 17.6, r: 2.7, fill: '#c8332b' }],
    ['circle', { cx: 18.4, cy: 17.6, r: 2.7, fill: '#c8332b' }],
    ['circle', { cx: 16, cy: 21.4, r: 2.7, fill: '#d94f45' }],
    ['circle', { cx: 12.8, cy: 16.8, r: 0.7, fill: '#fff', opacity: 0.7 }],
    ['circle', { cx: 17.6, cy: 16.8, r: 0.7, fill: '#fff', opacity: 0.7 }],
  ],
  mistletoe: [
    ['path', { d: 'M16 1.5 L16 9', stroke: RED, 'stroke-width': 2, 'stroke-linecap': 'round' }],
    ['path', { d: 'M16 9 L12 6.5 L12.4 11.6 Z M16 9 L20 6.5 L19.6 11.6 Z', fill: RED }],
    ['ellipse', { cx: 10.5, cy: 16, rx: 6.4, ry: 2.6, fill: '#7fa65a', transform: 'rotate(-35 10.5 16)' }],
    ['ellipse', { cx: 21.5, cy: 16, rx: 6.4, ry: 2.6, fill: '#6f9a4c', transform: 'rotate(35 21.5 16)' }],
    ['ellipse', { cx: 12.5, cy: 22.5, rx: 5.4, ry: 2.3, fill: '#6f9a4c', transform: 'rotate(-62 12.5 22.5)' }],
    ['ellipse', { cx: 19.5, cy: 22.5, rx: 5.4, ry: 2.3, fill: '#7fa65a', transform: 'rotate(62 19.5 22.5)' }],
    ['circle', { cx: 16, cy: 15.2, r: 2.1, fill: '#f6f3e8', stroke: '#cfc8ba', 'stroke-width': 0.6 }],
    ['circle', { cx: 13.8, cy: 18.4, r: 1.9, fill: '#f6f3e8', stroke: '#cfc8ba', 'stroke-width': 0.6 }],
    ['circle', { cx: 18.2, cy: 18.6, r: 1.9, fill: '#f6f3e8', stroke: '#cfc8ba', 'stroke-width': 0.6 }],
  ],
  reindeer: [
    ['path', { d: 'M11.5 9 L8 3 M8 3 L4.6 4.2 M8 3 L9 0.8 M9.6 5.8 L6.4 7 M20.5 9 L24 3 M24 3 L27.4 4.2 M24 3 L23 0.8 M22.4 5.8 L25.6 7', fill: 'none', stroke: '#7a4e33', 'stroke-width': 1.8, 'stroke-linecap': 'round' }],
    ['ellipse', { cx: 8.2, cy: 12, rx: 3.2, ry: 1.6, fill: '#9a6a43', transform: 'rotate(-25 8.2 12)' }],
    ['ellipse', { cx: 23.8, cy: 12, rx: 3.2, ry: 1.6, fill: '#9a6a43', transform: 'rotate(25 23.8 12)' }],
    ['ellipse', { cx: 16, cy: 16, rx: 7, ry: 8, fill: '#9a6a43' }],
    ['ellipse', { cx: 16, cy: 21, rx: 4.8, ry: 3.8, fill: '#c9a27a' }],
    ['circle', { cx: 16, cy: 19.5, r: 4.4, fill: '#ff5a4a', opacity: 0.28 }],
    ['circle', { cx: 16, cy: 19.5, r: 2.5, fill: '#e0322b' }],
    ['circle', { cx: 13, cy: 14.5, r: 1.1, fill: INK }],
    ['circle', { cx: 19, cy: 14.5, r: 1.1, fill: INK }],
  ],
  bell: [
    ['path', { d: 'M16 6 L12 3.6 L12.4 8.6 Z M16 6 L20 3.6 L19.6 8.6 Z', fill: RED }],
    ['path', { d: 'M16 7.5 C10.5 7.5 9.8 13 9.8 17 C9.8 21 7.2 23 6 24.6 L26 24.6 C24.8 23 22.2 21 22.2 17 C22.2 13 21.5 7.5 16 7.5 Z', fill: GOLD }],
    ['path', { d: 'M13 10.5 C11.8 12.5 11.8 15.5 11.8 18.5', fill: 'none', stroke: '#f3d27a', 'stroke-width': 1.6, 'stroke-linecap': 'round' }],
    ['rect', { x: 5.5, y: 24, width: 21, height: 2.6, rx: 1.3, fill: GOLD2 }],
    ['circle', { cx: 16, cy: 28.4, r: 2.2, fill: GOLD2 }],
    ['circle', { cx: 16, cy: 6, r: 1.5, fill: RED2 }],
  ],
  sled: [
    ['rect', { x: 6, y: 12.5, width: 20, height: 4, rx: 1.2, fill: '#a8744a' }],
    ['rect', { x: 6, y: 12.5, width: 20, height: 1.4, rx: 0.7, fill: '#c49568' }],
    ['rect', { x: 9, y: 16, width: 2.2, height: 6.5, fill: '#7a4e33' }],
    ['rect', { x: 20.8, y: 16, width: 2.2, height: 6.5, fill: '#7a4e33' }],
    ['path', { d: 'M3.5 23 L24 23 C28 23 29.5 19.5 27.5 17', fill: 'none', stroke: RED, 'stroke-width': 2.6, 'stroke-linecap': 'round' }],
    ['path', { d: 'M26 13.5 C29.5 10.5 30 7.5 27.5 5.5', fill: 'none', stroke: GOLD, 'stroke-width': 1.3, 'stroke-linecap': 'round' }],
  ],
  'crate-apples': [
    ['circle', { cx: 9.8, cy: 13, r: 4.6, fill: RED }],
    ['circle', { cx: 22.2, cy: 13, r: 4.6, fill: RED }],
    ['circle', { cx: 16, cy: 11.4, r: 4.8, fill: '#d94f45' }],
    ['path', { d: 'M16 6.8 L16.4 5', stroke: WOOD2, 'stroke-width': 1.2, 'stroke-linecap': 'round' }],
    ['ellipse', { cx: 18.4, cy: 5.6, rx: 2.2, ry: 1.1, fill: G2, transform: 'rotate(-20 18.4 5.6)' }],
    ['circle', { cx: 14.4, cy: 9.8, r: 1, fill: '#fff', opacity: 0.55 }],
    ['rect', { x: 4, y: 14.5, width: 24, height: 14, rx: 1.6, fill: '#b0845a' }],
    ['rect', { x: 4, y: 19, width: 24, height: 1.3, fill: WOOD }],
    ['rect', { x: 4, y: 24, width: 24, height: 1.3, fill: WOOD }],
    ['rect', { x: 4, y: 14.5, width: 2.6, height: 14, rx: 0.8, fill: WOOD }],
    ['rect', { x: 25.4, y: 14.5, width: 2.6, height: 14, rx: 0.8, fill: WOOD }],
  ],
  'pot-plant': [
    ['ellipse', { cx: 10.5, cy: 11.5, rx: 5.6, ry: 2.5, fill: G2, transform: 'rotate(-40 10.5 11.5)' }],
    ['ellipse', { cx: 21.5, cy: 11.5, rx: 5.6, ry: 2.5, fill: G1, transform: 'rotate(40 21.5 11.5)' }],
    ['ellipse', { cx: 16, cy: 8.5, rx: 2.5, ry: 6, fill: '#4f8a5b' }],
    ['ellipse', { cx: 9.5, cy: 16.5, rx: 5.2, ry: 2.1, fill: G1, transform: 'rotate(-12 9.5 16.5)' }],
    ['ellipse', { cx: 22.5, cy: 16.5, rx: 5.2, ry: 2.1, fill: G2, transform: 'rotate(12 22.5 16.5)' }],
    ['path', { d: 'M9 19 L23 19 L21 29.5 L11 29.5 Z', fill: '#c46a3a' }],
    ['rect', { x: 7.8, y: 17.4, width: 16.4, height: 3.6, rx: 1.2, fill: '#d9824f' }],
  ],
  chalkboard: [
    ['path', { d: 'M9 21 L6.5 29.5 M23 21 L25.5 29.5', fill: 'none', stroke: '#7a4e33', 'stroke-width': 2.2, 'stroke-linecap': 'round' }],
    ['rect', { x: 4.5, y: 4, width: 23, height: 18, rx: 1.6, fill: WOOD }],
    ['rect', { x: 6.6, y: 6.1, width: 18.8, height: 13.8, rx: 0.6, fill: '#2f3a35' }],
    ['path', { d: 'M10 10.5 L21 10.5 M10 14 L22.5 14 M10 17.4 L16.5 17.4', fill: 'none', stroke: CREAM, 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.9 }],
    ['path', { d: star(21.5, 17.3, 1.8, 0.8), fill: GOLD }],
  ],
  bunting: [
    ['path', { d: 'M1.5 7 Q16 14 30.5 7', fill: 'none', stroke: WOOD2, 'stroke-width': 1.3 }],
    flag(5.5, 8.4, RED),
    flag(12.3, 10.1, GOLD),
    flag(19.5, 10.2, '#2f5d50'),
    flag(26.5, 8.6, '#5b7fc7'),
  ],
};

export function decoArt(type: DecorationType, size = 32): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', class: 'ed-deco-art' });
  for (const [tag, attrs] of ART[type] ?? []) svg.appendChild(s(tag, attrs));
  return svg;
}
