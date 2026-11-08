import { append, h } from './dom';
import { snowflakeSvg } from './Loading';
import type { UIShared } from './shared';

/** Toast stack (top-centre) and the elegant zone banner. */
export class Toasts {
  private stack: HTMLElement;
  private banner: HTMLElement;
  private bannerTimer = 0;
  private bannerHide = 0;

  constructor(private ui: UIShared) {
    this.stack = h('div', { class: 'gl-toasts', role: 'status', 'aria-live': 'polite' });
    this.banner = h('div', { class: 'gl-banner', role: 'status', 'aria-live': 'polite' });
    ui.root.append(this.banner, this.stack);
  }

  toast(text: string, opts?: { icon?: string; duration?: number }) {
    const t = String(text ?? '').trim();
    if (!t) return;
    // same text already showing: just refresh it
    for (const el of this.stack.children) {
      if ((el as HTMLElement).dataset.text === t && !el.classList.contains('is-out')) {
        el.classList.remove('is-bump');
        void (el as HTMLElement).offsetWidth;
        el.classList.add('is-bump');
        return;
      }
    }
    const el = h(
      'div',
      { class: 'gl-toast', dataset: { text: t } },
      opts?.icon ? h('span', { class: 'gl-toast__icon', 'aria-hidden': 'true', text: opts.icon }) : null,
      h('span', { class: 'gl-toast__text', text: t }),
    );
    this.stack.appendChild(el);
    const live = [...this.stack.children].filter((c) => !c.classList.contains('is-out'));
    while (live.length > 3) this.dismiss(live.shift() as HTMLElement);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const duration = opts?.duration ?? Math.min(6000, 2400 + t.length * 40);
    setTimeout(() => this.dismiss(el), duration);
  }

  private dismiss(el: HTMLElement) {
    if (el.classList.contains('is-out')) return;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 420);
  }

  zoneBanner(title: string, subtitle?: string) {
    if (!title) return;
    clearTimeout(this.bannerTimer);
    clearTimeout(this.bannerHide);
    const b = this.banner;
    b.classList.remove('is-in', 'is-out');
    b.textContent = '';
    append(
      b,
      h('div', { class: 'gl-banner__orn', 'aria-hidden': 'true' }, h('span', { class: 'gl-banner__line' }), h('span', { class: 'gl-banner__gem', text: '✦' }), h('span', { class: 'gl-banner__line' })),
      h('h2', { class: 'gl-banner__title', text: title }),
      subtitle ? h('p', { class: 'gl-banner__sub', text: subtitle }) : null,
      h('div', { class: 'gl-banner__orn gl-banner__orn--bottom', 'aria-hidden': 'true' }, h('span', { class: 'gl-banner__line' }), h('span', { class: 'gl-banner__gem gl-banner__gem--flake' }, snowflakeSvg()), h('span', { class: 'gl-banner__line' })),
    );
    void b.offsetWidth;
    b.classList.add('is-in');
    this.ui.sfx('chime', { volume: 0.35 });
    this.bannerTimer = window.setTimeout(() => {
      b.classList.remove('is-in');
      b.classList.add('is-out');
      this.bannerHide = window.setTimeout(() => b.classList.remove('is-out'), 900);
    }, 3500);
  }
}
