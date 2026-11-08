/** Small helpers shared by the scanner extractors (Node 20, no dependencies besides node-html-parser). */
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';

export const USER_AGENT = 'GivreluneScanner/0.1 (+https://github.com/givrelune)';

/** Collapse whitespace (incl. nbsp) and trim. */
export function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/[\s  ​]+/g, ' ').trim();
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Decodes HTML entities in a plain string (JSON-LD values often contain "&amp;" or "&#8217;"). */
export function decodeEntities(s: string): string {
  if (!s || !s.includes('&')) return s;
  const quick = s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_m, n) => NAMED[n] ?? _m).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
  if (!/&[a-z]+;/i.test(quick)) return quick;
  try {
    return parse(`<p>${quick.replace(/</g, '&lt;')}</p>`).text;
  } catch {
    return quick;
  }
}

/** Text content of an HTML fragment (Shopify body_html, WooCommerce descriptions). */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  try {
    const root = parse(html.replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '$& '));
    root.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
    return clean(root.text);
  } catch {
    return clean(html.replace(/<[^>]+>/g, ' '));
  }
}

/** "1 234,56 €" / "€24.00" / "24,00" / 24 → number. */
export function parsePrice(input: unknown): number | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : undefined;
  if (typeof input !== 'string') return undefined;
  let s = input.replace(/[\s  ']/g, '');
  const m = s.match(/\d[\d.,]*/);
  if (!m) return undefined;
  s = m[0].replace(/[.,]$/, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    // "1,234" / "1,234,567" → thousands (prices never have 3 decimals); "12,5" / "12,50" → decimal
    s = parts.length > 2 || parts[1].length === 3 ? parts.join('') : parts.join('.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join('');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/** "€" → EUR, "$" → USD… */
export function currencyFrom(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (/^[A-Z]{3}$/.test(t)) return t;
  if (/€|eur/i.test(t)) return 'EUR';
  if (/£|gbp/i.test(t)) return 'GBP';
  if (/chf/i.test(t)) return 'CHF';
  if (/\$|usd/i.test(t)) return /ca\$|cad/i.test(t) ? 'CAD' : 'USD';
  return undefined;
}

/** Absolute http(s) URL or undefined. Handles protocol-relative "//cdn…". */
export function absolutize(href: string | undefined | null, base: string): string | undefined {
  if (!href) return undefined;
  const h = decodeEntities(String(href).trim());
  if (!h || /^(javascript|data|mailto|tel|blob):/i.test(h) || h.startsWith('#')) return undefined;
  try {
    const u = new URL(h.startsWith('//') ? `https:${h}` : h, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'page'
  );
}

/** Cuts a text at a sentence boundary under `max` chars. */
export function clipText(s: string, max: number): string {
  const t = clean(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (at > max * 0.4) return cut.slice(0, at + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `fn` over items with a small concurrency. */
export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
