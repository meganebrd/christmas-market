import type { MarketFile, ResolvedMarket, ScannedStallData, StallConfig } from './types';
import { resolveMarket } from './resolve';
import marketFile from '../../content/market.json';

/**
 * Loads every JSON file in /content at build time (Vite glob import) and resolves the market.
 * Adding a stall = dropping a JSON file in content/stalls/. No code change needed.
 * Files starting with "_" are ignored (templates, drafts).
 */
const stallModules = import.meta.glob<StallConfig>('../../content/stalls/*.json', { eager: true, import: 'default' });
const generatedModules = import.meta.glob<ScannedStallData>('../../content/generated/*.json', {
  eager: true,
  import: 'default',
});

/** Site-relative paths ("/demo/x.svg") must be prefixed when the site is served from a sub-folder (GitHub Pages). */
export function assetUrl(u: string | undefined): string | undefined {
  if (!u) return u;
  const base = import.meta.env.BASE_URL ?? '/';
  if (u.startsWith('/') && !u.startsWith('//') && base !== '/' && !u.startsWith(base)) return base.replace(/\/$/, '') + u;
  return u;
}

export function loadMarket(): ResolvedMarket {
  const { market, stalls, generated } = rawContent();
  const m = resolveMarket(market, stalls, generated);
  for (const s of m.stalls) {
    for (const p of s.products) p.image = assetUrl(p.image);
    if (s.owner.photo) s.owner.photo = assetUrl(s.owner.photo);
  }
  m.music.tracks = m.music.tracks.map((t) => (t.type === 'file' ? { ...t, src: assetUrl(t.src)! } : t));
  return m;
}

/** localStorage key where the stall editor stores the stall being edited ("Voir dans le marché"). */
export const DRAFT_KEY = 'givrelune:draft-stall';

export function rawContent(opts: { withDraft?: boolean } = {}): { market: MarketFile; stalls: StallConfig[]; generated: ScannedStallData[] } {
  let stalls = Object.entries(stallModules)
    .filter(([path]) => !path.split('/').pop()!.startsWith('_'))
    .map(([path, s]) => ({ ...s, id: s.id ?? path.split('/').pop()!.replace(/\.json$/, '') }));
  const withDraft = opts.withDraft ?? (typeof location !== 'undefined' && new URLSearchParams(location.search).has('draft'));
  if (withDraft) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const draft = raw ? (JSON.parse(raw) as StallConfig) : null;
      if (draft?.id && draft.name && draft.owner?.name) {
        const i = stalls.findIndex((s) => s.id === draft.id);
        if (i >= 0) stalls[i] = draft;
        else stalls = [{ ...draft, order: draft.order ?? -1 }, ...stalls];
      }
    } catch {
      /* ignore a broken draft */
    }
  }
  return {
    market: marketFile as MarketFile,
    stalls,
    generated: Object.values(generatedModules),
  };
}
