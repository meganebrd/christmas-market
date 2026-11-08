import { h, type Child } from '../ui/dom';
import { icon } from './icons';

/**
 * Reorderable lists. Three ways to move an item, all ending in the same `move(from, to)`:
 *   - mouse: native HTML5 drag-and-drop, started from the grip handle;
 *   - touch / pen: pointer-based dragging of the grip (the row follows the finger, the others make room);
 *   - keyboard: ↑ / ↓ buttons, or the arrow keys on the focused grip.
 *
 * Each row carries `data-flip` (stable key) so the editor animates the re-render (FLIP), and its
 * buttons carry `data-focus-key` so the focus comes back to the same button after a move.
 */

// ── stable keys for array items (objects or strings) ──
const arrKeys = new WeakMap<unknown[], string[]>();
let keySeq = 0;

export function keysOf(arr: unknown[]): string[] {
  let keys = arrKeys.get(arr);
  if (!keys) {
    keys = [];
    arrKeys.set(arr, keys);
  }
  while (keys.length < arr.length) keys.push('k' + ++keySeq);
  if (keys.length > arr.length) keys.length = arr.length;
  return keys;
}

export function moveItem<T>(arr: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const keys = keysOf(arr);
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
  const [k] = keys.splice(from, 1);
  keys.splice(to, 0, k);
}

export function removeItem<T>(arr: T[], i: number) {
  const keys = keysOf(arr);
  arr.splice(i, 1);
  keys.splice(i, 1);
}

export function insertItem<T>(arr: T[], i: number, item: T): string {
  const keys = keysOf(arr);
  arr.splice(i, 0, item);
  const k = 'k' + ++keySeq;
  keys.splice(i, 0, k);
  return k;
}

// ── live region for announcements ──
let live: HTMLElement | null = null;
export function announce(text: string) {
  if (!live) {
    live = h('div', { class: 'ed-sr', 'aria-live': 'polite', role: 'status' });
    document.body.appendChild(live);
  }
  live.textContent = '';
  setTimeout(() => (live!.textContent = text), 30);
}

export interface SortableOpts<T> {
  items: T[];
  render: (item: T, index: number, key: string) => Child;
  /** Short name of an item, for buttons and announcements ("Bougie « Forêt »"). */
  name: (item: T, index: number) => string;
  /** Called after a move or a removal (the caller re-renders). `undo` puts a removed item back. */
  onChange: (what: 'move' | 'remove', key: string, removed?: { name: string; undo: () => void }) => void;
  removable?: boolean | ((item: T, i: number) => boolean);
  removeLabel?: string;
  class?: string;
  rowClass?: (item: T, index: number) => string;
  listLabel: string;
  /** Extra buttons in the row's action column. */
  actions?: (item: T, index: number, key: string) => Child;
}

export function sortableList<T>(o: SortableOpts<T>): HTMLElement {
  const keys = keysOf(o.items as unknown[]);
  const list = h('ol', { class: 'ed-sortable ' + (o.class ?? ''), 'aria-label': o.listLabel });
  const n = o.items.length;

  const commitMove = (from: number, to: number, key: string, how: 'drag' | 'key') => {
    if (from === to) return;
    const name = o.name(o.items[from], from);
    moveItem(o.items, from, to);
    announce(`${name} : position ${to + 1} sur ${n}.`);
    o.onChange('move', how === 'key' ? key : key + ':drag');
  };

  o.items.forEach((item, i) => {
    const key = keys[i];
    const name = o.name(item, i);
    const grip = h(
      'button',
      {
        type: 'button',
        class: 'ed-grip',
        'aria-label': `Déplacer ${name} (position ${i + 1} sur ${n}, flèches haut et bas)`,
        title: 'Glisser pour déplacer',
        dataset: { focusKey: key + ':grip' },
      },
      icon('grip', 18),
    );
    const up = h('button', { type: 'button', class: 'ed-iconbtn ed-iconbtn--small', 'aria-label': `Monter ${name}`, title: 'Monter', disabled: i === 0, dataset: { focusKey: key + ':up' } }, icon('up', 16));
    const down = h('button', { type: 'button', class: 'ed-iconbtn ed-iconbtn--small', 'aria-label': `Descendre ${name}`, title: 'Descendre', disabled: i === n - 1, dataset: { focusKey: key + ':down' } }, icon('down', 16));
    up.addEventListener('click', () => commitMove(i, i - 1, key + ':up', 'key'));
    down.addEventListener('click', () => commitMove(i, i + 1, key + ':down', 'key'));
    grip.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && i > 0) {
        e.preventDefault();
        commitMove(i, i - 1, key + ':grip', 'key');
      } else if (e.key === 'ArrowDown' && i < n - 1) {
        e.preventDefault();
        commitMove(i, i + 1, key + ':grip', 'key');
      }
    });
    const canRemove = typeof o.removable === 'function' ? o.removable(item, i) : o.removable !== false;
    const del = canRemove
      ? h('button', { type: 'button', class: 'ed-iconbtn ed-iconbtn--small ed-iconbtn--danger', 'aria-label': `${o.removeLabel ?? 'Supprimer'} ${name}`, title: o.removeLabel ?? 'Supprimer' }, icon('trash', 16))
      : null;
    del?.addEventListener('click', () => {
      removeItem(o.items, i);
      const nextKey = keysOf(o.items as unknown[])[Math.min(i, o.items.length - 1)];
      o.onChange('remove', nextKey ? nextKey + ':grip' : '', { name, undo: () => insertItem(o.items, Math.min(i, o.items.length), item) });
    });

    const row = h(
      'li',
      { class: 'ed-row ' + (o.rowClass?.(item, i) ?? ''), dataset: { flip: key, index: String(i) } },
      grip,
      h('div', { class: 'ed-row__body' }, o.render(item, i, key)),
      h('div', { class: 'ed-row__actions' }, o.actions?.(item, i, key), up, down, del),
    );
    list.appendChild(row);
    wireMouseDrag(list, row, grip, i, (from, to) => commitMove(from, to, key + ':grip', 'drag'));
    wireTouchDrag(list, row, grip, i, (from, to) => commitMove(from, to, key + ':grip', 'drag'));
  });
  return list;
}

