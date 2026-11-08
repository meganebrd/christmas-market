/** Regression tests for the QA round on the vendor dialogue (genders, off-topic questions, referrals…). */
import { beforeAll, describe, expect, it } from 'vitest';
import { createResponder, socialPhrase, type Responder } from '../../src/dialogue/responder';
import { articleFor } from '../../src/dialogue/voice';
import type { ResolvedMarket } from '../../src/config/types';
import { loadDemoMarket, seeded, stall } from './helpers';

let market: ResolvedMarket;
/** Responder that knows the whole market (other stalls + zones), like in the game. */
const r = (id: string, opts: { noMarket?: boolean; zones?: ResolvedMarket['zones'] } = {}): Responder =>
  createResponder(stall(market, id), {
    town: market.meta.town,
    random: seeded(11),
    market: opts.noMarket ? undefined : { stalls: market.stalls, zones: opts.zones ?? market.zones },
  });
const ALL = () => market.stalls.map((s) => s.id);

beforeAll(() => {
  market = loadDemoMarket();
});

describe('1. articles in front of product names', () => {
  // every product name of the demo content (content/stalls/*.json) and its expected article
  const DEMO: [string, string][] = [
    ['Toupie arc-en-ciel', 'la toupie arc-en-ciel'],
    ['Petit train des Cimes', 'le petit train des Cimes'],
    ['Casse-noisette « Capitaine Pomme »', 'le casse-noisette « Capitaine Pomme »'],
    ['Puzzle « Renard des neiges »', 'le puzzle « Renard des neiges »'],
    ['Bougie « Forêt sous la neige »', 'la bougie « Forêt sous la neige »'],
    ['Bougie « Pain d\'épices »', 'la bougie « Pain d\'épices »'],
    ['Bougie « Nuit de givre »', 'la bougie « Nuit de givre »'],
    ['Coffret de fondants', 'le coffret de fondants'],
    ['Miel de sapin', 'le miel de sapin'],
    ['Pain d\'épices au miel', 'le pain d\'épices au miel'],
    ['Nougat tendre', 'le nougat tendre'],
    ['Hydromel des Cimes', 'l\'hydromel des Cimes'],
    ['Boîte de bredele assortis', 'la boîte de bredele assortis'],
    ['Chocolat chaud en pot', 'le chocolat chaud en pot'],
    ['Mannele', 'le mannele'],
    ['Biscuits à suspendre', 'les biscuits à suspendre'],
    ['Bonnet à pompon « Flocon »', 'le bonnet à pompon « Flocon »'],
    ['Écharpe torsadée', 'l\'écharpe torsadée'],
    ['Chaussettes de cheminée', 'les chaussettes de cheminée'],
    ['Moufles doublées', 'les moufles doublées'],
    ['Cartes de vœux « Moulin sous la neige »', 'les cartes de vœux « Moulin sous la neige »'],
    ['Carnet « Nuit étoilée »', 'le carnet « Nuit étoilée »'],
    ['Kit de calligraphie', 'le kit de calligraphie'],
    ['Cachet de cire « Flocon »', 'le cachet de cire « Flocon »'],
    ['Savon « Lait de chèvre & miel »', 'le savon « Lait de chèvre & miel »'],
    ['Savon « Sapin & menthe poivrée »', 'le savon « Sapin & menthe poivrée »'],
    ['Baume réparateur au calendula', 'le baume réparateur au calendula'],
    ['Coffret « Douce nuit »', 'le coffret « Douce nuit »'],
    ['Tasse « Givre bleu »', 'la tasse « Givre bleu »'],
    ['Bol « Sous-bois »', 'le bol « Sous-bois »'],
    ['Photophore « Maison de neige »', 'le photophore « Maison de neige »'],
    ['Théière « Brume »', 'la théière « Brume »'],
  ];
  it.each(DEMO)('%s → %s', (name, ref) => {
    expect(articleFor(name).ref).toBe(ref);
  });
  it('covers every product of the demo stalls', () => {
    const known = new Set(DEMO.map(([n]) => n));
    const demoStalls = ['l-etabli-de-gaspard', 'la-meche-doree', 'le-rucher-des-cimes', 'les-douceurs-de-rosalie', 'les-mailles-de-suzon', 'papeterie-du-vieux-moulin', 'savons-de-la-source', 'terre-et-givre'];
    for (const id of demoStalls) for (const p of stall(market, id).products) expect(known.has(p.name), p.name).toBe(true);
  });
  it('handles other tricky nouns and keeps names that start with a determiner', () => {
    expect(articleFor('Porte-clés en bois').ref).toBe('le porte-clés en bois');
    expect(articleFor('Marque-page brodé').ref).toBe('le marque-page brodé');
    expect(articleFor('Sablés de Noël').ref).toBe('les sablés de Noël');
    expect(articleFor('Renne en feutre').ref).toBe('le renne en feutre');
    expect(articleFor('Couronne de houx').ref).toBe('la couronne de houx');
    expect(articleFor('Mon produit préféré').ref).toBe('mon produit préféré');
    expect(articleFor('Les bougies du soir').ref).toBe('les bougies du soir');
    expect(articleFor("L'étoile du berger").ref).toBe("l'étoile du berger");
  });
});

