/**
 * Givrelune website scanner (Node 20). Reads an artisan's website at build time and extracts products,
 * contact details, social links and readable text chunks for the dialogue engine.
 *
 *   const data = await scanSite('https://mon-atelier.fr', { stallId: 'mon-atelier', maxPages: 15 });
 *
 * Polite: identifies itself, respects robots.txt, same site only, 2 requests at a time with a small delay.
 * Never throws: network problems end up in `warnings`, and whatever was found is returned.
 * Used by `npm run scan` (scripts/scan.ts) and by the editor's dev endpoint (vite.config.ts).
 */
import { resolve } from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import type { KnowledgeChunk, ScannedProduct, ScannedStallData, StallLink } from '../../src/config/types';
import { fetchText } from './fetcher';
import { ALLOW_ALL, parseRobots, type Robots } from './robots';
import { canonical, isPlaceholder, priority, sameSite, shouldSkip } from './urls';
import { USER_AGENT, absolutize, clean, clipText, sleep, slug } from './util';
import { extractJsonLd, type OrgInfo } from './extract/jsonld';
import { cleanTitle, extractMeta, type MetaInfo } from './extract/opengraph';
import { extractMicrodata } from './extract/microdata';
import { looksLikeShopify, parseShopifyProducts, shopifyCurrency, shopifyProductsUrl } from './extract/shopify';
import { looksLikeWooCommerce, parseWooProducts, wooProductsUrl } from './extract/woocommerce';
import { blocksToChunks, extractBlocks, guessTopic, type TextBlock } from './extract/text';
import { extractContact, type ContactInfo } from './extract/contact';
import { extractSocial, mergeSocial, socialLink } from './extract/social';
import { downloadImages } from './images';

export interface ScanOptions {
  /** Max HTML pages to fetch (default 15). */
  maxPages?: number;
  stallId?: string;
  /** Per request (default 10 s). */
  timeoutMs?: number;
  /** Save images to `<publicDir>/generated/<stallId>/` and rewrite URLs to `/generated/<stallId>/…`. */
  downloadImages?: boolean;
  /** Defaults to `<cwd>/public`. */
  publicDir?: string;
  /** Extra start pages (knowledge.scan.urls). */
  urls?: string[];
  /** Delay between two requests of a worker (default 250 ms, or robots.txt Crawl-delay up to 5 s). */
  delayMs?: number;
  /** Parallel requests (default 2). */
  concurrency?: number;
  userAgent?: string;
  /** Progress messages. */
  log?: (message: string) => void;
}

export interface ScannedPage {
  url: string;
  status: number;
  title?: string;
  topic?: string;
}

export interface ScanResult extends ScannedStallData {
  warnings: string[];
  pages: ScannedPage[];
  platform?: 'shopify' | 'woocommerce';
}

interface PageData {
  url: string;
  depth: number;
  meta: MetaInfo;
  org: OrgInfo;
  siteName?: string;
  products: { p: ScannedProduct; rank: number }[];
  microAddress?: string;
  contact: ContactInfo;
  social: StallLink[];
  blocks: TextBlock[];
  topic?: string;
  title?: string;
}

const AGENT_TOKEN = 'GivreluneScanner';
const TOPIC_ORDER = ['about', 'faq', 'livraison', 'contact', 'horaires', 'personnalisation', 'entretien', 'paiement', 'matieres', 'allergenes', undefined, 'product', 'conditions'];

function clampInt(v: number | undefined, def: number, lo: number, hi: number) {
  const n = Number.isFinite(v as number) ? Math.round(v as number) : def;
  return Math.max(lo, Math.min(hi, n));
}

function productKey(p: ScannedProduct): string {
  try {
    const u = new URL(p.url);
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    if (m) return `${u.hostname.replace(/^www\./, '')}/products/${m[1].toLowerCase()}`;
    return canonical(p.url).toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
  } catch {
    return p.url;
  }
}

function nameKey(name: string) {
  return slug(name);
}

function formatEuro(price: number, currency = 'EUR') {
  const v = price % 1 === 0 ? String(price) : price.toFixed(2).replace('.', ',');
  return currency === 'EUR' ? `${v} €` : `${v} ${currency}`;
}

