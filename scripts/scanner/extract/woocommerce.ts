/** WooCommerce: the public Store API (`/wp-json/wc/store/v1/products`) — no key needed. */
import type { HTMLElement } from 'node-html-parser';
import type { ScannedProduct } from '../../../src/config/types';
import { absolutize, clipText, decodeEntities, parsePrice, stripHtml } from '../util';

export function looksLikeWooCommerce(html: string): boolean {
  return /woocommerce|wp-content|wp-json|wc-block|wp-includes/i.test(html);
}

/** API root from `<link rel="https://api.w.org/" href="…">` (handles sub-folder installs and ?rest_route=). */
export function wooProductsUrl(root: HTMLElement | null, origin: string, perPage = 50): string {
  const href = root?.querySelector('link[rel="https://api.w.org/"]')?.getAttribute('href');
  const api = absolutize(href, origin);
  if (api && /rest_route=/.test(api)) {
    const u = new URL(api);
    u.searchParams.set('rest_route', '/wc/store/v1/products');
    u.searchParams.set('per_page', String(perPage));
    return u.href;
  }
  const base = (api ?? `${origin.replace(/\/$/, '')}/wp-json/`).replace(/\/?$/, '/');
  return `${base}wc/store/v1/products?per_page=${perPage}`;
}

interface WooProduct {
  name?: string;
  permalink?: string;
  short_description?: string;
  description?: string;
  prices?: { price?: string; regular_price?: string; currency_code?: string; currency_minor_unit?: number };
  images?: { src?: string; thumbnail?: string }[];
  is_in_stock?: boolean;
  is_purchasable?: boolean;
}

/** Parses a Store API response. Returns null when it is not a list of products. */
export function parseWooProducts(json: unknown, origin: string): ScannedProduct[] | null {
  if (!Array.isArray(json)) return null;
  if (json.length && !json.some((p) => p && typeof p === 'object' && 'prices' in p && 'name' in p)) return null;
  const out: ScannedProduct[] = [];
  for (const p of json as WooProduct[]) {
    if (!p?.name) continue;
    const minor = p.prices?.currency_minor_unit ?? 2;
    const raw = p.prices?.price;
    const price = raw !== undefined && /^\d+$/.test(String(raw)) ? Number(raw) / Math.pow(10, minor) : parsePrice(raw);
    const desc = stripHtml(p.short_description || p.description);
    out.push({
      url: absolutize(p.permalink, origin) ?? origin,
      name: decodeEntities(stripHtml(p.name)),
      price: price !== undefined ? Math.round(price * 100) / 100 : undefined,
      currency: p.prices?.currency_code || 'EUR',
      image: absolutize(p.images?.[0]?.src, origin),
      description: desc ? clipText(desc, 500) : undefined,
      availability: typeof p.is_in_stock === 'boolean' ? (p.is_in_stock ? 'in_stock' : 'out_of_stock') : 'unknown',
    });
  }
  return out;
}
