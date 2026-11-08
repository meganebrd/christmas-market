import type { ScannedProduct, StallLink } from '../../config/types';
import { formatPrice } from '../../config/resolve';
import { h, prettyHost, safeUrl } from '../../ui/dom';
import { FACT_TOPICS, GOOD_DESCRIPTION } from '../catalog';
import { button, field, note, section, textArea, textInput } from '../fields';
import { icon } from '../icons';
import { insertItem, sortableList } from '../sortable';
import { normalizeUrl, SCAN_AVAILABLE, scanSite } from '../scan';
import type { App } from '../types';
import { isHttp } from '../validate';
import { thumb } from './products';

const raw = (s: string) => s;
let scanning = false;

export function knowledgeTab(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;
  d.knowledge ??= {};
  const k = d.knowledge;
  k.faq ??= [];
  k.facts ??= [];

  // ── description ──
  const desc = textArea(store, 'knowledge.description', {
    id: 'f-description',
    rows: 9,
    class: 'ed-textarea--story',
    placeholder:
      'Je fabrique toutes mes bougies à la main, dans mon atelier…\n\nJ’utilise de la cire de colza cultivé en France…\n\nJ’ai commencé en 2016 après avoir retrouvé le carnet de recettes de ma grand-mère…',
  });
  const meter = h('div', { class: 'ed-meter', role: 'meter', 'aria-label': 'Longueur de ta description', 'aria-valuemin': 0, 'aria-valuemax': 1500 });
  const meterFill = h('span', { class: 'ed-meter__fill' });
  const meterText = h('span', { class: 'ed-meter__text' });
  meter.append(h('span', { class: 'ed-meter__track' }, meterFill, h('span', { class: 'ed-meter__mark', style: { left: (GOOD_DESCRIPTION / 1500) * 100 + '%' } })), meterText);
  const paintMeter = () => {
    const n = desc.value.trim().length;
    const paras = desc.value.split(/\n\s*\n/).filter((p) => p.trim()).length;
    meter.setAttribute('aria-valuenow', String(Math.min(n, 1500)));
    meterFill.style.width = Math.min(100, (n / 1500) * 100) + '%';
    const level = n < GOOD_DESCRIPTION ? 0 : n < 800 ? 1 : n < 1500 ? 2 : 3;
    meter.dataset.level = String(level);
    meterText.textContent =
      `${n} caractères · ${paras} paragraphe${paras > 1 ? 's' : ''} — ` +
      ['plus tu écris, mieux ton personnage répondra', 'c’est un bon début !', 'très bien, ton personnage a de la conversation', 'parfait, c’est un vrai bavard'][level];
  };
  desc.addEventListener('input', paintMeter);
  paintMeter();

  const tips = h(
    'details',
    { class: 'ed-tips' },
    h('summary', null, icon('sparkle', 16), ' Des idées pour écrire'),
    h(
      'ul',
      null,
      h('li', null, h('b', null, 'Écris à la première personne'), ', comme si tu parlais devant ta cabane : « Je fabrique… », « Mon atelier… ».'),
      h('li', null, h('b', null, 'Parle de ce qu’on te demande vraiment'), ' : tes matières, ta fabrication, ton histoire, la livraison, l’entretien.'),
      h('li', null, h('b', null, 'Donne des chiffres'), ' : prix, délais, tailles, durées. Ce sont les réponses les plus utiles.'),
      h('li', null, h('b', null, 'Une idée par paragraphe'), ', séparés par une ligne vide : ton personnage choisit le bon morceau.'),
      h('li', null, 'Rien n’est inventé : ton personnage ne répond qu’avec tes mots (et ceux de ton site).'),
    ),
  );

  // ── FAQ ──
  const faq = k.faq;
  const faqList = sortableList({
    items: faq,
    listLabel: 'Questions fréquentes',
    name: (f, i) => `la question ${i + 1}`,
    onChange: (_w, key, removed) => app.listChanged(key, removed),
    class: 'ed-sortable--faq',
    render: (_f, i, key) => {
      const q = textInput(store, `knowledge.faq.${i}.q`, { id: `f-faq-q-${i}`, focusKey: key + ':q', parse: raw, placeholder: 'Livrez-vous ?', maxLength: 160, class: 'ed-input--q' });
      const a = textArea(store, `knowledge.faq.${i}.a`, { id: `f-faq-a-${i}`, focusKey: key + ':a', rows: 2, placeholder: 'Oui ! J’expédie partout en France en Colissimo sous 3 jours.' });
      return h('div', { class: 'ed-qa' }, h('label', { class: 'ed-sr', for: q.id }, `Question ${i + 1}`), q, h('label', { class: 'ed-sr', for: a.id }, `Réponse ${i + 1}`), a);
    },
  });
  const addFaq = button('Ajouter une question', {
    icon: 'plus',
    small: true,
    focusKey: 'add-faq',
    onClick: () => {
      const key = insertItem(faq, faq.length, { q: '', a: '' });
      store.touch('structure');
      app.rerender(key + ':q');
    },
  });

  // ── facts ──
  const facts = k.facts;
  const topics = h('datalist', { id: 'ed-topics' }, FACT_TOPICS.map((t) => h('option', { value: t })));
  const factList = sortableList({
    items: facts,
    listLabel: 'Petits faits',
    name: (f, i) => `le fait ${f.topic || i + 1}`,
    onChange: (_w, key, removed) => app.listChanged(key, removed),
    class: 'ed-sortable--facts',
    render: (_f, i, key) => {
      const t = textInput(store, `knowledge.facts.${i}.topic`, { id: `f-fact-t-${i}`, focusKey: key + ':topic', list: 'ed-topics', placeholder: 'livraison', parse: raw, maxLength: 30, class: 'ed-input--topic' });
      const x = textArea(store, `knowledge.facts.${i}.text`, { id: `f-fact-x-${i}`, focusKey: key + ':text', rows: 1, placeholder: 'Expédition sous 3 jours, offerte dès 50 €.' });
      return h('div', { class: 'ed-fact' }, h('label', { class: 'ed-sr', for: t.id }, `Sujet ${i + 1}`), t, h('label', { class: 'ed-sr', for: x.id }, `Fait ${i + 1}`), x);
    },
  });
  const addFact = button('Ajouter un fait', {
    icon: 'plus',
    small: true,
    focusKey: 'add-fact',
    onClick: () => {
      const used = new Set(facts.map((f) => f.topic));
      const key = insertItem(facts, facts.length, { topic: FACT_TOPICS.find((t) => !used.has(t)) ?? '', text: '' });
      store.touch('structure');
      app.rerender(key + ':text');
    },
  });

  return h(
    'div',
    { class: 'ed-tab' },
    section(
      'Ton histoire',
      h('p', { class: 'ed-lead' }, 'Quand un visiteur pose une question, ton personnage cherche la réponse ', h('b', null, 'dans tes propres textes'), '. Pas d’IA, rien d’inventé.'),
      field({ label: 'Raconte ta cabane', aside: null }, desc),
      meter,
      tips,
    ),
    section(
      'Questions fréquentes',
      h('p', { class: 'ed-lead' }, 'Les questions qu’on te pose vraiment au marché. Ce sont les réponses les plus précises.'),
      faq.length ? faqList : null,
      addFaq,
    ),
    section(
      'Petits faits',
      h('p', { class: 'ed-lead' }, 'Des phrases courtes rangées par sujet, parfaites pour les questions pratiques.'),
      topics,
      facts.length ? factList : null,
      addFact,
    ),
    scanSection(app),
  );
}

