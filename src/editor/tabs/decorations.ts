import type { DecorationItem, DecorationType, DecoSlot } from '../../config/types';
import { h, s, safeColor } from '../../ui/dom';
import { assignSlots, DECORATIONS } from '../../world/stalls';
import { DECO_ORDER, DECO_SWATCHES, DECOS, MAX_DECORATIONS, SLOT_LABEL, SLOT_POS, SLOTS } from '../catalog';
import { button, note, section, select, swatches, textInput } from '../fields';
import { decoArt, icon } from '../icons';
import { announce, insertItem, keysOf, sortableList } from '../sortable';
import type { App } from '../types';

const openColors = new Set<string>();

export function decorationsTab(app: App): HTMLElement {
  const { store } = app;
  const d = store.draft;
  d.decorations ??= [];
  const decos = d.decorations;
  const keys = keysOf(decos);

  const assigned = assignSlots(decos.slice(0, MAX_DECORATIONS));
  const slotOf = new Map<DecorationItem, DecoSlot>(assigned.map((a) => [a.item, a.slot]));
  const explicitTaken = new Map<DecoSlot, number>();
  decos.forEach((it, i) => {
    if (it.slot && !explicitTaken.has(it.slot)) explicitTaken.set(it.slot, i);
  });

  // ── catalogue ──
  const counts = new Map<DecorationType, number>();
  for (const it of decos) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  const full = decos.length >= MAX_DECORATIONS;
  const catalogue = h(
    'div',
    { class: 'ed-catalogue', role: 'list', 'aria-label': 'Catalogue des décorations' },
    DECO_ORDER.map((type) => {
      const info = DECOS[type];
      const n = counts.get(type) ?? 0;
      const b = h(
        'button',
        { type: 'button', class: 'ed-cat', role: 'listitem', title: `Ajouter : ${info.label} — ${info.hint}`, 'aria-label': `Ajouter ${info.label}${n ? ` (déjà ${n})` : ''}`, dataset: { focusKey: 'cat-' + type } },
        h('span', { class: 'ed-cat__art' }, decoArt(type, 40)),
        h('span', { class: 'ed-cat__label' }, info.label),
        n ? h('span', { class: 'ed-cat__count', 'aria-hidden': 'true' }, String(n)) : null,
        h('span', { class: 'ed-cat__plus', 'aria-hidden': 'true' }, icon('plus', 14)),
      );
      b.addEventListener('click', () => {
        const item: DecorationItem = { type };
        if (info.text) item.text = type === 'chalkboard' ? 'Fait main !' : '';
        insertItem(decos, decos.length, item);
        store.touch('structure');
        announce(`${info.label} : ajout en position ${decos.length}.`);
        app.toast(decos.length > MAX_DECORATIONS ? `« ${info.label} » est dans la liste, mais il n’y a plus de place sur la cabane.` : `« ${info.label} » rejoint ta cabane !`, decos.length > MAX_DECORATIONS ? 'warn' : 'ok');
        app.rerender('cat-' + type);
        // a little bounce on the new row
        requestAnimationFrame(() => document.querySelector('.ed-sortable--decos > .ed-row:last-child')?.classList.add('is-new'));
      });
      return b;
    }),
  );

  // ── slot map ──
  const map = slotMap(decos, slotOf);

  // ── list ──
  const list = sortableList<DecorationItem>({
    items: decos,
    listLabel: 'Décorations de ta cabane, dans l’ordre',
    name: (it) => DECOS[it.type]?.label ?? it.type,
    onChange: (_w, key, removed) => app.listChanged(key, removed),
    class: 'ed-sortable--decos',
    rowClass: (it) => (slotOf.has(it) ? '' : 'is-homeless'),
    render: (it, i, key) => {
      const info = DECOS[it.type] ?? { label: it.type, hint: '', colorOf: 'la couleur' };
      const where = slotOf.get(it);
      const slotOptions = SLOTS.map((o) => {
        const by = explicitTaken.get(o.value);
        return { value: o.value, label: o.label + (by !== undefined && by !== i ? ' · déjà pris' : '') };
      });
      const slotSel = select(store, `decorations.${i}.slot`, slotOptions, {
        id: `f-deco-slot-${i}`,
        empty: where && !it.slot ? `Automatique → ${SLOT_LABEL[where]}` : 'Automatique',
        focusKey: key + ':slot',
        class: 'ed-select--slot',
        onChange: () => queueMicrotask(() => app.rerender(key + ':slot')),
      });
      const defColor = DECORATIONS[it.type]?.color ?? '#c0392b';
      const colorOpen = openColors.has(key);
      const colorBtn = h(
        'button',
        {
          type: 'button',
          class: 'ed-colorbtn' + (it.color ? ' is-set' : ''),
          style: { '--c': safeColor(it.color, defColor) },
          'aria-expanded': colorOpen ? 'true' : 'false',
          'aria-label': `Couleur de ${info.label} (${info.colorOf})`,
          title: `Couleur : ${info.colorOf}`,
          dataset: { focusKey: key + ':color' },
        },
        h('span', { class: 'ed-colorbtn__dot' }),
      );
      colorBtn.addEventListener('click', () => {
        if (openColors.has(key)) openColors.delete(key);
        else openColors.add(key);
        app.rerender(key + ':color');
      });
      const colorRow = colorOpen
        ? h(
            'div',
            { class: 'ed-deco__colors' },
            h('span', { class: 'ed-hint' }, `Couleur de ${info.colorOf} :`),
            swatches(store, `decorations.${i}.color`, DECO_SWATCHES, { effective: () => defColor, small: true, label: `Couleur de ${info.label}`, onChange: () => colorBtn.style.setProperty('--c', safeColor(it.color, defColor)) }),
            it.color
              ? button('D’origine', {
                  small: true,
                  variant: 'plain',
                  icon: 'undo',
                  onClick: () => {
                    delete it.color;
                    store.touch('structure');
                    app.rerender(key + ':color');
                  },
                })
              : null,
          )
        : null;
      const text = info.text
        ? textInput(store, `decorations.${i}.text`, { id: `f-deco-text-${i}`, focusKey: key + ':text', placeholder: it.type === 'chalkboard' ? 'Bougies coulées main' : 'Texte (facultatif)', maxLength: 28, class: 'ed-input--small' })
        : null;
      return h(
        'div',
        { class: 'ed-deco', dataset: { slot: where ?? '' } },
        h('span', { class: 'ed-deco__num', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'ed-deco__art' }, decoArt(it.type, 34)),
        h(
          'div',
          { class: 'ed-deco__main' },
          h('div', { class: 'ed-deco__title' }, info.label, i >= MAX_DECORATIONS || !where ? h('span', { class: 'ed-pill ed-pill--warn' }, 'pas de place') : null),
          h('div', { class: 'ed-deco__controls' }, h('label', { class: 'ed-sr', for: slotSel.id }, `Emplacement de ${info.label}`), slotSel, colorBtn, text ? h('label', { class: 'ed-sr', for: text.id }, `Texte de ${info.label}`) : null, text),
          colorRow,
        ),
      );
    },
  });

  // highlight the dot of the hovered/focused row
  const highlight = (slot: string | undefined) => {
    for (const el of map.querySelectorAll('.ed-slotmap__slot')) el.classList.toggle('is-hl', !!slot && (el as SVGElement).dataset.slot === slot);
  };
  list.addEventListener('pointerover', (e) => highlight((e.target as HTMLElement).closest<HTMLElement>('.ed-row')?.querySelector<HTMLElement>('.ed-deco')?.dataset.slot));
  list.addEventListener('pointerleave', () => highlight(undefined));
  list.addEventListener('focusin', (e) => highlight((e.target as HTMLElement).closest<HTMLElement>('.ed-row')?.querySelector<HTMLElement>('.ed-deco')?.dataset.slot));

  const freeSlots = 13 - assigned.length;
  return h(
    'div',
    { class: 'ed-tab' },
    section(
      'Le catalogue',
      h('p', { class: 'ed-lead' }, 'Clique sur une décoration pour l’ajouter à ta cabane.', full ? h('b', null, ' Ta cabane est pleine (13 emplacements).') : null),
      catalogue,
    ),
    section(
      `Ta cabane (${decos.length} / ${MAX_DECORATIONS})`,
      h(
        'div',
        { class: 'ed-decohead' },
        map,
        note(
          'tip',
          h('b', null, 'L’ordre compte : '),
          'chaque décoration prend, dans l’ordre de la liste, la première place libre qui lui va. Tu peux aussi lui choisir sa place. ',
          freeSlots > 0 ? `Encore ${freeSlots} place${freeSlots > 1 ? 's' : ''} libre${freeSlots > 1 ? 's' : ''}.` : 'Toutes les places sont prises.',
          decos.some((x) => x.type === 'lantern') ? null : h('span', { class: 'ed-hint' }, ' Sans lanterne dans ta liste, la cabane en reçoit une d’office.'),
        ),
      ),
      decos.length ? list : note('info', 'Aucune décoration pour l’instant : ta cabane est toute nue ! Choisis-en dans le catalogue.'),
      decos.length
        ? button('Tout enlever', {
            small: true,
            variant: 'plain',
            icon: 'trash',
            class: 'ed-btn--quiet',
            onClick: () => {
              const backup = decos.splice(0, decos.length);
              keys.length = 0;
              store.touch('structure');
              app.rerender();
              app.toast('Toutes les décorations ont été enlevées.', 'ok', {
                label: 'Annuler',
                run: () => {
                  for (const it of backup) insertItem(decos, decos.length, it);
                  store.touch('structure');
                  app.rerender();
                },
              });
            },
          })
        : null,
    ),
  );
}

