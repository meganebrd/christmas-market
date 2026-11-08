import { s } from './dom';

/**
 * Hand-drawn-ish line icons (24×24, round caps). Path data is code (constants), never content.
 */
const ICONS = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  map: ['M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z', 'M9 4v13.5', 'M15 6.5V20'],
  volume: ['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z', 'M15.5 9a4 4 0 0 1 0 6', 'M18.2 6.3a8 8 0 0 1 0 11.4'],
  volumeOff: ['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  music: ['M9 17.5V6l11-2v11.5', 'M9 17.5a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0z', 'M20 15.5a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0z'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 12h3', 'M11 12h9', 'M4 17h11', 'M19 17h1', 'M15 5v4', 'M9 10v4', 'M17 15v4'],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.3 9.3a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 2.5', 'M12 16.6v.1'],
  star: ['M12 2.8l2.75 5.75 6.3.85-4.6 4.35 1.15 6.25L12 16.95 6.4 20l1.15-6.25-4.6-4.35 6.3-.85z'],
  arrowUpRight: ['M7 17L17 7', 'M8.5 7H17v8.5'],
  arrowLeft: ['M19 12H5', 'M11 18l-6-6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  send: ['M21 3L10.5 13.5', 'M21 3l-6.5 18-4-7.5L3 9.5z'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z'],
  instagram: ['M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z', 'M15.6 12a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 0 1 7.2 0z', 'M17.2 6.8v.1'],
  facebook: ['M17 3h-2.5A4.5 4.5 0 0 0 10 7.5V10H7.5v3.5H10V21h3.5v-7.5H16l.8-3.5h-3.3V7.8c0-.6.4-1 1-1H17z'],
  etsy: ['M6.5 3L4 7v12.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V7l-2.5-4z', 'M4 7h16', 'M15.5 10.5a3.5 3.5 0 0 1-7 0'],
  tiktok: ['M10 11.5a4 4 0 1 0 4 4V3c.6 2.4 2.5 4.3 5 4.7'],
  youtube: ['M3 16.5a22 22 0 0 1 0-9A2 2 0 0 1 4.4 6c4.9-.8 10.3-.8 15.2 0A2 2 0 0 1 21 7.5a22 22 0 0 1 0 9 2 2 0 0 1-1.4 1.5c-4.9.8-10.3.8-15.2 0A2 2 0 0 1 3 16.5z', 'M10 14.8l4.8-2.8L10 9.2z'],
  mail: ['M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5z', 'M3.5 6.5l8.5 6.5 8.5-6.5'],
  phone: ['M20.5 16.4v2.7a1.8 1.8 0 0 1-2 1.8A17.8 17.8 0 0 1 3.1 5.5a1.8 1.8 0 0 1 1.8-2h2.7a1.8 1.8 0 0 1 1.8 1.5c.1.9.4 1.7.7 2.5a1.8 1.8 0 0 1-.4 1.9L8.5 10.6a14.4 14.4 0 0 0 4.9 4.9l1.2-1.2a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.6 2.5.7a1.8 1.8 0 0 1 1.5 1.8z'],
  link: ['M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5', 'M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5'],
  skip: ['M5 5l9 7-9 7z', 'M18.5 5v14'],
  sparkle: ['M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z', 'M19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  user: ['M19.5 20.5a7.5 7.5 0 0 0-15 0', 'M15.8 7.8a3.8 3.8 0 1 1-7.6 0 3.8 3.8 0 0 1 7.6 0z'],
  gift: ['M19.5 11.5V20a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8.5', 'M3 7.5h18v4H3z', 'M12 21V7.5', 'M12 7.5H8.2a2.3 2.3 0 0 1 0-4.6C11 2.9 12 7.5 12 7.5z', 'M12 7.5h3.8a2.3 2.3 0 0 0 0-4.6C13 2.9 12 7.5 12 7.5z'],
  chat: ['M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z'],
  check: ['M20 6.5L9.5 17 4 11.5'],
  refresh: ['M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20.5 8.5', 'M20.5 3.5v5h-5', 'M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5', 'M3.5 20.5v-5h5'],
  heart: ['M20.3 5.2a5 5 0 0 0-7.1 0L12 6.4l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 20.6l8.3-8.3a5 5 0 0 0 0-7.1z'],
  hand: ['M8 13V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5', 'M14 10.5V5.5a1.5 1.5 0 0 1 3 0V12', 'M17 9.5a1.5 1.5 0 0 1 3 0v4.5a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4.3 15a1.6 1.6 0 0 1 2.4-2l1.3 1.3'],
  tree: ['M12 2.5l4.5 6h-2.7l4 5.5h-3.3l3.5 5H6l3.5-5H6.2l4-5.5H7.5z', 'M12 19v3'],
  keyboard: ['M4 6h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 6z', 'M6.5 10h.01', 'M10 10h.01', 'M13.5 10h.01', 'M17 10h.01', 'M8 14h8'],
  touch: ['M7.5 2.5h9a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V4a1.5 1.5 0 0 1 1.5-1.5z', 'M11 18.5h2'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5', 'M12 7.5v.1'],
  pin: ['M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z', 'M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'],
  mouse: ['M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6z', 'M12 6.5v3.5'],
  pointer: ['M6 3.5l12.5 7-5.5 1.8 3.4 6.2-2.6 1.4-3.4-6.2L6 17.5z'],
  pinch: ['M4.5 19.5l5-5', 'M4.5 15v4.5H9', 'M19.5 4.5l-5 5', 'M15 4.5h4.5V9'],
  search: ['M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z', 'M15.3 15.3L20.5 20.5'],
} as const;

export type IconName = keyof typeof ICONS;

const FILLED: Partial<Record<IconName, boolean>> = { star: true, heart: true };

export function icon(name: IconName, opts: { size?: number; class?: string; filled?: boolean } = {}): SVGSVGElement {
  const size = opts.size ?? 22;
  const filled = opts.filled ?? FILLED[name] ?? false;
  return s(
    'svg',
    {
      class: `gl-icon gl-icon--${name}${opts.class ? ' ' + opts.class : ''}`,
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: filled ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': filled ? 1.2 : 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ICONS[name].map((d) => s('path', { d })),
  );
}

/** Guess the icon of a stall link from its kind or its URL. */
export function linkIcon(kind: string | undefined, url: string): IconName {
  const k = (kind || '').toLowerCase();
  const u = url.toLowerCase();
  if (k === 'instagram' || u.includes('instagram.com')) return 'instagram';
  if (k === 'facebook' || u.includes('facebook.com') || u.includes('fb.com')) return 'facebook';
  if (k === 'etsy' || u.includes('etsy.com')) return 'etsy';
  if (k === 'tiktok' || u.includes('tiktok.com')) return 'tiktok';
  if (k === 'youtube' || u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (k === 'mail' || u.startsWith('mailto:')) return 'mail';
  if (k === 'phone' || u.startsWith('tel:')) return 'phone';
  if (k === 'site') return 'globe';
  return 'link';
}