// ───────────────────────────── scan ─────────────────────────────

function scanSection(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;
  const site = d.website?.trim();
  const out = h('div', { class: 'ed-scan' });

  if (!SCAN_AVAILABLE) {
    const cmd = `npm run scan -- ${d.id || 'mon-identifiant'}`;
    out.append(
      note(
        'info',
        'Le scan de ton site se lance depuis ton ordinateur, dans le dossier du projet : ',
        h('code', { class: 'ed-code' }, cmd),
        ' (après avoir déposé ton fichier dans ',
        h('code', null, 'content/stalls/'),
        '). En lançant ',
        h('code', null, 'npm run dev'),
        ', tu peux aussi scanner directement depuis cet atelier.',
      ),
      button('Copier la commande', {
        small: true,
        icon: 'copy',
        onClick: () => {
          void navigator.clipboard?.writeText(cmd).then(
            () => app.toast('Commande copiée !', 'ok'),
            () => app.toast(cmd),
          );
        },
      }),
    );
  } else {
    const btn = button(scanning ? 'Je visite ton site…' : store.scan ? 'Scanner à nouveau' : 'Scanner mon site', {
      icon: 'search',
      variant: 'berry',
      disabled: scanning || !site || !isHttp(site),
      focusKey: 'scan',
      class: scanning ? 'is-busy' : '',
      onClick: async () => {
        if (!site) return;
        scanning = true;
        app.rerender('scan');
        try {
          const res = await scanSite(site, d.id, 12);
          store.scan = res;
          store.touch('structure');
          app.toast(`Scan terminé : ${res.products.length} produit${res.products.length > 1 ? 's' : ''}, ${res.chunks.length} texte${res.chunks.length > 1 ? 's' : ''}.`, 'ok');
        } catch (err) {
          app.toast(`Le scan n’a pas abouti : ${(err as Error).message}`, 'error');
        } finally {
          scanning = false;
          app.rerender('scan');
        }
      },
    });
    out.append(
      h(
        'div',
        { class: 'ed-scan__cta' },
        h(
          'p',
          { class: 'ed-lead' },
          site && isHttp(site)
            ? ['Je visite ', h('b', null, prettyHost(site)), ' (une douzaine de pages, en respectant robots.txt) pour trouver tes produits, tes coordonnées et des textes qui aideront ton personnage.']
            : ['Indique d’abord l’adresse de ton site dans l’onglet ', h('b', null, 'Identité'), '.'],
        ),
        btn,
      ),
    );
  }
  if (store.scan) out.append(scanResults(app));
  return section('Scanner mon site', out);
}

