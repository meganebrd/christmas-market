import { h } from './dom';
import { icon } from './icons';
import { SnowCanvas } from './Snow';
import { snowflakeSvg } from './Loading';
import type { UIShared } from './shared';

export interface TitleOpts {
  title: string;
  town: string;
  tagline?: string;
  onStart: () => void;
}

/** Title screen over the slowly orbiting village. */
export class Title {
  private el: HTMLElement | null = null;
  private snow: SnowCanvas;
  private offKeys: (() => void) | null = null;

  constructor(private ui: UIShared, private openCredits: () => void) {
    this.snow = new SnowCanvas(1, () => ui.reducedMotion());
  }

  isOpen() {
    return !!this.el;
  }

  show(opts: TitleOpts) {
    this.hide(true);
    const title = opts.title || 'Le Marché de Givrelune';
    const town = opts.town || '';
    // "Le Marché de Givrelune" → small "Le Marché de" over a big "Givrelune"
    let lead = '';
    let main = title;
    if (town && title.endsWith(town) && title.length > town.length + 2) {
      lead = title.slice(0, title.length - town.length).trim();
      main = town;
    }
    let started = false;
    const start = h(
      'button',
      {
        class: 'gl-title__start',
        type: 'button',
        onclick: () => {
          if (started) return;
          started = true;
          start.classList.add('is-pressed');
          start.disabled = true;
          this.ui.sfx('ui-select');
          try {
            opts.onStart();
          } catch (err) {
            console.error('[givrelune] title start failed', err);
          }
        },
      },
      h('span', { class: 'gl-title__start-glow', 'aria-hidden': 'true' }),
      h('span', { class: 'gl-title__start-label', text: 'Entrer dans le marché' }),
      icon('chevronRight', { size: 22 }),
    );

    const sparkles = h('div', { class: 'gl-title__sparkles', 'aria-hidden': 'true' });
    for (let i = 0; i < 9; i++) {
      sparkles.appendChild(
        h('span', {
          class: 'gl-title__sparkle',
          style: { left: `${8 + ((i * 37) % 86)}%`, top: `${10 + ((i * 53) % 70)}%`, animationDelay: `${(i * 0.73) % 4}s`, '--s': String(0.6 + ((i * 7) % 5) / 6) },
        }),
      );
    }

    this.el = h(
      'section',
      { class: 'gl-title', 'aria-label': title },
      h('div', { class: 'gl-title__vignette', 'aria-hidden': 'true' }),
      this.snow.el,
      h(
        'div',
        { class: 'gl-title__center' },
        sparkles,
        h('p', { class: 'gl-title__overline' }, h('span', { 'aria-hidden': 'true', text: '✦' }), h('span', { text: town && !title.includes(town) ? `Bienvenue à ${town}` : 'Ce soir, les cabanes s’illuminent' }), h('span', { 'aria-hidden': 'true', text: '✦' })),
        h('h1', { class: 'gl-title__name' }, lead ? h('span', { class: 'gl-title__lead', text: lead }) : null, h('span', { class: 'gl-title__mainwrap' }, h('span', { class: 'gl-title__glow', 'aria-hidden': 'true', text: main }), h('span', { class: 'gl-title__main', text: main }))),
        h('div', { class: 'gl-title__rule', 'aria-hidden': 'true' }, h('span'), h('i', null, snowflakeSvg()), h('span')),
        opts.tagline ? h('p', { class: 'gl-title__tagline', text: opts.tagline }) : null,
        start,
        h('p', { class: 'gl-title__note', text: '🎧 Avec le son, c’est plus doux' }),
      ),
      h(
        'footer',
        { class: 'gl-title__foot' },
        h('button', { class: 'gl-title__credits', type: 'button', onclick: () => this.openCredits() }, 'Crédits'),
        h('span', { 'aria-hidden': 'true', text: '·' }),
        h('span', { text: 'Un marché de Noël open source' }),
      ),
    );
    this.ui.root.appendChild(this.el);
    this.snow.start();
    requestAnimationFrame(() => {
      this.el?.classList.add('is-in');
      // focus without scrolling; keyboard users can press Enter right away
      setTimeout(() => start.focus({ preventScroll: true }), 50);
    });
    this.offKeys = this.ui.pushLayer({
      el: this.el,
      onKey: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && document.activeElement !== start && !(document.activeElement instanceof HTMLButtonElement)) {
          start.click();
          return true;
        }
        return false;
      },
    });
  }

  hide(immediate = false) {
    const el = this.el;
    if (!el) return;
    this.el = null;
    this.offKeys?.();
    this.offKeys = null;
    if (immediate) {
      this.snow.stop();
      el.remove();
      return;
    }
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => {
      this.snow.stop();
      el.remove();
    }, 1100);
  }
}
