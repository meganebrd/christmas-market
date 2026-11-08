import type { ProductConfig, ResolvedProduct } from '../../config/types';
import { assetUrl } from '../../config/load';
import { formatPrice, parsePrice } from '../../config/resolve';
import { h, safeImage } from '../../ui/dom';
import { layoutProducts } from '../../world/stalls';
import { MAX_PRODUCTS } from '../catalog';
import { button, counter, field, note, section, textArea, textInput, toggle } from '../fields';
import { icon } from '../icons';
import { announce, insertItem, sortableList } from '../sortable';
import { normalizeUrl, SCAN_AVAILABLE, scanSite } from '../scan';
import type { App } from '../types';
import { isHttp } from '../validate';

const raw = (s: string) => s;

/** "12,50" → 12.5 (number); "dès 12 €" stays a string; "" → undefined. */
export function parsePriceInput(s: string): number | string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  if (/^\d+(?:[.,]\d{1,2})?$/.test(t)) return Number(t.replace(',', '.'));
  return s;
}

export function thumb(src: string | undefined, size: 'small' | 'big' = 'small'): HTMLElement {
  const safe = safeImage(assetUrl(src?.trim()));
  const box = h('span', { class: `ed-thumb ed-thumb--${size}` });
  if (!safe) {
    box.classList.add('is-empty');
    box.append(icon(src ? 'alert' : 'gift', size === 'big' ? 28 : 20));
    if (src) box.title = 'Adresse d’image invalide';
    return box;
  }
  const img = h('img', { src: safe, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
  img.addEventListener('error', () => {
    box.classList.add('is-empty', 'is-broken');
    box.title = 'Image introuvable';
    img.replaceWith(icon('alert', size === 'big' ? 28 : 20));
  });
  box.append(img);
  return box;
}

export function productsTab(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;
  d.products ??= [];
  const products = d.products;

  // where each product lands on the stall
  const resolved = app.resolved();
  const scannedByUrl = new Map((store.scan?.products ?? []).map((p) => [normalizeUrl(p.url), p]));
  const resolvedOf = new Map<ProductConfig, ResolvedProduct>();
  let j = 0;
  if (products.length) {
    for (const c of products) {
      const name = c.name?.trim() ? c.name : c.url ? scannedByUrl.get(normalizeUrl(c.url))?.name : undefined;
      if (name && resolved.products[j]) resolvedOf.set(c, resolved.products[j++]);
    }
  }
  const spots = new Map<ResolvedProduct, 'counter' | 'shelf'>();
  for (const pl of layoutProducts(resolved.products)) spots.set(pl.product, pl.spot.kind);

  const list = sortableList<ProductConfig>({
    items: products,
    listLabel: 'Tes produits, dans l’ordre de l’étal',
    name: (p, i) => (p.name?.trim() ? `« ${p.name} »` : `le produit ${i + 1}`),
    onChange: (_w, key, removed) => app.listChanged(key, removed),
    class: 'ed-sortable--products',
    removeLabel: 'Retirer',
    render: (p, i, key) => productRow(app, p, i, key, resolvedOf.get(p), spots),
  });

  // ── paste several links ──
  const bulk = h('textarea', { class: 'ed-input ed-textarea', rows: 3, placeholder: 'https://ma-boutique.fr/produits/bougie-sapin\nhttps://ma-boutique.fr/produits/coffret', id: 'f-bulk' });
  const bulkBox = h(
    'details',
    { class: 'ed-bulk' },
    h('summary', null, icon('link', 16), ' Coller plusieurs liens d’un coup'),
    h('label', { class: 'ed-hint', for: 'f-bulk' }, 'Un lien par ligne. Le scan complètera le nom, la photo et le prix.'),
    bulk,
    button('Ajouter ces liens', {
      small: true,
      icon: 'plus',
      onClick: () => {
        const urls = bulk.value.split(/\s+/).map((u) => u.trim()).filter((u) => isHttp(u));
        if (!urls.length) return app.toast('Aucun lien https:// trouvé.', 'warn');
        let last = '';
        for (const url of urls) if (!products.some((p) => p.url && normalizeUrl(p.url) === normalizeUrl(url))) last = insertItem(products, products.length, { url });
        store.touch('structure');
        app.toast(`${urls.length} lien${urls.length > 1 ? 's' : ''} ajouté${urls.length > 1 ? 's' : ''}.`, 'ok');
        app.rerender(last ? last + ':grip' : undefined);
      },
    }),
  );

  const add = button('Ajouter un produit', {
    icon: 'plus',
    variant: 'pine',
    focusKey: 'add-product',
    onClick: () => {
      const k = insertItem(products, products.length, { name: '', url: '' });
      app.expanded.add(k);
      store.touch('structure');
      app.rerender(k + ':name');
      announce(`Produit ${products.length} ajouté.`);
    },
  });

  const auto = !products.length && resolved.products.length;
  return h(
    'div',
    { class: 'ed-tab' },
    section(
      `Tes produits (${products.length})`,
      note(
        'tip',
        h('b', null, 'L’ordre de la liste est l’ordre de l’étal. '),
        'Les premiers vont sur le comptoir (les ',
        icon('star', 13, 'ed-inline-star'),
        ' « en vitrine » passent devant), les suivants sur les étagères du fond. ',
        `${MAX_PRODUCTS} produits au maximum sur l’étal, tous restent visibles dans la vitrine.`,
      ),
      auto ? note('info', `Tu n’as listé aucun produit : les ${resolved.products.length} premiers trouvés sur ton site sont affichés.`) : null,
      products.length ? list : note('info', 'Pas encore de produit. Ajoute-en un, ou scanne ton site dans l’onglet « Savoir ».'),
      h('div', { class: 'ed-actions' }, add),
      bulkBox,
    ),
  );
}

function productRow(app: App, p: ProductConfig, i: number, key: string, rp: ResolvedProduct | undefined, spots: Map<ResolvedProduct, 'counter' | 'shelf'>): HTMLElement {
  const { store } = app;
  const open = app.expanded.has(key);
  const spot = rp ? spots.get(rp) : undefined;
  const badge = !rp
    ? h('span', { class: 'ed-pill ed-pill--warn' }, 'sans nom : invisible')
    : spot === 'counter'
      ? h('span', { class: 'ed-pill ed-pill--gold' }, p.featured ? '★ comptoir, devant' : 'comptoir')
      : spot === 'shelf'
        ? h('span', { class: 'ed-pill' }, 'étagère')
        : h('span', { class: 'ed-pill ed-pill--muted' }, 'vitrine seulement');

  const priceLabel = rp?.priceLabel ?? (p.price !== undefined ? (typeof p.price === 'number' ? formatPrice(p.price) : p.price) : undefined);
  const title = h('span', { class: 'ed-prod__name' + (p.name?.trim() ? '' : ' is-empty') }, p.name?.trim() || rp?.name || 'Produit sans nom');
  const star = h(
    'button',
    { type: 'button', class: 'ed-star' + (p.featured ? ' is-on' : ''), 'aria-pressed': p.featured ? 'true' : 'false', 'aria-label': `Mettre ${p.name || 'ce produit'} en vitrine`, title: 'En vitrine : devant, sur le comptoir', dataset: { focusKey: key + ':star' } },
    icon('star', 18),
  );
  star.addEventListener('click', () => {
    if (p.featured) delete p.featured;
    else p.featured = true;
    store.touch('structure');
    app.rerender(key + ':star');
  });
  const expand = h(
    'button',
    { type: 'button', class: 'ed-prod__toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': `prod-body-${key}`, dataset: { focusKey: key + ':toggle' } },
    thumb(p.image ?? rp?.image),
    h('span', { class: 'ed-prod__text' }, title, h('span', { class: 'ed-prod__meta' }, priceLabel ? h('span', { class: 'ed-prod__price' }, priceLabel) : null, badge)),
    icon('chevron', 18, 'ed-prod__chev'),
  );
  expand.addEventListener('click', () => {
    if (app.expanded.has(key)) app.expanded.delete(key);
    else app.expanded.add(key);
    app.rerender(key + ':toggle');
  });

  let body: HTMLElement | null = null;
  if (open) {
    const nameIn = textInput(store, `products.${i}.name`, { id: `f-prod-name-${i}`, focusKey: key + ':name', placeholder: rp?.name ?? 'Bougie « Forêt sous la neige »', maxLength: 80, onInput: (v) => (title.textContent = (v as string) || 'Produit sans nom') });
    const priceIn = textInput(store, `products.${i}.price`, {
      id: `f-prod-price-${i}`,
      focusKey: key + ':price',
      placeholder: '24 ou « dès 12 € »',
      parse: parsePriceInput,
      format: (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v === undefined ? '' : String(v)),
      class: 'ed-input--short',
      validate: (s) => (s.trim() && parsePrice(s) === undefined && !/€|eur|\d/i.test(s) ? 'Un nombre (ex. 12,50) ou un petit texte avec un prix.' : null),
    });
    const imgPreview = h('div', { class: 'ed-prod__imgprev' }, thumb(p.image, 'big'));
    const imageIn = textInput(store, `products.${i}.image`, {
      id: `f-prod-image-${i}`,
      focusKey: key + ':image',
      type: 'url',
      placeholder: 'https://… ou /demo/products/honey.svg',
      validate: (s) => (s.trim() && !safeImage(assetUrl(s.trim())) ? 'Ce n’est pas une adresse d’image valide.' : null),
      onInput: () => {
        clearTimeout((imageIn as any)._t);
        (imageIn as any)._t = setTimeout(() => imgPreview.replaceChildren(thumb(p.image, 'big')), 350);
      },
    });
    const urlIn = textInput(store, `products.${i}.url`, {
      id: `f-prod-url-${i}`,
      focusKey: key + ':url',
      type: 'url',
      placeholder: 'https://ma-boutique.fr/produits/…',
      parse: raw,
      validate: (s) => (s.trim() && !isHttp(s.trim()) ? 'Le lien doit commencer par https://' : null),
    });
    urlIn.addEventListener('blur', () => {
      const t = urlIn.value.trim();
      if (t && !/^https?:/i.test(t) && /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) {
        p.url = 'https://' + t;
        urlIn.dispatchEvent(new Event('ed:sync'));
        store.touch('field');
      }
    });
    const desc = textArea(store, `products.${i}.description`, { id: `f-prod-desc-${i}`, focusKey: key + ':desc', rows: 2, maxLength: 400, placeholder: 'Sapin, cèdre et une pointe de mandarine. 40 heures de combustion.' });

    const fill = SCAN_AVAILABLE
      ? button('Compléter depuis la page', {
          small: true,
          icon: 'sparkle',
          variant: 'plain',
          focusKey: key + ':fill',
          onClick: async (e) => {
            const b = e.currentTarget as HTMLButtonElement;
            const url = p.url?.trim();
            if (!url || !isHttp(url)) return app.toast('Mets d’abord le lien de la page du produit.', 'warn');
            b.disabled = true;
            b.classList.add('is-busy');
            b.querySelector('span')!.textContent = 'Je lis la page…';
            try {
              const res = await scanSite(url, store.draft.id, 1, 45000);
              const found = res.products.find((x) => normalizeUrl(x.url) === normalizeUrl(url)) ?? res.products[0];
              if (!found) {
                app.toast('Je n’ai pas trouvé de produit sur cette page.', 'warn');
                return;
              }
              const filled: string[] = [];
              if (!p.name?.trim() && found.name) (p.name = found.name), filled.push('le nom');
              if (p.price === undefined && found.price !== undefined) (p.price = found.price), filled.push('le prix');
              if (!p.currency && found.currency && found.currency !== 'EUR') p.currency = found.currency;
              if (!p.image?.trim() && found.image) (p.image = found.image), filled.push('la photo');
              if (!p.description?.trim() && found.description) (p.description = found.description.slice(0, 400)), filled.push('la description');
              store.touch('structure');
              app.toast(filled.length ? `J’ai ajouté ${filled.join(', ')}.` : 'Tout était déjà rempli !', 'ok');
              app.rerender(key + ':fill');
            } catch (err) {
              app.toast(`Lecture impossible : ${(err as Error).message}`, 'error');
            } finally {
              if (b.isConnected) {
                b.disabled = false;
                b.classList.remove('is-busy');
                b.querySelector('span')!.textContent = 'Compléter depuis la page';
              }
            }
          },
        })
      : null;

    body = h(
      'div',
      { class: 'ed-prod__body', id: `prod-body-${key}` },
      field({ label: 'Lien de la page du produit', hint: SCAN_AVAILABLE ? 'Le bouton lit la page et remplit ce qui manque.' : 'Le visiteur arrive sur cette page en cliquant sur le produit.' }, urlIn),
      fill ? h('div', { class: 'ed-fill' }, fill) : null,
      h('div', { class: 'ed-grid2 ed-grid2--wide' }, field({ label: 'Nom' }, nameIn), field({ label: 'Prix (€)' }, priceIn)),
      h('div', { class: 'ed-prod__imgrow' }, imgPreview, field({ label: 'Photo (adresse de l’image)', hint: 'Si le serveur de l’image refuse le partage, un joli paquet cadeau la remplace sur l’étal.' }, imageIn)),
      field({ label: 'Description', aside: counter(desc) }, desc),
      toggle(store, `products.${i}.featured`, {
        label: 'En vitrine',
        hint: 'Devant, sur le comptoir.',
        onChange: (v) => {
          if (!v) delete p.featured;
          queueMicrotask(() => app.rerender(key + ':toggle'));
        },
      }),
    );
  }

  return h('div', { class: 'ed-prod' + (open ? ' is-open' : '') }, h('div', { class: 'ed-prod__head' }, expand, star), body);
}
