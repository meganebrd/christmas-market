import { h, parseColor, type Child } from '../ui/dom';
import type { Choice, Swatch } from './catalog';
import { icon } from './icons';
import { getPath, setPath, type Store } from './state';

/**
 * Small form controls bound to a dotted path of the draft. They write into `store.draft` and call
 * `store.touch('field')` — never re-render themselves from scratch, so typing keeps the focus.
 */

let uid = 0;
export const nextId = (p = 'f') => `ed-${p}-${++uid}`;

export interface FieldOpts {
  label: string;
  hint?: Child;
  id?: string;
  /** Extra element on the right of the label (counter, button…). */
  aside?: Child;
  class?: string;
  /** Id of the input the label points to, when the control is a wrapper. */
  for?: string;
}

export function field(o: FieldOpts, control: HTMLElement): HTMLElement {
  const id = o.id ?? (control.id || nextId());
  if (!control.id && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) control.id = id;
  const labelFor = o.for ?? (/^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName) ? control.id : undefined);
  const hintId = o.hint ? id + '-hint' : undefined;
  if (hintId && labelFor) (document.getElementById(labelFor) ?? control.querySelector(`#${labelFor}`) ?? control).setAttribute('aria-describedby', hintId);
  // groups (swatches, pills…) are named by the visible label
  if (!labelFor && (control.getAttribute('role') === 'radiogroup' || control.querySelector('[role="radiogroup"]')) && !control.hasAttribute('aria-label'))
    (control.getAttribute('role') === 'radiogroup' ? control : control.querySelector('[role="radiogroup"]')!).setAttribute('aria-labelledby', id + '-label');
  return h(
    'div',
    { class: 'ed-field ' + (o.class ?? '') },
    h('div', { class: 'ed-field__head' }, labelFor ? h('label', { class: 'ed-label', for: labelFor }, o.label) : h('span', { class: 'ed-label', id: id + '-label' }, o.label), o.aside),
    control,
    o.hint ? h('p', { class: 'ed-hint', id: hintId }, o.hint) : null,
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'ed-section' }, h('h3', { class: 'ed-section__title' }, title), ...children);
}

export function note(kind: 'tip' | 'warn' | 'info', ...children: Child[]): HTMLElement {
  const ic = kind === 'warn' ? 'alert' : kind === 'tip' ? 'sparkle' : 'info';
  return h('div', { class: `ed-note ed-note--${kind}`, role: kind === 'warn' ? 'status' : undefined }, icon(ic, 18), h('div', { class: 'ed-note__body' }, ...children));
}

// ───────────────────────────── text ─────────────────────────────

export interface TextOpts {
  type?: 'text' | 'url' | 'number' | 'email';
  placeholder?: string;
  maxLength?: number;
  list?: string;
  inputmode?: string;
  /** string → stored value (undefined deletes the key). Default: trimmed-empty → undefined. */
  parse?: (s: string) => unknown;
  format?: (v: unknown) => string;
  onInput?: (value: unknown) => void;
  /** Returns an error message, shown under the input. */
  validate?: (s: string) => string | null;
  autocomplete?: string;
  class?: string;
  id?: string;
  focusKey?: string;
}