function scanResults(app: App): HTMLElement {
  const { store } = app;
  const scan = store.scan!;
  const d = store.draft;
  d.products ??= [];
  d.links ??= [];
  const have = new Set(d.products.filter((p) => p.url).map((p) => normalizeUrl(p.url!)));
  const haveLink = (url: string) => (d.links ?? []).some((l) => l.url.replace(/\/$/, '').toLowerCase() === url.replace(/\/$/, '').toLowerCase());

  const addProduct = (p: ScannedProduct) => {
    insertItem(d.products!, d.products!.length, { url: p.url, name: p.name, price: p.price, image: p.image, description: p.description?.slice(0, 400), ...(p.currency && p.currency !== 'EUR' ? { currency: p.currency } : {}) });
  };
  const addLink = (l: StallLink) => {
    if (!haveLink(l.url)) insertItem(d.links!, d.links!.length, l);
  };

  const products = scan.products.slice(0, 24);
  const fresh = products.filter((p) => !have.has(normalizeUrl(p.url)));
  const contacts: StallLink[] = [];
  if (scan.site.email) contacts.push({ label: scan.site.email, url: 'mailto:' + scan.site.email, kind: 'mail' });
  if (scan.site.phone) contacts.push({ label: scan.site.phone, url: 'tel:' + scan.site.phone.replace(/[^\d+]/g, ''), kind: 'phone' });
  for (const s of scan.site.social ?? []) if (safeUrl(s.url)) contacts.push(s);

  const when = (() => {
    try {
      return new Date(scan.scannedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return '';
    }
  })();

  return h(
    'div',
    { class: 'ed-scanres' },
    h(
      'div',
      { class: 'ed-scanres__stats' },
      stat(String(scan.products.length), 'produits'),
      stat(String(scan.chunks.length), 'textes trouvés'),
      stat(String(contacts.length), 'contacts'),
    ),
    h('p', { class: 'ed-hint' }, `Scan du ${when}${scan.site.title ? ` — « ${scan.site.title} »` : ''}. Ton personnage s’en sert déjà dans l’onglet Tester. `, 'Pour le marché, lance aussi ', h('code', null, `npm run scan -- ${d.id}`), ' : le résultat est enregistré dans ', h('code', null, 'content/generated/'), '.'),
    contacts.length
      ? h(
          'div',
          { class: 'ed-scanres__block' },
          h('h4', null, 'Coordonnées'),
          h(
            'ul',
            { class: 'ed-scanres__links' },
            contacts.map((c) =>
              h(
                'li',
                null,
                h('span', { class: 'ed-scanres__link' }, c.label, h('small', null, prettyHost(c.url))),
                haveLink(c.url)
                  ? h('span', { class: 'ed-pill ed-pill--ok' }, icon('check', 12), ' dans tes liens')
                  : button('Ajouter', {
                      small: true,
                      icon: 'plus',
                      variant: 'plain',
                      onClick: () => {
                        addLink(c);
                        store.touch('structure');
                        app.toast('Lien ajouté à ta fiche.', 'ok');
                        app.rerender();
                      },
                    }),
              ),
            ),
          ),
          scan.site.address ? h('p', { class: 'ed-hint' }, '📍 ', scan.site.address) : null,
        )
      : null,
    products.length
      ? h(
          'div',
          { class: 'ed-scanres__block' },
          h(
            'div',
            { class: 'ed-scanres__head' },
            h('h4', null, 'Produits trouvés'),
            fresh.length > 1
              ? button(`Tout ajouter (${fresh.length})`, {
                  small: true,
                  icon: 'plus',
                  variant: 'pine',
                  onClick: () => {
                    fresh.forEach(addProduct);
                    store.touch('structure');
                    app.toast(`${fresh.length} produits ajoutés à ton étal.`, 'ok');
                    app.rerender();
                  },
                })
              : null,
          ),
          h(
            'ul',
            { class: 'ed-scanres__products' },
            products.map((p) =>
              h(
                'li',
                { class: 'ed-found' },
                thumb(p.image),
                h('span', { class: 'ed-found__text' }, h('span', { class: 'ed-found__name' }, p.name), p.price !== undefined ? h('span', { class: 'ed-found__price' }, formatPrice(p.price, p.currency ?? 'EUR')) : null),
                have.has(normalizeUrl(p.url))
                  ? h('span', { class: 'ed-pill ed-pill--ok' }, icon('check', 12), ' sur l’étal')
                  : button('Ajouter', {
                      small: true,
                      icon: 'plus',
                      variant: 'plain',
                      onClick: () => {
                        addProduct(p);
                        store.touch('structure');
                        app.toast(`« ${p.name} » ajouté à ton étal.`, 'ok');
                        app.rerender();
                      },
                    }),
              ),
            ),
          ),
        )
      : h('p', { class: 'ed-hint' }, 'Aucun produit trouvé automatiquement : ajoute-les à la main dans l’onglet Produits.'),
    scan.warnings?.length
      ? h('details', { class: 'ed-tips' }, h('summary', null, `${scan.warnings.length} remarque${scan.warnings.length > 1 ? 's' : ''} du scanner`), h('ul', null, scan.warnings.slice(0, 12).map((w) => h('li', null, w))))
      : null,
  );
}

function stat(n: string, label: string) {
  return h('div', { class: 'ed-stat' }, h('b', null, n), h('span', null, label));
}