export async function scanSite(url: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const stallId = opts.stallId ?? 'preview';
  const maxPages = clampInt(opts.maxPages, 15, 1, 200);
  const timeoutMs = clampInt(opts.timeoutMs, 10000, 500, 120000);
  const concurrency = clampInt(opts.concurrency, 2, 1, 4);
  const userAgent = opts.userAgent ?? USER_AGENT;
  const log = opts.log ?? (() => {});
  const result: ScanResult = {
    stallId,
    scannedAt: new Date().toISOString(),
    source: url,
    site: {},
    products: [],
    chunks: [],
    warnings: [],
    pages: [],
  };
  const warn = (w: string) => {
    if (!result.warnings.includes(w)) result.warnings.push(w);
  };

  let start: URL;
  try {
    start = new URL(String(url ?? '').trim());
  } catch {
    warn(`invalid URL: ${url}`);
    return result;
  }
  if (start.protocol !== 'http:' && start.protocol !== 'https:') {
    warn(`unsupported protocol: ${start.protocol}`);
    return result;
  }
  start.hash = '';
  result.source = start.href;
  if (isPlaceholder(start.href)) {
    warn(`${start.hostname} is a placeholder domain (demo stall): nothing to scan`);
    return result;
  }

  try {
    // ── robots.txt
    let robots: Robots = ALLOW_ALL;
    const rb = await fetchText(`${start.origin}/robots.txt`, { timeoutMs, userAgent, accept: 'text/plain,*/*;q=0.5', maxBytes: 512_000 });
    if (rb.ok && !/html/i.test(rb.contentType) && !/^\s*<(!doctype|html)/i.test(rb.text)) robots = parseRobots(rb.text, AGENT_TOKEN);
    else if (rb.status === 0 || rb.status >= 500) warn(`robots.txt unreachable (${rb.error ?? `HTTP ${rb.status}`}), crawling carefully anyway`);
    const delay = Math.max(opts.delayMs ?? 250, Math.min(5, robots.crawlDelay ?? 0) * 1000);

    // ── crawl
    let origin = start.origin;
    const queue = new Map<string, { url: string; depth: number; prio: number }>();
    const seen = new Set<string>();
    let robotsSkipped = 0;
    let haveApiProducts = false;
    const enqueue = (u: string | undefined, depth: number, boost = 0) => {
      if (!u) return;
      const key = canonical(u);
      if (seen.has(key) || queue.has(key)) return;
      if (!sameSite(u, origin) || shouldSkip(u)) return;
      queue.set(key, { url: u.replace(/#.*$/, ''), depth, prio: priority(u, depth, { haveApiProducts }) + boost });
    };
    const takeNext = () => {
      let best: { key: string; url: string; depth: number; prio: number } | null = null;
      for (const [key, it] of queue) if (!best || it.prio > best.prio) best = { key, ...it };
      if (best) {
        queue.delete(best.key);
        seen.add(best.key);
      }
      return best;
    };

    const pages: PageData[] = [];
    let firstHtml = '';
    let firstRoot: HTMLElement | null = null;

    const visit = async (item: { url: string; depth: number }) => {
      log(`  ↳ ${item.url}`);
      const res = await fetchText(item.url, { timeoutMs, userAgent });
      seen.add(canonical(res.url));
      result.pages.push({ url: res.url || item.url, status: res.status });
      const page = result.pages[result.pages.length - 1];
      if (!res.ok) {
        warn(`${item.url}: ${res.error ?? `HTTP ${res.status}`}`);
        return;
      }
      if (!/html|xml/i.test(res.contentType) && !/^\s*</.test(res.text)) return;
      if (!sameSite(res.url, origin)) {
        if (item.depth === 0 && pages.length === 0) origin = new URL(res.url).origin;
        else {
          warn(`${item.url}: redirected to another site (${res.url}), ignored`);
          return;
        }
      }
      if (pages.length === 0 && item.depth === 0) origin = new URL(res.url).origin;
      let root: HTMLElement;
      try {
        root = parse(res.text, { comment: false });
      } catch (err: any) {
        warn(`${item.url}: unreadable HTML (${err?.message ?? err})`);
        return;
      }
      if (!firstRoot) {
        firstRoot = root;
        firstHtml = res.text.slice(0, 400_000);
      }
      const data = analyzePage(root, res.url, item.depth);
      page.title = data.title;
      page.topic = data.topic;
      pages.push(data);
      for (const a of root.querySelectorAll('a[href]')) enqueue(absolutize(a.getAttribute('href'), res.url), item.depth + 1);
      for (const pu of data.productUrls) enqueue(pu, item.depth + 1);
    };

    enqueue(start.href, 0, 10_000);
    for (const u of opts.urls ?? []) enqueue(absolutize(u, start.href), 0, 5_000);

    // first page alone (it settles the origin after redirects), then the workers
    let fetched = 0;
    const first = takeNext();
    if (first) {
      if (!robots.allowed(first.url)) {
        warn(`robots.txt disallows ${first.url}: nothing scanned`);
        return result;
      }
      fetched++;
      await visit(first);
      // a Shopify/WooCommerce API will list every product: spend the page budget on the story/FAQ/shipping pages
      haveApiProducts = looksLikeShopify(firstHtml) || looksLikeWooCommerce(firstHtml);
      if (haveApiProducts) for (const it of queue.values()) it.prio = priority(it.url, it.depth, { haveApiProducts });
    }
    let inflight = 0;
    const worker = async () => {
      for (;;) {
        if (fetched >= maxPages) return;
        const item = takeNext();
        if (!item) {
          if (inflight === 0) return;
          await sleep(25);
          continue;
        }
        if (!robots.allowed(item.url)) {
          robotsSkipped++;
          continue;
        }
        fetched++;
        inflight++;
        try {
          await sleep(delay);
          await visit(item);
        } catch (err: any) {
          warn(`${item.url}: ${err?.message ?? err}`);
        } finally {
          inflight--;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (robotsSkipped) warn(`robots.txt: ${robotsSkipped} page(s) skipped`);

    // ── platform APIs (Shopify / WooCommerce)
    const found: { p: ScannedProduct; rank: number; order: number }[] = [];
    let order = 0;
    for (const pg of pages) for (const it of pg.products) found.push({ ...it, order: order++ });
    const looksShopify = looksLikeShopify(firstHtml);
    const looksWoo = looksLikeWooCommerce(firstHtml);
    const currencyHint = shopifyCurrency(firstHtml) ?? pages.find((p) => p.meta.currency)?.meta.currency ?? found.find((f) => f.p.currency)?.p.currency ?? 'EUR';
    const tryApi = async (apiUrl: string, kind: 'shopify' | 'woocommerce') => {
      if (!robots.allowed(apiUrl)) {
        warn(`robots.txt disallows ${new URL(apiUrl).pathname}`);
        return null;
      }
      await sleep(Math.min(delay, 300));
      const res = await fetchText(apiUrl, { timeoutMs, userAgent, accept: 'application/json,*/*;q=0.5', maxBytes: 8_000_000 });
      if (!res.ok || !res.text) return null;
      let json: unknown;
      try {
        json = JSON.parse(res.text);
      } catch {
        return null;
      }
      const list = kind === 'shopify' ? parseShopifyProducts(json, origin, currencyHint) : parseWooProducts(json, origin);
      if (list) log(`  ↳ ${kind} API: ${list.length} produit(s)`);
      return list;
    };
    const unreachable = !pages.length && result.pages.every((p) => p.status === 0);
    if (unreachable) warn(`${start.origin} is unreachable`);
    if (!unreachable && (looksShopify || !found.length)) {
      const list = await tryApi(shopifyProductsUrl(origin, 50), 'shopify');
      if (list && (list.length || looksShopify)) {
        result.platform = 'shopify';
        list.forEach((p) => found.push({ p, rank: 0, order: -100000 + order++ }));
      }
    }
    if (!unreachable && !result.platform && (looksWoo || !found.length)) {
      const list = await tryApi(wooProductsUrl(firstRoot, origin, 50), 'woocommerce');
      if (list && (list.length || looksWoo)) {
        result.platform = 'woocommerce';
        list.forEach((p) => found.push({ p, rank: 0, order: -100000 + order++ }));
      }
    }

    // ── products: merge by URL (or name), best source first
    found.sort((a, b) => a.rank - b.rank || a.order - b.order);
    const byKey = new Map<string, ScannedProduct & { _order: number }>();
    const byName = new Map<string, string>();
    for (const { p, order: ord } of found) {
      const name = clean(p.name);
      if (!name || name.length > 160) continue;
      const k = productKey(p);
      const nk = nameKey(name);
      const existingKey = byKey.has(k) ? k : byName.get(nk);
      if (existingKey) {
        const e = byKey.get(existingKey)!;
        for (const f of ['price', 'currency', 'image', 'description', 'availability'] as const) if (e[f] === undefined && p[f] !== undefined) (e as any)[f] = p[f];
        if (e.availability === 'unknown' && p.availability && p.availability !== 'unknown') e.availability = p.availability;
        continue;
      }
      byKey.set(k, { ...p, name, _order: ord });
      byName.set(nk, k);
    }
    const siteNameGuess = pages[0]?.meta.siteName ?? pages[0]?.siteName ?? pages.find((p) => p.org.name)?.org.name;
    result.products = [...byKey.values()]
      .filter((p) => !siteNameGuess || p.name.toLowerCase() !== siteNameGuess.toLowerCase())
      .sort((a, b) => a._order - b._order)
      .slice(0, 100)
      .map(({ _order, ...p }) => {
        const out: ScannedProduct = { url: p.url, name: p.name };
        if (p.price !== undefined) out.price = p.price;
        if (p.currency || p.price !== undefined) out.currency = p.currency ?? currencyHint;
        if (p.image) out.image = p.image;
        if (p.description) out.description = p.description;
        if (p.availability) out.availability = p.availability;
        return out;
      });

    // ── site info
    const home = pages[0];
    const org: OrgInfo = { sameAs: [] };
    for (const pg of pages) {
      const o = pg.org;
      const take = !org.kind || (org.kind === 'person' && o.kind === 'organization');
      for (const k of ['name', 'description', 'logo', 'image', 'email', 'telephone', 'address', 'url'] as const) if (o[k] !== undefined && (take || org[k] === undefined)) org[k] = o[k];
      if (take && o.kind) org.kind = o.kind;
      for (const s of o.sameAs) if (!org.sameAs.includes(s)) org.sameAs.push(s);
    }
    const siteName = home?.meta.siteName ?? pages.find((p) => p.siteName)?.siteName ?? org.name;
    const contactFirst = [...pages].sort((a, b) => Number(b.topic === 'contact') - Number(a.topic === 'contact'));
    const siteHost = (() => {
      try {
        return new URL(origin).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    })();
    const emails = contactFirst.flatMap((p) => p.contact.emails);
    const email = org.email ?? emails.find((e) => siteHost && e.endsWith('@' + siteHost)) ?? emails[0];
    const phone = org.telephone ?? contactFirst.flatMap((p) => p.contact.phones)[0];
    const address = org.address ?? contactFirst.map((p) => p.microAddress).find(Boolean) ?? contactFirst.map((p) => p.contact.address).find(Boolean);
    const social = mergeSocial([org.sameAs.map((s) => socialLink(s)).filter((l): l is StallLink => !!l), ...pages.map((p) => p.social)]);
    const description = org.description ?? home?.meta.description;
    const site: ScannedStallData['site'] = {};
    const title = siteName ?? cleanTitle(home?.meta.htmlTitle) ?? home?.meta.title;
    if (title) site.title = title;
    if (description) site.description = description;
    const image = home?.meta.image ?? org.logo ?? org.image;
    if (image) site.image = image;
    if (siteName) site.siteName = siteName;
    if (email) site.email = email;
    if (phone) site.phone = phone;
    if (address) site.address = address;
    if (social.length) site.social = social;
    result.site = site;

    // ── chunks
    const chunks: KnowledgeChunk[] = [];
    const blockCount = new Map<string, number>();
    for (const pg of pages) {
      const uniq = new Set(pg.blocks.filter((b) => b.kind === 'p' || b.kind === 'li').map((b) => b.text.toLowerCase()));
      for (const t of uniq) blockCount.set(t, (blockCount.get(t) ?? 0) + 1);
    }
    const boilerplateMin = pages.length >= 3 ? Math.max(3, Math.ceil(pages.length * 0.5)) : Infinity;
    const keptOnce = new Set<string>();
    const ordered = [...pages].sort((a, b) => TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic) || a.depth - b.depth);
    if (description && description.length >= 60) chunks.push({ id: 'site-description', title: siteName ?? title, text: clipText(description, 700), topic: 'about', source: home?.url });
    for (const pg of ordered) {
      const blocks = pg.blocks.filter((b) => {
        if (b.kind === 'h' || b.kind === 'q') return true;
        const key = b.text.toLowerCase();
        if ((blockCount.get(key) ?? 0) < boilerplateMin) return true;
        // repeated on most pages (footer blurb…): keep a long one once, drop short ones
        if (b.text.length >= 120 && !keptOnce.has(key)) {
          keptOnce.add(key);
          return true;
        }
        return false;
      });
      chunks.push(...blocksToChunks(blocks, { pageUrl: pg.url, pageTitle: pg.title, pageTopic: pg.meta.product ? 'product' : pg.topic }));
    }
    // API products are rarely all crawled: give the dialogue their descriptions too
    if (result.platform) {
      const crawled = new Set(chunks.map((c) => (c.source ? canonical(c.source) : '')));
      for (const p of result.products.slice(0, 30)) {
        if (!p.description || p.description.length < 60 || crawled.has(canonical(p.url))) continue;
        const price = p.price !== undefined ? ` Prix : ${formatEuro(p.price, p.currency)}.` : '';
        chunks.push({ id: `product-${slug(p.name)}`, title: p.name, text: clipText(`${p.name}.${price} ${p.description}`, 700), topic: 'product', source: p.url });
      }
    }
    const seenText = new Set<string>();
    const ids = new Map<string, number>();
    for (const c of chunks) {
      const key = c.text.toLowerCase().replace(/\s+/g, ' ');
      if (seenText.has(key)) continue;
      seenText.add(key);
      let id = c.id;
      const n = ids.get(id) ?? 0;
      ids.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      const out: KnowledgeChunk = { id, text: c.text };
      if (c.title) out.title = c.title;
      if (c.source) out.source = c.source;
      if (c.topic) out.topic = c.topic;
      result.chunks.push(out);
      if (result.chunks.length >= 120) break;
    }

    // ── images
    if (opts.downloadImages) {
      const n = await downloadImages(result, { stallId, publicDir: opts.publicDir ?? resolve(process.cwd(), 'public'), timeoutMs, userAgent, warnings: result.warnings });
      log(`  ↳ ${n} image(s) téléchargée(s)`);
    }

    if (!result.products.length && !result.chunks.length) warn('nothing useful found on this site');
  } catch (err: any) {
    warn(`scan interrupted: ${err?.message ?? err}`);
  }
  return result;
}

function analyzePage(root: HTMLElement, url: string, depth: number): PageData & { productUrls: string[] } {
  const meta = extractMeta(root, url);
  const ld = extractJsonLd(root, url);
  const micro = extractMicrodata(root, url);
  const products: { p: ScannedProduct; rank: number }[] = [
    ...ld.products.map((p) => ({ p, rank: 1 })),
    ...micro.products.map((p) => ({ p, rank: 2 })),
    ...(meta.product ? [{ p: meta.product, rank: 3 }] : []),
  ];
  const siteName = meta.siteName ?? ld.siteName;
  const title = cleanTitle(clean(root.querySelector('h1')?.text) || meta.title || meta.htmlTitle, siteName);
  const singleProduct = depth > 0 && ld.productUrls.length === 0 && ld.products.length + micro.products.length === 1;
  const topic = meta.product || singleProduct ? 'product' : guessTopic(url, title);
  return {
    url,
    depth,
    meta,
    org: ld.org,
    siteName: ld.siteName,
    products,
    microAddress: micro.address,
    contact: extractContact(root),
    social: extractSocial(root, url),
    blocks: extractBlocks(root),
    topic,
    title,
    productUrls: ld.productUrls,
  };
}

export { parseRobots } from './robots';
export { extractJsonLd } from './extract/jsonld';
export { extractMeta } from './extract/opengraph';
export { extractMicrodata } from './extract/microdata';
export { extractBlocks, blocksToChunks, guessTopic } from './extract/text';
export { extractContact } from './extract/contact';
export { extractSocial } from './extract/social';
export { parseShopifyProducts } from './extract/shopify';
export { parseWooProducts } from './extract/woocommerce';
export { parsePrice } from './util';