export function textInput(store: Store, path: string, o: TextOpts = {}): HTMLInputElement {
  const fmt = o.format ?? ((v: unknown) => (v === undefined || v === null ? '' : String(v)));
  const parse = o.parse ?? ((s: string) => (s === '' ? undefined : s));
  const input = h('input', {
    class: 'ed-input ' + (o.class ?? ''),
    id: o.id,
    type: o.type === 'number' ? 'text' : o.type ?? 'text',
    inputmode: o.type === 'number' ? 'decimal' : o.inputmode ?? (o.type === 'url' ? 'url' : undefined),
    placeholder: o.placeholder,
    maxlength: o.maxLength,
    list: o.list,
    autocomplete: o.autocomplete ?? 'off',
    spellcheck: o.type === 'url' || o.type === 'email' ? 'false' : undefined,
    value: fmt(getPath(store.draft, path)),
    dataset: o.focusKey ? { focusKey: o.focusKey } : undefined,
  });
  const check = () => {
    if (!o.validate) return;
    const err = o.validate(input.value);
    input.classList.toggle('is-invalid', !!err);
    input.setAttribute('aria-invalid', err ? 'true' : 'false');
    // the message goes right after the input, or after its decorated wrapper (id field)
    const anchor = input.closest<HTMLElement>('.ed-idfield') ?? input;
    let msg = anchor.nextElementSibling?.classList.contains('ed-error') ? (anchor.nextElementSibling as HTMLElement) : null;
    if (err) {
      if (!msg && anchor.parentElement) {
        msg = h('p', { class: 'ed-error', role: 'status', id: (input.id || nextId('e')) + '-err' });
        anchor.insertAdjacentElement('afterend', msg);
      }
      if (msg) {
        msg.textContent = err;
        input.setAttribute('aria-errormessage', msg.id);
      }
    } else {
      msg?.remove();
      input.removeAttribute('aria-errormessage');
    }
  };
  input.addEventListener('input', () => {
    const v = parse(input.value);
    setPath(store.draft, path, v);
    o.onInput?.(v);
    check();
    store.touch('field');
  });
  // the value changed elsewhere (auto-slug, scan…): re-read it without firing `input`
  input.addEventListener('ed:sync', () => {
    input.value = fmt(getPath(store.draft, path));
    check();
  });
  queueMicrotask(check);
  return input;
}

export interface AreaOpts {
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  onInput?: (v: string) => void;
  id?: string;
  class?: string;
  focusKey?: string;
}

export function textArea(store: Store, path: string, o: AreaOpts = {}): HTMLTextAreaElement {
  const ta = h('textarea', {
    class: 'ed-input ed-textarea ' + (o.class ?? ''),
    id: o.id,
    rows: o.rows ?? 3,
    placeholder: o.placeholder,
    maxlength: o.maxLength,
    dataset: o.focusKey ? { focusKey: o.focusKey } : undefined,
  });
  ta.value = String(getPath(store.draft, path) ?? '');
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, 640) + 'px';
  };
  ta.addEventListener('input', () => {
    setPath(store.draft, path, ta.value === '' ? undefined : ta.value);
    o.onInput?.(ta.value);
    grow();
    store.touch('field');
  });
  requestAnimationFrame(grow);
  return ta;
}

/** Live character counter for a textarea/input. */
export function counter(target: HTMLInputElement | HTMLTextAreaElement, goal?: number): HTMLElement {
  const el = h('span', { class: 'ed-counter', 'aria-live': 'off' });
  const upd = () => {
    const n = target.value.length;
    el.textContent = goal ? `${n} / ${goal}+` : `${n}`;
    el.classList.toggle('is-good', !!goal && n >= goal);
  };
  target.addEventListener('input', upd);
  upd();
  return el;
}

// ───────────────────────────── choices ─────────────────────────────

export function select<T extends string>(
  store: Store,
  path: string,
  options: Choice<T>[],
  o: { empty?: string; id?: string; onChange?: (v: T | undefined) => void; focusKey?: string; class?: string } = {},
): HTMLSelectElement {
  const cur = getPath(store.draft, path) as string | undefined;
  const sel = h(
    'select',
    { class: 'ed-input ed-select ' + (o.class ?? ''), id: o.id, dataset: o.focusKey ? { focusKey: o.focusKey } : undefined },
    o.empty !== undefined ? h('option', { value: '' }, o.empty) : null,
    options.map((c) => h('option', { value: c.value }, (c.icon ? c.icon + '  ' : '') + c.label)),
  );
  sel.value = cur ?? '';
  sel.addEventListener('change', () => {
    const v = (sel.value || undefined) as T | undefined;
    setPath(store.draft, path, v);
    o.onChange?.(v);
    store.touch('field');
  });
  return sel;
}

