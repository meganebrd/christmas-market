/** OpenGraph / Twitter cards / basic meta: page title, description, image, site name, product price. */
import type { HTMLElement } from 'node-html-parser';
import type { ScannedProduct } from '../../../src/config/types';
import { absolutize, clean, clipText, currencyFrom, decodeEntities, parsePrice } from '../util';

export interface MetaInfo {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  url?: string;
  canonical?: string;
  /** <title> */
  htmlTitle?: string;
  price?: number;
  currency?: string;
  /** Product described by og:type=product / product:price:amount. */
  product?: ScannedProduct;
}

export function extractMeta(root: HTMLElement, pageUrl: string): MetaInfo {
  const metas = new Map<string, string>();
  for (const m of root.querySelectorAll('meta')) {
    const key = (m.getAttribute('property') ?? m.getAttribute('name') ?? m.getAttribute('itemprop') ?? '').toLowerCase().trim();
    const content = m.getAttribute('content');
    if (!key || content === undefined) continue;
    if (!metas.has(key)) metas.set(key, clean(decodeEntities(content)));
  }
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = metas.get(k);
      if (v) return v;
    }
    return undefined;
  };
  const htmlTitle = clean(root.querySelector('title')?.text) || undefined;
  const canonical = absolutize(root.querySelector('link[rel="canonical"]')?.getAttribute('href'), pageUrl);
  const info: MetaInfo = {
    title: get('og:title', 'twitter:title') ?? htmlTitle,
    description: get('og:description', 'twitter:description', 'description'),
    image: absolutize(get('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), pageUrl),
    siteName: get('og:site_name', 'application-name', 'apple-mobile-web-app-title'),
    type: get('og:type')?.toLowerCase(),
    url: absolutize(get('og:url'), pageUrl),
    canonical,
    htmlTitle,
    price: parsePrice(get('product:price:amount', 'og:price:amount', 'product:sale_price:amount', 'twitter:data1')),
    currency: currencyFrom(get('product:price:currency', 'og:price:currency', 'product:sale_price:currency')),
  };
  const isProduct = info.type === 'product' || info.type === 'og:product' || info.type === 'product.item' || get('product:price:amount', 'og:price:amount') !== undefined;
  if (isProduct && info.title) {
    const availability = (get('product:availability', 'og:availability') ?? '').toLowerCase();
    info.product = {
      url: info.url ?? canonical ?? pageUrl,
      name: info.title,
      price: info.price,
      currency: info.currency,
      image: info.image,
      description: info.description ? clipText(info.description, 500) : undefined,
      availability: availability ? (/instock|in stock|in_stock|available/.test(availability) && !/out/.test(availability) ? 'in_stock' : /out/.test(availability) ? 'out_of_stock' : 'unknown') : undefined,
    };
  }
  return info;
}

/** "À propos – La Mèche Dorée | Bougies" → "À propos" when a site name is known. */
export function cleanTitle(title: string | undefined, siteName?: string): string | undefined {
  if (!title) return undefined;
  const parts = title.split(/\s+[|–—·•»-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return title.trim();
  const sn = siteName?.toLowerCase();
  const filtered = sn ? parts.filter((p) => p.toLowerCase() !== sn) : parts;
  return (filtered[0] ?? parts[0]).trim();
}
