import type { ZoneId } from '../config/types';
import type { PathShape } from '../world/layout';
import { h, s, safeColor, readableOn } from './dom';
import { icon } from './icons';
import type { UIShared } from './shared';

const VB = 54; // viewBox half-size, metres
const pct = (v: number) => `${((v + VB) / (VB * 2)) * 100}%`;

/** Ink illustrations of the zones (24×24, stroked). */
const ZONE_ART: Record<ZoneId, string[]> = {
  gate: ['M4.5 21V11.5a7.5 7.5 0 0 1 15 0V21', 'M8.5 21v-8.5a3.5 3.5 0 0 1 7 0V21', 'M2.5 21h19', 'M12 2.5v1.5'],
  plaza: ['M12 2.5l4.5 6h-2.7l4 5.5h-3.3l3.5 5H6l3.5-5H6.2l4-5.5H7.5z', 'M12 19v3'],
  bar: ['M5 10h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5z', 'M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16', 'M8.5 2.5c-.8 1 .8 2 0 3.2s.8 2 0 2.8', 'M12.5 2.5c-.8 1 .8 2 0 3.2s.8 2 0 2.8'],
  food: ['M3.5 11.5h17', 'M5 11.5v5a3.5 3.5 0 0 0 3.5 3.5h7a3.5 3.5 0 0 0 3.5-3.5v-5', 'M9 3.5c-.7.9.7 1.8 0 2.8s.7 1.8 0 2.6', 'M15 3.5c-.7.9.7 1.8 0 2.8s.7 1.8 0 2.6', 'M12 3c-.7.9.7 1.8 0 2.8'],
  workshop: ['M12 2.5v3', 'M10 5.5h4v2.5h-4z', 'M12 8a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'M6 14.2c2 1.4 4 1.4 6 0s4-1.4 6 0'],
  rink: ['M6 3.5h4v7l6.5 2.2a3 3 0 0 1 2 2.8V17H6z', 'M3.5 20.5h15.5a2.5 2.5 0 0 0 2-1', 'M8.5 17v3.5', 'M15.5 17v3.5'],
  belvedere: ['M3 13l11-5.5 2 4-11 5.5z', 'M14 7.5l3.5-1.7 2 4-3.5 1.7', 'M9.5 15l-3 6.5', 'M9.5 15l3 6.5', 'M19.5 3.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z'],
  fair: ['M3.5 16h5.5v5H3.5z', 'M9.25 16h5.5v5h-5.5z', 'M15 16h5.5v5H15z', 'M6.4 10.8h5.5v5H6.4z', 'M12.1 10.8h5.5v5h-5.5z', 'M9.25 5.6h5.5v5h-5.5z', 'M20.5 6.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  carousel: ['M3 9.5L12 3l9 6.5z', 'M3 9.5h18', 'M6 9.5V20', 'M12 9.5V20', 'M18 9.5V20', 'M3 20.5h18', 'M4.5 14.5h3', 'M10.5 13h3', 'M16.5 15.5h3'],
};

function art(id: ZoneId, size: number, cx: number, cy: number, cls = 'gl-map__art'): SVGGElement {
  const k = size / 24;
  return s('g', { class: cls, transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${k})` }, ZONE_ART[id].map((d) => s('path', { d })));
}

export function zoneIcon(id: ZoneId, size = 22): SVGSVGElement {
  return s(
    'svg',
    { class: 'gl-zoneicon', viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    ZONE_ART[id].map((d) => s('path', { d })),
  );
}

/** Deterministic pseudo-random. */
function rand(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Parchment map generated from the layout: plaza & tree, alley ring, avenues, zone pads, stall markers,
 * live visitor arrow. Clicking a place fast-travels there.
 */
export class MapView {
  private backdrop: HTMLElement | null = null;
  private me: HTMLElement | null = null;
  private offSystem: (() => void) | null = null;
  private offLayer: (() => void) | null = null;
  private markers = new Map<string, HTMLElement>();
  private restoreFocus: HTMLElement | null = null;
  private onResize = () => this.declutter();

  constructor(private ui: UIShared) {}

  isOpen() {
    return !!this.backdrop;
  }

  open() {
    if (this.backdrop) return;
    const ctx = this.ui.ctx;
    this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = this.build();
    this.backdrop = el;
    this.ui.root.appendChild(el);
    void el.offsetWidth;
    el.classList.add('is-in');
    this.ui.sfx('page');
    this.updateMe();
    this.offSystem = ctx.addSystem(() => this.updateMe());
    this.offLayer = this.ui.pushLayer({
      el,
      modal: true,
      onKey: (e) => {
        if (e.key === 'Escape' || e.code === 'KeyM') {
          if (!e.repeat) this.closeAndExplore();
          return true;
        }
        return false;
      },
    });
    requestAnimationFrame(() => this.declutter());
    setTimeout(() => this.declutter(), 400);
    window.addEventListener('resize', this.onResize);
    setTimeout(() => el.querySelector<HTMLElement>('.gl-map__close')?.focus({ preventScroll: true }), 60);
  }

  /** Hide the map (does not touch the game mode). */
  hide() {
    const el = this.backdrop;
    if (!el) return;
    this.backdrop = null;
    this.offSystem?.();
    this.offSystem = null;
    this.offLayer?.();
    this.offLayer = null;
    window.removeEventListener('resize', this.onResize);
    this.markers.clear();
    this.me = null;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (this.restoreFocus?.isConnected && !this.restoreFocus.closest('.gl-hud')) this.restoreFocus.focus({ preventScroll: true });
    this.restoreFocus = null;
    setTimeout(() => el.remove(), 380);
  }

  closeAndExplore() {
    const wasOpen = this.isOpen();
    this.hide();
    if (wasOpen) this.ui.sfx('ui-close', { volume: 0.5 });
    if (this.ui.ctx.mode === 'map') this.ui.ctx.setMode('explore');
  }

  private async travel(target: ZoneId | `stall:${string}`) {
    const ctx = this.ui.ctx;
    this.ui.sfx('ui-select');
    this.hide();
    try {
      await ctx.travelTo(target);
    } catch (err) {
      console.error('[givrelune] travel failed', err);
    }
    if (ctx.mode === 'map') ctx.setMode('explore');
  }

  private updateMe() {
    const me = this.me;
    if (!me) return;
    const p = this.ui.ctx.player;
    if (!p?.position) {
      me.hidden = true;
      return;
    }
    me.hidden = false;
    const x = Math.max(-VB + 2, Math.min(VB - 2, p.position.x));
    const z = Math.max(-VB + 2, Math.min(VB - 2, p.position.z));
    me.style.left = pct(x);
    me.style.top = pct(z);
    me.style.setProperty('--yaw', `${(-(p.yaw ?? 0) * 180) / Math.PI}deg`);
  }

  // ───────────────────────────── building ─────────────────────────────

  private build(): HTMLElement {
    const ctx = this.ui.ctx;
    const L = ctx.layout;
    const town = ctx.config?.meta?.town || 'Givrelune';
    const stalls = ctx.config?.stalls ?? [];
    const stallById = new Map(stalls.map((st) => [st.id, st]));
    const zones = (Object.keys(L.zones) as ZoneId[]).filter((id) => id !== 'plaza' && (L.zones[id].enabled || id === 'gate'));

    // ── SVG terrain ──
    const svg = s('svg', { class: 'gl-map__svg', viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`, 'aria-hidden': 'true' });
    svg.appendChild(
      s(
        'defs',
        null,
        s('radialGradient', { id: 'gl-map-meadow', cx: '50%', cy: '50%', r: '50%' }, s('stop', { offset: '0%', 'stop-color': '#fbf4e6' }), s('stop', { offset: '85%', 'stop-color': '#f3e6cc' }), s('stop', { offset: '100%', 'stop-color': '#e7d3ad' })),
        s('radialGradient', { id: 'gl-map-glow', cx: '50%', cy: '50%', r: '50%' }, s('stop', { offset: '0%', 'stop-color': '#ffd98a', 'stop-opacity': 0.75 }), s('stop', { offset: '100%', 'stop-color': '#ffd98a', 'stop-opacity': 0 })),
        s('filter', { id: 'gl-map-rough', x: '-5%', y: '-5%', width: '110%', height: '110%' }, s('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, seed: 3, result: 'n' }), s('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 0.7 })),
      ),
    );
    // meadow + forest edge
    svg.appendChild(s('circle', { cx: 0, cy: 0, r: L.walkRadius + 1.5, fill: 'url(#gl-map-meadow)', stroke: '#c9ad7f', 'stroke-width': 0.5, 'stroke-dasharray': '1.4 1.1' }));
    // mountains in the north (the valley view from the belvedere)
    const mountains = s('g', { class: 'gl-map__mountains' });
    for (const [x, w, hgt] of [[-34, 14, 8], [-22, 12, 6], [24, 13, 7], [36, 12, 6.5]] as const) {
      const y = -VB + 9 + (Math.abs(x) > 30 ? 2 : 0);
      mountains.append(
        s('path', { d: `M${x - w / 2} ${y}L${x} ${y - hgt}L${x + w / 2} ${y}z`, fill: '#d9cbb3', stroke: '#8f7556', 'stroke-width': 0.35, 'stroke-linejoin': 'round' }),
        s('path', { d: `M${x - w * 0.14} ${y - hgt * 0.72}L${x} ${y - hgt}L${x + w * 0.14} ${y - hgt * 0.72}l-${w * 0.07} 0.9z`, fill: '#fffaf0', stroke: 'none' }),
      );
    }
    svg.appendChild(mountains);
    // pines around the walkable circle
    const pines = s('g', { class: 'gl-map__pines' });
    const avenueAngles = zones.map((id) => L.zones[id].angle);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + (rand(i) - 0.5) * 0.08;
      if (avenueAngles.some((za) => Math.abs(Math.atan2(Math.sin(a - za), Math.cos(a - za))) < (za === 0 ? 0.16 : 0.05))) continue;
      const r = L.walkRadius + 2.6 + rand(i + 99) * 4.5;
      const x = Math.sin(a) * r;
      const y = Math.cos(a) * r;
      if (Math.abs(x) > VB - 2 || Math.abs(y) > VB - 2) continue;
      const k = 0.8 + rand(i + 7) * 0.6;
      pines.appendChild(
        s('path', {
          d: `M${x} ${y - 3.2 * k}l${1.5 * k} ${1.9 * k}h${-0.6 * k}l${1.4 * k} ${1.6 * k}h${-4.6 * k}l${1.4 * k} ${-1.6 * k}h${-0.6 * k}z`,
          fill: i % 3 ? '#8aa588' : '#6f8f73',
          stroke: '#3e5a48',
          'stroke-width': 0.28,
          'stroke-linejoin': 'round',
        }),
      );
    }
    svg.appendChild(pines);
    // paths: outline pass then fill pass (union look)
    const outline = s('g', { class: 'gl-map__paths-outline', filter: 'url(#gl-map-rough)' });
    const fill = s('g', { class: 'gl-map__paths' });
    for (const p of L.paths) {
      const o = this.shape(p, true);
      const f = this.shape(p, false);
      if (o) outline.appendChild(o);
      if (f) fill.appendChild(f);
    }
    svg.append(outline, fill);
    // cobble dots on the alley ring
    const dots = s('g', { class: 'gl-map__cobbles' });
    const mid = (L.alley.r0 + L.alley.r1) / 2;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const rr = mid + (rand(i + 3) - 0.5) * (L.alley.r1 - L.alley.r0 - 2);
      dots.appendChild(s('circle', { cx: Math.sin(a) * rr, cy: Math.cos(a) * rr, r: 0.22, fill: '#b89c70' }));
    }
    svg.appendChild(dots);
    // the Grand Sapin
    const tr = L.plaza.treeRadius;
    svg.appendChild(s('circle', { cx: 0, cy: 0, r: tr * 2.4, fill: 'url(#gl-map-glow)' }));
    svg.appendChild(
      s(
        'g',
        { class: 'gl-map__tree' },
        s('path', { d: `M0 ${-tr * 2}L${tr * 0.9} ${-tr * 0.75}H${tr * 0.45}L${tr * 1.25} ${tr * 0.45}H${tr * 0.6}L${tr * 1.55} ${tr * 1.55}H${-tr * 1.55}L${-tr * 0.6} ${tr * 0.45}H${-tr * 1.25}L${-tr * 0.45} ${-tr * 0.75}H${-tr * 0.9}Z`, fill: '#3f7660', stroke: '#1c3d34', 'stroke-width': 0.4, 'stroke-linejoin': 'round' }),
        s('rect', { x: -0.5, y: tr * 1.55, width: 1, height: 1.1, fill: '#8a5a3b' }),
        s('circle', { cx: -1.4, cy: tr * 0.9, r: 0.42, fill: '#c0392b' }),
        s('circle', { cx: 1.6, cy: tr * 0.2, r: 0.42, fill: '#e2b34a' }),
        s('circle', { cx: -0.6, cy: -tr * 0.4, r: 0.38, fill: '#e2b34a' }),
        s('circle', { cx: 2.2, cy: tr * 1.2, r: 0.42, fill: '#e2b34a' }),
        s('path', { class: 'gl-map__treestar', d: `M0 ${-tr * 2 - 1.9}l.55 1.15 1.25.15-.92.85.24 1.25L0 ${-tr * 2 + 0.05}l-1.12.6.24-1.25-.92-.85 1.25-.15z`, fill: '#ffd86b', stroke: '#a77b1f', 'stroke-width': 0.2 }),
      ),
    );
    // zone pads with their illustrations
    const pads = s('g', { class: 'gl-map__pads' });
    for (const id of zones) {
      const z = L.zones[id];
      const r = Math.min(z.radius * 0.62, 4.6);
      pads.append(
        s('circle', { cx: z.center.x, cy: z.center.z, r: r + 0.6, fill: 'none', stroke: '#8f7556', 'stroke-width': 0.3, 'stroke-dasharray': '0.8 0.6' }),
        s('circle', { cx: z.center.x, cy: z.center.z, r, fill: '#fffaf0', stroke: '#5b412c', 'stroke-width': 0.45 }),
        art(id, r * 1.25, z.center.x, z.center.z),
      );
    }
    svg.appendChild(pads);

    // ── HTML overlay (buttons, labels, markers) ──
    const overlay = h('div', { class: 'gl-map__overlay' });
    for (const id of zones) {
      const z = L.zones[id];
      const r = Math.min(z.radius * 0.62, 4.6);
      overlay.appendChild(
        h(
          'button',
          {
            class: 'gl-map__zone',
            type: 'button',
            style: { left: pct(z.center.x), top: pct(z.center.z), '--r': `${((r + 0.8) / (VB * 2)) * 100}%` },
            'aria-label': `Aller à ${z.name}`,
            onclick: () => this.travel(id),
          },
          h('span', { class: 'gl-map__hit', 'aria-hidden': 'true' }),
          h('span', { class: 'gl-map__label gl-map__label--zone', text: z.name }),
        ),
      );
    }
    // plaza: the tree is clickable too
    overlay.appendChild(
      h(
        'button',
        { class: 'gl-map__zone gl-map__zone--plaza', type: 'button', style: { left: pct(0), top: pct(0), '--r': `${((tr * 2) / (VB * 2)) * 100}%` }, 'aria-label': `Aller à ${L.zones.plaza.name}`, onclick: () => this.travel('plaza') },
        h('span', { class: 'gl-map__hit', 'aria-hidden': 'true' }),
        h('span', { class: 'gl-map__label gl-map__label--zone gl-map__label--plaza', text: L.zones.plaza.name }),
      ),
    );
    // stalls
    L.stalls.forEach((slot, i) => {
      const st = stallById.get(slot.stallId);
      if (!st) return;
      const accent = safeColor(st.chalet?.accent, '#b8413a');
      const left = slot.position.x < -0.5;
      const m: HTMLButtonElement = h(
        'button',
        {
          class: `gl-map__stall${left ? ' is-left' : ''}`,
          type: 'button',
          dataset: { x: String(slot.position.x), z: String(slot.position.z) },
          style: { left: pct(slot.position.x), top: pct(slot.position.z), '--accent': accent, '--accent-ink': readableOn(accent) },
          'aria-label': `Aller à la cabane ${st.name} (${st.owner.name})`,
          onclick: () => {
            // touch: a first tap shows the name, a second tap goes there (no hover on phones)
            if (this.ui.isTouch() && !m.classList.contains('is-picked')) {
              for (const o of this.markers.values()) o.classList.remove('is-picked');
              m.classList.add('is-picked');
              this.ui.sfx('ui-hover', { volume: 0.5 });
              return;
            }
            this.travel(`stall:${st.id}`);
          },
        },
        h('span', { class: 'gl-map__house', 'aria-hidden': 'true' }, h('b', { text: String(i + 1) })),
        h('span', { class: 'gl-map__label gl-map__label--stall', 'aria-hidden': 'true' }, h('span', { text: st.name }), h('small', { text: 'Touche encore pour y aller' })),
      );
      this.markers.set(st.id, m);
      overlay.appendChild(m);
    });
    // the visitor
    this.me = h('div', { class: 'gl-map__me', 'aria-hidden': 'true' }, h('span', { class: 'gl-map__me-pulse' }), s('svg', { viewBox: '-10 -10 20 20', width: 26, height: 26 }, s('path', { d: 'M0 9L6.5 -6.5L0 -3L-6.5 -6.5Z', fill: '#b8413a', stroke: '#fff8ea', 'stroke-width': 2, 'stroke-linejoin': 'round' })), h('span', { class: 'gl-map__me-label', text: 'Toi' }));
    overlay.appendChild(this.me);

    const compass = h(
      'div',
      { class: 'gl-map__compass', 'aria-hidden': 'true' },
      s(
        'svg',
        { viewBox: '-20 -20 40 40', width: 58, height: 58 },
        s('circle', { r: 15, fill: '#fffaf0', stroke: '#8f7556', 'stroke-width': 1 }),
        s('circle', { r: 12, fill: 'none', stroke: '#c9ad7f', 'stroke-width': 0.6, 'stroke-dasharray': '1.5 1.5' }),
        s('path', { d: 'M0 -13L3.4 0L0 13L-3.4 0Z', fill: '#e9dcc2', stroke: '#5b412c', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
        s('path', { d: 'M0 -13L3.4 0H-3.4Z', fill: '#b8413a' }),
        s('path', { d: 'M-13 0L0 -2.6L13 0L0 2.6Z', fill: '#f3e6cc', stroke: '#5b412c', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }),
        s('circle', { r: 1.6, fill: '#e2b34a', stroke: '#5b412c', 'stroke-width': 0.5 }),
      ),
      h('span', { class: 'gl-map__north', text: 'N' }),
    );

    const canvas = h('div', { class: 'gl-map__canvas' }, svg, overlay, compass);

    // ── legend ──
    const zoneList = h(
      'ul',
      { class: 'gl-legend__list' },
      [ 'plaza' as ZoneId, ...zones].map((id) => {
        const z = L.zones[id];
        return h(
          'li',
          null,
          h(
            'button',
            { class: 'gl-legend__item', type: 'button', onclick: () => this.travel(id) },
            h('span', { class: 'gl-legend__icon' }, zoneIcon(id, 20)),
            h('span', { class: 'gl-legend__text' }, h('strong', { text: z.name }), z.subtitle ? h('small', { text: z.subtitle }) : null),
          ),
        );
      }),
    );
    const stallList = h(
      'ul',
      { class: 'gl-legend__list' },
      L.stalls.map((slot, i) => {
        const st = stallById.get(slot.stallId);
        if (!st) return null;
        const accent = safeColor(st.chalet?.accent, '#b8413a');
        const hot = (on: boolean) => this.markers.get(st.id)?.classList.toggle('is-hot', on);
        return h(
          'li',
          null,
          h(
            'button',
            {
              class: 'gl-legend__item',
              type: 'button',
              onclick: () => this.travel(`stall:${st.id}`),
              onpointerenter: () => hot(true),
              onpointerleave: () => hot(false),
              onfocus: () => hot(true),
              onblur: () => hot(false),
            },
            h('span', { class: 'gl-legend__num', style: { '--accent': accent, '--accent-ink': readableOn(accent) }, text: String(i + 1) }),
            h('span', { class: 'gl-legend__text' }, h('strong', { text: st.name }), h('small', { text: [st.owner.name, st.owner.role].filter(Boolean).join(' · ') })),
          ),
        );
      }),
    );

    const close = h('button', { class: 'gl-close gl-map__close', type: 'button', 'aria-label': 'Fermer la carte (M ou Échap)', onclick: () => this.closeAndExplore() }, icon('close', { size: 20 }));
    const card = h(
      'section',
      { class: 'gl-map', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Plan de ${town}` },
      h(
        'header',
        { class: 'gl-map__head' },
        h('div', { class: 'gl-map__ribbon' }, h('h2', { class: 'gl-map__title', text: `Plan de ${town}` })),
        h('p', { class: 'gl-map__hint' }, h('kbd', { text: 'M' }), h('span', { text: 'pour fermer' })),
        close,
      ),
      h(
        'div',
        { class: 'gl-map__body' },
        canvas,
        h(
          'aside',
          { class: 'gl-legend' },
          h('p', { class: 'gl-legend__tip' }, icon('sparkle', { size: 16 }), h('span', { text: 'Touche un lieu pour t’y rendre en un clin d’œil.' })),
          h('h3', { class: 'gl-legend__h', text: 'Les lieux' }),
          zoneList,
          L.stalls.length ? h('h3', { class: 'gl-legend__h', text: 'Les cabanes' }) : null,
          L.stalls.length ? stallList : null,
        ),
      ),
    );
    const backdrop = h('div', { class: 'gl-backdrop gl-backdrop--map' }, card);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        this.closeAndExplore();
      }
    });
    return backdrop;
  }

  private shape(p: PathShape, outline: boolean): SVGElement | null {
    const fill = p.surface === 'ice' ? '#d7ecf4' : p.surface === 'wood' ? '#e3c18f' : '#ead9b7';
    const edge = p.surface === 'ice' ? '#7fb3d1' : p.surface === 'wood' ? '#9c7243' : '#b3956a';
    const pad = 1.1;
    switch (p.kind) {
      case 'disk':
        return s('circle', { cx: p.center.x, cy: p.center.z, r: p.r + (outline ? pad / 2 : 0), fill: outline ? edge : fill });
      case 'ellipse':
        return s('ellipse', { cx: p.center.x, cy: p.center.z, rx: p.rx + (outline ? pad / 2 : 0), ry: p.rz + (outline ? pad / 2 : 0), fill: outline ? edge : fill, stroke: outline ? 'none' : '#a9d0e3', 'stroke-width': outline ? 0 : 0.3 });
      case 'ring':
        return s('circle', { cx: p.center.x, cy: p.center.z, r: (p.r0 + p.r1) / 2, fill: 'none', stroke: outline ? edge : fill, 'stroke-width': p.r1 - p.r0 + (outline ? pad : 0) });
      case 'segment':
        return s('line', { x1: p.a.x, y1: p.a.z, x2: p.b.x, y2: p.b.z, stroke: outline ? edge : fill, 'stroke-width': p.width + (outline ? pad : 0), 'stroke-linecap': 'butt' });
    }
    return null;
  }

  /** Hide stall labels that would overlap a zone label or another stall label. */
  private declutter() {
    const el = this.backdrop;
    if (!el) return;
    const placed: DOMRect[] = [];
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    for (const h0 of el.querySelectorAll<HTMLElement>('.gl-map__hit')) placed.push(h0.getBoundingClientRect());
    // zone labels: the plaza (its tree is unmistakable) gives way first
    const zoneLabels = [...el.querySelectorAll<HTMLElement>('.gl-map__label--zone')].sort((a, b) => Number(a.classList.contains('gl-map__label--plaza')) - Number(b.classList.contains('gl-map__label--plaza')));
    const labelRects: DOMRect[] = [];
    for (const z of zoneLabels) {
      z.parentElement?.classList.remove('is-quiet');
      const r = z.getBoundingClientRect();
      if (labelRects.some((p) => overlap(r, p))) z.parentElement?.classList.add('is-quiet');
      else labelRects.push(r);
    }
    this.spreadMarkers();
  }

  /** Stall houses that sit too close on screen are gently pushed apart (names live in the legend/tooltips). */
  private spreadMarkers() {
    const canvas = this.backdrop?.querySelector<HTMLElement>('.gl-map__canvas');
    const W = canvas?.clientWidth ?? 0;
    const ms = [...this.markers.values()];
    if (!W || ms.length < 2) return;
    const size = ms[0].querySelector<HTMLElement>('.gl-map__house')?.offsetWidth || 24;
    const min = size + 3;
    const toPx = (v: number) => ((v + VB) / (VB * 2)) * W;
    const pts = ms.map((m, i) => {
      const x0 = toPx(Number(m.dataset.x));
      const y0 = toPx(Number(m.dataset.z));
      return { m, i, x0, y0, x: x0, y: y0 };
    });
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          const A = pts[a];
          const B = pts[b];
          let dx = B.x - A.x;
          let dy = B.y - A.y;
          let d = Math.hypot(dx, dy);
          if (d >= min) continue;
          if (d < 0.01) {
            const ang = (A.i + 1) * 2.399;
            dx = Math.cos(ang);
            dy = Math.sin(ang);
            d = 1;
          }
          const push = (min - d) / 2 + 0.05;
          A.x -= (dx / d) * push;
          A.y -= (dy / d) * push;
          B.x += (dx / d) * push;
          B.y += (dy / d) * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const p of pts) {
      p.m.style.left = `${(p.x / W) * 100}%`;
      p.m.style.top = `${(p.y / W) * 100}%`;
    }
  }
}
