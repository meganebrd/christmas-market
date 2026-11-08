/** Social profile links (Instagram, Facebook, Etsy, TikTok, YouTube, Pinterest) → StallLink. Share buttons are ignored. */
import type { HTMLElement } from 'node-html-parser';
import type { StallLink } from '../../../src/config/types';
import { absolutize } from '../util';

interface Network {
  kind: NonNullable<StallLink['kind']>;
  label: string;
  host: RegExp;
  /** Paths that are not profiles (share dialogs, single posts…). */
  reject?: RegExp;
}

const NETWORKS: Network[] = [
  { kind: 'instagram', label: 'Instagram', host: /(^|\.)instagram\.com$|(^|\.)instagr\.am$/, reject: /^\/(p|reel|reels|tv|stories|explore|accounts|share)\b/ },
  { kind: 'facebook', label: 'Facebook', host: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, reject: /^\/(sharer|share|dialog|plugins|tr|login|events\/\d|photo|watch)\b|sharer\.php/ },
  { kind: 'etsy', label: 'Etsy', host: /(^|\.)etsy\.(com|me)$|(^|\.)etsy\.[a-z]{2}$/, reject: /^\/(listing|cart|signin|search|c\/)/ },
  { kind: 'tiktok', label: 'TikTok', host: /(^|\.)tiktok\.com$/, reject: /\/video\/|^\/(share|embed)\b/ },
  { kind: 'youtube', label: 'YouTube', host: /(^|\.)(youtube\.com|youtu\.be)$/, reject: /^\/(watch|embed|shorts|playlist|results)\b|^\/[\w-]{11}$/ },
  { kind: 'other', label: 'Pinterest', host: /(^|\.)pinterest\.[a-z.]{2,6}$|(^|\.)pin\.it$/, reject: /^\/pin\/(create|\d)|\/pin\/|^\/search\b/ },
];

/** Returns the network for a URL, or null when it is not a profile link. */
export function classifySocial(url: string): Network | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  for (const n of NETWORKS) {
    if (!n.host.test(host)) continue;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' && n.kind !== 'etsy') return null; // the network's home page
    if (n.reject?.test(u.pathname) || /[?&](u|url|text|href)=/.test(u.search)) return null;
    return n;
  }
  return null;
}

function canonicalSocial(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.replace(/^(www\.|m\.|fr-fr\.|fr\.)/, '');
    return u.href.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

export function socialLink(url: string): StallLink | null {
  const n = classifySocial(url);
  if (!n) return null;
  return { label: n.label, url: canonicalSocial(url), kind: n.kind };
}

export function extractSocial(root: HTMLElement, pageUrl: string): StallLink[] {
  const out: StallLink[] = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const abs = absolutize(a.getAttribute('href'), pageUrl);
    if (!abs) continue;
    const link = socialLink(abs);
    if (link && !out.some((l) => l.url === link.url)) out.push(link);
  }
  return out;
}

/** One link per network (the first seen), in a stable order. */
export function mergeSocial(lists: StallLink[][]): StallLink[] {
  const byLabel = new Map<string, StallLink>();
  for (const list of lists) for (const l of list) if (!byLabel.has(l.label)) byLabel.set(l.label, l);
  const order = NETWORKS.map((n) => n.label);
  return [...byLabel.values()].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}
