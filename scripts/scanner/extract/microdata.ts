/** schema.org microdata (itemscope / itemprop) for Products, and PostalAddress for contact. */
import type { HTMLElement } from 'node-html-parser';
import type { ScannedProduct } from '../../../src/config/types';
import { absolutize, clean, clipText, currencyFrom, decodeEntities, parsePrice } from '../util';

const PRODUCT_SEL = '[itemtype*="schema.org/Product"], [itemtype*="schema.org/IndividualProduct"], [itemtype*="schema.org/ProductModel"]';

function propValue(el: HTMLElement, base: string): string | undefined {
  const tag = el.rawTagName?.toLowerCase();
  const content = el.getAttribute('content');
  if (content !== undefined && content !== '') return clean(decodeEntities(content));
  if (tag === 'img' || tag === 'source') return absolutize(el.getAttribute('src') ?? el.getAttribute('data-src') ?? el.getAttribute('srcset')?.split(/[ ,]/)[0], base);
  if (tag === 'a' || tag === 'link') return el.getAttribute('href') ? absolutize(el.getAttribute('href'), base) ?? el.getAttribute('href') : undefined;
  if (tag === 'meta') return undefined;
  if (tag === 'time') return el.getAttribute('datetime') ?? clean(el.text);
  if (tag === 'data' || tag === 'meter') return el.getAttribute('value') ?? clean(el.text);
  return clean(el.text) || undefined;
}

/** First itemprop=`name` that belongs to `scope` (not to a nested product). */
function prop(scope: HTMLElement, name: string, base: string): string | undefined {
  for (const el of scope.querySelectorAll(`[itemprop~="${name}"]`)) {
    // the nearest product scope must be this one (not a nested related product); Offer scopes are fine
    if (el.closest(PRODUCT_SEL) !== scope) continue;
    const v = propValue(el, base);
    if (v) return v;
  }
  return undefined;
}

export function extractMicrodata(root: HTMLElement, pageUrl: string): { products: ScannedProduct[]; address?: string } {
  const products: ScannedProduct[] = [];
  for (const scope of root.querySelectorAll(PRODUCT_SEL)) {
    if (!scope.hasAttribute('itemscope')) continue;
    // skip products nested in another product (related products) — they will be found on their own page
    const parent = scope.parentNode as HTMLElement | null;
    if (parent && typeof parent.closest === 'function' && parent.closest(PRODUCT_SEL)) continue;
    const name = prop(scope, 'name', pageUrl);
    if (!name) continue;
    const price = parsePrice(prop(scope, 'price', pageUrl) ?? prop(scope, 'lowPrice', pageUrl));
    const availability = (prop(scope, 'availability', pageUrl) ?? '').toLowerCase();
    const desc = prop(scope, 'description', pageUrl);
    products.push({
      url: absolutize(prop(scope, 'url', pageUrl), pageUrl) ?? pageUrl,
      name,
      price,
      currency: currencyFrom(prop(scope, 'priceCurrency', pageUrl)),
      image: absolutize(prop(scope, 'image', pageUrl), pageUrl),
      description: desc ? clipText(desc, 500) : undefined,
      availability: availability ? (/instock|in_stock/.test(availability) ? 'in_stock' : /outofstock|soldout/.test(availability) ? 'out_of_stock' : 'unknown') : undefined,
    });
  }
  let address: string | undefined;
  const addr = root.querySelector('[itemtype*="schema.org/PostalAddress"]');
  if (addr) {
    const street = prop(addr, 'streetAddress', pageUrl);
    const city = [prop(addr, 'postalCode', pageUrl), prop(addr, 'addressLocality', pageUrl)].filter(Boolean).join(' ');
    address = [street, city].filter(Boolean).join(', ') || undefined;
  }
  return { products, address };
}
