import type { GameMode, QuestState } from '../core/contracts';
import { clear, h } from './dom';
import { icon, type IconName } from './icons';
import { UIShared } from './shared';

export interface HudActions {
  openSettings: () => void;
  openHelp: () => void;
  toast: (text: string, opts?: { icon?: string; duration?: number }) => void;
}

/** Top-left quest tracker + top-right round buttons, frosted over the scene. */
export class Hud {
  readonly el: HTMLElement;
  private quest: HTMLElement;
  private questLabel: HTMLElement;
  private questCount: HTMLElement;
  private stars: HTMLElement;
  private objective: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private musicBtn: HTMLButtonElement;
  private visible = true;
  private state: QuestState | null = null;
  private finaleDone = false;

  constructor(private ui: UIShared, private actions: HudActions) {
    const ctx = ui.ctx;
    this.questLabel = h('span', { class: 'gl-quest__label', text: 'Étoiles de verre' });
    this.questCount = h('span', { class: 'gl-quest__count' });
    this.stars = h('div', { class: 'gl-quest__stars', 'aria-hidden': 'true' });
    this.objective = h('p', { class: 'gl-quest__obj' });
    this.quest = h(
      'div',
      { class: 'gl-quest gl-chip', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'gl-quest__top' }, this.questLabel, h('span', { class: 'gl-quest__dot', 'aria-hidden': 'true', text: '·' }), this.questCount),
      this.stars,
      this.objective,
    );
    this.quest.hidden = true;

    const btn = (name: IconName, label: string, onClick: (e: MouseEvent) => void, cls = '') =>
      h(
        'button',
        {
          class: `gl-round ${cls}`,
          type: 'button',
          'aria-label': label,
          'data-tip': label,
          onclick: (e: MouseEvent) => {
            onClick(e);
            UIShared.blurAfterPointer(e);
          },
        },
        icon(name, { size: 22 }),
      );

