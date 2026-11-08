import './editor.css';
import type { ResolvedStall, StallConfig } from '../config/types';
import { assetUrl, DRAFT_KEY, rawContent } from '../config/load';
import { resolveStall } from '../config/resolve';
import { h } from '../ui/dom';
import { button } from './fields';
import { icon } from './icons';
import { Preview, type CameraPreset } from './preview';
import { clearAutosave, exportable, exportJson, normalizeDraft, ONBOARD_KEY, readAutosave, starterStall, Store } from './state';
import { characterTab } from './tabs/character';
import { chaletTab } from './tabs/chalet';
import { decorationsTab } from './tabs/decorations';
import { identityTab } from './tabs/identity';
import { knowledgeTab } from './tabs/knowledge';
import { productsTab } from './tabs/products';
import { resetTester, testerTab } from './tabs/tester';
import type { App, TabId } from './types';
import { validate, type Issue } from './validate';

/**
 * L'Atelier des cabanes (editor.html): a visual editor for content/stalls/<id>.json.
 * Left: tabs of forms bound to the StallConfig draft. Right: the live 3D preview. Top: load / see in the
 * market / export, validation and autosave status.
 */

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
  render: (app: App) => HTMLElement;
  preset?: CameraPreset;
}

const TABS: TabDef[] = [
  { id: 'identite', label: 'Identité', icon: 'tag', render: identityTab, preset: 'three' },
  { id: 'personnage', label: 'Personnage', icon: 'user', render: characterTab, preset: 'character' },
  { id: 'cabane', label: 'Cabane', icon: 'home', render: chaletTab, preset: 'three' },
  { id: 'decorations', label: 'Décorations', icon: 'tree', render: decorationsTab, preset: 'three' },
  { id: 'produits', label: 'Produits', icon: 'gift', render: productsTab, preset: 'face' },
  { id: 'savoir', label: 'Savoir', icon: 'book', render: knowledgeTab },
  { id: 'tester', label: 'Tester', icon: 'chat', render: testerTab, preset: 'character' },
];

const content = rawContent({ withDraft: false });
const existing = [...content.stalls].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
const params = new URLSearchParams(location.search);

class Atelier implements App {
  store: Store;
  existing = existing;
  generated = content.generated;
  town = content.market.meta.town;
  preview: Preview | null = null;
  expanded = new Set<string>();
  version = 0;

  private tab: TabId = 'identite';
  private cache: ResolvedStall | null = null;
  private baseline = '';
  private issues: Issue[] = [];
  private previewTimer = 0;
  private validateTimer = 0;

  // DOM
  private root = document.getElementById('editor-root')!;
  private panel = h('div', { class: 'ed-panel', role: 'tabpanel', tabindex: -1 });
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private badge = h('button', { type: 'button', class: 'ed-badge', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  private issuesPop = h('div', { class: 'ed-pop ed-issues', role: 'dialog', 'aria-label': 'Vérifications', hidden: true });
  private saved = h('span', { class: 'ed-saved', role: 'status' });
  private picker = h('select', { class: 'ed-input ed-select ed-top__select', id: 'ed-stall-picker', 'aria-label': 'Cabane à modifier' });
  private exportMenu = h('div', { class: 'ed-pop ed-menu', role: 'menu', hidden: true });
  private exportBtn!: HTMLButtonElement;
  private toasts = h('div', { class: 'ed-toasts', role: 'status', 'aria-live': 'polite' });
  private stage = h('div', { class: 'ed-preview__stage' });
  private previewEl!: HTMLElement;
  private onboarding: HTMLElement | null = null;

  constructor() {
    this.store = new Store(starterStall());
    this.store.on((kind) => this.onChange(kind));
    this.build();
    this.boot();
  }

  // ───────────────────────────── App API ─────────────────────────────

  resolved(): ResolvedStall {
    if (!this.cache) {
      const r = resolveStall(this.store.draft, this.store.scan ?? undefined, 'fr', 0);
      for (const p of r.products) p.image = assetUrl(p.image);
      this.cache = r;
    }
    return this.cache;
  }

  go(tab: TabId, focusId?: string) {
    this.selectTab(tab, false);
    if (focusId)
      requestAnimationFrame(() => {
        const el = document.getElementById(focusId);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          el.focus({ preventScroll: true });
          el.classList.add('is-flash');
          setTimeout(() => el.classList.remove('is-flash'), 1400);
        }
      });
  }

  rerender(focusKey?: string) {
    const panel = this.panel;
    const active = document.activeElement as HTMLElement | null;
    const inPanel = !!active && panel.contains(active);
    const key = focusKey ?? (inPanel ? active!.dataset.focusKey ?? (active!.id ? '#' + active!.id : undefined) : undefined);
    const sel = inPanel && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) ? [active.selectionStart, active.selectionEnd] : null;
    const first = new Map<string, DOMRect>();
    panel.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => first.set(el.dataset.flip!, el.getBoundingClientRect()));
    const y = window.scrollY;