/** Row of pill buttons, one selected (radiogroup semantics). */
export function segmented<T extends string>(
  store: Store,
  path: string,
  choices: Choice<T>[],
  o: { effective?: () => T; onChange?: (v: T) => void; label?: string; compact?: boolean; labelledBy?: string } = {},
): HTMLElement {
  const group = h('div', { class: 'ed-seg' + (o.compact ? ' ed-seg--compact' : ''), role: 'radiogroup', 'aria-label': o.label, 'aria-labelledby': o.labelledBy });
  const current = () => (getPath(store.draft, path) as T | undefined) ?? o.effective?.();
  const buttons = choices.map((c) => {
    const b = h(
      'button',
      { type: 'button', class: 'ed-seg__btn', role: 'radio', title: c.hint, dataset: { value: c.value } },
      c.icon ? h('span', { class: 'ed-seg__icon', 'aria-hidden': 'true' }, c.icon) : null,
      h('span', null, c.label),
    );
    b.addEventListener('click', () => {
      setPath(store.draft, path, c.value);
      paint();
      o.onChange?.(c.value);
      store.touch('field');
    });
    return b;
  });
  const paint = () => {
    const v = current();
    buttons.forEach((b) => {
      const on = b.dataset.value === v;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on || (!v && b === buttons[0]) ? 0 : -1;
    });
  };
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = buttons[(i + d + buttons.length) % buttons.length];
    n.focus();
    n.click();
  });
  group.append(...buttons);
  paint();
  return group;
}

export interface SwatchOpts {
  /** Value shown as selected when the path is unset (the resolved default). */
  effective?: () => string | null | undefined;
  /** Adds a "none" choice that stores `null`. */
  none?: string;
  /** Adds a custom colour picker. Default true. */
  custom?: boolean;
  onChange?: (v: string | null) => void;
  label?: string;
  labelledBy?: string;
  small?: boolean;
}

/** Round colour swatches + "none" + custom colour input. */
export function swatches(store: Store, path: string, list: Swatch[], o: SwatchOpts = {}): HTMLElement {
  const group = h('div', { class: 'ed-swatches' + (o.small ? ' ed-swatches--small' : ''), role: 'radiogroup', 'aria-label': o.label, 'aria-labelledby': o.labelledBy });
  const current = () => {
    const v = getPath(store.draft, path) as string | null | undefined;
    return v === undefined ? o.effective?.() : v;
  };
  const set = (v: string | null) => {
    setPath(store.draft, path, v);
    paint();
    o.onChange?.(v);
    store.touch('field');
  };
  const items: HTMLButtonElement[] = [];
  if (o.none) {
    const b = h('button', { type: 'button', class: 'ed-swatch ed-swatch--none', role: 'radio', title: o.none, 'aria-label': o.none, dataset: { value: '__none' } });
    b.addEventListener('click', () => set(null));
    items.push(b);
  }
  for (const sw of list) {
    const b = h('button', { type: 'button', class: 'ed-swatch', role: 'radio', title: sw.name, 'aria-label': sw.name, style: { '--c': sw.color }, dataset: { value: sw.color.toLowerCase() } });
    b.addEventListener('click', () => set(sw.color));
    items.push(b);
  }
  let customInput: HTMLInputElement | null = null;
  let customWrap: HTMLElement | null = null;
  if (o.custom !== false) {
    customInput = h('input', { type: 'color', class: 'ed-swatch__native', 'aria-label': 'Choisir une autre couleur', tabindex: -1 });
    customWrap = h('label', { class: 'ed-swatch ed-swatch--custom', title: 'Autre couleur…', tabindex: 0, role: 'radio' }, customInput, icon('plus', 14));
    customInput.addEventListener('input', () => set(customInput!.value));
    customWrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        customInput!.click();
      }
    });
  }
  const all = (): HTMLElement[] => (customWrap ? [...items, customWrap] : items);
  const paint = () => {
    const v = current();
    const key = v === null ? '__none' : (v ?? '').toLowerCase();
    let found = false;
    for (const b of items) {
      const on = b.dataset.value === key;
      found ||= on;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (customWrap && customInput) {
      const isCustom = !found && !!v && !!parseColor(v);
      customWrap.setAttribute('aria-checked', isCustom ? 'true' : 'false');
      customWrap.style.setProperty('--c', isCustom ? v! : 'transparent');
      customWrap.classList.toggle('has-color', isCustom);
      if (v && parseColor(v)) customInput.value = expandHex(v);
    }
    // one tab stop per group (roving tabindex), arrows move inside
    const els = all();
    const sel = els.find((e) => e.getAttribute('aria-checked') === 'true') ?? els[0];
    for (const e of els) e.tabIndex = e === sel ? 0 : -1;
  };
  group.addEventListener('keydown', (e) => {
    const els = all();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = els[(i + d + els.length) % els.length];
    n.focus();
    if (n !== customWrap) n.click();
  });
  group.append(...items);
  if (customWrap) group.append(customWrap);
  paint();
  return group;
}

