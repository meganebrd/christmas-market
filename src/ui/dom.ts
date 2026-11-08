/**
 * Tiny DOM helpers for the UI. Everything that comes from content (JSON, scraped sites) goes through
 * `textContent` / attributes — never through innerHTML. Links and images are filtered by `safeUrl()`.
 */

export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<string, unknown>;

function appendChildren(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

function applyProps(el: Element, props: Props | null | undefined, svg = false) {
  if (!props) return;
  for (const [key, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (key === 'class') {
      if (svg) el.setAttribute('class', String(v));
      else (el as HTMLElement).className = String(v);
    } else if (key === 'style') {
      const st = (el as HTMLElement | SVGElement).style;
      if (typeof v === 'string') st.cssText = v;
      else
        for (const [k, val] of Object.entries(v as Record<string, string>)) {
          if (val === undefined || val === null) continue;
          if (k.startsWith('--')) st.setProperty(k, String(val));
          else (st as any)[k] = val;
        }
    } else if (key === 'dataset') {
      Object.assign((el as HTMLElement).dataset, v);
    } else if (key === 'text') {
      el.textContent = String(v);
    } else if (key.startsWith('on') && typeof v === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), v as EventListener);
    } else if (!svg && (key === 'value' || key === 'checked')) {
      (el as any)[key] = v;
    } else if (v === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(v));
    }
  }
}

/** `h('div', { class: 'x', onclick: fn }, 'text', child)` */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG element with attributes. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Props | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  applyProps(el, attrs, true);
  appendChildren(el, children);
  return el;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function append(el: Element, ...children: Child[]) {
  appendChildren(el, children);
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Only http(s), mailto and tel links survive. Returns the normalised href or null. */
export function safeUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed, location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' || u.protocol === 'tel:') return u.href;
  } catch {
    /* invalid */
  }
  return null;
}

/** Image sources: http(s), same-origin relative paths, data:image. */
export function safeImage(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed, location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch {
    /* invalid */
  }
  return null;
}

/** Attributes for an external link. */
export function linkProps(href: string): Props {
  const web = /^https?:/i.test(href);
  return { href, target: web ? '_blank' : undefined, rel: 'noopener noreferrer' };
}

/** Pretty host name for a link ("atelier-margot.fr"). */
export function prettyHost(href: string): string {
  try {
    const u = new URL(href);
    if (u.protocol === 'mailto:') return u.pathname;
    if (u.protocol === 'tel:') return u.pathname;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name;
}

export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Cut a text on a word boundary. */
export function excerpt(text: string, max: number): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Keeps Tab inside `container`. Returns true when it handled the key. */
export function trapTab(container: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== 'Tab') return false;
  const els = focusables(container);
  if (!els.length) return true;
  const first = els[0];
  const last = els[els.length - 1];
  const active = document.activeElement as HTMLElement | null;
  const inside = active && container.contains(active);
  if (e.shiftKey) {
    if (!inside || active === first) last.focus();
    else return false;
  } else if (!inside || active === last) first.focus();
  else return false;
  return true;
}

export function isControl(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.getAttribute('role') === 'button';
}

/** Adds a class on the next frame (so CSS transitions run from the initial state). */
export function enter(el: HTMLElement, cls = 'is-in') {
  void el.offsetWidth;
  requestAnimationFrame(() => el.classList.add(cls));
}

/** Removes the element after its leave transition. */
export function leave(el: HTMLElement, ms = 320, cls = 'is-in') {
  el.classList.remove(cls);
  el.classList.add('is-out');
  setTimeout(() => el.remove(), ms);
}

/** Pick a readable text colour (ink or cream) for a background colour. */
export function readableOn(bg: string | undefined): string {
  const c = parseColor(bg);
  if (!c) return '#fff8ea';
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return lum > 0.62 ? '#3a2416' : '#fff8ea';
}

export function parseColor(c: string | undefined): [number, number, number] | null {
  if (!c) return null;
  const m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Only CSS hex colours from content are applied to styles. */
export function safeColor(c: string | undefined, fallback: string): string {
  return parseColor(c) ? c!.trim() : fallback;
}