describe('2. off-topic and tricky questions', () => {
  it('weather / cold → cosy smalltalk with a hot drink at the Chaudron Doré (never durations or hours)', () => {
    for (const id of ALL()) {
      for (const q of ['Quel temps fait-il ?', 'Il fait froid ce soir !']) {
        const a = r(id).answer(q);
        expect(a.intent, `${id}: ${q}`).toBe('smalltalk');
        expect(a.smalltalk).toBe('weather');
        expect(a.text).toMatch(/au Chaudron Doré/);
        expect(a.text).not.toMatch(/\d+\s*h\b|heures|semaines/);
      }
    }
  });

  it('weather without a bar zone still answers kindly', () => {
    const zones = { ...market.zones, bar: { ...market.zones.bar, enabled: false } };
    const a = r('la-meche-doree', { zones }).answer('Quel temps fait-il ?');
    expect(a.smalltalk).toBe('weather');
    expect(a.text).not.toMatch(/Chaudron/);
  });

  it('"jusqu’à quelle heure ?" is about opening hours', () => {
    const a = r('la-meche-doree').answer('jusqu’à quelle heure ?');
    expect(a.intent).toBe('horaires');
    expect(a.text).toMatch(/16 h à 22 h/);
    const b = r('les-mailles-de-suzon').answer('jusqu’à quelle heure ?');
    expect(b.intent).toBe('horaires');
    expect(b.text).toMatch(/horaires/);
    expect(b.text).not.toMatch(/bonnet|écharpe|soirée/);
    expect(b.link?.url).toBe(stall(market, 'les-mailles-de-suzon').website);
  });

  it('payment questions get an honest, specific answer when the texts say nothing', () => {
    for (const id of ALL()) {
      const a = r(id).answer('payer par carte ?');
      expect(a.intent, id).toBe('paiement');
      expect(a.text).toMatch(/paiement/);
      expect(a.text).not.toMatch(/colis|lettre suivie|Colissimo|presse à bras/);
    }
  });

  it('"Où sont les toilettes ?" → the market map, never a product card', () => {
    for (const id of ALL()) {
      const a = r(id).answer('Où sont les toilettes ?');
      expect(a.intent, id).toBe('lieu');
      expect(a.text).toMatch(/carte du marché/);
      expect(a.product).toBeUndefined();
    }
    expect(r('papeterie-du-vieux-moulin').answer('Où est le parking ?').text).toMatch(/carte du marché/);
  });

  it('discounts: the real offer when there is one, an honest answer otherwise', () => {
    const a = r('la-meche-doree').answer('Tu fais des réductions ?');
    expect(a.intent).toBe('promo');
    expect(a.text).toMatch(/2 € de réduction/);
    const b = r('les-mailles-de-suzon').answer('Tu fais des réductions ?');
    expect(b.intent).toBe('promo');
    expect(b.text).toMatch(/promotion/);
    expect(b.text).not.toMatch(/€/);
    expect(r('terre-et-givre').answer('Vous faites des promos ?').text).toMatch(/moitié prix/);
  });

  it('a product sold by another stall → "je n’en vends pas" + referral to that stall', () => {
    const a = r('la-meche-doree').answer('Combien coûte le petit train ?');
    expect(a.referral).toMatchObject({ stallId: 'l-etabli-de-gaspard', owner: 'Gaspard Lindqvist' });
    expect(a.text).toMatch(/Gaspard/);
    expect(a.text).toMatch(/L'Établi de Gaspard/);
    expect(a.text).toMatch(/n’en vends pas|pas chez moi/);
    expect(a.product?.id).toBe('train-des-cimes');
    // the stall that sells it answers itself
    expect(r('l-etabli-de-gaspard').answer('Combien coûte le petit train ?').text).toMatch(/58 €/);
    // "au Rucher des Cimes" (le → au)
    expect(r('les-mailles-de-suzon').answer('Tu as du miel ?').text).toMatch(/Élias au Rucher des Cimes/);
    // nobody sells it
    expect(r('la-meche-doree').answer('Combien coûte un vélo ?').text).toMatch(/je n’en (ai|fais) pas/i);
    // without the market, no referral
    expect(r('la-meche-doree', { noMarket: true }).answer('Combien coûte le petit train ?').referral).toBeUndefined();
  });

  it('food and drinks of the market → the right zone (names from the market config)', () => {
    expect(r('la-meche-doree').answer('Où je trouve du vin chaud ?').text).toMatch(/au Chaudron Doré/);
    expect(r('les-mailles-de-suzon').answer('Où je trouve des crêpes ?').text).toMatch(/au Coin Gourmand/);
    expect(r('le-rucher-des-cimes').answer('Où je trouve des marrons ?').text).toMatch(/au Coin Gourmand/);
    const renamed = { ...market.zones, bar: { ...market.zones.bar, name: 'La Buvette du Givre' } };
    expect(r('la-meche-doree', { zones: renamed }).answer('Où je trouve du vin chaud ?').text).toMatch(/à La Buvette du Givre/);
    // a stall that sells it answers itself
    expect(r('les-douceurs-de-rosalie').answer('Tu as du chocolat chaud ?').product?.id).toBe('chocolat-chaud-pot');
  });

  it('"tu es nul" → gentle insult smalltalk', () => {
    for (const id of ALL()) {
      const a = r(id).answer('tu es nul');
      expect(a.smalltalk, id).toBe('insult');
      expect(a.link).toBeUndefined();
    }
  });

  it('"Depuis quand ?" → how it started, not a certification date', () => {
    expect(r('la-meche-doree').answer('Depuis quand ?').text).toMatch(/2016/);
    const a = r('le-rucher-des-cimes').answer('Depuis quand tu fais ça ?');
    expect(a.intent).toBe('histoire');
    expect(a.text).not.toMatch(/certifiés bio/);
    expect(r('les-mailles-de-suzon').answer('Depuis quand ?').text).toMatch(/huit ans/);
  });

  it('"Comment je te contacte ?" uses contact facts and the mail / social links', () => {
    const rosalie = r('les-douceurs-de-rosalie').answer('Comment je te contacte ?');
    expect(rosalie.intent).toBe('contact');
    expect(rosalie.text).toMatch(/rosalie\.douceurs@example\.com/);
    expect(rosalie.link?.url).toBe('mailto:rosalie.douceurs@example.com');
    const lou = r('savons-de-la-source').answer('Comment je te contacte ?');
    expect(lou.text).toMatch(/lou\.savons@example\.com/);
    expect(lou.text).toMatch(/sur Instagram/);
    expect(r('la-meche-doree').answer('Comment je te contacte ?').text).toMatch(/3 rue de la Laiterie/);
    expect(r('terre-et-givre').answer('Où est ton atelier ?').text).toMatch(/chemin du Torrent/);
  });

  it('gift for a child picks a product that fits (age, toys) before the favourite', () => {
    const a = r('l-etabli-de-gaspard').answer('Tu me conseilles quoi pour un enfant de 5 ans ?');
    expect(a.intent).toBe('cadeau');
    expect(['train-des-cimes', 'puzzle-renard', 'toupie-arc-en-ciel']).toContain(a.product?.id);
    const tiny = r('l-etabli-de-gaspard').answer('un cadeau pour un enfant de 2 ans ?');
    expect(['train-des-cimes', 'puzzle-renard']).toContain(tiny.product?.id);
    // nothing fits → the artisan's favourite
    expect(r('la-meche-doree').answer('Qu’est-ce que tu me conseilles pour un enfant de 5 ans ?').product?.id).toBe('foret-neige');
  });

  it('gift cards and opening days are not mistaken for gifts or durations', () => {
    expect(r('la-meche-doree').answer('Est-ce que vous faites des cartes cadeaux ?').text).toMatch(/cartes cadeaux/);
    expect(r('la-meche-doree').answer('Tu es là demain ?').text).toMatch(/16 h à 22 h/);
    expect(r('le-rucher-des-cimes').answer('Tu es là demain ?').text).not.toMatch(/visites du rucher/);
  });
});

describe('3. social links are phrased by network, not by their label', () => {
  it('socialPhrase()', () => {
    const gaspard = stall(market, 'l-etabli-de-gaspard');
    expect(socialPhrase(gaspard.links)).toBe('sur TikTok et sur ma boutique Etsy');
    expect(socialPhrase(stall(market, 'terre-et-givre').links)).toBe('sur Instagram et sur ma chaîne YouTube');
    expect(socialPhrase([{ label: 'La lettre des saisons', url: 'https://x', kind: 'other' }])).toBe('');
  });
  it('site and network answers', () => {
    const g = r('l-etabli-de-gaspard').answer('Tu as un site ?').text;
    expect(g).not.toMatch(/Les coulisses de l'atelier|Boutique Etsy/);
    expect(g).toMatch(/sur ma boutique Etsy/);
    const i = r('terre-et-givre').answer('Tu as un site ?').text;
    expect(i).not.toMatch(/Instagram de l'atelier|Le tour en vidéo/);
    expect(r('la-meche-doree').answer('Tu as un compte instagram ?').link?.url).toBe('https://example.com/la-meche-doree/instagram');
    expect(r('l-etabli-de-gaspard').answer('Tu as un compte instagram ?').text).toMatch(/Pas de compte Instagram.*TikTok/);
  });
});

describe('performance', () => {
  it('stays well under 5 ms per answer (median) with the whole market loaded', () => {
    const qs = ['Quel temps fait-il ?', 'payer par carte ?', 'Combien coûte le petit train ?', 'Où sont les toilettes ?', 'Où je trouve du vin chaud ?', 'Comment je te contacte ?', 'Depuis quand ?', 'Tu me conseilles quoi pour un enfant de 5 ans ?'];
    const times: number[] = [];
    for (const id of ALL()) {
      const resp = r(id);
      for (const q of qs) resp.answer(q);
      for (const q of qs) {
        const t = performance.now();
        resp.answer(q);
        times.push(performance.now() - t);
      }
    }
    times.sort((a, b) => a - b);
    expect(times[times.length >> 1]).toBeLessThan(5);
  });
});
