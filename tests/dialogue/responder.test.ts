import { beforeAll, describe, expect, it } from 'vitest';
import { createResponder, type Responder } from '../../src/dialogue/responder';
import type { ResolvedMarket } from '../../src/config/types';
import { loadDemoMarket, seeded, stall } from './helpers';

let market: ResolvedMarket;
const r = (id: string): Responder => createResponder(stall(market, id), { town: market.meta.town, random: seeded(7) });

beforeAll(() => {
  market = loadDemoMarket();
});

describe('La Mèche Dorée (bougies)', () => {
  it('"Tu livres ?" → Colissimo, livraison offerte dès 50 €', () => {
    const a = r('la-meche-doree').answer('Tu livres ?');
    expect(a.intent).toBe('livraison');
    expect(a.text).toMatch(/Colissimo/);
    expect(a.text).toMatch(/50 €/);
    expect(a.confidence).toBeGreaterThan(0.6);
  });

  it('"c’est combien la bougie pain d’épices ?" → product card + 19 €', () => {
    const a = r('la-meche-doree').answer("c'est combien la bougie pain d'épices ?");
    expect(a.product?.id).toBe('pain-epices');
    expect(a.product?.image).toBeTruthy();
    expect(a.text).toMatch(/19\s?€/);
    expect(a.intent).toBe('prix');
  });

  it('"elle dure combien de temps une bougie" → 35 à 45 heures', () => {
    const a = r('la-meche-doree').answer('elle dure combien de temps une bougie');
    expect(a.text).toMatch(/35 et 45 heures/);
    expect(a.product).toBeUndefined();
  });

  it('general price question → price range', () => {
    const a = r('la-meche-doree').answer("c'est combien ?");
    expect(a.intent).toBe('prix');
    expect(a.text).toMatch(/12,50 €/);
    expect(a.text).toMatch(/28 €/);
  });

  it('materials, opening hours, custom orders, care', () => {
    const resp = r('la-meche-doree');
    expect(resp.answer("c'est fait avec quoi ?").text).toMatch(/colza/i);
    expect(resp.answer('tu ouvres quand ?').text).toMatch(/16 h à 22 h/);
    const custom = resp.answer('Tu fais des bougies personnalisées ?');
    expect(custom.text).toMatch(/mariages/);
    expect(custom.link?.url).toMatch(/^https?:/);
    expect(resp.answer('comment bien utiliser une bougie').text).toMatch(/5 mm/);
  });

  it('contact gives the e-mail and a mailto card', () => {
    const a = r('la-meche-doree').answer('comment te contacter ?');
    expect(a.text).toMatch(/bonjour@example\.com/);
    expect(a.link?.url).toBe('mailto:bonjour@example.com');
  });

  it('identity speaks in the first person', () => {
    const a = r('la-meche-doree').answer('qui es-tu ?');
    expect(a.intent).toBe('identite');
    expect(a.text).toMatch(/^Moi, c’est Margot/);
    expect(a.text).toMatch(/Je coule mes bougies/);
    expect(a.text).not.toMatch(/Margot coule/);
  });

  it('smalltalk: bonjour / merci / compliments / au revoir', () => {
    const resp = r('la-meche-doree');
    const hello = resp.answer('bonjour');
    expect(hello.intent).toBe('smalltalk');
    expect(hello.smalltalk).toBe('greeting');
    expect(hello.text).toMatch(/bonsoir/i);
    const thanks = resp.answer('merci !');
    expect(thanks.smalltalk).toBe('thanks');
    expect(thanks.text.length).toBeGreaterThan(3);
    expect(resp.answer('ça sent trop bon !').smalltalk).toBe('compliment');
    const bye = resp.answer('au revoir');
    expect(bye.action).toBe('bye');
    expect(stall(market, 'la-meche-doree').owner.farewells).toContain(bye.text);
  });

  it('greeting + question answers the question', () => {
    const a = r('la-meche-doree').answer('Bonjour ! Tu livres ?');
    expect(a.text).toMatch(/^Bonsoir !/);
    expect(a.text).toMatch(/Colissimo/);
  });

  it('gibberish → graceful fallback with the website link and suggestions', () => {
    const a = r('la-meche-doree').answer('asdfgh qwerty zxcv');
    expect(a.intent).toBe('fallback');
    expect(a.confidence).toBeLessThan(0.3);
    expect(a.link?.url).toBe('https://example.com/la-meche-doree');
    expect(a.text).toMatch(/site/);
    expect(a.followUps.length).toBeGreaterThanOrEqual(2);
  });

  it('English "do you ship?" → shipping answer', () => {
    const a = r('la-meche-doree').answer('do you ship?');
    expect(a.intent).toBe('livraison');
    expect(a.text).toMatch(/Colissimo/);
  });

  it('suggestions are short questions the engine can answer', () => {
    const resp = r('la-meche-doree');
    const s = resp.suggestions();
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(5);
    for (const q of s) {
      expect(q).toMatch(/\?$/);
      const a = createResponder(stall(market, 'la-meche-doree')).answer(q);
      expect(a.intent).not.toBe('fallback');
    }
  });

  it('openers never repeat twice in a row', () => {
    const resp = createResponder(stall(market, 'la-meche-doree'), { random: () => 0.5 });
    const openers: string[] = [];
    for (let i = 0; i < 6; i++) {
      const t = resp.answer('Tu livres ?').text;
      openers.push(t.slice(0, t.indexOf('Oui')).trim());
    }
    for (let i = 1; i < openers.length; i++) if (openers[i]) expect(openers[i]).not.toBe(openers[i - 1]);
  });
});