export function expandHex(c: string): string {
  const rgb = parseColor(c);
  if (!rgb) return '#000000';
  return '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function toggle(store: Store, path: string, o: { label: string; effective?: boolean; onChange?: (v: boolean) => void; hint?: string }): HTMLElement {
  const id = nextId('t');
  const cur = getPath(store.draft, path) as boolean | undefined;
  const input = h('input', { type: 'checkbox', class: 'ed-switch__input', id, role: 'switch', checked: cur ?? o.effective ?? false });
  input.addEventListener('change', () => {
    setPath(store.draft, path, input.checked);
    o.onChange?.(input.checked);
    store.touch('field');
  });
  return h(
    'label',
    { class: 'ed-switch', for: id },
    input,
    h('span', { class: 'ed-switch__track', 'aria-hidden': 'true' }, h('span', { class: 'ed-switch__thumb' })),
    h('span', { class: 'ed-switch__text' }, h('span', { class: 'ed-switch__label' }, o.label), o.hint ? h('span', { class: 'ed-switch__hint' }, o.hint) : null),
  );
}

export function slider(
  store: Store,
  path: string,
  o: { min: number; max: number; step: number; effective: () => number; format: (v: number) => string; left?: string; right?: string; id?: string },
): HTMLElement {
  const id = o.id ?? nextId('r');
  const out = h('output', { class: 'ed-range__out', for: id });
  const input = h('input', { type: 'range', class: 'ed-range__input', id, min: o.min, max: o.max, step: o.step });
  const cur = (getPath(store.draft, path) as number | undefined) ?? o.effective();
  input.value = String(cur);
  const paint = () => {
    const v = Number(input.value);
    out.textContent = o.format(v);
    input.style.setProperty('--p', ((v - o.min) / (o.max - o.min)) * 100 + '%');
    input.setAttribute('aria-valuetext', o.format(v));
  };
  input.addEventListener('input', () => {
    setPath(store.draft, path, Math.round(Number(input.value) * 1000) / 1000);
    paint();
    store.touch('field');
  });
  paint();
  return h(
    'div',
    { class: 'ed-range' },
    o.left ? h('span', { class: 'ed-range__end' }, o.left) : null,
    input,
    o.right ? h('span', { class: 'ed-range__end' }, o.right) : null,
    out,
  );
}

export function button(label: Child, o: { icon?: string; variant?: 'berry' | 'pine' | 'ghost' | 'gold' | 'plain' | 'danger'; small?: boolean; onClick?: (e: MouseEvent) => void; title?: string; class?: string; type?: 'button' | 'submit'; disabled?: boolean; focusKey?: string; ariaLabel?: string } = {}): HTMLButtonElement {
  const b = h(
    'button',
    {
      type: o.type ?? 'button',
      class: `ed-btn ed-btn--${o.variant ?? 'ghost'}${o.small ? ' ed-btn--small' : ''} ${o.class ?? ''}`,
      title: o.title,
      disabled: o.disabled,
      'aria-label': o.ariaLabel,
      dataset: o.focusKey ? { focusKey: o.focusKey } : undefined,
    },
    o.icon ? icon(o.icon, o.small ? 16 : 18) : null,
    label !== '' && label !== null ? h('span', null, label) : null,
  );
  if (o.onClick) b.addEventListener('click', o.onClick);
  return b;
}

export function iconButton(name: string, label: string, onClick: (e: MouseEvent) => void, o: { class?: string; focusKey?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'ed-iconbtn ' + (o.class ?? ''), 'aria-label': label, title: label, disabled: o.disabled, dataset: o.focusKey ? { focusKey: o.focusKey } : undefined }, icon(name, 18));
  b.addEventListener('click', onClick);
  return b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const L = (c: string) => {
    const rgb = parseColor(c);
    if (!rgb) return 0;
    const [r, g, bl] = rgb.map((x) => {
      const v = x / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = L(a);
  const lb = L(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
