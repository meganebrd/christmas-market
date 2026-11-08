import type { CharacterAppearance } from '../../config/types';
import { h } from '../../ui/dom';
import {
  ACCESSORIES,
  CLOTH_SWATCHES,
  HAIR_STYLES,
  HAIR_SWATCHES,
  HATS,
  MOODS,
  OUTFITS,
  SCARF_SWATCHES,
  SKIN_SWATCHES,
} from '../catalog';
import { button, counter, field, section, segmented, slider, swatches, textArea, textInput } from '../fields';
import { insertItem, sortableList } from '../sortable';
import type { App } from '../types';

const raw = (s: string) => s;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export function characterTab(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;
  const owner = d.owner;
  owner.appearance ??= {};
  const eff = () => app.resolved().owner.appearance;

  const bio = textArea(store, 'owner.bio', { id: 'f-owner-bio', rows: 2, maxLength: 320, placeholder: 'Margot coule ses bougies dans l’ancienne laiterie depuis 2016…' });

  const moodHint = h('span', { class: 'ed-hint--mood' });
  const paintMood = () => {
    const m = MOODS.find((x) => x.value === (owner.mood ?? 'chaleureux'));
    moodHint.textContent = m ? `${m.icon} ${m.label} : ${m.hint}.` : '';
  };
  paintMood();

  const appearance = (path: keyof CharacterAppearance) => `owner.appearance.${path}`;
  const hatColorField = field({ label: 'Couleur du chapeau' }, swatches(store, appearance('hatColor'), SCARF_SWATCHES.concat(CLOTH_SWATCHES.slice(0, 6)), { effective: () => eff().hatColor, small: true }));
  const paintHat = () => hatColorField.classList.toggle('is-dim', (owner.appearance?.hat ?? eff().hat) === 'none');
  paintHat();

  const surprise = button('Surprise !', {
    icon: 'dice',
    variant: 'gold',
    focusKey: 'surprise',
    onClick: () => {
      const hat = pick(HATS).value;
      const a: CharacterAppearance = {
        skin: pick(SKIN_SWATCHES).color,
        hair: pick(HAIR_SWATCHES.slice(0, 8)).color,
        hairStyle: pick(HAIR_STYLES.slice(0, 7)).value,
        outfit: pick(OUTFITS).value,
        outfitColor: pick(CLOTH_SWATCHES).color,
        outfitColor2: pick(['#3b3340', '#f3ead8', '#2b2b3a', '#4b3a2e', '#6b4f3a']),
        scarf: Math.random() < 0.8 ? pick(SCARF_SWATCHES).color : null,
        hat: Math.random() < 0.15 ? 'none' : hat === 'chef' || hat === 'tophat' ? (Math.random() < 0.5 ? hat : 'bobble') : hat,
        hatColor: pick(SCARF_SWATCHES).color,
        accessory: Math.random() < 0.55 ? 'none' : pick(ACCESSORIES).value,
        beard: Math.random() < 0.22 ? pick(HAIR_SWATCHES.slice(0, 7)).color : null,
        height: Math.round((0.9 + Math.random() * 0.2) * 100) / 100,
        build: Math.round((0.9 + Math.random() * 0.25) * 100) / 100,
      };
      owner.appearance = a;
      store.touch('structure');
      app.rerender('surprise');
      setTimeout(() => app.preview?.emote('happy'), 450);
    },
  });

  return h(
    'div',
    { class: 'ed-tab' },
    section(
      'Qui tient la cabane ?',
      h(
        'div',
        { class: 'ed-grid2' },
        field({ label: 'Prénom et nom' }, textInput(store, 'owner.name', { id: 'f-owner-name', parse: raw, placeholder: 'Margot Lenoir', maxLength: 50 })),
        field({ label: 'Métier' }, textInput(store, 'owner.role', { id: 'f-owner-role', placeholder: 'Ciergière', maxLength: 40 })),
      ),
      field({ label: 'Petite bio', hint: 'Deux phrases, affichées sur ta fiche (à la 3ᵉ personne, c’est plus joli).', aside: counter(bio) }, bio),
    ),
    section(
      'Son caractère',
      field({ label: 'Humeur', hint: moodHint }, segmented(store, 'owner.mood', MOODS, { effective: () => 'chaleureux', onChange: paintMood })),
      field(
        { label: 'Voix', hint: 'La hauteur des petits bruits de voix quand ton personnage parle.' },
        slider(store, 'owner.voicePitch', { min: 0.6, max: 1.6, step: 0.05, effective: () => app.resolved().owner.voicePitch, format: (v) => (v < 0.85 ? 'grave' : v > 1.25 ? 'aiguë' : 'moyenne'), left: 'Grave', right: 'Aiguë' }),
      ),
    ),
    section(
      'Ce que ton personnage dit',
      stringList(app, 'greetings', 'Quand on approche', 'Bonsoir ! Approche, sens un peu…', 'Ajouter un bonjour', 'Une phrase est tirée au hasard. Sans phrase, une salutation est inventée avec le nom de ta cabane.'),
      stringList(app, 'farewells', 'Quand on s’en va', 'Belle soirée au marché !', 'Ajouter un au revoir'),
    ),
    section(
      'Son allure',
      h('div', { class: 'ed-surprise' }, h('p', { class: 'ed-hint' }, 'Chaque choix s’affiche tout de suite dans l’aperçu. En panne d’idée ?'), surprise),
      field({ label: 'Peau' }, swatches(store, appearance('skin'), SKIN_SWATCHES, { effective: () => eff().skin })),
      h(
        'div',
        { class: 'ed-subgroup' },
        field({ label: 'Coiffure' }, segmented(store, appearance('hairStyle'), HAIR_STYLES, { effective: () => eff().hairStyle, compact: true })),
        field({ label: 'Couleur des cheveux' }, swatches(store, appearance('hair'), HAIR_SWATCHES, { effective: () => eff().hair })),
      ),
      h(
        'div',
        { class: 'ed-subgroup' },
        field({ label: 'Tenue' }, segmented(store, appearance('outfit'), OUTFITS, { effective: () => eff().outfit, compact: true })),
        field({ label: 'Couleur principale' }, swatches(store, appearance('outfitColor'), CLOTH_SWATCHES, { effective: () => eff().outfitColor })),
        field({ label: 'Deuxième couleur', hint: 'Pantalon, jupe ou motif.' }, swatches(store, appearance('outfitColor2'), [{ color: '#2b2b3a', name: 'Encre' }, { color: '#4b3a2e', name: 'Brun' }, ...CLOTH_SWATCHES], { effective: () => eff().outfitColor2, small: true })),
      ),
      field({ label: 'Écharpe' }, swatches(store, appearance('scarf'), SCARF_SWATCHES, { effective: () => eff().scarf, none: 'Pas d’écharpe' })),
      h(
        'div',
        { class: 'ed-subgroup' },
        field({ label: 'Chapeau' }, segmented(store, appearance('hat'), HATS, { effective: () => eff().hat, compact: true, onChange: paintHat })),
        hatColorField,
      ),
      field({ label: 'Accessoire' }, segmented(store, appearance('accessory'), ACCESSORIES, { effective: () => eff().accessory, compact: true })),
      field({ label: 'Barbe' }, swatches(store, appearance('beard'), HAIR_SWATCHES.slice(0, 8), { effective: () => eff().beard, none: 'Pas de barbe' })),
      h(
        'div',
        { class: 'ed-grid2' },
        field({ label: 'Taille' }, slider(store, appearance('height'), { min: 0.85, max: 1.15, step: 0.01, effective: () => eff().height, format: (v) => (v < 0.95 ? 'petit·e' : v > 1.06 ? 'grand·e' : 'moyenne'), left: '', right: '' })),
        field({ label: 'Silhouette' }, slider(store, appearance('build'), { min: 0.85, max: 1.2, step: 0.01, effective: () => eff().build, format: (v) => (v < 0.95 ? 'menue' : v > 1.08 ? 'ronde' : 'moyenne'), left: '', right: '' })),
      ),
    ),
  );
}