    this.soundBtn = btn('volume', 'Couper le son', () => this.toggleMute(), 'gl-round--sound');
    this.musicBtn = btn('music', 'Musique suivante', () => this.nextTrack(), 'gl-round--music');
    this.musicBtn.addEventListener('pointerenter', () => {
      const t = this.currentTrack();
      this.musicBtn.dataset.tip = t ? `♪ ${t}` : 'Musique suivante';
    });
    const buttons = h(
      'nav',
      { class: 'gl-hud__buttons', 'aria-label': 'Menu' },
      btn('map', 'Carte (M)', () => ctx.input?.press?.('map'), 'gl-round--map'),
      this.soundBtn,
      this.musicBtn,
      btn('settings', 'Paramètres', () => actions.openSettings(), 'gl-round--settings'),
      btn('help', 'Aide', () => actions.openHelp(), 'gl-round--help'),
    );
    this.el = h('div', { class: 'gl-hud' }, this.quest, buttons);
    ui.root.appendChild(this.el);
    ctx.events?.on('mode:change', ({ to }) => this.applyMode(to));
    // the tree only "shines" once the finale has really played
    ctx.events?.on('finale:end', () => {
      this.finaleDone = true;
      if (this.state) this.setQuest(this.state);
    });
    ctx.events?.on('settings:change', () => this.syncSound());
    this.applyMode(ctx.mode);
    this.syncSound();
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.applyMode(this.ui.ctx.mode);
  }

  private applyMode(mode: GameMode) {
    const show = this.visible && (mode === 'explore' || mode === 'panel' || mode === 'map' || mode === 'dialogue' || mode === 'minigame');
    this.el.classList.toggle('is-on', show);
    this.el.dataset.mode = mode;
    if (show) this.syncSound();
  }

  // ───────────── quest ─────────────

  setQuest(q: QuestState) {
    if (!q || !q.total) {
      this.quest.hidden = true;
      this.state = q ?? null;
      return;
    }
    const prev = this.state;
    this.state = { ...q, ids: [...(q.ids ?? [])] };
    this.quest.hidden = false;
    const found = Math.max(0, Math.min(q.total, q.found));
    this.questCount.textContent = `${found}/${q.total}`;
    this.quest.setAttribute('aria-label', `Étoiles de verre : ${found} sur ${q.total}${q.objective ? '. ' + q.objective : ''}`);
    // All stars found but the tree is still dark: keep the story's objective ("Retourne voir Céleste…").
    const shining = !!q.complete && this.finaleSeen();
    this.objective.textContent = shining ? 'Le Grand Sapin brille de mille feux ✨' : q.objective ?? '';
    this.objective.hidden = !this.objective.textContent;
    this.quest.classList.toggle('is-complete', shining);
    this.quest.classList.toggle('is-ready', !!q.complete && !shining);

    const prevFound = prev && prev.total === q.total ? prev.found : found;
    if (this.stars.children.length !== q.total) {
      clear(this.stars);
      for (let i = 0; i < q.total; i++) this.stars.appendChild(h('span', { class: 'gl-star' }, icon('star', { size: 18 })));
    }
    [...this.stars.children].forEach((st, i) => {
      const on = i < found;
      st.classList.toggle('is-on', on);
      if (on && i >= prevFound && prev) {
        st.classList.remove('is-new');
        void (st as HTMLElement).offsetWidth;
        st.classList.add('is-new');
        setTimeout(() => st.classList.remove('is-new'), 1400);
      }
    });
    if (prev && found > prevFound) {
      this.quest.classList.remove('is-bump');
      void this.quest.offsetWidth;
      this.quest.classList.add('is-bump');
    }
  }

  private finaleSeen(): boolean {
    if (this.finaleDone) return true;
    try {
      return !!this.ui.ctx.save?.flag?.<boolean>('finale');
    } catch {
      return false;
    }
  }

  // ───────────── sound ─────────────

  private muted(): boolean {
    try {
      const a = this.ui.ctx.audio;
      if (a?.isMuted) return a.isMuted();
    } catch {
      /* ignore */
    }
    return !!this.ui.ctx.save?.data?.settings?.muted;
  }

  syncSound() {
    const m = this.muted();
    const svg = this.soundBtn.querySelector('svg');
    if (svg) svg.replaceWith(icon(m ? 'volumeOff' : 'volume', { size: 22 }));
    this.soundBtn.setAttribute('aria-label', m ? 'Remettre le son' : 'Couper le son');
    this.soundBtn.dataset.tip = m ? 'Remettre le son' : 'Couper le son';
    this.soundBtn.classList.toggle('is-off', m);
    this.soundBtn.setAttribute('aria-pressed', String(m));
  }

  toggleMute() {
    const ctx = this.ui.ctx;
    const next = !this.muted();
    try {
      ctx.audio?.setMuted?.(next);
    } catch {
      /* ignore */
    }
    ctx.save?.update?.((d) => (d.settings.muted = next));
    ctx.events?.emit('settings:change', { ...ctx.save.data.settings });
    this.syncSound();
    if (!next) this.ui.sfx('ui-select');
    this.actions.toast(next ? 'Chut… le marché se fait silencieux' : 'Le son est de retour', { icon: next ? '🔇' : '🔔', duration: 1800 });
  }

  private currentTrack(): string | null {
    try {
      const t = this.ui.ctx.audio?.music?.current?.();
      if (!t) return null;
      return t.author ? `${t.title} · ${t.author}` : t.title;
    } catch {
      return null;
    }
  }

  private nextTrack() {
    try {
      this.ui.ctx.audio?.music?.next?.();
    } catch {
      /* ignore */
    }
    this.musicBtn.classList.remove('is-spin');
    void this.musicBtn.offsetWidth;
    this.musicBtn.classList.add('is-spin');
    setTimeout(() => {
      const t = this.currentTrack();
      this.actions.toast(t ?? 'La boîte à musique se repose un instant', { icon: '🎵', duration: 2600 });
      if (t) this.musicBtn.dataset.tip = `♪ ${t}`;
    }, 60);
  }
}
