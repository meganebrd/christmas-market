/**
 * JSON-LD extractor: Product / ProductGroup (+ Offer, AggregateOffer), ItemList, Organization, LocalBusiness,
 * Store, Person, WebSite. Handles `@graph`, arrays, nested ListItems and slightly broken JSON.
 */
import type { HTMLElement } from 'node-html-parser';
import type { ScannedProduct } from '../../../src/config/types';
import { absolutize, clean, clipText, currencyFrom, decodeEntities, parsePrice, stripHtml } from '../util';

export interface OrgInfo {
  name?: string;
  description?: string;
  logo?: string;
  image?: string;
  email?: string;
  telephone?: string;
  address?: string;
  url?: string;
  sameAs: string[];
  /** 'organization' beats 'person' when merging. */
  kind?: 'organization' | 'person' | 'website';
}

export interface JsonLdResult {
  products: ScannedProduct[];
  org: OrgInfo;
  siteName?: string;
  /** Product URLs listed in ItemLists (worth crawling). */
  productUrls: string[];
}

type Node = Record<string, any>;

function parseJson(raw: string): unknown {
  const txt = raw
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .replace(/^\s*\/\/\s*<!\[CDATA\[/, '')
    .replace(/\/\/\s*\]\]>\s*$/, '')
    .trim();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    try {
      // trailing commas, raw newlines inside strings
      return JSON.parse(txt.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
}

function types(n: Node): string[] {
  const t = n['@type'];
  return (Array.isArray(t) ? t : t ? [t] : []).map((x) => String(x).toLowerCase().replace(/^.*[/#]/, ''));
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return str(v[0]);
  if (typeof v === 'object') return str((v as Node)['@value'] ?? (v as Node).name ?? (v as Node).url);
  const s = clean(decodeEntities(String(v)));
  return s || undefined;
}

function imageOf(v: unknown, base: string): string | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) {
    for (const x of v) {
      const i = imageOf(x, base);
      if (i) return i;
    }
    return undefined;
  }
  if (typeof v === 'object') return imageOf((v as Node).url ?? (v as Node).contentUrl ?? (v as Node)['@id'], base);
  return absolutize(String(v), base);
}

function addressOf(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return clean(decodeEntities(v)) || undefined;
  if (Array.isArray(v)) return addressOf(v[0]);
  const a = v as Node;
  const street = str(a.streetAddress);
  const city = [str(a.postalCode), str(a.addressLocality)].filter(Boolean).join(' ');
  const country = str(a.addressCountry);
  const out = [street, city, country && !/^(fr|france)$/i.test(country) ? country : undefined].filter(Boolean).join(', ');
  return out || undefined;
}

function availabilityOf(v: unknown): ScannedProduct['availability'] {
  const s = String(Array.isArray(v) ? v[0] : (v ?? '')).toLowerCase();
  if (!s) return undefined;
  if (/instock|in_stock|limitedavailability|preorder|onlineonly|instoreonly/.test(s)) return 'in_stock';
  if (/outofstock|out_of_stock|soldout|discontinued/.test(s)) return 'out_of_stock';
  return 'unknown';
}

function offerInfo(offers: unknown): { price?: number; currency?: string; availability?: ScannedProduct['availability']; url?: string } {
  if (!offers) return {};
  const list = Array.isArray(offers) ? offers : [offers];
  let best: { price?: number; currency?: string; availability?: ScannedProduct['availability']; url?: string } = {};
  for (const o of list as Node[]) {
    if (!o || typeof o !== 'object') continue;
    const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
    const nested = o.offers ? offerInfo(o.offers) : {};
    const price = parsePrice(o.price ?? o.lowPrice ?? spec?.price ?? o.highPrice) ?? nested.price;
    const currency = currencyFrom(str(o.priceCurrency ?? spec?.priceCurrency)) ?? nested.currency;
    const info = { price, currency, availability: availabilityOf(o.availability) ?? nested.availability, url: str(o.url) };
    if (best.price === undefined || (price !== undefined && price < best.price)) best = { ...best, ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)) };
  }
  return best;
}

function collect(v: unknown, out: Node[], depth = 0) {
  if (!v || depth > 8) return;
  if (Array.isArray(v)) {
    for (const x of v) collect(x, out, depth + 1);
    return;
  }
  if (typeof v !== 'object') return;
  const n = v as Node;
  if (n['@type']) out.push(n);
  if (n['@graph']) collect(n['@graph'], out, depth + 1);
  // descend into containers that often hold products/orgs
  for (const k of ['mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'publisher', 'provider', 'brand', 'seller', 'hasVariant', 'isPartOf']) {
    if (n[k] && typeof n[k] === 'object') collect(n[k], out, depth + 1);
  }
}

export function extractJsonLd(root: HTMLElement, pageUrl: string): JsonLdResult {
  const res: JsonLdResult = { products: [], org: { sameAs: [] }, productUrls: [] };
  const nodes: Node[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"], script[type="application/ld+json; charset=utf-8"]')) {
    const data = parseJson(s.rawText);
    if (data) collect(data, nodes);
  }
  const seen = new Set<Node>();
  for (const n of nodes) {
    if (seen.has(n)) continue;
    seen.add(n);
    const t = types(n);
    if (t.includes('product') || t.includes('productgroup') || t.includes('individualproduct') || t.includes('productmodel')) {
      const name = str(n.name);
      if (!name) continue;
      let offers = offerInfo(n.offers);
      if (offers.price === undefined && n.hasVariant) offers = offerInfo((Array.isArray(n.hasVariant) ? n.hasVariant : [n.hasVariant]).map((x: Node) => x?.offers).filter(Boolean));
      const url = absolutize(str(n.url) ?? offers.url ?? (typeof n['@id'] === 'string' && /^https?:/.test(n['@id']) ? n['@id'].replace(/#.*$/, '') : undefined), pageUrl) ?? pageUrl;
      const desc = str(n.description);
      res.products.push({
        url,
        name,
        price: offers.price,
        currency: offers.currency,
        image: imageOf(n.image, pageUrl),
        description: desc ? clipText(stripHtml(desc), 500) : undefined,
        availability: offers.availability,
      });
      continue;
    }
    if (t.includes('itemlist') || t.includes('offercatalog')) {
      const items = Array.isArray(n.itemListElement) ? n.itemListElement : [];
      for (const it of items as Node[]) {
        const target = it?.item ?? it;
        const u = typeof target === 'string' ? target : str(target?.url ?? (typeof target?.['@id'] === 'string' ? target['@id'] : undefined));
        const abs = absolutize(u, pageUrl);
        if (abs) res.productUrls.push(abs);
      }
      continue;
    }
    const isOrg = t.some((x) => /organization|business|store|shop|bakery|restaurant|craft|artist|museum|corporation|ngo|localbusiness|onlinestore|winery|brewery|farm/.test(x));
    const isPerson = t.includes('person');
    const isSite = t.includes('website');
    if (isSite) {
      res.siteName ??= str(n.name);
      continue;
    }
    if (isOrg || isPerson) {
      const kind = isOrg ? 'organization' : 'person';
      const o = res.org;
      if (o.kind === 'organization' && kind === 'person') {
        // keep the organisation, only fill the gaps
      }
      const take = !o.kind || (o.kind === 'person' && kind === 'organization');
      const set = <K extends keyof OrgInfo>(k: K, v: OrgInfo[K] | undefined) => {
        if (v === undefined) return;
        if (take || o[k] === undefined) o[k] = v;
      };
      set('name', str(n.name));
      set('description', str(n.description) ? clipText(stripHtml(str(n.description)!), 600) : undefined);
      set('logo', imageOf(n.logo, pageUrl));
      set('image', imageOf(n.image, pageUrl));
      set('email', str(n.email)?.replace(/^mailto:/i, ''));
      set('telephone', str(n.telephone)?.replace(/^tel:/i, ''));
      set('address', addressOf(n.address ?? n.location?.address));
      set('url', absolutize(str(n.url), pageUrl));
      if (take) o.kind = kind;
      const same = n.sameAs ? (Array.isArray(n.sameAs) ? n.sameAs : [n.sameAs]) : [];
      for (const s of same) {
        const abs = absolutize(String(s), pageUrl);
        if (abs && !o.sameAs.includes(abs)) o.sameAs.push(abs);
      }
      const cp = n.contactPoint ? (Array.isArray(n.contactPoint) ? n.contactPoint[0] : n.contactPoint) : null;
      if (cp) {
        set('email', str(cp.email)?.replace(/^mailto:/i, ''));
        set('telephone', str(cp.telephone));
      }
    }
  }
  return res;
}
