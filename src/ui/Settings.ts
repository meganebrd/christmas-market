import type { Settings as SettingsData } from '../core/contracts';
import { clear, h } from './dom';
import { icon } from './icons';
import { ModalShell } from './Modal';
import type { UIShared } from './shared';

const QUALITIES: { id: SettingsData['quality']; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Ton appareil choisit' },
  { id: 'low', label: 'Légère', hint: 'Pour les petits téléphones' },
  { id: 'medium', label: 'Douce', hint: 'L’équilibre' },
  { id: 'high', label: 'Féerique', hint: 'Ombres et mille lumières' },
];

/** Sound, graphics, motion and "start again". */
export class SettingsPanel {
  private shell: ModalShell;
  private body: HTMLElement;
  private initialQuality: SettingsData['quality'] | null = null;

  constructor(private ui: UIShared, private onChange: () => void) {
    this.shell = new ModalShell(ui, { cls: 'gl-modal--settings', label: 'Paramètres', lock: 'settings', backdropCls: 'gl-backdrop--top' });
    this.body = h('div', { class: 'gl-modal__body' });
    this.shell.panel.append(
      h('header', { class: 'gl-modal__head' }, h('span', { class: 'gl-modal__badge', 'aria-hidden': 'true' }, icon('settings', { size: 22 })), h('h2', { class: 'gl-modal__title', text: 'Paramètres' }), this.shell.closeBtn),
      this.body,
    );
  }

  isOpen() {
    return this.shell.isOpen();
  }

  close() {
    this.shell.close();
  }

  open() {
    const st = this.settings();
    if (this.initialQuality === null) this.initialQuality = st.quality;
    this.render();
    this.shell.show();
  }

  private settings(): SettingsData {
    return this.ui.ctx.save?.data?.settings ?? { muted: false, music: 0.6, sfx: 0.8, quality: 'auto', reducedMotion: false };
  }

  private commit(fn: (s: SettingsData) => void) {
    const ctx = this.ui.ctx;
    if (ctx.save?.update) ctx.save.update((d) => fn(d.settings));
    else fn(this.settings());
    ctx.events?.emit('settings:change', { ...this.settings() });
    this.onChange();
  }