function stringList(app: App, key: 'greetings' | 'farewells', label: string, placeholder: string, addLabel: string, hint?: string): HTMLElement {
  const { store } = app;
  const arr = (store.draft.owner[key] ??= []);
  const list = sortableList<string>({
    items: arr,
    listLabel: label,
    name: (s, i) => `la phrase ${i + 1}`,
    onChange: (_w, k, removed) => app.listChanged(k, removed),
    class: 'ed-sortable--compact',
    render: (_s, i, k) => {
      const input = textInput(store, `owner.${key}.${i}`, { id: `f-${key}-${i}`, focusKey: k + ':text', parse: (s) => s, placeholder, maxLength: 220 });
      return h('div', null, h('label', { class: 'ed-sr', for: input.id }, `${label}, phrase ${i + 1}`), input);
    },
  });
  const add = button(addLabel, {
    icon: 'plus',
    small: true,
    focusKey: 'add-' + key,
    onClick: () => {
      const k = insertItem(arr, arr.length, '');
      store.touch('structure');
      app.rerender(k + ':text');
    },
  });
  return h(
    'div',
    { class: 'ed-field' },
    h('div', { class: 'ed-field__head' }, h('span', { class: 'ed-label' }, label)),
    arr.length ? list : null,
    add,
    hint ? h('p', { class: 'ed-hint' }, hint) : null,
  );
}
