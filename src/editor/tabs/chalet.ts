import { h, safeColor } from '../../ui/dom';
import { ACCENT_SWATCHES, AWNINGS, GARLANDS, ROOF_SWATCHES, SIGN_SWATCHES, SIGN_TEXT_SWATCHES, WOOD_SWATCHES } from '../catalog';
import { button, contrast, field, section, segmented, swatches, textInput, toggle } from '../fields';
import { icon } from '../icons';
import type { App } from '../types';

export function chaletTab(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;
  d.chalet ??= {};
  const ch = d.chalet;
  const eff = () => app.resolved().chalet;

  // ── live sign ──
  const signBoard = h('div', { class: 'ed-signboard', 'aria-hidden': 'true' }, h('span', { class: 'ed-signboard__star' }, '✦'), h('span', { class: 'ed-signboard__text' }), h('span', { class: 'ed-signboard__star' }, '✦'));
  const contrastNote = h('div', { class: 'ed-contrast', role: 'status' });
  const paintSign = () => {
    const bg = safeColor(ch.signColor, '#f3e6c8');
    const fg = safeColor(ch.signTextColor, '#4a2c1a');
    signBoard.style.setProperty('--bg', bg);
    signBoard.style.setProperty('--fg', fg);
    signBoard.querySelector('.ed-signboard__text')!.textContent = ch.sign?.trim() || d.name || 'Ma Cabane';
    const r = contrast(bg, fg);
    contrastNote.replaceChildren();
    if (r < 3) {
      contrastNote.className = 'ed-contrast is-bad';
      contrastNote.append(
        icon('alert', 16),
        h('span', null, 'Le texte risque d’être difficile à lire de loin.'),
        button('Choisir pour moi', {
          small: true,
          variant: 'plain',
          icon: 'wand',
          onClick: () => {
            const best = SIGN_TEXT_SWATCHES.map((s) => s.color).sort((a, b) => contrast(bg, b) - contrast(bg, a))[0];
            ch.signTextColor = best;
            store.touch('structure');
            app.rerender();
          },
        }),
      );
    } else {
      contrastNote.className = 'ed-contrast is-good';
      contrastNote.append(icon('check', 16), h('span', null, r > 6 ? 'Très lisible, même du bout de l’allée.' : 'Bien lisible.'));
    }
  };
  paintSign();

  const awningColorFields = h('div', { class: 'ed-grid2' });
  const fillAwning = () => {
    const e = eff().awningColors;
    ch.awningColors = [ch.awningColors?.[0] ?? e[0], ch.awningColors?.[1] ?? e[1]];
  };
  const paintAwning = () => {
    const a = ch.awning ?? 'stripes';
    awningColorFields.hidden = a === 'none';
    awningColorFields.classList.toggle('is-single', a === 'plain');
  };
  awningColorFields.append(
    field({ label: 'Couleur de l’auvent' }, swatches(store, 'chalet.awningColors.0', ACCENT_SWATCHES, { effective: () => eff().awningColors[0], onChange: fillAwning, small: true })),
    field({ label: 'Rayures', class: 'ed-awning2' }, swatches(store, 'chalet.awningColors.1', [{ color: '#f3ead8', name: 'Crème' }, { color: '#fff8ea', name: 'Blanc neige' }, ...ACCENT_SWATCHES.slice(0, 7), { color: '#5c3a26', name: 'Bois foncé' }], { effective: () => eff().awningColors[1], onChange: fillAwning, small: true })),
  );
  paintAwning();

  return h(
    'div',
    { class: 'ed-tab' },
    section(
      'Les couleurs',
      field({ label: 'Bois des murs' }, swatches(store, 'chalet.wood', WOOD_SWATCHES, { effective: () => eff().wood })),
      field({ label: 'Toit' }, swatches(store, 'chalet.roof', ROOF_SWATCHES, { effective: () => eff().roof })),
      field({ label: 'Couleur d’accent', hint: 'Les volets, les nœuds et les petits détails peints.' }, swatches(store, 'chalet.accent', ACCENT_SWATCHES, { effective: () => eff().accent })),
    ),
    section(
      'L’enseigne',
      signBoard,
      field(
        { label: 'Texte de l’enseigne', hint: 'Laisse vide pour reprendre le nom de ta cabane.' },
        textInput(store, 'chalet.sign', { id: 'f-sign', placeholder: d.name || 'Ma Cabane', maxLength: 32, onInput: paintSign }),
      ),
      h(
        'div',
        { class: 'ed-grid2' },
        field({ label: 'Fond' }, swatches(store, 'chalet.signColor', SIGN_SWATCHES, { effective: () => eff().signColor, onChange: paintSign, small: true })),
        field({ label: 'Lettres' }, swatches(store, 'chalet.signTextColor', SIGN_TEXT_SWATCHES, { effective: () => eff().signTextColor, onChange: paintSign, small: true })),
      ),
      contrastNote,
    ),
    section(
      'Lumières et auvent',
      field({ label: 'Guirlande lumineuse' }, segmented(store, 'chalet.garland', GARLANDS, { effective: () => 'warm' })),
      field({ label: 'Auvent' }, segmented(store, 'chalet.awning', AWNINGS, { effective: () => 'stripes', onChange: paintAwning })),
      awningColorFields,
      toggle(store, 'chalet.snow', { label: 'Neige sur le toit', hint: 'Un bon manteau blanc, avec quelques stalactites.', effective: true }),
    ),
  );
}
