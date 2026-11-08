import type { ScannedStallData, StallConfig } from '../config/types';
import { slugify } from '../config/resolve';

/**
 * The editor's single source of truth: the StallConfig being edited (exactly what gets exported),
 * plus editor-only state (scan result, whether the id was typed by hand…).
 *
 * Fields mutate `store.draft` in place and call `store.touch(kind)`:
 *   - 'field'     → a value changed (preview, validation and autosave follow; the form is NOT re-rendered)
 *   - 'structure' → items were added/removed/reordered (the current tab re-renders)
 *   - 'load'      → a whole new stall (everything re-renders)
 */

export type ChangeKind = 'field' | 'structure' | 'load';
export type Listener = (kind: ChangeKind) => void;

export const AUTOSAVE_KEY = 'givrelune:editor-autosave';
export const ONBOARD_KEY = 'givrelune:editor-onboarded';
export const SCHEMA_REF = '../../docs/schema/stall.schema.json';

/** Built-in copy of content/stalls/_template.json (friendlier placeholders, demo pictures). */
export function starterStall(): StallConfig {
  return {
    id: 'ma-cabane',
    order: 99,
    name: 'Ma Cabane',
    tagline: 'Une phrase qui donne envie d’approcher',
    category: 'artisanat',
    website: 'https://mon-site.fr',
    links: [{ label: 'Instagram', url: 'https://instagram.com/moncompte', kind: 'instagram' }],
    owner: {
      name: 'Prénom Nom',
      role: 'Mon métier',
      bio: 'Deux phrases sur toi, affichées sur ta fiche.',
      mood: 'chaleureux',
      appearance: { hairStyle: 'bun', hat: 'bobble', outfit: 'sweater', outfitColor: '#2f5d50', scarf: '#e8c547' },
      greetings: ['Bonsoir ! Bienvenue dans ma cabane.'],
      farewells: ['Belle soirée au marché !'],
    },
    chalet: { wood: '#9b6a45', roof: '#5a3a2a', accent: '#b8413a', garland: 'warm', awning: 'stripes', awningColors: ['#b8413a', '#f3ead8'] },
    decorations: [{ type: 'wreath', slot: 'sign' }, { type: 'lantern' }, { type: 'mini-tree' }],
    products: [
      { name: 'Bougie de Noël', price: 24, image: '/demo/products/candle-forest.svg', url: 'https://mon-site.fr/produits/bougie-de-noel', description: 'Une phrase qui donne envie : le parfum, la matière, la taille.', featured: true },
      { name: 'Pot de miel', price: 15, image: '/demo/products/honey.svg', url: 'https://mon-site.fr/produits/pot-de-miel' },
    ],
    knowledge: {
      description:
        'Écris ici, à la première personne, tout ce que tu raconterais à quelqu’un devant ta cabane : ton métier, ta façon de travailler, ton histoire.\n\nSépare les paragraphes par une ligne vide. Plus il y a de texte, plus tes réponses seront précises.',
      faq: [{ q: 'Livrez-vous ?', a: 'Oui, partout en France sous 5 jours.' }],
      facts: [{ topic: 'horaires', text: 'Ouvert tous les soirs du marché de 16 h à 22 h.' }],
      scan: { enabled: true, maxPages: 15, autoProducts: 6 },
    },
  };
}

export interface Autosave {
  v: 1;
  savedAt: number;
  draft: StallConfig;
  idEdited: boolean;
  source: string;
}

export class Store {
  draft: StallConfig;
  /** Result of "Scanner mon site" (or content/generated/<id>.json for an existing stall). Memory only. */
  scan: ScannedStallData | null = null;
  /** The id was typed by hand: stop deriving it from the name. */
  idEdited = false;
  /** 'new' or the id of the existing stall this draft started from. */
  source = 'new';
  savedAt = 0;
  private listeners = new Set<Listener>();
  private saveTimer = 0;

  constructor(draft: StallConfig) {
    this.draft = normalizeDraft(draft);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  touch(kind: ChangeKind = 'field') {
    for (const fn of [...this.listeners]) {
      try {
        fn(kind);
      } catch (err) {
        console.error('[atelier] listener failed', err);
      }
    }
    this.scheduleSave();
  }

  load(draft: StallConfig, opts: { source: string; idEdited?: boolean; scan?: ScannedStallData | null }) {
    this.draft = normalizeDraft(draft);
    this.source = opts.source;
    this.idEdited = opts.idEdited ?? opts.source !== 'new';
    this.scan = opts.scan ?? null;
    this.touch('load');
  }

  /** Called when the name changes: keep the id in sync until the artisan edits it. */
  syncIdFromName() {
    if (this.idEdited) return;
    const slug = slugify(this.draft.name || '') || 'ma-cabane';
    this.draft.id = slug;
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 500);
  }