  private render() {
    const ctx = this.ui.ctx;
    const st = this.settings();
    clear(this.body);

    const slider = (label: string, value: number, iconName: 'music' | 'volume', onInput: (v: number) => void) => {
      const out = h('output', { class: 'gl-range__out', text: `${Math.round(value * 100)} %` });
      const input = h('input', { class: 'gl-range__input', type: 'range', min: 0, max: 100, step: 1, value: String(Math.round(value * 100)), 'aria-label': label });
      const paint = () => input.style.setProperty('--fill', `${input.value}%`);
      paint();
      input.addEventListener('input', () => {
        const v = Number(input.value) / 100;
        out.textContent = `${input.value} %`;
        paint();
        onInput(v);
      });
      input.addEventListener('change', () => this.ui.sfx('ui-select', { volume: 0.6 }));
      return h('label', { class: 'gl-range' }, h('span', { class: 'gl-range__label' }, icon(iconName, { size: 18 }), h('span', { text: label })), input, out);
    };

    const toggle = (label: string, hint: string, on: boolean, onToggle: (v: boolean) => void) => {
      const btn = h(
        'button',
        { class: 'gl-toggle', type: 'button', role: 'switch', 'aria-checked': String(on) },
        h('span', { class: 'gl-toggle__text' }, h('strong', { text: label }), h('small', { text: hint })),
        h('span', { class: 'gl-toggle__track', 'aria-hidden': 'true' }, h('span', { class: 'gl-toggle__thumb' })),
      );
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(v));
        onToggle(v);
        this.ui.sfx('ui-select', { volume: 0.6 });
      });
      return btn;
    };

    // ── sound ──
    const sound = h(
      'section',
      { class: 'gl-set' },
      h('h3', { class: 'gl-h3', text: 'Le son' }),
      slider('Musique', st.music, 'music', (v) => {
        try {
          ctx.audio?.setVolume?.('music', v);
        } catch {
          /* ignore */
        }
        this.commit((s) => (s.music = v));
      }),
      slider('Bruitages', st.sfx, 'volume', (v) => {
        try {
          ctx.audio?.setVolume?.('sfx', v);
        } catch {
          /* ignore */
        }
        this.commit((s) => (s.sfx = v));
      }),
      toggle('Couper tout le son', 'Le marché, en silence', this.isMuted(), (v) => {
        try {
          ctx.audio?.setMuted?.(v);
        } catch {
          /* ignore */
        }
        this.commit((s) => (s.muted = v));
      }),
    );

    // ── graphics ──
    const reload = h(
      'div',
      { class: 'gl-reload', hidden: st.quality === this.initialQuality },
      h('p', { text: 'Le changement prendra effet au prochain chargement.' }),
      h('button', { class: 'gl-btn gl-btn--small gl-btn--berry', type: 'button', onclick: () => location.reload() }, icon('refresh', { size: 16 }), h('span', { text: 'Recharger maintenant' })),
    );
    const group = h('div', { class: 'gl-seg', role: 'radiogroup', 'aria-label': 'Qualité graphique' });
    const tier = ctx.quality?.tier;
    for (const q of QUALITIES) {
      const b = h(
        'button',
        { class: 'gl-seg__opt', type: 'button', role: 'radio', 'aria-checked': String(st.quality === q.id) },
        h('strong', { text: q.label }),
        h('small', { text: q.id === 'auto' && tier ? `${q.hint} · ${tier === 'low' ? 'légère' : tier === 'medium' ? 'douce' : 'féerique'}` : q.hint }),
      );
      b.addEventListener('click', () => {
        for (const o of group.children) o.setAttribute('aria-checked', String(o === b));
        this.commit((s) => (s.quality = q.id));
        reload.hidden = q.id === this.initialQuality;
        this.ui.sfx('ui-select', { volume: 0.6 });
      });
      group.appendChild(b);
    }
    const graphics = h(
      'section',
      { class: 'gl-set' },
      h('h3', { class: 'gl-h3', text: 'Les images' }),
      group,
      reload,
      toggle('Réduire les animations', 'Moins de mouvements à l’écran', !!st.reducedMotion, (v) => {
        this.commit((s) => (s.reducedMotion = v));
        this.ui.applyMotion();
      }),
    );

    // ── restart ──
    const confirmRow = h(
      'div',
      { class: 'gl-confirm', hidden: true },
      h('p', { text: 'Tes étoiles et tes découvertes seront oubliées. On recommence vraiment ?' }),
      h(
        'div',
        { class: 'gl-confirm__row' },
        h(
          'button',
          {
            class: 'gl-btn gl-btn--small gl-btn--berry',
            type: 'button',
            onclick: () => {
              try {
                ctx.save?.reset?.();
              } catch {
                /* ignore */
              }
              const u = new URL(location.href);
              u.searchParams.delete('skipIntro');
              u.searchParams.delete('autostart');
              location.href = u.href;
            },
          },
          h('span', { text: 'Oui, tout recommencer' }),
        ),
        h('button', { class: 'gl-btn gl-btn--small gl-btn--ghost', type: 'button', onclick: () => ((confirmRow.hidden = true), (restartBtn.hidden = false), restartBtn.focus()) }, h('span', { text: 'Non, je reste' })),
      ),
    );
    const restartBtn = h(
      'button',
      {
        class: 'gl-btn gl-btn--ghost gl-btn--small gl-btn--danger',
        type: 'button',
        onclick: () => {
          restartBtn.hidden = true;
          confirmRow.hidden = false;
          confirmRow.querySelector<HTMLElement>('button')?.focus();
        },
      },
      icon('refresh', { size: 16 }),
      h('span', { text: 'Recommencer l’aventure' }),
    );
    const restart = h('section', { class: 'gl-set gl-set--restart' }, h('h3', { class: 'gl-h3', text: 'L’aventure' }), restartBtn, confirmRow);

    this.body.append(sound, graphics, restart);
  }

  private isMuted() {
    try {
      if (this.ui.ctx.audio?.isMuted) return this.ui.ctx.audio.isMuted();
    } catch {
      /* ignore */
    }
    return !!this.settings().muted;
  }
}