    let view: HTMLElement;
    try {
      view = TABS.find((t) => t.id === this.tab)!.render(this);
    } catch (err) {
      console.error('[atelier] tab render', err);
      view = h('div', { class: 'ed-tab' }, h('p', { class: 'ed-error' }, 'Oups, cet onglet n’a pas pu s’afficher. Les autres fonctionnent toujours.'));
    }
    panel.replaceChildren(view);
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
        const f = first.get(el.dataset.flip!);
        if (!f) return;
        const l = el.getBoundingClientRect();
        const dy = f.top - l.top;
        if (Math.abs(dy) < 1) return;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      });
    }
    if (key) {
      const target = key.startsWith('#') ? panel.querySelector<HTMLElement>(key.replace(/^#(.*)$/, (_m, id) => '#' + CSS.escape(id))) : panel.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
      if (target) {
        target.focus({ preventScroll: true });
        if (sel && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && sel[0] !== null) {
          try {
            target.setSelectionRange(sel[0], sel[1]);
          } catch {
            /* some input types refuse selection */
          }
        }
      }
    }
  }

  listChanged(key: string, removed?: { name: string; undo: () => void }) {
    this.store.touch('structure');
    this.rerender(key);
    if (removed) {
      this.toast(`Retiré de la liste : ${removed.name}.`, 'ok', {
        label: 'Annuler',
        run: () => {
          removed.undo();
          this.store.touch('structure');
          this.rerender();
          this.toast('C’est revenu !', 'ok');
        },
      });
    }
  }

  toast(text: string, kind: 'ok' | 'warn' | 'error' = 'ok', action?: { label: string; run: () => void }) {
    const ic = kind === 'ok' ? 'check' : 'alert';
    const t = h('div', { class: `ed-toast ed-toast--${kind}` }, icon(ic, 18), h('span', null, text));
    if (action) {
      const b = h('button', { type: 'button', class: 'ed-toast__action' }, action.label);
      b.addEventListener('click', () => {
        t.remove();
        action.run();
      });
      t.append(b);
    }
    this.toasts.append(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    while (this.toasts.children.length > 2) this.toasts.firstElementChild?.remove();
    setTimeout(() => {
      t.classList.remove('is-in');
      setTimeout(() => t.remove(), 400);
    }, kind === 'error' ? 6000 : action ? 6500 : 3600);
  }

  // ───────────────────────────── changes ─────────────────────────────

  private onChange(kind: string) {
    this.cache = null;
    this.version++;
    if (kind === 'load') {
      this.expanded.clear();
      resetTester();
      this.baseline = exportJson(this.store.draft);
      this.syncPicker();
      this.rerender();
      this.updatePreview(true);
      this.runValidation();
      return;
    }
    clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.updatePreview(), 200);
    clearTimeout(this.validateTimer);
    this.validateTimer = window.setTimeout(() => this.runValidation(), 160);
    this.saved.classList.add('is-saving');
  }

  private updatePreview(now = false) {
    if (!this.preview) return;
    const run = () => {
      try {
        this.preview!.setStall(this.resolved());
      } catch (err) {
        console.error('[atelier] preview', err);
      }
    };
    if (now) requestAnimationFrame(run);
    else run();
  }

  private runValidation() {
    this.issues = validate(this.store.draft, this.existing, this.store.source);
    const errors = this.issues.filter((i) => i.level === 'error').length;
    const warns = this.issues.filter((i) => i.level === 'warn').length;
    const tips = this.issues.length - errors - warns;
    const b = this.badge;
    b.className = 'ed-badge ' + (errors ? 'is-error' : warns ? 'is-warn' : 'is-ok');
    b.replaceChildren(
      icon(errors ? 'alert' : warns ? 'sparkle' : 'check', 16),
      h('span', null, errors ? `${errors} point${errors > 1 ? 's' : ''} à corriger` : warns ? `${warns} conseil${warns > 1 ? 's' : ''}` : 'Prête à exporter'),
      ...(tips && !errors ? [h('span', { class: 'ed-badge__more' }, `+${tips}`)] : []),
    );
    b.setAttribute('aria-label', `Vérifications : ${errors} erreur(s), ${warns} conseil(s), ${tips} idée(s). Afficher la liste.`);
    // tabs with errors get a dot
    for (const [id, btn] of this.tabButtons) {
      const lvl = this.issues.filter((i) => i.tab === id && i.level !== 'tip');
      btn.dataset.issue = lvl.some((i) => i.level === 'error') ? 'error' : lvl.length ? 'warn' : '';
    }
    if (!this.issuesPop.hidden) this.paintIssues();
  }

  private paintIssues() {
    const pop = this.issuesPop;
    const label = { error: 'À corriger', warn: 'Conseil', tip: 'Idée' } as const;
    pop.replaceChildren(
      h('h2', { class: 'ed-pop__title' }, this.issues.length ? 'Petite vérification' : 'Tout est prêt !'),
      this.issues.length
        ? h(
            'ul',
            { class: 'ed-issues__list' },
            this.issues.map((i) => {
              const b = h('button', { type: 'button', class: `ed-issue ed-issue--${i.level}` }, h('span', { class: 'ed-issue__lvl' }, label[i.level]), h('span', { class: 'ed-issue__text' }, i.text), h('span', { class: 'ed-issue__go' }, TABS.find((t) => t.id === i.tab)?.label, ' ›'));
              b.addEventListener('click', () => {
                this.closePops();
                this.go(i.tab, i.focus);
              });
              return h('li', null, b);
            }),
          )
        : h('p', { class: 'ed-hint' }, 'Ta cabane est complète. Il ne reste qu’à l’exporter et la déposer dans content/stalls/.'),
    );
  }

  // ───────────────────────────── layout ─────────────────────────────

  private build() {
    const root = this.root;
    root.className = 'ed-app';

    // ── top bar ──
    this.exportBtn = button('Exporter', { icon: 'download', variant: 'berry', class: 'ed-top__export' });
    this.exportBtn.setAttribute('aria-haspopup', 'menu');
    this.exportBtn.setAttribute('aria-expanded', 'false');
    this.exportBtn.append(icon('chevron', 16, 'ed-btn__chev'));
    this.exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExportMenu();
    });
    const market = button(h('span', null, h('span', { class: 'ed-lg' }, 'Voir dans le marché'), h('span', { class: 'ed-sm' }, 'Au marché')), {
      icon: 'market',
      variant: 'ghost',
      class: 'ed-top__market',
      onClick: () => this.openMarket(),
    });
    market.title = 'Voir ma cabane dans le marché (nouvel onglet)';
    market.setAttribute('aria-label', 'Voir dans le marché (nouvel onglet)');
    this.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = this.issuesPop.hidden;
      this.closePops();
      if (open) {
        this.paintIssues();
        this.issuesPop.hidden = false;
        this.badge.setAttribute('aria-expanded', 'true');
        this.issuesPop.querySelector<HTMLElement>('button')?.focus();
      }
    });
    this.buildPicker();
    this.buildExportMenu();

    const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'ed-sr', id: 'ed-file', tabindex: -1, 'aria-hidden': 'true' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (f) void this.openFile(f);
    });

    const top = h(
      'header',
      { class: 'ed-top' },
      h(
        'a',
        { class: 'ed-brand', href: import.meta.env.BASE_URL || '/', title: 'Retour au marché' },
        h('span', { class: 'ed-brand__flake' }, icon('flake', 26)),
        h('span', { class: 'ed-brand__text' }, h('span', { class: 'ed-brand__title' }, 'Atelier des cabanes'), h('span', { class: 'ed-brand__town' }, '· Givrelune')),
      ),
      h('div', { class: 'ed-top__stall' }, h('label', { class: 'ed-top__label', for: 'ed-stall-picker' }, 'Cabane'), this.picker, fileInput),
      h('div', { class: 'ed-top__status' }, h('div', { class: 'ed-popwrap' }, this.badge, this.issuesPop), this.saved),
      h('div', { class: 'ed-top__actions' }, market, h('div', { class: 'ed-popwrap' }, this.exportBtn, this.exportMenu)),
    );

    // ── tabs ──
    const tablist = h('div', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Étapes' });
    for (const t of TABS) {
      const b = h(
        'button',
        { type: 'button', class: 'ed-tabbtn', role: 'tab', id: `tab-${t.id}`, 'aria-controls': 'ed-panel', 'aria-selected': 'false', tabindex: -1, dataset: { tab: t.id } },
        icon(t.icon, 20),
        h('span', { class: 'ed-tabbtn__label' }, t.label),
        h('span', { class: 'ed-tabbtn__dot', 'aria-hidden': 'true' }),
      );
      b.addEventListener('click', () => this.selectTab(t.id, true));
      this.tabButtons.set(t.id, b);
      tablist.append(b);
    }
    tablist.addEventListener('keydown', (e) => {
      const ids = TABS.map((t) => t.id);
      const i = ids.indexOf(this.tab);
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % ids.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = ids.length - 1;
      if (n < 0) return;
      e.preventDefault();
      this.selectTab(ids[n], true);
      this.tabButtons.get(ids[n])?.focus();
    });
    this.panel.id = 'ed-panel';

    // ── preview ──
    const presets = h(
      'div',
      { class: 'ed-presets', role: 'group', 'aria-label': 'Point de vue' },
      ([
        ['face', 'Face'],
        ['three', '3/4'],
        ['character', 'Personnage'],
      ] as [CameraPreset, string][]).map(([p, label]) => {
        const b = h('button', { type: 'button', class: 'ed-preset', dataset: { preset: p } }, label);
        b.addEventListener('click', () => {
          this.preview?.preset(p);
          this.markPreset(p);
        });
        return b;
      }),
    );
    const collapse = h('button', { type: 'button', class: 'ed-iconbtn ed-preview__collapse', 'aria-expanded': 'true', 'aria-label': 'Réduire l’aperçu', title: 'Réduire l’aperçu' }, icon('minimize', 18));
    collapse.addEventListener('click', () => {
      const collapsed = !this.previewEl.classList.contains('is-collapsed');
      this.previewEl.classList.toggle('is-collapsed', collapsed);
      this.root.classList.toggle('is-prev-collapsed', collapsed);
      collapse.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      collapse.setAttribute('aria-label', collapsed ? 'Afficher l’aperçu' : 'Réduire l’aperçu');
      collapse.replaceChildren(icon(collapsed ? 'maximize' : 'minimize', 18));
      this.preview?.setVisible(!collapsed);
    });
    this.previewEl = h(
      'aside',
      { class: 'ed-preview', 'aria-label': 'Aperçu en 3D' },
      h(
        'div',
        { class: 'ed-preview__frame' },
        this.stage,
        h('div', { class: 'ed-preview__live' }, h('span', { class: 'ed-preview__dot', 'aria-hidden': 'true' }), 'Aperçu en direct'),
        collapse,
        h('div', { class: 'ed-preview__bar' }, presets, h('span', { class: 'ed-preview__hint' }, 'Glisse pour tourner autour')),
      ),
    );

    // onboarding (first visit)
    let onboarded = false;
    try {
      onboarded = !!localStorage.getItem(ONBOARD_KEY);
    } catch {
      /* ignore */
    }
    if (!onboarded && !params.has('noHint')) this.onboarding = this.buildOnboarding();

    root.append(
      top,
      h('main', { class: 'ed-main' }, h('section', { class: 'ed-editor', 'aria-label': 'Formulaire de ta cabane' }, this.onboarding, tablist, this.panel), this.previewEl),
      h('footer', { class: 'ed-footer' }, 'Givrelune · un marché de Noël open source. Ton travail reste dans ton navigateur jusqu’à l’export.'),
      this.toasts,
    );

    document.addEventListener('click', (e) => {
      const t = e.target as Node;
      if (!this.issuesPop.hidden && !this.issuesPop.contains(t) && t !== this.badge) this.closePops();
      if (!this.exportMenu.hidden && !this.exportMenu.contains(t)) this.closePops();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (!this.issuesPop.hidden || !this.exportMenu.hidden)) {
        const wasExport = !this.exportMenu.hidden;
        this.closePops();
        (wasExport ? this.exportBtn : this.badge).focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.store.saveNow();
        this.toast('Enregistrée dans ce navigateur. Pour la publier : « Exporter ».', 'ok');
      }
    });
    document.addEventListener('atelier:saved', () => this.paintSaved());
    window.addEventListener('beforeunload', () => this.store.saveNow());
    window.addEventListener('hashchange', () => {
      const t = location.hash.slice(1) as TabId;
      if (TABS.some((x) => x.id === t) && t !== this.tab) this.selectTab(t, false);
    });
  }

  private buildOnboarding(): HTMLElement {
    const steps: [TabId, string, string][] = [
      ['identite', 'Identité', 'donne un nom à ta cabane'],
      ['personnage', 'Personnage', 'habille la personne derrière le comptoir'],
      ['decorations', 'Décorations', 'décore, ajoute tes produits'],
      ['tester', 'Tester', 'discute avec ton personnage'],
    ];
    const close = () => {
      try {
        localStorage.setItem(ONBOARD_KEY, '1');
      } catch {
        /* ignore */
      }
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 300);
      this.onboarding = null;
    };
    const el = h(
      'div',
      { class: 'ed-onboard', role: 'note' },
      h('div', { class: 'ed-onboard__art', 'aria-hidden': 'true' }, '🎄'),
      h(
        'div',
        { class: 'ed-onboard__body' },
        h('h2', null, 'Bienvenue dans l’Atelier !'),
        h('p', null, 'Ici, tu fabriques ta propre cabane pour le marché de Givrelune, sans écrire une ligne de code. Tout s’affiche en direct dans l’aperçu.'),
        h(
          'ol',
          { class: 'ed-onboard__steps' },
          steps.map(([tab, label, text]) => {
            const b = h('button', { type: 'button', class: 'ed-linkbtn' }, label);
            b.addEventListener('click', () => this.selectTab(tab, true));
            return h('li', null, b, ' : ', text);
          }),
          h('li', null, h('b', null, 'Exporter'), ' : récupère ton fichier et dépose-le dans ', h('code', null, 'content/stalls/'), '.'),
        ),
      ),
      button('C’est parti !', { variant: 'pine', small: true, onClick: close, class: 'ed-onboard__go' }),
    );
    return el;
  }

  private buildPicker() {
    const p = this.picker;
    p.replaceChildren(
      h('option', { value: 'new' }, '✨ Nouvelle cabane'),
      h('optgroup', { label: 'Modifier une cabane du marché' }, this.existing.map((s) => h('option', { value: 'stall:' + s.id }, s.name))),
      h('optgroup', { label: 'Autre' }, h('option', { value: 'file' }, '📂 Ouvrir un fichier .json…'), h('option', { value: 'current', hidden: true, disabled: true }, 'Ma cabane en cours')),
    );
    p.addEventListener('change', async () => {
      const v = p.value;
      if (v === 'file') {
        this.syncPicker();
        document.getElementById('ed-file')?.click();
        return;
      }
      if (!(await this.confirmReplace())) return this.syncPicker();
      if (v === 'new') {
        this.store.load(starterStall(), { source: 'new', idEdited: false });
        this.toast('Nouvelle cabane, à toi de jouer !');
      } else if (v.startsWith('stall:')) this.loadExisting(v.slice(6));
    });
  }

  private syncPicker() {
    const src = this.store.source;
    const opt = src === 'new' ? 'new' : this.existing.some((s) => s.id === src) ? 'stall:' + src : 'current';
    const cur = this.picker.querySelector<HTMLOptionElement>('option[value="current"]')!;
    cur.hidden = opt !== 'current';
    cur.textContent = this.store.draft.name ? `${this.store.draft.name} (fichier ouvert)` : 'Ma cabane en cours';
    this.picker.value = opt;
  }

  private loadExisting(id: string) {
    const s = this.existing.find((x) => x.id === id);
    if (!s) return;
    this.store.load(structuredClone(s), { source: id, idEdited: true, scan: this.generated.find((g) => g.stallId === id) ?? null });
    this.toast(`« ${s.name} » est ouverte dans l’atelier.`);
  }

  private async openFile(f: File) {
    try {
      const text = await f.text();
      const data = JSON.parse(text) as StallConfig;
      if (!data || typeof data !== 'object' || (!data.name && !data.id)) throw new Error('ce fichier ne ressemble pas à une cabane');
      if (!(await this.confirmReplace())) return;
      const id = data.id || f.name.replace(/\.json$/i, '');
      this.store.load({ ...data, id }, { source: this.existing.some((s) => s.id === id) ? id : 'file:' + id, idEdited: true, scan: this.generated.find((g) => g.stallId === id) ?? null });
      this.toast(`« ${data.name || id} » est ouverte.`);
    } catch (err) {
      this.toast(`Impossible d’ouvrir ce fichier : ${(err as Error).message}`, 'error');
    }
  }

  private isDirty() {
    return exportJson(this.store.draft) !== this.baseline;
  }

  private async confirmReplace(): Promise<boolean> {
    if (!this.isDirty()) return true;
    return dialog({
      title: 'Remplacer la cabane en cours ?',
      text: `Tes modifications sur « ${this.store.draft.name || 'ta cabane'} » seront perdues si tu ne l’as pas exportée.`,
      ok: 'Oui, remplacer',
      cancel: 'Non, je garde',
      extra: { label: 'Exporter d’abord', run: () => this.download() },
    });
  }

  private buildExportMenu() {
    const m = this.exportMenu;
    const item = (ic: string, label: string, sub: string, run: () => void) => {
      const b = h('button', { type: 'button', class: 'ed-menu__item', role: 'menuitem' }, icon(ic, 20), h('span', null, h('b', null, label), h('small', null, sub)));
      b.addEventListener('click', () => {
        this.closePops();
        run();
      });
      return b;
    };
    m.addEventListener('keydown', (e) => {
      const items = [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    });
    this.paintExportMenu = () => {
      const id = this.store.draft.id || 'ma-cabane';
      m.replaceChildren(
        item('download', `Télécharger ${id}.json`, 'Le fichier à déposer dans content/stalls/', () => this.download()),
        item('copy', 'Copier le JSON', 'Pour le coller dans un éditeur ou une pull request', () => void this.copy()),
        item('open', 'Ouvrir un fichier .json…', 'Reprendre une cabane exportée', () => document.getElementById('ed-file')?.click()),
        h('p', { class: 'ed-menu__foot' }, icon('info', 14), h('span', null, 'Ensuite : ', h('code', null, 'npm run scan -- ' + id), ' pour lire ton site, puis ', h('code', null, 'npm run dev'), '.')),
      );
    };
  }
  private paintExportMenu = () => {};

  private toggleExportMenu() {
    const open = this.exportMenu.hidden;
    this.closePops();
    if (!open) return;
    this.paintExportMenu();
    this.exportMenu.hidden = false;
    this.exportBtn.setAttribute('aria-expanded', 'true');
    this.exportMenu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }

  private closePops() {
    this.issuesPop.hidden = true;
    this.exportMenu.hidden = true;
    this.badge.setAttribute('aria-expanded', 'false');
    this.exportBtn?.setAttribute('aria-expanded', 'false');
  }

  private blockers(): boolean {
    const errors = validate(this.store.draft, this.existing, this.store.source).filter((i) => i.level === 'error');
    if (!errors.length) return false;
    this.toast(`Corrige d’abord : ${errors[0].text}`, 'error');
    this.go(errors[0].tab, errors[0].focus);
    return true;
  }

  private download() {
    if (this.blockers()) return;
    const id = this.store.draft.id;
    const blob = new Blob([exportJson(this.store.draft)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${id}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.baseline = exportJson(this.store.draft);
    this.toast(`${id}.json est prêt : dépose-le dans content/stalls/.`, 'ok');
  }

  private async copy() {
    const json = exportJson(this.store.draft);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      const ta = h('textarea', { class: 'ed-sr' });
      ta.value = json;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    this.toast('JSON copié dans le presse-papiers.', 'ok');
  }

  private openMarket() {
    if (this.blockers()) return;
    const d = this.store.draft;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(exportable(d)));
    } catch {
      this.toast('Ton navigateur refuse d’enregistrer le brouillon (navigation privée ?).', 'error');
      return;
    }
    const base = import.meta.env.BASE_URL || '/';
    const url = `${base}?draft&skipIntro&at=stall:${encodeURIComponent(d.id)}`;
    window.open(url, '_blank', 'noopener');
    this.toast('Le marché s’ouvre dans un nouvel onglet, devant ta cabane…', 'ok');
  }

  private paintSaved() {
    const t = this.store.savedAt;
    this.saved.classList.remove('is-saving');
    if (!t) return this.saved.replaceChildren();
    const time = new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    this.saved.replaceChildren(icon('check', 14), h('span', null, 'Enregistré'));
    this.saved.title = `Brouillon enregistré dans ce navigateur à ${time}`;
  }

  private markPreset(p: CameraPreset | undefined) {
    this.previewEl.querySelectorAll<HTMLElement>('.ed-preset').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === p ? 'true' : 'false'));
  }

  private selectTab(id: TabId, user: boolean) {
    const changed = id !== this.tab;
    this.tab = id;
    for (const [tid, b] of this.tabButtons) {
      const on = tid === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on) {
        // keep the active tab visible in the (horizontally scrolling) strip, without scrolling the page
        const list = b.parentElement!;
        const l = b.offsetLeft;
        const r = l + b.offsetWidth;
        if (l < list.scrollLeft) list.scrollLeft = l - 12;
        else if (r > list.scrollLeft + list.clientWidth) list.scrollLeft = r - list.clientWidth + 12;
      }
    }
    this.panel.setAttribute('aria-labelledby', `tab-${id}`);
    this.rerender();
    if (location.hash.slice(1) !== id) history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
    const def = TABS.find((t) => t.id === id)!;
    this.preview?.setKeeperFront(id === 'personnage');
    if (def.preset && (changed || !user)) {
      this.preview?.preset(def.preset);
      this.markPreset(def.preset);
    }
    if (user && changed) {
      // bring the top of the new tab just under the (sticky) tab strip
      const strip = this.tabButtons.get(id)!.parentElement!.getBoundingClientRect();
      const top = this.panel.getBoundingClientRect().top;
      if (top < strip.bottom) window.scrollBy({ top: top - strip.bottom - 4, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  // ───────────────────────────── boot ─────────────────────────────

  private boot() {
    // 3D first (so the first render has something to show)
    try {
      this.preview = new Preview(this.stage);
      this.preview.onError = (msg) => this.toast(msg, 'error');
    } catch (err) {
      console.error('[atelier] WebGL', err);
      this.stage.append(h('div', { class: 'ed-nogl' }, h('b', null, 'Pas d’aperçu 3D sur cet appareil'), h('span', null, 'Ton navigateur ne permet pas la 3D (WebGL). Tu peux quand même tout remplir et exporter ta cabane.')));
    }
    (window as any).__atelier = {
      app: this,
      store: this.store,
      go: (t: TabId, f?: string) => this.go(t, f),
      preset: (p: CameraPreset) => this.preview?.preset(p, true),
      info: () => this.preview?.info(),
      exportJson: () => exportJson(this.store.draft),
      load: (id: string) => this.loadExisting(id),
    };

    const tabFromHash = location.hash.slice(1) as TabId;
    this.tab = TABS.some((t) => t.id === tabFromHash) ? tabFromHash : ((params.get('tab') as TabId) ?? 'identite');
    if (!TABS.some((t) => t.id === this.tab)) this.tab = 'identite';

    if (params.has('reset')) clearAutosave();
    const wanted = params.get('stall');
    const auto = readAutosave();
    if (wanted && this.existing.some((s) => s.id === wanted)) this.loadExisting(wanted);
    else if (auto && exportJson(normalizeDraft(auto.draft)) !== exportJson(normalizeDraft(starterStall()))) {
      // show the work in progress right away, and ask
      this.store.load(auto.draft, { source: auto.source ?? 'new', idEdited: auto.idEdited, scan: auto.source ? this.generated.find((g) => g.stallId === auto.source) ?? null : null });
      this.store.savedAt = auto.savedAt;
      this.baseline = ''; // never exported: replacing it must ask first
      this.paintSaved();
      const when = new Date(auto.savedAt).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      void dialog({
        title: 'Reprendre ma cabane ?',
        text: `Tu avais commencé « ${auto.draft.name || 'une cabane'} » ${when}. Elle t’attend bien au chaud.`,
        ok: 'Reprendre ma cabane',
        cancel: 'Repartir de zéro',
        icon: '🏡',
      }).then((resume) => {
        if (!resume) {
          this.store.load(starterStall(), { source: 'new', idEdited: false });
          this.toast('Nouvelle cabane, à toi de jouer !');
        }
      });
    } else this.store.load(starterStall(), { source: 'new', idEdited: false });

    this.selectTab(this.tab, false);
    this.runValidation();
  }
}

// ───────────────────────────── modal dialog ─────────────────────────────

function dialog(o: { title: string; text: string; ok: string; cancel: string; icon?: string; extra?: { label: string; run: () => void } }): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'ed-dialog', 'aria-labelledby': 'ed-dlg-title' }) as HTMLDialogElement;
    const done = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const okBtn = button(o.ok, { variant: 'berry', onClick: () => done(true) });
    dlg.append(
      ...(o.icon ? [h('div', { class: 'ed-dialog__art', 'aria-hidden': 'true' }, o.icon)] : []),
      h('h2', { id: 'ed-dlg-title', class: 'ed-dialog__title' }, o.title),
      h('p', { class: 'ed-dialog__text' }, o.text),
      h(
        'div',
        { class: 'ed-dialog__actions' },
        o.extra ? button(o.extra.label, { variant: 'plain', icon: 'download', onClick: () => o.extra!.run() }) : null,
        button(o.cancel, { variant: 'ghost', onClick: () => done(false) }),
        okBtn,
      ),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dlg);
    dlg.showModal();
    okBtn.focus();
  });
}

new Atelier();
