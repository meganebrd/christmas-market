import type { AskResult, DialogueChoice, DialogueUI, SpeakerInfo } from '../core/contracts';
import { clear, h, linkProps, readableOn, safeColor, safeImage, safeUrl } from './dom';
import { icon } from './icons';
import type { UIShared } from './shared';

type Emotion = 'neutral' | 'happy' | 'surprised' | 'thinking' | 'sad';

interface Typing {
  text: string;
  i: number;
  timer: number;
  done: boolean;
  onDone: (() => void)[];
}

const EXIT_RE = /(au revoir|à bientôt|a bientot|partir|merci|bye|quit|leave|close|fermer|rien|plus tard|bonne soirée)/i;

/**
 * Bottom dialogue box: name tag, typewriter with voice blips, choices, free-text question, cards.
 */
export class Dialogue implements DialogueUI {
  private wrap: HTMLElement;
  private box: HTMLElement;
  private tag: HTMLElement;
  private tagName: HTMLElement;
  private tagTitle: HTMLElement;
  private shown: HTMLElement;
  private rest: HTMLElement;
  private live: HTMLElement;
  private extras: HTMLElement;
  private cards: HTMLElement;
  private catcher: HTMLElement;
  private speaker: SpeakerInfo | null = null;
  private open_ = false;
  private offLayer: (() => void) | null = null;
  private typing: Typing | null = null;
  private sayResolve: (() => void) | null = null;
  private autoTimer = 0;
  private choiceState: { choices: DialogueChoice[]; buttons: HTMLButtonElement[]; index: number; finish: (id: string) => void } | null = null;
  private askState: { input: HTMLInputElement; finish: (r: AskResult) => void; choices: DialogueChoice[] } | null = null;
  private lastBlip = 0;
  private closeTimer = 0;
  private layer = { el: undefined as HTMLElement | undefined, onKey: (e: KeyboardEvent) => this.onKey(e) };

  constructor(private ui: UIShared) {
    this.tagName = h('span', { class: 'gl-dlg__name' });
    this.tagTitle = h('span', { class: 'gl-dlg__title' });
    this.tag = h('div', { class: 'gl-dlg__tag' }, h('span', { class: 'gl-dlg__emo', 'aria-hidden': 'true' }), this.tagName, this.tagTitle);
    this.shown = h('span', { class: 'gl-dlg__shown' });
    this.rest = h('span', { class: 'gl-dlg__rest' });
    this.live = h('div', { class: 'gl-sr', 'aria-live': 'polite' });
    this.extras = h('div', { class: 'gl-dlg__extras' });
    this.cards = h('div', { class: 'gl-dlg__cards' });
    this.box = h(
      'div',
      { class: 'gl-dlg__box', onclick: (e: MouseEvent) => this.onBoxClick(e) },
      this.tag,
      h('p', { class: 'gl-dlg__text', 'aria-hidden': 'true' }, this.shown, this.rest),
      h('span', { class: 'gl-dlg__next', 'aria-hidden': 'true' }),
      this.extras,
    );
    this.wrap = h('section', { class: 'gl-dlg', role: 'region', 'aria-label': 'Dialogue' }, this.cards, this.box, this.live);
    this.catcher = h('div', { class: 'gl-dlg-catcher', 'aria-hidden': 'true', onclick: () => this.advance() });
    this.layer.el = this.wrap;
    ui.root.append(this.catcher, this.wrap);
  }

  // ───────────────────────────── API ─────────────────────────────

  open(speaker: SpeakerInfo): void {
    clearTimeout(this.closeTimer);
    const changed = !this.speaker || this.speaker.id !== speaker.id || this.speaker.name !== speaker.name;
    this.speaker = speaker;
    const color = safeColor(speaker.color, '#b8413a');
    this.tag.style.setProperty('--tag', color);
    this.tag.style.setProperty('--tag-ink', readableOn(color));
    this.tagName.textContent = speaker.name || '';
    this.tagTitle.textContent = speaker.title || '';
    this.tag.classList.toggle('has-title', !!speaker.title);
    this.tag.classList.toggle('is-empty', !speaker.name);
    this.wrap.setAttribute('aria-label', speaker.name ? `Dialogue avec ${speaker.name}` : 'Dialogue');
    if (!this.open_) {
      this.open_ = true;
      this.clearText();
      this.wrap.classList.remove('is-out');
      this.wrap.classList.add('is-on');
      void this.wrap.offsetWidth;
      this.wrap.classList.add('is-in');
      this.offLayer = this.ui.pushLayer(this.layer);
      this.ui.sfx('ui-open', { volume: 0.5 });
    } else if (changed) {
      this.tag.classList.remove('is-swap');
      void this.tag.offsetWidth;
      this.tag.classList.add('is-swap');
    }
  }

