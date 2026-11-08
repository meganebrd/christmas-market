import type { StallLink } from '../../config/types';
import { slugify } from '../../config/resolve';
import { h } from '../../ui/dom';
import { CATEGORIES, LINK_KINDS } from '../catalog';
import { button, field, iconButton, note, section, select, textInput } from '../fields';
import { icon } from '../icons';
import { insertItem, sortableList } from '../sortable';
import type { App } from '../types';
import { isHttp, isSafeLink, slugProblem } from '../validate';

const raw = (s: string) => s;

export function identityTab(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;

  // ── name & id ──
  const idInput = textInput(store, 'id', {
    id: 'f-id',
    parse: (s) => s,
    class: 'ed-input--mono',
    validate: (s) => slugProblem(s),
    onInput: () => {
      store.idEdited = true;
      relink.hidden = false;
    },
    autocomplete: 'off',
  });
  idInput.addEventListener('blur', () => {
    const clean = slugify(idInput.value);
    if (clean && clean !== idInput.value) {
      d.id = clean;
      idInput.dispatchEvent(new Event('ed:sync'));
      store.touch('field');
    }
  });
  const relink = iconButton('link', 'Déduire à nouveau l’identifiant du nom', () => {
    store.idEdited = false;
    store.syncIdFromName();
    idInput.dispatchEvent(new Event('ed:sync'));
    relink.hidden = true;
    store.touch('field');
  });
  relink.hidden = !store.idEdited;

  const nameInput = textInput(store, 'name', {
    id: 'f-name',
    parse: raw,
    placeholder: 'La Mèche Dorée',
    maxLength: 60,
    onInput: () => {
      if (!store.idEdited) {
        store.syncIdFromName();
        idInput.dispatchEvent(new Event('ed:sync'));
      }
    },
  });

  const idField = h(
    'div',
    { class: 'ed-idfield' },
    h('span', { class: 'ed-idfield__pre', 'aria-hidden': 'true' }, 'content/stalls/'),
    idInput,
    h('span', { class: 'ed-idfield__post', 'aria-hidden': 'true' }, '.json'),
    relink,
  );

  // ── order in the alley ──
  const alley = h('div', { class: 'ed-alley', 'aria-live': 'polite' });
  const paintAlley = () => {
    const mine = { id: d.id, name: d.name || 'Ta cabane', order: d.order ?? 99, me: true };
    const others = app.existing.filter((s) => s.id !== store.source && s.id !== d.id).map((s, i) => ({ id: s.id, name: s.name, order: s.order ?? i, me: false }));
    const all = [...others, mine].sort((a, b) => a.order - b.order || (a.me ? -1 : b.me ? 1 : a.id.localeCompare(b.id)));
    alley.replaceChildren(
      h('span', { class: 'ed-alley__gate' }, '🚪 Entrée'),
      ...all.map((s, i) =>
        h('span', { class: 'ed-alley__stall' + (s.me ? ' is-me' : ''), title: `${s.name} (ordre ${s.order})` }, h('b', null, String(i + 1)), ' ', s.me ? `${s.name} ★` : s.name),
      ),
    );
  };
  paintAlley();
  const orderInput = textInput(store, 'order', {
    id: 'f-order',
    type: 'number',
    placeholder: '99',
    class: 'ed-input--short',
    parse: (s) => {
      const n = Number(s.replace(',', '.').trim());
      return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
    },
    onInput: paintAlley,
  });

  // ── links ──
  d.links ??= [];
  const links = d.links;
  const linkList = sortableList<StallLink>({
    items: links,
    listLabel: 'Liens',
    name: (l, i) => `le lien ${l.label || i + 1}`,
    onChange: (_w, key, removed) => app.listChanged(key, removed),
    class: 'ed-sortable--links',
    render: (l, i, key) => {
      const kind = select(store, `links.${i}.kind`, LINK_KINDS, {
        id: `f-link-kind-${i}`,
        focusKey: key + ':kind',
        class: 'ed-select--kind',
        empty: '🔗  Type…',
        onChange: (v) => {
          const prev = LINK_KINDS.find((k) => k.label === l.label);
          if (v && (!l.label || prev)) {
            l.label = LINK_KINDS.find((k) => k.value === v)!.label;
            label.dispatchEvent(new Event('ed:sync'));
          }
        },
      });
      const label = textInput(store, `links.${i}.label`, { id: `f-link-label-${i}`, focusKey: key + ':label', placeholder: 'Texte du bouton', parse: raw });
      const url = textInput(store, `links.${i}.url`, {
        id: `f-link-url-${i}`,
        focusKey: key + ':url',
        type: 'url',
        parse: raw,
        placeholder: l.kind === 'mail' ? 'bonjour@exemple.fr' : l.kind === 'phone' ? '+33 6 12 34 56 78' : 'https://…',
        validate: (s) => (s.trim() && !isSafeLink(s) ? 'Commence par https://, mailto: ou tel:' : null),
      });
      url.addEventListener('blur', () => {
        const fixed = fixLink(url.value, l.kind);
        if (fixed !== url.value) {
          l.url = fixed;
          url.dispatchEvent(new Event('ed:sync'));
          store.touch('field');
        }
      });
      return h(
        'div',
        { class: 'ed-linkrow' },
        h('label', { class: 'ed-sr', for: kind.id }, 'Type de lien'),
        kind,
        h('label', { class: 'ed-sr', for: label.id }, 'Texte du lien'),
        label,
        h('label', { class: 'ed-sr', for: url.id }, 'Adresse du lien'),
        url,
      );
    },
  });

  const addLink = button('Ajouter un lien', {
    icon: 'plus',
    small: true,
    focusKey: 'add-link',
    onClick: () => {
      const k = insertItem(links, links.length, { label: '', url: '', kind: 'instagram' } as StallLink);
      links[links.length - 1].label = 'Instagram';
      store.touch('structure');
      app.rerender(k + ':url');
    },
  });

  return h(
    'div',
    { class: 'ed-tab' },
    section(
      'Ta cabane',
      field({ label: 'Nom de la boutique', hint: 'Il est peint sur l’enseigne de ta cabane.' }, nameInput),
      field({ label: 'Phrase d’accroche', hint: 'Une ligne qui donne envie d’approcher.' }, textInput(store, 'tagline', { id: 'f-tagline', placeholder: 'Bougies parfumées coulées à la main', maxLength: 110 })),
      h(
        'div',
        { class: 'ed-grid2' },
        field({ label: 'Catégorie' }, select(store, 'category', CATEGORIES, { id: 'f-category', empty: '— Choisir —' })),
        field({ label: 'Place dans l’allée', hint: 'Plus le nombre est petit, plus tu es près de l’entrée.' }, orderInput),
      ),
      alley,
      field(
        {
          label: 'Identifiant',
          hint: store.idEdited ? 'C’est aussi le nom du fichier. Minuscules, chiffres et tirets.' : 'Il se remplit tout seul à partir du nom. C’est aussi le nom du fichier.',
          for: 'f-id',
        },
        idField,
      ),
    ),
    section(
      'Sur le web',
      field(
        { label: 'Ton site', hint: 'Le bouton « Visiter le site » de ta cabane. Il sert aussi au scan.' },
        textInput(store, 'website', { id: 'f-website', type: 'url', placeholder: 'https://ma-boutique.fr', validate: (s) => (s.trim() && !isHttp(s.trim()) ? 'L’adresse doit commencer par https://' : null) }),
      ),
      h('div', { class: 'ed-field' }, h('div', { class: 'ed-field__head' }, h('span', { class: 'ed-label' }, 'Autres liens'), h('span', { class: 'ed-counter' }, `${links.length}`)), links.length ? linkList : note('info', 'Instagram, Etsy, ton e-mail… Ils apparaissent sur ta fiche, dans l’ordre de la liste.'), addLink),
    ),
    store.source === 'new'
      ? null
      : note('info', 'Tu modifies une cabane du marché. ', h('b', null, 'Exporter'), ' te donne le fichier à remettre à sa place dans ', h('code', null, 'content/stalls/'), '.'),
    h('p', { class: 'ed-foot' }, icon('info', 14), ' Tout est enregistré automatiquement dans ce navigateur.'),
  );
}

/** "monsite.fr" → "https://monsite.fr", "a@b.fr" → "mailto:a@b.fr", "06 12…" → "tel:0612…". */
export function fixLink(v: string, kind?: StallLink['kind']): string {
  const t = v.trim();
  if (!t || /^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (kind === 'mail' || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return 'mailto:' + t;
  if (kind === 'phone' || /^\+?[\d\s.()-]{8,}$/.test(t)) return 'tel:' + t.replace(/[^\d+]/g, '');
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) return 'https://' + t;
  return t;
}
