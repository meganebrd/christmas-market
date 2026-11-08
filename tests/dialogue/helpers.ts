import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMarket } from '../../src/config/resolve';
import type { MarketFile, ResolvedMarket, ResolvedStall, StallConfig } from '../../src/config/types';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function loadDemoMarket(): ResolvedMarket {
  const market = JSON.parse(readFileSync(resolve(ROOT, 'content/market.json'), 'utf8')) as MarketFile;
  const stalls = readdirSync(resolve(ROOT, 'content/stalls'))
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(readFileSync(resolve(ROOT, 'content/stalls', f), 'utf8')) as StallConfig);
  return resolveMarket(market, stalls, []);
}

export function stall(market: ResolvedMarket, id: string): ResolvedStall {
  const s = market.stalls.find((x) => x.id === id);
  if (!s) throw new Error(`demo stall ${id} not found`);
  return s;
}

/** Deterministic RNG for tests. */
export function seeded(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
