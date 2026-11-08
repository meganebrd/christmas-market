import type { ResolvedStall } from '../config/types';
import { excerpt, firstName, h, initials, linkProps, prettyHost, readableOn, safeColor, safeImage, safeUrl } from './dom';
import { icon, linkIcon } from './icons';

/** Round portrait: the artisan's photo, or their initials under a little knitted bonnet. */
export function avatar(stall: ResolvedStall, size: 'small' | 'big' = 'small'): HTMLElement {
  const o = stall.owner;
  const app = o.appearance ?? ({} as any);
  const bg = safeColor(app.outfitColor, safeColor(stall.chalet?.accent, '#b8413a'));
  const hat = safeColor(app.hatColor, '#b8413a');
  const el = h('div', { class: `gl-avatar gl-avatar--${size}`, style: { '--av': bg, '--av-ink': readableOn(bg), '--hat': hat }, 'aria-hidden': 'true' });
  const fallback = () => {
    el.textContent = '';
    el.classList.add('is-initials');
    el.append(h('span', { class: 'gl-avatar__hat' }, h('i')), h('span', { class: 'gl-avatar__txt', text: initials(o.name) }));
  };
  const photo = safeImage(o.photo);
  if (photo) {
    const img = h('img', { src: photo, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', fallback, { once: true });
    el.appendChild(img);
  } else fallback();
  return el;
}

/** Website + social links as icon chips. */
export function linkChips(stall: ResolvedStall, opts: { withSite?: boolean } = {}): HTMLElement | null {
  const chips: HTMLElement[] = [];
  const seen = new Set<string>();
  const site = safeUrl(stall.website);
  if (site) seen.add(site);
  for (const l of stall.links ?? []) {
    const href = safeUrl(l?.url);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const label = (l.label || prettyHost(href)).slice(0, 40);
    chips.push(
      h('a', { class: 'gl-linkchip', ...linkProps(href), title: label, 'aria-label': `${label} (nouvel onglet)` }, icon(linkIcon(l.kind, href), { size: 18 }), h('span', { text: label })),
    );
  }
  if (opts.withSite && site) {
    chips.unshift(h('a', { class: 'gl-linkchip', ...linkProps(site), 'aria-label': `${prettyHost(site)} (nouvel onglet)` }, icon('globe', { size: 18 }), h('span', { text: prettyHost(site) })));
  }
  return chips.length ? h('div', { class: 'gl-linkchips' }, chips) : null;
}

/** Owner card: who is this artisan, their story, their links. */
export function profileView(stall: ResolvedStall, actions: { showProducts: () => void }): HTMLElement {
  const o = stall.owner;
  const prenom = firstName(o.name);
  const site = safeUrl(stall.website);
  const story = (stall.knowledge?.description ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const greeting = o.greetings?.[0];
  const facts = (stall.knowledge?.facts ?? []).filter((f) => f && f.topic && f.text).slice(0, 4);

  return h(
    'div',
    { class: 'gl-profile' },
    h(
      'div',
      { class: 'gl-profile__card' },
      h('div', { class: 'gl-profile__tape', 'aria-hidden': 'true' }),
      avatar(stall, 'big'),
      h('h2', { class: 'gl-profile__name', id: 'gl-sheet-title', text: o.name }),
      o.role ? h('p', { class: 'gl-profile__role', text: o.role }) : null,
      h('p', { class: 'gl-profile__shop' }, icon('pin', { size: 15 }), h('span', { text: stall.name })),
    ),
    h(
      'div',
      { class: 'gl-profile__body' },
      o.bio ? h('p', { class: 'gl-profile__bio', text: o.bio }) : null,
      greeting ? h('blockquote', { class: 'gl-profile__quote' }, h('p', { text: `« ${greeting.replace(/^[«"\s]+|[»"\s]+$/g, '')} »` }), h('cite', { text: `— ${prenom}` })) : null,
      story.length
        ? h(
            'div',
            { class: 'gl-profile__story' },
            h('h3', { class: 'gl-h3', text: 'Son histoire' }),
            ...story.slice(0, 2).map((p, i) => h('p', { text: i === 0 ? excerpt(p, 340) : excerpt(p, 220) })),
          )
        : null,
      facts.length
        ? h(
            'dl',
            { class: 'gl-facts' },
            facts.map((f) => h('div', { class: 'gl-fact' }, h('dt', { text: f.topic }), h('dd', { text: excerpt(f.text, 180) }))),
          )
        : null,
      linkChips(stall),
      h(
        'div',
        { class: 'gl-profile__actions' },
        site ? h('a', { class: 'gl-btn gl-btn--berry', ...linkProps(site) }, h('span', { text: 'Visiter le site' }), icon('arrowUpRight', { size: 18 })) : null,
        stall.products.length ? h('button', { class: 'gl-btn gl-btn--ghost', type: 'button', onclick: actions.showProducts }, icon('gift', { size: 18 }), h('span', { text: `Voir les créations de ${prenom}` })) : null,
      ),
    ),
  );
}
