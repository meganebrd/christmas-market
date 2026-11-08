import type { ResolvedProduct, ResolvedStall } from '../config/types';
import { clear, firstName, h, linkProps, prettyHost, safeColor, safeImage, safeUrl } from './dom';
import { icon } from './icons';
import { ModalShell } from './Modal';
import { avatar, linkChips, profileView } from './Profile';
import type { UIShared } from './shared';

type View = { kind: 'stall'; stall: ResolvedStall } | { kind: 'product'; stall: ResolvedStall; product: ResolvedProduct } | { kind: 'profile'; stall: ResolvedStall };

const CATEGORY: Record<string, string> = {
  artisanat: 'Artisanat',
  gourmand: 'Gourmandises',
  deco: 'Décoration',
  textile: 'Textile',
  bijoux: 'Bijoux',
  jouets: 'Jouets',
  beaute: 'Beauté',
  papeterie: 'Papeterie',
  ceramique: 'Céramique',
  autre: 'Trouvailles',
};

/** Product picture with a cosy illustrated fallback (gift box in the stall colours). */
function productMedia(stall: ResolvedStall, p: ResolvedProduct, cls: string): HTMLElement {
  const box = h('div', { class: cls });
  const fallback = () => {
    clear(box);
    box.classList.add('is-fallback');
    box.append(h('span', { class: 'gl-ph__icon' }, icon('gift', { size: 40 })), h('span', { class: 'gl-ph__name', text: p.name.slice(0, 1).toUpperCase() }));
  };
  const src = safeImage(p.image);
  if (src) {
    const img = h('img', { src, alt: p.name, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', fallback, { once: true });
    img.addEventListener('load', () => box.classList.add('is-loaded'), { once: true });
    box.appendChild(img);
  } else fallback();
  return box;
}

/**
 * The stall "sheet": header with the awning colours, products grid, product detail, artisan profile.
 * One modal, several views with a back button.
 */
export class StallPanel {
  private shell: ModalShell;
  private awning: HTMLElement;
  private bar: HTMLElement;
  private backBtn: HTMLButtonElement;
  private crumb: HTMLElement;
  private scroll: HTMLElement;
  private history: View[] = [];
  private current: View | null = null;

  constructor(private ui: UIShared) {
    this.shell = new ModalShell(ui, {
      cls: 'gl-sheet',
      label: 'Cabane',
      lock: 'sheet',
      onKey: (e) => this.onKey(e),
      onClosed: () => {
        this.history = [];
        this.current = null;
      },
    });
    this.awning = h('div', { class: 'gl-sheet__awning', 'aria-hidden': 'true' });
    this.backBtn = h('button', { class: 'gl-sheet__back', type: 'button', onclick: () => this.back() }, icon('arrowLeft', { size: 18 }), h('span', { text: 'Retour' }));
    this.crumb = h('p', { class: 'gl-sheet__crumb' });
    this.bar = h('div', { class: 'gl-sheet__bar' }, this.backBtn, this.crumb, this.shell.closeBtn);
    this.scroll = h('div', { class: 'gl-sheet__scroll' });
    this.shell.panel.setAttribute('aria-labelledby', 'gl-sheet-title');
    this.shell.panel.append(this.awning, this.bar, this.scroll);
  }

  isOpen() {
    return this.shell.isOpen();
  }

  close() {
    this.shell.close();
  }

  openStall(stall: ResolvedStall) {
    if (!stall) return;
    this.history = [];
    this.show({ kind: 'stall', stall });
    this.ui.ctx.events?.emit('stall:open', { stallId: stall.id });
  }

  openProduct(stall: ResolvedStall, product: ResolvedProduct) {
    if (!stall || !product) return;
    this.navigate({ kind: 'product', stall, product });
  }

  openProfile(stall: ResolvedStall) {
    if (!stall) return;
    this.navigate({ kind: 'profile', stall });
  }

  /** Push a view: keeps a way back to the stall it belongs to. */
  private navigate(v: View) {
    if (this.isOpen() && this.current && this.current.stall.id === v.stall.id) {
      if (this.current.kind === 'product' && v.kind === 'product') {
        // product → product: replace (prev/next) instead of stacking
        this.show(v, 'side');
        return;
      }
      this.history.push(this.current);
    } else this.history = [{ kind: 'stall', stall: v.stall }];
    this.show(v);
  }

  private back() {
    const prev = this.history.pop();
    if (prev) this.show(prev, 'back');
    else this.close();
  }

  private show(v: View, dir: 'forward' | 'back' | 'side' = 'forward') {
    const wasOpen = this.isOpen();
    this.current = v;
    const s = v.stall;
    const [a1, a2] = s.chalet?.awningColors ?? ['#b8413a', '#f3ead8'];
    const accent = safeColor(s.chalet?.accent, '#b8413a');
    const p = this.shell.panel;
    p.style.setProperty('--accent', accent);
    p.style.setProperty('--aw1', safeColor(a1, '#b8413a'));
    p.style.setProperty('--aw2', safeColor(a2, '#f3ead8'));
    p.classList.toggle('is-plain-awning', s.chalet?.awning === 'plain' || s.chalet?.awning === 'none');
    p.dataset.view = v.kind;

    const hasBack = this.history.length > 0;
    this.backBtn.hidden = !hasBack;
    const prev = this.history[this.history.length - 1];
    (this.backBtn.lastChild as HTMLElement).textContent = !prev ? 'Retour' : prev.kind === 'stall' ? 'La cabane' : prev.kind === 'profile' ? firstName(s.owner.name) : 'Retour';
    this.crumb.textContent = v.kind === 'stall' ? '' : s.name;

    const content = v.kind === 'stall' ? this.stallView(s) : v.kind === 'product' ? this.productView(s, v.product) : profileView(s, { showProducts: () => this.showProducts(s) });
    const view = h('div', { class: `gl-view gl-view--${v.kind} is-${dir}` }, content);
    clear(this.scroll);
    this.scroll.appendChild(view);
    this.scroll.scrollTop = 0;
    this.shell.panel.setAttribute('aria-label', v.kind === 'product' ? v.product.name : v.kind === 'profile' ? s.owner.name : s.name);
    if (wasOpen) {
      this.ui.sfx('page', { volume: 0.6 });
      // keep keyboard focus inside the sheet after the swap
      setTimeout(() => {
        const t = this.scroll.querySelector<HTMLElement>('h2');
        if (t && this.shell.panel.contains(document.activeElement) === false) t.focus?.({ preventScroll: true });
      }, 30);
    }
    this.shell.show();
    if (v.kind === 'product') this.ui.ctx.events?.emit('product:open', { stallId: s.id, productId: v.product.id });
  }

  private showProducts(s: ResolvedStall) {
    // back to the stall view (it is usually right below in the history)
    const i = this.history.findIndex((x) => x.kind === 'stall' && x.stall.id === s.id);
    if (i >= 0) {
      this.history.length = i;
      this.show({ kind: 'stall', stall: s }, 'back');
    } else {
      this.history = [];
      this.show({ kind: 'stall', stall: s }, 'back');
    }
  }

  // ───────────────────────────── views ─────────────────────────────

  private stallView(s: ResolvedStall): HTMLElement {
    const o = s.owner;
    const prenom = firstName(o.name);
    const site = safeUrl(s.website);
    const products = s.products ?? [];
    const cat = s.category ? CATEGORY[s.category] ?? null : null;

    const head = h(
      'header',
      { class: 'gl-stall__head' },
      cat ? h('span', { class: 'gl-tagpill', text: cat }) : null,
      h('h2', { class: 'gl-stall__name', id: 'gl-sheet-title', tabindex: '-1', text: s.name }),
      s.tagline ? h('p', { class: 'gl-stall__tagline', text: s.tagline }) : null,
      h(
        'div',
        { class: 'gl-stall__owner' },
        avatar(s, 'small'),
        h('div', { class: 'gl-stall__who' }, h('strong', { text: o.name }), o.role ? h('span', { text: o.role }) : null),
        h('button', { class: 'gl-btn gl-btn--ghost gl-btn--small', type: 'button', onclick: () => this.openProfile(s) }, icon('user', { size: 16 }), h('span', { text: `Rencontrer ${prenom}` })),
      ),
      h(
        'div',
        { class: 'gl-stall__actions' },
        site ? h('a', { class: 'gl-btn gl-btn--berry', ...linkProps(site) }, h('span', { text: 'Visiter le site' }), icon('arrowUpRight', { size: 18 })) : null,
        linkChips(s),
      ),
    );

    let body: HTMLElement;
    if (products.length) {
      body = h(
        'div',
        { class: 'gl-products' },
        products.map((p, i) => {
          const href = safeUrl(p.url);
          return h(
            'article',
            { class: 'gl-product', style: { animationDelay: `${Math.min(i, 10) * 45}ms` } },
            h(
              'button',
              { class: 'gl-product__open', type: 'button', 'aria-label': `${p.name}${p.priceLabel ? ', ' + p.priceLabel : ''} — voir le détail`, onclick: () => this.openProduct(s, p) },
              productMedia(s, p, 'gl-product__media'),
              p.featured ? h('span', { class: 'gl-product__badge' }, icon('heart', { size: 12 }), h('span', { text: 'Coup de cœur' })) : null,
              h('span', { class: 'gl-product__name', text: p.name }),
              p.priceLabel ? h('span', { class: 'gl-product__price', text: p.priceLabel }) : null,
            ),
            href ? h('a', { class: 'gl-product__link', ...linkProps(href) }, h('span', { text: 'Voir sur le site' }), icon('arrowUpRight', { size: 14 })) : null,
          );
        }),
      );
    } else {
      body = h(
        'div',
        { class: 'gl-empty' },
        icon('gift', { size: 34 }),
        h('p', { text: `${prenom} est encore en train d’installer son étal…` }),
        site ? h('a', { class: 'gl-btn gl-btn--ghost gl-btn--small', ...linkProps(site) }, h('span', { text: 'Découvrir ses créations en ligne' }), icon('arrowUpRight', { size: 16 })) : null,
      );
    }

    return h(
      'div',
      { class: 'gl-stall' },
      head,
      h('h3', { class: 'gl-h3 gl-stall__section' }, h('span', { text: 'Sur l’étal' }), products.length ? h('em', { text: String(products.length) }) : null),
      body,
    );
  }

  private productView(s: ResolvedStall, p: ResolvedProduct): HTMLElement {
    const href = safeUrl(p.url);
    const list = s.products ?? [];
    const idx = list.findIndex((x) => x.id === p.id);
    const nav =
      list.length > 1 && idx >= 0
        ? h(
            'nav',
            { class: 'gl-pnav', 'aria-label': 'Autres créations' },
            h('button', { class: 'gl-iconbtn', type: 'button', 'aria-label': 'Création précédente', onclick: () => this.step(-1) }, icon('chevronLeft', { size: 20 })),
            h('span', { class: 'gl-pnav__count', text: `${idx + 1} / ${list.length}` }),
            h('button', { class: 'gl-iconbtn', type: 'button', 'aria-label': 'Création suivante', onclick: () => this.step(1) }, icon('chevronRight', { size: 20 })),
          )
        : null;
    return h(
      'div',
      { class: 'gl-pdetail' },
      h('div', { class: 'gl-pdetail__frame' }, productMedia(s, p, 'gl-pdetail__media'), p.featured ? h('span', { class: 'gl-product__badge gl-product__badge--big' }, icon('heart', { size: 13 }), h('span', { text: 'Coup de cœur' })) : null),
      h(
        'div',
        { class: 'gl-pdetail__info' },
        h('p', { class: 'gl-pdetail__from' }, h('span', { text: 'Chez ' }), h('strong', { text: s.name }), h('span', { text: ` · ${s.owner.name}` })),
        h('h2', { class: 'gl-pdetail__name', id: 'gl-sheet-title', tabindex: '-1', text: p.name }),
        p.priceLabel ? h('p', { class: 'gl-pdetail__price', text: p.priceLabel }) : null,
        p.description ? h('p', { class: 'gl-pdetail__desc', text: p.description }) : null,
        href
          ? h(
              'div',
              { class: 'gl-pdetail__cta' },
              h('a', { class: 'gl-btn gl-btn--berry', ...linkProps(href), 'data-autofocus': '' }, h('span', { text: 'Voir sur le site' }), icon('arrowUpRight', { size: 18 })),
              h('span', { class: 'gl-pdetail__host', text: prettyHost(href) }),
            )
          : null,
        h('button', { class: 'gl-btn gl-btn--ghost gl-btn--small', type: 'button', onclick: () => this.openProfile(s) }, avatar(s, 'small'), h('span', { text: `Qui est ${firstName(s.owner.name)} ?` })),
        nav,
      ),
    );
  }

  private step(d: number) {
    const v = this.current;
    if (!v || v.kind !== 'product') return;
    const list = v.stall.products;
    const i = list.findIndex((x) => x.id === v.product.id);
    if (i < 0 || list.length < 2) return;
    const next = list[(i + d + list.length) % list.length];
    this.show({ kind: 'product', stall: v.stall, product: next }, 'side');
  }

  private onKey(e: KeyboardEvent): boolean {
    if (this.current?.kind === 'product' && !(e.target instanceof HTMLInputElement)) {
      if (e.key === 'ArrowRight') {
        this.step(1);
        return true;
      }
      if (e.key === 'ArrowLeft') {
        this.step(-1);
        return true;
      }
    }
    if (e.key === 'Backspace' && this.history.length && !(e.target instanceof HTMLInputElement)) {
      this.back();
      return true;
    }
    return false;
  }
}
