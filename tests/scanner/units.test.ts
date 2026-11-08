import { describe, expect, it } from 'vitest';
import { parse } from 'node-html-parser';
import { parseRobots } from '../../scripts/scanner/robots';
import { parsePrice, currencyFrom, absolutize } from '../../scripts/scanner/util';
import { classifySocial } from '../../scripts/scanner/extract/social';
import { canonical, isPlaceholder, priority, sameSite, shouldSkip } from '../../scripts/scanner/urls';
import { extractBlocks, guessTopic } from '../../scripts/scanner/extract/text';
import { extractContact } from '../../scripts/scanner/extract/contact';

describe('robots.txt', () => {
  const txt = `
User-agent: *
Disallow: /private/
Disallow: /*.pdf$
Allow: /private/ok.html

User-agent: BadBot
Disallow: /

User-agent: GivreluneScanner
User-agent: OtherBot
Disallow: /drafts
Crawl-delay: 2
`;
  it('uses the most specific group, wildcards, $ and Allow precedence', () => {
    const star = parseRobots(txt, 'SomeBot');
    expect(star.allowed('https://a.fr/private/x')).toBe(false);
    expect(star.allowed('https://a.fr/private/ok.html')).toBe(true);
    expect(star.allowed('https://a.fr/doc/file.pdf')).toBe(false);
    expect(star.allowed('https://a.fr/doc/file.pdf?x=1')).toBe(true);
    const us = parseRobots(txt, 'GivreluneScanner');
    expect(us.allowed('https://a.fr/private/x')).toBe(true);
    expect(us.allowed('https://a.fr/drafts/1')).toBe(false);
    expect(us.crawlDelay).toBe(2);
    expect(parseRobots(txt, 'BadBot').allowed('https://a.fr/')).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow:\n', 'X').allowed('https://a.fr/anything')).toBe(true);
    expect(parseRobots('', 'X').allowed('https://a.fr/')).toBe(true);
  });
});

describe('prices & URLs', () => {
  it('parses prices in every common format', () => {
    expect(parsePrice('12,50 €')).toBe(12.5);
    expect(parsePrice('€24.00')).toBe(24);
    expect(parsePrice('1 234,56 €')).toBe(1234.56);
    expect(parsePrice('1.234,56')).toBe(1234.56);
    expect(parsePrice('1,234.56')).toBe(1234.56);
    expect(parsePrice('1,234')).toBe(1234);
    expect(parsePrice(19)).toBe(19);
    expect(parsePrice('gratuit')).toBeUndefined();
    expect(currencyFrom('€')).toBe('EUR');
    expect(currencyFrom('USD')).toBe('USD');
  });
  it('normalises and filters URLs', () => {
    expect(absolutize('//cdn.shopify.com/a.jpg', 'https://x.fr/')).toBe('https://cdn.shopify.com/a.jpg');
    expect(absolutize('mailto:a@b.fr', 'https://x.fr/')).toBeUndefined();
    expect(canonical('https://X.fr/a/?utm_source=nl&b=1#top')).toBe('https://x.fr/a?b=1');
    expect(sameSite('https://www.x.fr/a', 'http://x.fr/b')).toBe(true);
    expect(sameSite('https://x.fr/a', 'https://y.fr/b')).toBe(false);
    expect(shouldSkip('https://x.fr/panier')).toBe(true);
    expect(shouldSkip('https://x.fr/img/a.jpg')).toBe(true);
    expect(shouldSkip('https://x.fr/?add-to-cart=3')).toBe(true);
    expect(shouldSkip('https://x.fr/a-propos')).toBe(false);
    expect(isPlaceholder('https://example.com/stand')).toBe(true);
    expect(isPlaceholder('https://mon-atelier.fr')).toBe(false);
    expect(priority('https://x.fr/livraison', 1)).toBeGreaterThan(priority('https://x.fr/blog/article', 1));
    expect(priority('https://x.fr/', 0)).toBeGreaterThan(priority('https://x.fr/a-propos', 1));
  });
  it('recognises social profiles but not share buttons', () => {
    expect(classifySocial('https://www.instagram.com/mon.atelier/')?.kind).toBe('instagram');
    expect(classifySocial('https://www.instagram.com/p/Cabc123/')).toBeNull();
    expect(classifySocial('https://www.facebook.com/sharer/sharer.php?u=x')).toBeNull();
    expect(classifySocial('https://www.etsy.com/fr/shop/MonAtelier')?.kind).toBe('etsy');
    expect(classifySocial('https://www.etsy.com/listing/123/bougie')).toBeNull();
    expect(classifySocial('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(classifySocial('https://www.tiktok.com/@atelier')?.kind).toBe('tiktok');
    expect(classifySocial('https://pinterest.com/pin/create/button/?url=x')).toBeNull();
  });
});

describe('text & contact extraction', () => {
  it('drops navigation, cookie banners, page-builder chrome but keeps page-builder content', () => {
    const root = parse(`<body><nav><a href="/">Accueil</a></nav><div id="cookie-notice">Ce site utilise des cookies pour la navigation.</div>
      <div class="elementor-widget elementor-widget-text-editor"><div class="elementor-widget-container"><p>Je tisse mes plaids sur un vieux métier à bras en noyer, dans la grange.</p></div></div>
      <div class="elementor-widget-nav-menu"><a href="/x">Menu item long enough to be a block</a></div>
      <footer><p>© 2026 Tous droits réservés</p></footer></body>`);
    const texts = extractBlocks(root).map((b) => b.text);
    expect(texts).toEqual(['Je tisse mes plaids sur un vieux métier à bras en noyer, dans la grange.']);
  });
  it('guesses topics from URLs and headings', () => {
    expect(guessTopic('https://x.fr/pages/livraison-et-retours')).toBe('livraison');
    expect(guessTopic('https://x.fr/faq', 'Frais de port')).toBe('livraison');
    expect(guessTopic('https://x.fr/products/bougie')).toBe('product');
    expect(guessTopic('https://x.fr/qui-sommes-nous')).toBe('about');
  });
  it('finds e-mails and French phone numbers, ignoring fake ones', () => {
    const root = parse(`<body><p>Écrivez à atelier@mon-site.fr ou au 06.12.34.56.78. Logo: logo@2x.png, exemple: votre-email@domaine.fr</p><a href="tel:+33 4 76 00 00 00">Tel</a></body>`);
    const c = extractContact(root);
    expect(c.emails).toEqual(['atelier@mon-site.fr']);
    expect(c.phones).toEqual(['04 76 00 00 00', '06 12 34 56 78']);
  });
});
