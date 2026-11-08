import { h } from './dom';
import { icon } from './icons';
import type { KeyLayer, UIShared } from './shared';

export interface ModalOpts {
  /** Extra class on the panel (`gl-modal--settings`…). */
  cls: string;
  /** Accessible name. */
  label: string;
  /** Key of the 'panel' mode lock. null = never changes the game mode. */
  lock: string | null;
  onKey?: (e: KeyboardEvent) => boolean;
  onClosed?: () => void;
  /** Close when clicking the backdrop (default true). */
  backdropClose?: boolean;
  /** Extra class on the backdrop (e.g. `gl-backdrop--top` to sit above the title screen). */
  backdropCls?: string;
}

/**
 * Backdrop + card + close button. Traps focus, closes on Esc / X / click outside,
 * locks the game in 'panel' mode while open and restores focus on close.
 */
export class ModalShell {
  readonly backdrop: HTMLElement;
  readonly panel: HTMLElement;
  readonly closeBtn: HTMLButtonElement;
  private open_ = false;
  private offLayer: (() => void) | null = null;
  private restoreFocus: HTMLElement | null = null;
  private removeTimer = 0;
  private layer: KeyLayer;

  constructor(private ui: UIShared, private opts: ModalOpts) {
    this.closeBtn = h('button', { class: 'gl-close', type: 'button', 'aria-label': 'Fermer (Échap)', onclick: () => this.close() }, icon('close', { size: 20 }));
    this.panel = h('section', { class: `gl-modal ${opts.cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label, tabindex: '-1' });
    this.backdrop = h('div', { class: `gl-backdrop${opts.backdropCls ? ' ' + opts.backdropCls : ''}` }, this.panel);
    this.backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === this.backdrop && opts.backdropClose !== false) {
        e.preventDefault();
        this.close();
      }
    });
    this.layer = {
      el: this.panel,
      modal: true,
      onKey: (e) => {
        if (this.opts.onKey?.(e)) return true;
        if (e.key === 'Escape') {
          this.close();
          return true;
        }
        return false;
      },
    };
  }

  isOpen() {
    return this.open_;
  }

  show() {
    clearTimeout(this.removeTimer);
    if (!this.open_) {
      this.open_ = true;
      this.restoreFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      if (!this.backdrop.isConnected) this.ui.root.appendChild(this.backdrop);
      this.backdrop.classList.remove('is-out');
      void this.backdrop.offsetWidth;
      this.backdrop.classList.add('is-in');
      this.offLayer = this.ui.pushLayer(this.layer);
      if (this.opts.lock) this.ui.lockPanel(this.opts.lock);
      this.ui.sfx('ui-open', { volume: 0.6 });
      setTimeout(() => {
        if (!this.open_) return;
        const auto = this.panel.querySelector<HTMLElement>('[data-autofocus]');
        (auto ?? this.closeBtn).focus({ preventScroll: true });
      }, 60);
    }
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.offLayer?.();
    this.offLayer = null;
    this.backdrop.classList.remove('is-in');
    this.backdrop.classList.add('is-out');
    this.ui.sfx('ui-close', { volume: 0.5 });
    if (this.panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    const restore = this.restoreFocus;
    this.restoreFocus = null;
    if (restore?.isConnected && !restore.closest('.gl-hud')) restore.focus({ preventScroll: true });
    this.removeTimer = window.setTimeout(() => this.backdrop.remove(), 360);
    if (this.opts.lock) this.ui.unlockPanel(this.opts.lock);
    this.opts.onClosed?.();
  }
}