/** Little front view of the chalet with its 13 places; numbers = position in the list. */
function slotMap(decos: DecorationItem[], slotOf: Map<DecorationItem, DecoSlot>): SVGSVGElement {
  const bySlot = new Map<DecoSlot, number>();
  decos.forEach((it, i) => {
    const sl = slotOf.get(it);
    if (sl) bySlot.set(sl, i);
  });
  const svg = s('svg', { viewBox: '0 0 200 150', class: 'ed-slotmap', role: 'img', 'aria-label': `Plan des emplacements : ${bySlot.size} sur 13 occupés` });
  svg.append(
    s('ellipse', { cx: 100, cy: 141, rx: 96, ry: 7, class: 'ed-slotmap__snow' }),
    s('rect', { x: 40, y: 58, width: 120, height: 82, rx: 3, class: 'ed-slotmap__wall' }),
    s('path', { d: 'M18 64 L100 14 L182 64 Z', class: 'ed-slotmap__roof' }),
    s('path', { d: 'M24 62 L100 18 L176 62', class: 'ed-slotmap__snowline' }),
    s('rect', { x: 66, y: 40, width: 68, height: 14, rx: 3, class: 'ed-slotmap__sign' }),
    s('rect', { x: 54, y: 66, width: 92, height: 30, rx: 2, class: 'ed-slotmap__opening' }),
    s('rect', { x: 50, y: 96, width: 100, height: 6, rx: 2, class: 'ed-slotmap__counter' }),
    s('rect', { x: 2, y: 86, width: 26, height: 40, rx: 2, class: 'ed-slotmap__side' }),
    s('rect', { x: 172, y: 86, width: 26, height: 40, rx: 2, class: 'ed-slotmap__side' }),
  );
  for (const [slot, [x, y]] of Object.entries(SLOT_POS) as [DecoSlot, [number, number]][]) {
    const i = bySlot.get(slot);
    const g = s('g', { class: 'ed-slotmap__slot' + (i !== undefined ? ' is-used' : ''), dataset: { slot } });
    g.append(s('title', null, SLOT_LABEL[slot] + (i !== undefined ? ` : ${DECOS[decos[i].type]?.label ?? ''} (n° ${i + 1})` : ' : libre')));
    g.append(s('circle', { cx: x, cy: y, r: i !== undefined ? 8 : 5 }));
    if (i !== undefined) g.append(s('text', { x, y: y + 3.6, 'text-anchor': 'middle' }, String(i + 1)));
    svg.append(g);
  }
  return svg;
}