describe('Les Mailles de Suzon (tricot)', () => {
  it('"quelle laine tu utilises" → mérinos', () => {
    const a = r('les-mailles-de-suzon').answer('quelle laine tu utilises');
    expect(a.intent).toBe('matieres');
    expect(a.text).toMatch(/mérinos/);
  });

  it('"tu fais du sur mesure ?" → yes', () => {
    const a = r('les-mailles-de-suzon').answer('tu fais du sur mesure ?');
    expect(a.intent).toBe('personnalisation');
    expect(a.text).toMatch(/bien sûr|oui|sur mesure/i);
  });

  it('shipping is found even if the texts say "envoi" instead of "livrer"', () => {
    const a = r('les-mailles-de-suzon').answer('Tu livres ?');
    expect(a.text).toMatch(/lettre suivie/);
    expect(a.confidence).toBeGreaterThan(0.6);
  });

  it('product questions show a card', () => {
    const a = r('les-mailles-de-suzon').answer('tu as des moufles ?');
    expect(a.product?.id).toBe('moufles');
    expect(a.text).toMatch(/29 €/);
  });

  it('care question picks the washing FAQ, not the product', () => {
    const a = r('les-mailles-de-suzon').answer('comment laver un bonnet ?');
    expect(a.text).toMatch(/eau froide/);
  });

  it('nickname bio converted to first person', () => {
    const lines = r('les-mailles-de-suzon').introduce();
    expect(lines[0]).toMatch(/Tout le monde m'appelle Suzon/);
  });
});

describe('Le Rucher des Cimes (miel)', () => {
  it('"Combien coûte le miel ?" → miel de sapin, 14 €', () => {
    const a = r('le-rucher-des-cimes').answer('Combien coûte le miel ?');
    expect(a.product?.id).toBe('miel-sapin');
    expect(a.text).toMatch(/14 €/);
  });

  it('organic, allergens, quantities', () => {
    const resp = r('le-rucher-des-cimes');
    expect(resp.answer('ton miel est bio ?').text).toMatch(/certifiés bio/);
    expect(resp.answer('il y a du gluten ?').text).toMatch(/gluten/);
    expect(resp.answer('tu as combien de ruches ?').text).toMatch(/120 ruches/);
  });

  it('typos are tolerated', () => {
    const a = r('le-rucher-des-cimes').answer('tu as du nougaat ?');
    expect(a.product?.id).toBe('nougat');
  });
});

describe('every demo stall', () => {
  it('answers fast (median < 5 ms per query) and never throws', () => {
    const questions = [
      'Tu livres ?', 'c’est combien ?', 'qui es-tu ?', 'bonjour', 'merci', 'c’est fait comment ?', 'tu fais du sur-mesure ?',
      'asdfgh', '', '   ', '?!?', 'Depuis quand tu fais ça ?', 'how much?', 'tu as un site ?', 'au revoir', 'x'.repeat(1000),
    ];
    const times: number[] = [];
    for (const s of market.stalls) {
      const resp = createResponder(s, { town: market.meta.town });
      expect(resp.suggestions().length).toBeGreaterThanOrEqual(3);
      for (const q of questions) resp.answer(q); // warm-up (regex compilation, JIT)
      for (const q of questions) {
        const t = performance.now();
        const a = resp.answer(q);
        times.push(performance.now() - t);
        expect(typeof a.text).toBe('string');
        expect(a.text.length).toBeGreaterThan(0);
        expect(a.text.length).toBeLessThan(420);
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(a.followUps)).toBe(true);
      }
    }
    times.sort((x, y) => x - y);
    expect(times[times.length >> 1]).toBeLessThan(5);
  });
});
