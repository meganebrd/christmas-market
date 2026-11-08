import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSite, type ScanResult } from '../../scripts/scanner/index';
import { resolveMarket } from '../../src/config/resolve';
import type { MarketFile, StallConfig } from '../../src/config/types';
import { createResponder } from '../../src/dialogue/responder';
import { serveFixture, type FixtureServer } from './server';

const FAST = { delayMs: 5, timeoutMs: 5000 };

describe('artisan site (about / faq / livraison / contact)', () => {
  let srv: FixtureServer;
  let res: ScanResult;
  let publicDir: string;
  beforeAll(async () => {
    srv = await serveFixture('artisan');
    publicDir = mkdtempSync(join(tmpdir(), 'givrelune-scan-'));
    res = await scanSite(srv.url + '/', { ...FAST, stallId: 'atelier-brindille', downloadImages: true, publicDir });
  });
  afterAll(async () => {
    await srv.close();
    rmSync(publicDir, { recursive: true, force: true });
  });

  it('identifies itself and respects robots.txt', () => {
    expect(srv.requests[0]).toBe('/robots.txt');
    expect(srv.userAgents.every((ua) => ua.startsWith('GivreluneScanner/0.1'))).toBe(true);
    expect(srv.requests.some((r) => r.startsWith('/brouillons'))).toBe(false);
    expect(srv.requests.some((r) => r.startsWith('/panier'))).toBe(false);
    expect(srv.requests.some((r) => r.startsWith('/img/') && !res.site.image)).toBe(false);
    expect(res.warnings.some((w) => /robots\.txt/.test(w))).toBe(true);
  });

  it('crawls the important pages first', () => {
    const paths = res.pages.map((p) => new URL(p.url).pathname);
    expect(paths.slice(0, 5)).toEqual(expect.arrayContaining(['/', '/a-propos', '/faq', '/livraison', '/contact']));
  });

  it('extracts site info, contact and social profiles', () => {
    expect(res.site.title).toBe("L'Atelier Brindille");
    expect(res.site.description).toMatch(/Vercors/);
    expect(res.site.email).toBe('leon@atelier-brindille.fr');
    expect(res.site.phone).toBe('06 12 34 56 78');
    expect(res.site.address).toMatch(/12 rue des Érables.*38250 Villard-de-Lans/);
    const social = res.site.social ?? [];
    expect(social.map((s) => s.label)).toEqual(['Instagram', 'Facebook', 'Etsy', 'TikTok', 'YouTube', 'Pinterest']);
    expect(social.find((s) => s.kind === 'instagram')?.url).toBe('https://instagram.com/atelierbrindille');
    expect(social.some((s) => /sharer|intent|pin\/create|\/p\//.test(s.url))).toBe(false);
  });

  it('turns readable text into topical chunks without boilerplate', () => {
    const all = res.chunks.map((c) => c.text).join('\n');
    expect(all).not.toMatch(/cookies|Tous droits réservés|Lire la suite|Brouillon secret|Votre message/);
    const liv = res.chunks.find((c) => c.topic === 'livraison');
    expect(liv?.text).toMatch(/Colissimo/);
    expect(liv?.text).toMatch(/60 €/);
    expect(liv?.text).toMatch(/Belgique et Suisse : 12 €/);
    const wood = res.chunks.find((c) => c.title === 'Quel bois utilisez-vous ?');
    expect(wood?.text).toMatch(/hêtre/);
    expect(res.chunks.find((c) => c.title === 'Faites-vous des jouets personnalisés ?')?.text).toMatch(/grave le prénom/);
    const about = res.chunks.find((c) => c.topic === 'about' && /grand-père/.test(c.text));
    expect(about?.title).toBe('Notre histoire');
    expect(about?.source).toBe(`${srv.url}/a-propos`);
    for (const c of res.chunks) {
      expect(c.text.length).toBeLessThanOrEqual(800);
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(res.chunks.map((c) => c.id)).size).toBe(res.chunks.length);
  });

  it('downloads images to public/generated/<id>/ and rewrites URLs', () => {
    expect(res.site.image).toMatch(/^\/generated\/atelier-brindille\/[0-9a-f]{12}\.png$/);
    expect(existsSync(join(publicDir, res.site.image!))).toBe(true);
  });

  it('feeds the dialogue engine', () => {
    const market = { meta: { title: 'Test', town: 'Givrelune' } } as MarketFile;
    const cfg: StallConfig = { id: 'atelier-brindille', name: "L'Atelier Brindille", website: srv.url, owner: { name: 'Léon Bertrand', role: 'Tourneur sur bois' } };
    const stall = resolveMarket(market, [cfg], [res]).stalls[0];
    expect(stall.links?.some((l) => l.kind === 'etsy')).toBe(true);
    const r = createResponder(stall);
    expect(r.answer('Tu livres ?').text).toMatch(/Colissimo/);
    expect(r.answer("c'est quel bois ?").text).toMatch(/hêtre/);
    expect(r.answer('tu graves les prénoms ?').text).toMatch(/grave/);
    const contact = r.answer('comment te contacter ?');
    expect(contact.text).toMatch(/leon@atelier-brindille\.fr/);
    expect(contact.link?.url).toBe('mailto:leon@atelier-brindille.fr');
    expect(r.answer('depuis quand tu fais ça ?').text).toMatch(/2009/);
  });
});

describe('Shopify-like site', () => {
  let srv: FixtureServer;
  let res: ScanResult;
  beforeAll(async () => {
    srv = await serveFixture('shopify');
    res = await scanSite(srv.url, { ...FAST, stallId: 'savonnerie' });
  });
  afterAll(() => srv.close());

  it('reads /products.json', () => {
    expect(res.platform).toBe('shopify');
    expect(srv.requests).toContain('/products.json?limit=50');
    expect(res.products.map((p) => p.name)).toEqual(['Savon au lait de chèvre', 'Shampoing solide & ortie', 'Coffret découverte']);
    const savon = res.products[0];
    expect(savon.price).toBe(8.5);
    expect(savon.currency).toBe('EUR');
    expect(savon.url).toBe(`${srv.url}/products/savon-lait-de-chevre`);
    expect(savon.image).toBe('https://cdn.shopify.com/s/files/1/0000/products/chevre.jpg?v=2');
    expect(savon.description).toMatch(/peaux sensibles/);
    expect(savon.availability).toBe('in_stock');
    expect(res.products[1].availability).toBe('out_of_stock');
    expect(res.products[2].price).toBe(29);
  });

  it('respects robots.txt and skips cart/account/variant URLs', () => {
    expect(srv.requests.some((r) => r.startsWith('/secret'))).toBe(false);
    expect(srv.requests.some((r) => /^\/(cart|account)/.test(r))).toBe(false);
    expect(srv.requests.some((r) => r.includes('variant='))).toBe(false);
  });

  it('keeps the story and the site info', () => {
    expect(res.site.title).toBe('Savonnerie du Lac');
    expect(res.site.image).toBe('https://cdn.shopify.com/s/files/1/0000/files/boutique.jpg?v=1');
    expect(res.chunks.find((c) => c.topic === 'about' && /2018/.test(c.text))?.title).toBe('Notre histoire');
    expect(res.site.social?.map((s) => s.kind)).toEqual(['instagram', 'facebook']);
    expect(res.chunks.some((c) => /Livraison offerte dès 45/.test(c.text))).toBe(false); // announcement bar
  });
});

describe('WooCommerce-like site', () => {
  let srv: FixtureServer;
  let res: ScanResult;
  beforeAll(async () => {
    srv = await serveFixture('woocommerce');
    res = await scanSite(srv.url + '/', { ...FAST, stallId: 'ferme' });
  });
  afterAll(() => srv.close());

  it('reads the Store API', () => {
    expect(res.platform).toBe('woocommerce');
    expect(srv.requests).toContain('/wp-json/wc/store/v1/products?per_page=50');
    const byName = Object.fromEntries(res.products.map((p) => [p.name, p]));
    expect(byName['Confiture de fraise'].price).toBe(6.5);
    expect(byName['Confiture de fraise'].image).toBe(`${srv.url}/wp-content/uploads/2026/06/fraise.jpg`);
    expect(byName['Confiture de fraise'].url).toBe(`${srv.url}/produit/confiture-fraise/`);
    expect(byName['Gelée de coing'].availability).toBe('out_of_stock');
    expect(byName['Coffret trois pots'].price).toBe(18.9);
    expect(res.products.length).toBe(3);
  });

  it('uses the most specific robots.txt group', () => {
    expect(srv.requests.some((r) => r.startsWith('/prive'))).toBe(false);
    expect(srv.requests.some((r) => r.startsWith('/mon-compte') || r.includes('add-to-cart'))).toBe(false);
  });

  it('finds the shipping page and the Etsy shop', () => {
    expect(res.chunks.find((c) => c.topic === 'livraison')?.text).toMatch(/Mondial Relay/);
    expect(res.site.social?.[0]).toMatchObject({ kind: 'etsy', url: 'https://etsy.com/shop/FermeAuxConfitures' });
    expect(res.site.title).toBe('La Ferme aux Confitures');
  });
});

describe('JSON-LD / microdata / OpenGraph shop', () => {
  let srv: FixtureServer;
  let res: ScanResult;
  beforeAll(async () => {
    srv = await serveFixture('jsonld');
    res = await scanSite(srv.url, { ...FAST, stallId: 'terre-flamme' });
  });
  afterAll(() => srv.close());

  it('collects products from JSON-LD (Offer, AggregateOffer, ItemList), microdata and OpenGraph', () => {
    const byName = Object.fromEntries(res.products.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(['Assiette Goémon', 'Bol Écume', 'Tasse Marée', 'Vase Lande']);
    expect(byName['Bol Écume']).toMatchObject({ price: 32, currency: 'EUR', image: `${srv.url}/img/bol.jpg`, availability: 'in_stock' });
    expect(byName['Bol Écume'].description).toBe('Bol en grès & émail blanc écume, 40 cl.');
    expect(byName['Tasse Marée']).toMatchObject({ price: 26, url: `${srv.url}/creations/tasse-maree` });
    expect(byName['Vase Lande']).toMatchObject({ price: 45, availability: 'out_of_stock', image: `${srv.url}/img/vase.jpg` });
    expect(byName['Assiette Goémon']).toMatchObject({ price: 34.5, currency: 'EUR' });
    // no platform API calls when the pages already describe the products
    expect(srv.requests.some((r) => r.includes('products.json') || r.includes('wp-json'))).toBe(false);
  });

  it('reads the Organization (with @graph, ImageObject logo, PostalAddress, sameAs)', () => {
    expect(res.site.title).toBe('Terre & Flamme');
    expect(res.site.email).toBe('bonjour@terre-flamme.bzh');
    expect(res.site.phone).toBe('+33 2 98 00 00 00');
    expect(res.site.address).toBe('4 place du Marché, 29000 Quimper');
    expect(res.site.description).toMatch(/Quimper depuis 2014/);
    expect(res.site.social?.map((s) => s.kind)).toEqual(['instagram', 'facebook', 'youtube']);
    expect(res.warnings).toEqual([]);
  });
});

describe('robustness', () => {
  it('skips placeholder demo domains without any request', async () => {
    const t0 = Date.now();
    const r = await scanSite('https://example.com/la-meche-doree', { stallId: 'la-meche-doree' });
    expect(Date.now() - t0).toBeLessThan(200);
    expect(r).toMatchObject({ stallId: 'la-meche-doree', products: [], chunks: [], site: {} });
    expect(r.warnings[0]).toMatch(/placeholder/);
  });

  it('never throws on network errors', async () => {
    const srv = await serveFixture('artisan');
    const url = srv.url;
    await srv.close();
    const r = await scanSite(url, { ...FAST, timeoutMs: 2000 });
    expect(r.products).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    const bad = await scanSite('not a url');
    expect(bad.warnings[0]).toMatch(/invalid URL/);
    const ftp = await scanSite('ftp://example.org/');
    expect(ftp.warnings[0]).toMatch(/protocol/);
  });

  it('respects maxPages and survives server errors', async () => {
    const srv = await serveFixture('artisan', { status: { '/faq': 500 } });
    const r = await scanSite(srv.url, { ...FAST, maxPages: 3 });
    const html = srv.requests.filter((p) => !/robots|products\.json|wp-json/.test(p));
    expect(html.length).toBeLessThanOrEqual(3);
    expect(r.warnings.some((w) => /HTTP 500/.test(w))).toBe(true);
    await srv.close();
  });
});