  say(text: string, opts?: { emotion?: Emotion; autoAdvanceMs?: number }): Promise<void> {
    if (!this.open_) this.open(this.speaker ?? { id: 'narrateur', name: '' });
    this.settlePending();
    const t = String(text ?? '');
    this.setEmotion(opts?.emotion ?? 'neutral');
    clear(this.extras);
    this.box.classList.remove('has-extras', 'is-ready');
    this.shown.textContent = '';
    this.rest.textContent = t;
    this.live.textContent = (this.speaker?.name ? this.speaker.name + ' : ' : '') + t;
    this.catcher.classList.add('is-on');
    return new Promise<void>((resolve) => {
      this.sayResolve = resolve;
      this.startTyping(t, () => {
        this.box.classList.add('is-ready');
        if (opts?.autoAdvanceMs !== undefined && opts.autoAdvanceMs >= 0) {
          this.autoTimer = window.setTimeout(() => this.resolveSay(), opts.autoAdvanceMs);
        }
      });
    });
  }

  choose(choices: DialogueChoice[]): Promise<string> {
    if (!this.open_) this.open(this.speaker ?? { id: 'narrateur', name: '' });
    const list = (choices ?? []).filter((c) => c && c.id);
    if (!list.length) return Promise.resolve('');
    return new Promise<string>((resolve) => {
      this.afterTyping(() => {
        if (!this.open_) return resolve(list[list.length - 1].id); // closed meanwhile: never hang a script
        this.settlePending();
        this.catcher.classList.remove('is-on');
        this.box.classList.remove('is-ready');
        clear(this.extras);
        const group = h('div', { class: 'gl-choices', role: 'group', 'aria-label': 'Que réponds-tu ?' });
        const buttons = list.map((c, i) => {
          const b = this.choiceButton(c, i, () => finish(c.id));
          group.appendChild(b);
          return b;
        });
        this.extras.appendChild(group);
        this.box.classList.add('has-extras');
        let done = false;
        const finish = (id: string) => {
          if (done) return;
          done = true;
          const b = buttons[list.findIndex((c) => c.id === id)];
          b?.classList.add('is-picked');
          this.ui.sfx('ui-select');
          this.choiceState = null;
          for (const x of buttons) x.disabled = true;
          setTimeout(() => {
            this.clearCards();
            resolve(id);
          }, this.ui.reducedMotion() ? 0 : 160);
        };
        this.choiceState = { choices: list, buttons, index: 0, finish };
        this.highlight(0, false);
        if (!this.ui.isTouch()) setTimeout(() => buttons[0]?.focus({ preventScroll: true }), 30);
      });
    });
  }

