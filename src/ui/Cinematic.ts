import { h } from './dom';
import { icon } from './icons';
import type { UIShared } from './shared';

/** Letterbox bars, elegant narrated subtitles, "Passer" button. */
export class Cinematic {
  private bars: HTMLElement;
  private subtitle: HTMLElement;
  private live: HTMLElement;
  private skipBtn: HTMLButtonElement;
  private onSkip: (() => void) | null = null;
  private offLayer: (() => void) | null = null;
  private pending: { resolve: () => void; timer: number } | null = null;
  private lineId = 0;

  constructor(private ui: UIShared) {
    this.bars = h('div', { class: 'gl-letterbox', 'aria-hidden': 'true' }, h('div', { class: 'gl-letterbox__bar gl-letterbox__bar--top' }), h('div', { class: 'gl-letterbox__bar gl-letterbox__bar--bottom' }));
    this.subtitle = h('div', { class: 'gl-narration', 'aria-hidden': 'true' });
    this.live = h('div', { class: 'gl-sr', 'aria-live': 'polite' });
    this.skipBtn = h(
      'button',
      { class: 'gl-skip', type: 'button', 'aria-label': 'Passer la cinématique (Échap)', onclick: () => this.skip() },
      h('span', { text: 'Passer' }),
      icon('skip', { size: 18 }),
      h('kbd', { class: 'gl-skip__key', text: 'Échap' }),
    );
    ui.root.append(this.bars, this.subtitle, this.live, this.skipBtn);
  }

  letterbox(on: boolean) {
    this.bars.classList.toggle('is-on', on);
    this.subtitle.classList.toggle('is-boxed', on);
  }

  narrate(text: string, opts?: { duration?: number }): Promise<void> {
    this.finishLine();
    const id = ++this.lineId;
    const clean = String(text ?? '');
    const duration = opts?.duration ?? Math.max(2800, 1500 + clean.length * 62);
    const line = h('p', { class: 'gl-narration__line' });
    // soft typewriter: words fade in one after the other
    const words = clean.split(/(\s+)/);
    let delay = 0;
    const step = this.ui.reducedMotion() ? 0 : Math.min(70, 900 / Math.max(1, words.length / 2));
    for (const w of words) {
      if (/^\s+$/.test(w)) {
        line.appendChild(document.createTextNode(w));
        continue;
      }
      line.appendChild(h('span', { class: 'gl-narration__word', style: { animationDelay: `${delay}ms` }, text: w }));
      delay += step + (/[,;:]$/.test(w) ? 140 : /[.!?…]$/.test(w) ? 240 : 0);
    }
    // previous lines fade out
    for (const old of [...this.subtitle.children]) {
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 700);
    }
    this.subtitle.appendChild(line);
    this.live.textContent = clean;
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        if (id !== this.lineId) return;
        this.pending = null;
        line.classList.add('is-out');
        setTimeout(() => line.remove(), 700);
        resolve();
      }, duration);
      this.pending = { resolve, timer };
    });
  }

  /** Resolve the current narration right away. */
  private finishLine() {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const r = this.pending.resolve;
    this.pending = null;
    r();
  }

  clearNarration() {
    this.finishLine();
    for (const old of [...this.subtitle.children]) {
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 700);
    }
  }

  setSkippable(onSkip: (() => void) | null) {
    this.onSkip = onSkip;
    this.skipBtn.classList.toggle('is-on', !!onSkip);
    this.offLayer?.();
    this.offLayer = null;
    if (onSkip) {
      this.offLayer = this.ui.pushLayer({
        onKey: (e) => {
          if (e.key === 'Escape') {
            this.skip();
            return true;
          }
          return false;
        },
      });
    }
  }

  private skip() {
    const fn = this.onSkip;
    if (!fn) return;
    this.ui.sfx('ui-select');
    this.setSkippable(null);
    this.clearNarration();
    try {
      fn();
    } catch (err) {
      console.error('[givrelune] skip failed', err);
    }
  }
}
