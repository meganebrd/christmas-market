/**
 * Tiny BM25 index (two fields: title boosted, text). Documents are pre-tokenised (stemmed) arrays.
 * A few hundred chunks at most per stall: everything stays in plain Maps, a query is well under 1 ms.
 */
import { editDistance } from './normalize';

export interface Bm25Doc {
  title: string[];
  text: string[];
}

export interface Bm25Hit {
  index: number;
  score: number;
  /** Query terms (vocabulary terms) found in the document. */
  matched: Set<string>;
  /** Matched in the title field. */
  titleMatched: Set<string>;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  titleWeight?: number;
}

export class Bm25Index {
  readonly size: number;
  private tf: Map<string, number>[] = [];
  private titleTf: Map<string, number>[] = [];
  private len: number[] = [];
  private avgLen = 1;
  private df = new Map<string, number>();
  private k1: number;
  private b: number;
  private titleWeight: number;

  constructor(docs: Bm25Doc[], opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    this.titleWeight = opts.titleWeight ?? 2;
    this.size = docs.length;
    let total = 0;
    for (const d of docs) {
      const tf = new Map<string, number>();
      const ttf = new Map<string, number>();
      for (const t of d.text) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of d.title) ttf.set(t, (ttf.get(t) ?? 0) + 1);
      const seen = new Set<string>([...tf.keys(), ...ttf.keys()]);
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      const l = d.text.length + d.title.length * this.titleWeight;
      total += l;
      this.tf.push(tf);
      this.titleTf.push(ttf);
      this.len.push(l);
    }
    this.avgLen = docs.length ? Math.max(1, total / docs.length) : 1;
  }

  has(term: string): boolean {
    return this.df.has(term);
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    return Math.log(1 + (this.size - n + 0.5) / (n + 0.5));
  }

  /**
   * Maps a query term onto the vocabulary: exact, then prefix (≥ 4 letters), then one typo (≥ 5 letters).
   * Returns [vocabTerm, weight] pairs.
   */
  resolve(term: string): [string, number][] {
    if (this.df.has(term)) return [[term, 1]];
    const out: [string, number][] = [];
    if (term.length < 4 || /^\d+$/.test(term)) return out;
    for (const v of this.df.keys()) {
      if (v.length < 4) continue;
      if ((v.startsWith(term) || term.startsWith(v)) && Math.abs(v.length - term.length) <= 3) out.push([v, 0.75]);
      else if (term.length >= 5 && v.length >= 5 && editDistance(term, v, 1) <= 1) out.push([v, 0.7]);
      if (out.length >= 4) break;
    }
    return out;
  }

  /** Scores every document. `query`: vocabulary term → query weight. */
  search(query: Map<string, number>): Bm25Hit[] {
    const hits: Bm25Hit[] = [];
    if (!this.size || !query.size) return hits;
    const terms = [...query.entries()].map(([t, w]) => ({ t, w, idf: this.idf(t) }));
    for (let i = 0; i < this.size; i++) {
      let score = 0;
      let matched: Set<string> | null = null;
      let titleMatched: Set<string> | null = null;
      const tf = this.tf[i];
      const ttf = this.titleTf[i];
      const norm = this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avgLen);
      for (const { t, w, idf } of terms) {
        const a = tf.get(t) ?? 0;
        const tt = ttf.get(t) ?? 0;
        if (!a && !tt) continue;
        const f = a + tt * this.titleWeight;
        score += w * idf * ((f * (this.k1 + 1)) / (f + norm));
        (matched ??= new Set()).add(t);
        if (tt) (titleMatched ??= new Set()).add(t);
      }
      if (score > 0) hits.push({ index: i, score, matched: matched!, titleMatched: titleMatched ?? new Set() });
    }
    return hits.sort((a, b) => b.score - a.score);
  }
}