  ask(opts: { placeholder?: string; suggestions?: string[]; choices?: DialogueChoice[] }): Promise<AskResult> {
    if (!this.open_) this.open(this.speaker ?? { id: 'narrateur', name: '' });
    const choices = (opts?.choices ?? []).filter((c) => c && c.id);
    return new Promise<AskResult>((resolve) => {
      this.afterTyping(() => {
        if (!this.open_) return resolve(choices.length ? { type: 'choice', id: choices[choices.length - 1].id } : { type: 'text', value: '' });
        this.settlePending();
        this.catcher.classList.remove('is-on');
        this.box.classList.remove('is-ready');
        clear(this.extras);
        let done = false;
        const finish = (r: AskResult) => {
          if (done) return;
          done = true;
          this.askState = null;
          this.choiceState = null;
          this.ui.sfx('ui-select');
          input.blur();
          form.classList.add('is-sent');
          setTimeout(() => {
            this.clearCards();
            resolve(r);
          }, this.ui.reducedMotion() ? 0 : 140);
        };
        const input = h('input', {
          class: 'gl-ask__input',
          type: 'text',
          maxlength: 200,
          autocomplete: 'off',
          enterkeyhint: 'send',
          spellcheck: 'true',
          placeholder: opts?.placeholder || 'Pose ta question…',
          'aria-label': opts?.placeholder || 'Pose ta question',
        });
        const send = h('button', { class: 'gl-ask__send', type: 'submit', 'aria-label': 'Envoyer la question' }, icon('send', { size: 20 }));
        const form = h(
          'form',
          {
            class: 'gl-ask',
            onsubmit: (e: Event) => {
              e.preventDefault();
              const v = input.value.trim();
              if (!v) {
                form.classList.remove('is-shake');
                void form.offsetWidth;
                form.classList.add('is-shake');
                input.focus();
                return;
              }
              finish({ type: 'text', value: v });
            },
          },
          h('span', { class: 'gl-ask__icon', 'aria-hidden': 'true' }, icon('chat', { size: 18 })),
          input,
          send,
        );
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            input.blur();
          }
        });
        this.extras.appendChild(form);
        const sugg = (opts?.suggestions ?? []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 6);
        if (sugg.length) {
          const chips = h('div', { class: 'gl-chips', role: 'group', 'aria-label': 'Suggestions de questions' });
          sugg.forEach((sg, i) =>
            chips.appendChild(
              h(
                'button',
                { class: 'gl-sugg', type: 'button', style: { animationDelay: `${60 + i * 50}ms` }, onclick: () => finish({ type: 'text', value: sg }) },
                h('span', { class: 'gl-sugg__spark', 'aria-hidden': 'true', text: '✦' }),
                h('span', { text: sg }),
              ),
            ),
          );
          this.extras.appendChild(chips);
          // phones: the row scrolls sideways; soft fades tell there is more on either side
          const edges = () => {
            const more = chips.scrollWidth - chips.clientWidth > 4;
            chips.classList.toggle('has-more-right', more && chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 4);
            chips.classList.toggle('has-more-left', more && chips.scrollLeft > 4);
          };
          chips.addEventListener('scroll', edges, { passive: true });
          requestAnimationFrame(edges);
          setTimeout(edges, 400);
        }
        let buttons: HTMLButtonElement[] = [];
        if (choices.length) {
          const group = h('div', { class: 'gl-choices gl-choices--ask', role: 'group', 'aria-label': 'Ou bien…' });
          buttons = choices.map((c, i) => {
            const b = this.choiceButton(c, i, () => finish({ type: 'choice', id: c.id }));
            group.appendChild(b);
            return b;
          });
          this.extras.appendChild(group);
          this.choiceState = { choices, buttons, index: -1, finish: (id) => finish({ type: 'choice', id }) };
        }
        this.box.classList.add('has-extras');
        this.askState = { input, finish, choices };
        if (!this.ui.isTouch()) setTimeout(() => input.focus({ preventScroll: true }), 40);
      });
    });
  }

  card(card: { title: string; subtitle?: string; image?: string; url?: string; cta?: string }): void {
    if (!card || !card.title) return;
    const img = safeImage(card.image);
    const href = safeUrl(card.url);
    const media = h('div', { class: 'gl-dcard__media' });
    const fallback = () => {
      clear(media);
      media.classList.add('is-fallback');
      media.appendChild(icon('gift', { size: 30 }));
    };
    if (img) {
      const im = h('img', { src: img, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      im.addEventListener('error', fallback, { once: true });
      media.appendChild(im);
    } else fallback();
    const el = h(
      'article',
      { class: 'gl-dcard' },
      media,
      h(
        'div',
        { class: 'gl-dcard__body' },
        h('h3', { class: 'gl-dcard__title', text: card.title }),
        card.subtitle ? h('p', { class: 'gl-dcard__sub', text: card.subtitle }) : null,
        href
          ? h('a', { class: 'gl-btn gl-btn--small gl-btn--berry', ...linkProps(href), onclick: (e: Event) => e.stopPropagation() }, h('span', { text: card.cta || 'Voir sur le site' }), icon('arrowUpRight', { size: 16 }))
          : null,
      ),
    );
    while (this.cards.children.length >= 3) this.cards.firstElementChild?.remove();
    this.cards.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    this.ui.sfx('pop', { volume: 0.5 });
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.settlePending(true);
    this.stopTyping();
    this.catcher.classList.remove('is-on');
    this.offLayer?.();
    this.offLayer = null;
    this.wrap.classList.remove('is-in');
    this.wrap.classList.add('is-out');
    if (this.wrap.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.ui.sfx('ui-close', { volume: 0.4 });
    this.closeTimer = window.setTimeout(() => {
      this.wrap.classList.remove('is-on', 'is-out');
      this.clearText();
      this.clearCards();
      this.speaker = null;
    }, 380);
  }

  isOpen(): boolean {
    return this.open_;
  }

  /** The key layer, so a panel opened over the dialogue can hand keys back. */
  get keyLayer() {
    return this.layer;
  }

  // ───────────────────────────── internals ─────────────────────────────

  private clearText() {
    this.shown.textContent = '';
    this.rest.textContent = '';
    clear(this.extras);
    this.box.classList.remove('has-extras', 'is-ready');
    this.setEmotion('neutral');
  }

  private clearCards() {
    for (const c of [...this.cards.children]) {
      c.classList.remove('is-in');
      c.classList.add('is-out');
      setTimeout(() => c.remove(), 260);
    }
  }

  private setEmotion(e: Emotion) {
    for (const k of ['happy', 'surprised', 'thinking', 'sad']) this.wrap.classList.remove(`is-emo-${k}`);
    const emo = this.tag.querySelector('.gl-dlg__emo');
    if (emo) emo.textContent = e === 'happy' ? '♪' : e === 'surprised' ? '!' : e === 'thinking' ? '…' : '';
    if (e !== 'neutral') {
      void this.wrap.offsetWidth;
      this.wrap.classList.add(`is-emo-${e}`);
    }
  }

  /** Anything still waiting (a say, a choice, a question) is settled so scripts never hang. */
  private settlePending(closing = false) {
    clearTimeout(this.autoTimer);
    if (this.sayResolve) {
      this.stopTyping(true);
      this.resolveSay();
    }
    if (this.choiceState && (closing || !this.askState)) {
      const cs = this.choiceState;
      this.choiceState = null;
      cs.finish(cs.choices[cs.choices.length - 1].id);
    }
    if (this.askState) {
      const as = this.askState;
      this.askState = null;
      if (as.choices.length) as.finish({ type: 'choice', id: as.choices[as.choices.length - 1].id });
      else as.finish({ type: 'text', value: '' });
    }
  }

  private resolveSay() {
    clearTimeout(this.autoTimer);
    const r = this.sayResolve;
    this.sayResolve = null;
    this.catcher.classList.remove('is-on');
    this.box.classList.remove('is-ready');
    r?.();
  }

  private startTyping(text: string, onDone: () => void) {
    this.stopTyping();
    const typing: Typing = { text, i: 0, timer: 0, done: false, onDone: [onDone] };
    this.typing = typing;
    const reduced = this.ui.reducedMotion();
    const base = reduced ? 9 : text.length > 220 ? 17 : 24;
    const pitch = this.speaker?.voicePitch ?? 1;
    const tick = () => {
      if (this.typing !== typing) return;
      const ch = text[typing.i];
      typing.i++;
      this.shown.textContent = text.slice(0, typing.i);
      this.rest.textContent = text.slice(typing.i);
      if (ch && /[\p{L}\p{N}]/u.test(ch)) {
        const now = performance.now();
        if (now - this.lastBlip > 48) {
          this.lastBlip = now;
          this.ui.blip(ch, pitch);
        }
      }
      if (typing.i >= text.length) return this.finishTyping(typing);
      let delay = base;
      const next = text[typing.i];
      if (ch === '…') delay += 320;
      else if (/[.!?]/.test(ch) && (!next || /\s/.test(next))) delay += 260;
      else if (/[,;:]/.test(ch)) delay += 130;
      else if (ch === '\n') delay += 200;
      if (reduced) delay = Math.min(delay, 60);
      typing.timer = window.setTimeout(tick, delay);
    };
    if (!text.length) this.finishTyping(typing);
    else typing.timer = window.setTimeout(tick, reduced ? 0 : 90);
  }

  private finishTyping(typing: Typing) {
    if (typing.done) return;
    clearTimeout(typing.timer);
    typing.done = true;
    this.shown.textContent = typing.text;
    this.rest.textContent = '';
    const cbs = typing.onDone.splice(0);
    for (const cb of cbs) cb();
  }

  private stopTyping(complete = false) {
    const t = this.typing;
    if (!t) return;
    if (complete) this.finishTyping(t);
    else clearTimeout(t.timer);
    this.typing = null;
  }

  /** Run `fn` once the current line is fully typed (immediately if nothing is typing). */
  private afterTyping(fn: () => void) {
    const t = this.typing;
    if (t && !t.done) t.onDone.push(() => setTimeout(fn, 0));
    else fn();
  }

  /** Click / E / Space / Enter: complete the line, then continue. */
  private advance() {
    const t = this.typing;
    if (t && !t.done) {
      this.finishTyping(t);
      return;
    }
    if (this.sayResolve) {
      this.ui.sfx('dialogue-next', { volume: 0.5 });
      this.resolveSay();
    }
  }

  private onBoxClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, form')) return;
    this.advance();
  }

  private choiceButton(c: DialogueChoice, i: number, onPick: () => void): HTMLButtonElement {
    const b = h(
      'button',
      {
        class: 'gl-choice',
        type: 'button',
        style: { animationDelay: `${i * 55}ms` },
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          onPick();
        },
        onpointerenter: () => this.highlight(i, false),
      },
      i < 9 ? h('kbd', { class: 'gl-choice__key', 'aria-hidden': 'true', text: String(i + 1) }) : null,
      c.icon ? h('span', { class: 'gl-choice__icon', 'aria-hidden': 'true', text: c.icon }) : null,
      h('span', { class: 'gl-choice__label', text: c.label }),
    );
    return b;
  }

  private highlight(i: number, focus = true) {
    const cs = this.choiceState;
    if (!cs) return;
    cs.index = i;
    cs.buttons.forEach((b, j) => b.classList.toggle('is-hl', j === i));
    if (focus && i >= 0) cs.buttons[i]?.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent): boolean {
    if (!this.open_) return false;
    const key = e.key;
    const isAdvance = key === ' ' || key === 'Enter' || e.code === 'KeyE';
    const typingTarget = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

    // free text question
    if (this.askState) {
      if (typingTarget) return false; // the input handles its own keys (Enter submits)
      const cs = this.choiceState;
      if (cs && /^[1-9]$/.test(key)) {
        const c = cs.choices[Number(key) - 1];
        if (c) cs.finish(c.id);
        return true;
      }
      if (cs && (key === 'ArrowDown' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowLeft')) {
        const d = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
        const n = cs.buttons.length;
        this.highlight(cs.index < 0 ? (d > 0 ? 0 : n - 1) : (cs.index + d + n) % n);
        return true;
      }
      if (key === 'Escape') {
        const exit = this.exitChoice(this.askState.choices);
        if (exit) this.askState.finish({ type: 'choice', id: exit });
        return true;
      }
      if ((key === 'Enter' || key === ' ') && e.target instanceof HTMLButtonElement) return false; // native click
      if (key === 'Enter') {
        this.askState.input.focus();
        return true;
      }
      // start typing anywhere → goes into the field
      if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.askState.input.focus();
        return false; // let the character land in the field
      }
      return isAdvance;
    }

    // choices
    if (this.choiceState) {
      const cs = this.choiceState;
      if (e.repeat) return true;
      if (/^[1-9]$/.test(key)) {
        const c = cs.choices[Number(key) - 1];
        if (c) cs.finish(c.id);
        return true;
      }
      if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowLeft' || (key === 'Tab' && !e.shiftKey) || (key === 'Tab' && e.shiftKey)) {
        const d = key === 'ArrowDown' || key === 'ArrowRight' || (key === 'Tab' && !e.shiftKey) ? 1 : -1;
        const n = cs.buttons.length;
        this.highlight((Math.max(0, cs.index) + d + n) % n);
        return true;
      }
      if (isAdvance) {
        const c = cs.choices[Math.max(0, cs.index)];
        if (c) cs.finish(c.id);
        return true;
      }
      if (key === 'Escape') {
        const exit = this.exitChoice(cs.choices);
        if (exit) cs.finish(exit);
        return true;
      }
      return false;
    }

    // typing / waiting for "continue"
    if (isAdvance || key === 'Escape') {
      if (!e.repeat) this.advance();
      return true;
    }
    return false;
  }

  private exitChoice(choices: DialogueChoice[]): string | null {
    for (let i = choices.length - 1; i >= 0; i--) {
      const c = choices[i];
      if (EXIT_RE.test(c.id) || EXIT_RE.test(c.label)) return c.id;
    }
    return null;
  }
}