// ───────────────────────────── mouse: HTML5 drag & drop ─────────────────────────────

let dragFrom = -1;
let dragList: HTMLElement | null = null;

function rowsOf(list: HTMLElement): HTMLElement[] {
  return [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('ed-row'));
}

function clearIndicators(list: HTMLElement) {
  for (const r of rowsOf(list)) r.classList.remove('drop-before', 'drop-after');
}

function wireMouseDrag(list: HTMLElement, row: HTMLElement, grip: HTMLElement, index: number, move: (from: number, to: number) => void) {
  grip.addEventListener('mousedown', () => (row.draggable = true));
  grip.addEventListener('mouseup', () => (row.draggable = false));
  row.addEventListener('dragstart', (e) => {
    if (!row.draggable) return;
    dragFrom = index;
    dragList = list;
    e.dataTransfer?.setData('text/plain', String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    try {
      const r = row.getBoundingClientRect();
      e.dataTransfer?.setDragImage(row, Math.min(40, r.width / 2), r.height / 2);
    } catch {
      /* optional */
    }
    requestAnimationFrame(() => row.classList.add('is-dragging'));
    list.classList.add('is-sorting');
  });
  row.addEventListener('dragend', () => {
    row.draggable = false;
    row.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    clearIndicators(list);
    dragFrom = -1;
    dragList = null;
  });
  row.addEventListener('dragover', (e) => {
    if (dragList !== list || dragFrom < 0) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    clearIndicators(list);
    if (index !== dragFrom) row.classList.add(after ? 'drop-after' : 'drop-before');
  });
  row.addEventListener('drop', (e) => {
    if (dragList !== list || dragFrom < 0) return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    let to = index + (after ? 1 : 0);
    if (dragFrom < to) to -= 1;
    const from = dragFrom;
    clearIndicators(list);
    dragFrom = -1;
    move(from, Math.max(0, Math.min(rowsOf(list).length - 1, to)));
  });
}

// ───────────────────────────── touch / pen: pointer dragging ─────────────────────────────

function wireTouchDrag(list: HTMLElement, row: HTMLElement, grip: HTMLElement, index: number, move: (from: number, to: number) => void) {
  grip.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    e.preventDefault();
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already released pointer */
    }
    const rows = rowsOf(list);
    const startScroll = window.scrollY;
    const slots = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return { top: b.top + startScroll, h: b.height };
    });
    const me = slots[index];
    const gap = rows.length > 1 ? Math.max(0, slots[Math.min(1, rows.length - 1)].top - (slots[0].top + slots[0].h)) : 8;
    const startY = e.clientY + startScroll;
    let target = index;
    let lastY = e.clientY;
    let raf = 0;
    row.classList.add('is-lifted');
    list.classList.add('is-sorting');

    const layout = () => {
      const y = lastY + window.scrollY;
      const dy = y - startY;
      row.style.transform = `translateY(${dy}px) scale(1.02)`;
      const center = me.top + dy + me.h / 2;
      target = index;
      for (let j = 0; j < slots.length; j++) {
        if (j === index) continue;
        const mid = slots[j].top + slots[j].h / 2;
        if (j > index && center > mid) target = Math.max(target, j);
        if (j < index && center < mid) target = Math.min(target, j);
      }
      rows.forEach((r, j) => {
        if (j === index) return;
        let shift = 0;
        if (index < target && j > index && j <= target) shift = -(me.h + gap);
        if (index > target && j < index && j >= target) shift = me.h + gap;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const autoscroll = () => {
      raf = 0;
      const edge = 70;
      let v = 0;
      if (lastY < edge) v = -Math.ceil((edge - lastY) / 6);
      else if (lastY > window.innerHeight - edge) v = Math.ceil((lastY - (window.innerHeight - edge)) / 6);
      if (v) {
        window.scrollBy(0, v);
        layout();
        raf = requestAnimationFrame(autoscroll);
      }
    };
    const onMove = (ev: PointerEvent) => {
      lastY = ev.clientY;
      layout();
      if (!raf) raf = requestAnimationFrame(autoscroll);
    };
    const end = (commit: boolean) => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onCancel);
      cancelAnimationFrame(raf);
      list.classList.remove('is-sorting');
      row.classList.remove('is-lifted');
      if (commit && target !== index) move(index, target);
      else for (const r of rows) r.style.transform = '';
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onCancel);
  });
}
