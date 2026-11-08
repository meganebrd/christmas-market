import { h } from './dom';
import { icon } from './icons';
import type { UIShared } from './shared';

export interface MinigameHudState {
  title: string;
  score?: string;
  /** Remaining seconds (the bar is relative to the largest value seen for this title). */
  time?: number;
  hint?: string;
  /** Show the touch joystick (false for aiming/timing games). */
  joystick?: boolean;
}

/** Mini-game overlay (title, score, timer bar, hint) and the result card. */
export class Minigame {
  private hud: HTMLElement;
  private title: HTMLElement;
  private score: HTMLElement;
  private timer: HTMLElement;
  private timerFill: HTMLElement;
  private timerText: HTMLElement;
  private hint: HTMLElement;
  private maxTime = 0;
  private lastTitle = '';
  private lastScore = '';
  private resultOpen = false;

  constructor(private ui: UIShared) {
    this.title = h('span', { class: 'gl-mg__title' });
    this.score = h('span', { class: 'gl-mg__score', 'aria-live': 'polite' });
    this.timerFill = h('span', { class: 'gl-mg__fill' });
    this.timerText = h('span', { class: 'gl-mg__secs' });
    this.timer = h('div', { class: 'gl-mg__timer' }, h('span', { class: 'gl-mg__track' }, this.timerFill), this.timerText);
    this.hint = h('p', { class: 'gl-mg__hint' });
    // Touch screens have no Échap key: a small, discreet way out of every mini-game.
    const quit = h(
      'button',
      {
        class: 'gl-mg__quit',
        type: 'button',
        'aria-label': 'Quitter le jeu (Échap)',
        title: 'Quitter le jeu',
        onpointerdown: (e: PointerEvent) => e.stopPropagation(),
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).blur();
          this.abort();
        },
      },
      icon('close', { size: 14 }),
      h('span', { text: 'Quitter' }),
      h('kbd', { class: 'gl-mg__esc', 'aria-hidden': 'true', text: 'Échap' }),
    );
    this.hud = h('div', { class: 'gl-mg' }, h('div', { class: 'gl-mg__card gl-chip' }, h('span', { class: 'gl-mg__main' }, this.title, this.score), this.timer, quit), this.hint);
    ui.root.appendChild(this.hud);
  }

  isBlocking() {
    return this.resultOpen;
  }

  /** "Quitter": the minigames module listens to `minigame:abort` (same as Échap). */
  private abort() {
    if (this.resultOpen || !this.hud.classList.contains('is-on')) return;
    this.ui.sfx('ui-close', { volume: 0.6 });
    this.ui.ctx.events?.emit('minigame:abort');
  }

  setHud(state: MinigameHudState | null) {
    document.documentElement.dataset.mgJoystick = state && state.joystick === false ? 'off' : 'on';
    if (!state) {
      this.hud.classList.remove('is-on');
      this.maxTime = 0;
      this.lastTitle = '';
      this.lastScore = '';
      return;
    }
    if (state.title !== this.lastTitle) {
      this.lastTitle = state.title;
      this.maxTime = 0;
    }
    this.title.textContent = state.title;
    const sc = state.score ?? '';
    this.score.hidden = !sc;
    if (sc !== this.lastScore) {
      this.score.textContent = sc;
      if (this.lastScore) {
        this.score.classList.remove('is-bump');
        void this.score.offsetWidth;
        this.score.classList.add('is-bump');
      }
      this.lastScore = sc;
    }
    if (typeof state.time === 'number' && Number.isFinite(state.time)) {
      const t = Math.max(0, state.time);
      this.maxTime = Math.max(this.maxTime, t);
      const f = this.maxTime > 0 ? t / this.maxTime : 0;
      this.timer.hidden = false;
      this.timerFill.style.transform = `scaleX(${f.toFixed(4)})`;
      this.timer.classList.toggle('is-low', f < 0.25);
      this.timerText.textContent = `${Math.ceil(t)} s`;
    } else this.timer.hidden = true;
    this.hint.textContent = state.hint ?? '';
    this.hint.hidden = !state.hint;
    this.hud.classList.add('is-on');
  }

  result(opts: { title: string; text: string; won: boolean }): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resultOpen = true;
      const won = !!opts.won;
      const fx = h('div', { class: 'gl-result__fx', 'aria-hidden': 'true' });
      const n = this.ui.reducedMotion() ? 0 : won ? 46 : 22;
      const colors = ['#e2b34a', '#b8413a', '#2f5d50', '#f3d27a', '#fff8ea', '#7b8cff'];
      for (let i = 0; i < n; i++) {
        const r = (k: number) => {
          const x = Math.sin((i + 1) * 91.7 + k * 13.3) * 43758.5453;
          return x - Math.floor(x);
        };
        fx.appendChild(
          h('i', {
            class: won ? 'gl-confetti' : 'gl-fallstar',
            style: {
              left: `${r(1) * 100}%`,
              animationDelay: `${r(2) * (won ? 0.9 : 2.4)}s`,
              animationDuration: `${(won ? 2.4 : 4) + r(3) * 2}s`,
              '--c': colors[i % colors.length],
              '--x': `${(r(4) - 0.5) * 140}px`,
              '--rot': `${r(5) * 720 - 360}deg`,
              '--s': String(0.6 + r(6) * 0.8),
            },
          }),
        );
      }
      const btn = h('button', { class: 'gl-btn gl-btn--berry gl-result__btn', type: 'button' }, h('span', { text: 'Continuer' }), icon('chevronRight', { size: 18 }));
      const card = h(
        'section',
        { class: `gl-result ${won ? 'is-won' : 'is-lost'}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
        h('div', { class: 'gl-result__medal', 'aria-hidden': 'true' }, won ? icon('star', { size: 46 }) : h('span', { class: 'gl-result__flake', text: '❄' })),
        h('p', { class: 'gl-result__kicker', text: won ? 'Bravo !' : 'Presque !' }),
        h('h2', { class: 'gl-result__title', text: opts.title }),
        h('p', { class: 'gl-result__text', text: opts.text }),
        btn,
      );
      const back = h('div', { class: 'gl-backdrop gl-backdrop--result' }, fx, card);
      this.ui.root.appendChild(back);
      void back.offsetWidth;
      back.classList.add('is-in');
      this.ui.sfx(won ? 'success' : 'fail', { volume: 0.7 });
      let done = false;
      const off = this.ui.pushLayer({
        el: card,
        modal: true,
        onKey: (e) => {
          if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.code === 'KeyE') {
            if (!e.repeat) finish();
            return true;
          }
          return false;
        },
      });
      const finish = () => {
        if (done) return;
        done = true;
        off();
        this.ui.sfx('ui-select');
        back.classList.remove('is-in');
        back.classList.add('is-out');
        setTimeout(() => back.remove(), 420);
        this.resultOpen = false;
        resolve();
      };
      btn.addEventListener('click', finish);
      setTimeout(() => btn.focus({ preventScroll: true }), 350);
    });
  }
}
