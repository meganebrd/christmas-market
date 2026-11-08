/** Shopify: the public `/products.json` endpoint lists every product with prices, images and descriptions. */
import type { ScannedProduct } from '../../../src/config/types';
import { absolutize, clipText, decodeEntities, parsePrice, stripHtml } from '../util';

export function looksLikeShopify(html: string): boolean {
  return /cdn\.shopify\.com|Shopify\.theme|shopify-section|myshopify\.com|window\.Shopify|shopify-payment/i.test(html);
}

/** `Shopify.currency = {"active":"EUR",…}` */
export function shopifyCurrency(html: string): string | undefined {
  const m = html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/) ?? html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/);
  return m?.[1];
}

export function shopifyProductsUrl(origin: string, limit = 50): string {
  return `${origin.replace(/\/$/, '')}/products.json?limit=${limit}`;
}

interface ShopifyVariant {
  price?: string | number;
  available?: boolean;
}
interface ShopifyProduct {
  title?: string;
  handle?: string;
  body_html?: string;
  images?: { src?: string }[];
  image?: { src?: string };
  variants?: ShopifyVariant[];
}

/** Parses a /products.json response. Returns null when it is not a Shopify products document. */
export function parseShopifyProducts(json: unknown, origin: string, currency = 'EUR'): ScannedProduct[] | null {
  if (!json || typeof json !== 'object' || !Array.isArray((json as any).products)) return null;
  const out: ScannedProduct[] = [];
  for (const p of (json as { products: ShopifyProduct[] }).products) {
    if (!p || !p.title) continue;
    const prices = (p.variants ?? []).map((v) => parsePrice(typeof v.price === 'number' ? v.price : v.price)).filter((x): x is number => x !== undefined);
    const anyAvail = (p.variants ?? []).some((v) => v.available === true);
    const knownAvail = (p.variants ?? []).some((v) => typeof v.available === 'boolean');
    const img = p.images?.[0]?.src ?? p.image?.src;
    const desc = stripHtml(p.body_html);
    out.push({
      url: `${origin.replace(/\/$/, '')}/products/${p.handle ?? ''}`,
      name: decodeEntities(p.title).trim(),
      price: prices.length ? Math.min(...prices) : undefined,
      currency,
      image: absolutize(img, origin),
      description: desc ? clipText(desc, 500) : undefined,
      availability: knownAvail ? (anyAvail ? 'in_stock' : 'out_of_stock') : 'unknown',
    });
  }
  return out;
}