  saveNow() {
    try {
      const data: Autosave = { v: 1, savedAt: Date.now(), draft: this.draft, idEdited: this.idEdited, source: this.source };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      this.savedAt = data.savedAt;
      document.dispatchEvent(new CustomEvent('atelier:saved'));
    } catch {
      /* private mode / quota: autosave is a convenience */
    }
  }
}

export function readAutosave(): Autosave | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Autosave;
    if (a?.v !== 1 || !a.draft || typeof a.draft !== 'object') return null;
    return a;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Makes sure the nested objects the forms write into exist (a hand-written JSON may omit them). */
export function normalizeDraft(input: StallConfig): StallConfig {
  const d = structuredClone(input) as StallConfig & { $schema?: string };
  delete d.$schema;
  d.id = typeof d.id === 'string' ? d.id : '';
  d.name = typeof d.name === 'string' ? d.name : '';
  d.owner = d.owner && typeof d.owner === 'object' ? d.owner : { name: '' };
  d.owner.name = typeof d.owner.name === 'string' ? d.owner.name : '';
  for (const k of ['links', 'decorations', 'products'] as const) if (d[k] !== undefined && !Array.isArray(d[k])) delete d[k];
  // the lists the forms edit always exist (empty ones are dropped again on export)
  d.links ??= [];
  // same default as resolveStall: written explicitly so the list shows what the chalet shows
  d.decorations ??= [{ type: 'wreath' }, { type: 'lantern' }, { type: 'mini-tree' }];
  d.products ??= [];
  d.chalet = d.chalet && typeof d.chalet === 'object' ? d.chalet : {};
  d.owner.appearance = d.owner.appearance && typeof d.owner.appearance === 'object' ? d.owner.appearance : {};
  d.owner.greetings = Array.isArray(d.owner.greetings) ? d.owner.greetings : [];
  d.owner.farewells = Array.isArray(d.owner.farewells) ? d.owner.farewells : [];
  d.knowledge = d.knowledge && typeof d.knowledge === 'object' ? d.knowledge : {};
  d.knowledge.faq = Array.isArray(d.knowledge.faq) ? d.knowledge.faq : [];
  d.knowledge.facts = Array.isArray(d.knowledge.facts) ? d.knowledge.facts : [];
  return d;
}

// ───────────────────────────── paths ─────────────────────────────

export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Sets a dotted path, creating objects on the way. `undefined` deletes the key. */
export function setPath(obj: any, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

// ───────────────────────────── export ─────────────────────────────

const ORDER: (keyof StallConfig)[] = ['id', 'order', 'name', 'tagline', 'category', 'website', 'links', 'owner', 'chalet', 'decorations', 'products', 'knowledge'];
/** Arrays whose emptiness means something (no decorations at all, products from the scan). */
const KEEP_EMPTY = new Set(['decorations', 'products']);

function isBlank(v: unknown) {
  return v === undefined || (typeof v === 'string' && v.trim() === '');
}

function clean(v: unknown, key = '', depth = 0): unknown {
  if (Array.isArray(v)) {
    const arr = v.map((x) => clean(x, '', depth + 1)).filter((x) => x !== undefined);
    if (!arr.length && !(depth === 1 && KEEP_EMPTY.has(key))) return undefined;
    return arr;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const c = clean(val, k, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (isBlank(v)) return undefined;
  if (typeof v === 'string') return v.trim() === v ? v : v.replace(/^\s+|\s+$/g, '');
  return v;
}

/** The StallConfig as it should be written to content/stalls/<id>.json (no empty fields, clean items). */
export function exportable(d: StallConfig): StallConfig {
  const src = structuredClone(d);
  // drop list items that carry nothing
  src.links = src.links?.filter((l) => !isBlank(l.url));
  src.products = src.products?.filter((p) => !isBlank(p.url) || !isBlank(p.name));
  if (src.knowledge) {
    src.knowledge.faq = src.knowledge.faq?.filter((f) => !isBlank(f.q) && !isBlank(f.a));
    src.knowledge.facts = src.knowledge.facts?.filter((f) => !isBlank(f.text));
  }
  if (src.owner) {
    src.owner.greetings = src.owner.greetings?.filter((g) => !isBlank(g));
    src.owner.farewells = src.owner.farewells?.filter((g) => !isBlank(g));
  }
  const cleaned = (clean(src) ?? {}) as Record<string, unknown>;
  // id, name and owner.name are required by the schema, even if still empty while editing
  cleaned.id = d.id ?? '';
  cleaned.name = d.name ?? '';
  cleaned.owner = { name: d.owner?.name ?? '', ...(cleaned.owner as object) };
  const out: Record<string, unknown> = {};
  for (const k of ORDER) if (cleaned[k] !== undefined) out[k] = cleaned[k];
  for (const k of Object.keys(cleaned)) if (!(k in out)) out[k] = cleaned[k];
  return out as unknown as StallConfig;
}

export function exportJson(d: StallConfig): string {
  const body = exportable(d);
  return JSON.stringify({ $schema: SCHEMA_REF, ...body }, null, 2) + '\n';
}
