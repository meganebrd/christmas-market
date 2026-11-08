import { h, s } from './dom';
import { SnowCanvas } from './Snow';
import type { UIShared } from './shared';

/** Cosy phrases for the boot steps of the core (falls back to the raw label). */
const PHRASES: Record<string, string> = {
  Interface: 'On déplie la carte du village…',
  Musique: 'On remonte la boîte à musique…',
  'Neige et ciel': 'On saupoudre la neige sur les toits…',
  'Grand Sapin': 'On redresse le Grand Sapin…',
  Cabanes: 'Les artisans ouvrent leurs volets…',
  Visiteur: 'On tricote ton écharpe…',
  Habitants: 'Les habitants enfilent leurs bonnets…',
  Conversations: 'On prépare les mots doux…',
  Jeux: 'On empile les boîtes du chamboule-neige…',
  Histoire: 'Le vent du Nord se lève…',
  Illuminations: 'On allume les lampions…',
  Bienvenue: 'Bienvenue à Givrelune !',
};

/** A 6-branch snowflake drawn as an SVG (decorative). */
export function snowflakeSvg(cls = ''): SVGSVGElement {
  const branches = [];
  for (let i = 0; i < 6; i++) {
    branches.push(
      s(
        'g',
        { transform: `rotate(${i * 60} 50 50)` },
        s('path', { d: 'M50 50V12', 'stroke-width': 4.2 }),
        s('path', { d: 'M50 24l-8-8M50 24l8-8', 'stroke-width': 3.4 }),
        s('path', { d: 'M50 36l-11-7M50 36l11-7', 'stroke-width': 3.4 }),
        s('circle', { cx: 50, cy: 11, r: 3.2, fill: 'currentColor', stroke: 'none' }),
      ),
    );
  }
  return s(
    'svg',
    { class: `gl-flake ${cls}`, viewBox: '0 0 100 100', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'aria-hidden': 'true' },
    ...branches,
    s('circle', { cx: 50, cy: 50, r: 7, fill: 'currentColor', stroke: 'none' }),
  );
}

export class Loading {
  private el: HTMLElement | null = null;
  private bar!: HTMLElement;
  private label!: HTMLElement;
  private pct!: HTMLElement;
  private snow: SnowCanvas;
  private shown = 0;

  constructor(private ui: UIShared) {
    this.snow = new SnowCanvas(0.8, () => ui.reducedMotion());
  }

  show(progress: number, label?: string) {
    if (!this.el) {
      this.shown = 0;
      this.build();
    }
    const p = Math.max(this.shown, Math.min(1, progress || 0));
    this.shown = p;
    this.bar.style.transform = `scaleX(${Math.max(0.02, p)})`;
    this.pct.textContent = `${Math.round(p * 100)} %`;
    this.el!.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (label) {
      const text = PHRASES[label] ?? `${label}…`;
      if (this.label.textContent !== text) {
        this.label.classList.remove('is-swap');
        void this.label.offsetWidth;
        this.label.textContent = text;
        this.label.classList.add('is-swap');
      }
    }
  }

  hide() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.add('is-out');
    setTimeout(() => {
      this.snow.stop();
      el.remove();
    }, 900);
  }

  private build() {
    const title = this.ui.ctx.config?.meta?.town || 'Givrelune';
    this.bar = h('div', { class: 'gl-loading__fill' });
    this.label = h('p', { class: 'gl-loading__label', text: PHRASES.Interface });
    this.pct = h('span', { class: 'gl-loading__pct', text: '0 %' });
    this.el = h(
      'div',
      { class: 'gl-loading', role: 'progressbar', 'aria-label': 'Chargement du marché', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 },
      this.snow.el,
      h(
        'div',
        { class: 'gl-loading__center' },
        h('div', { class: 'gl-loading__flake' }, h('div', { class: 'gl-loading__halo' }), snowflakeSvg()),
        h('p', { class: 'gl-loading__town', text: title }),
        h('div', { class: 'gl-loading__track' }, this.bar, h('span', { class: 'gl-loading__glint' })),
        h('div', { class: 'gl-loading__row' }, this.label, this.pct),
      ),
    );
    this.ui.root.appendChild(this.el);
    this.snow.start();
  }
}
