import type { ResolvedStall, ScannedStallData, StallConfig } from '../config/types';
import type { Preview } from './preview';
import type { Store } from './state';

export type TabId = 'identite' | 'personnage' | 'cabane' | 'decorations' | 'produits' | 'savoir' | 'tester';

export interface ScanResponse extends ScannedStallData {
  warnings?: string[];
  pages?: unknown[];
  platform?: string;
}

/** What every tab receives. */
export interface App {
  store: Store;
  /** Stalls of the market (content/stalls), for the selector, order hints and id clashes. */
  existing: StallConfig[];
  generated: ScannedStallData[];
  town: string;
  /** resolveStall(draft, scan, 'fr', 0), cached until the next change. Images are base-path aware. */
  resolved(): ResolvedStall;
  /** Bumped on every change (the Tester rebuilds its responder when it moves). */
  readonly version: number;
  preview: Preview | null;
  go(tab: TabId, focusId?: string): void;
  /** Re-render the current tab, keeping focus (data-focus-key) and animating moved rows (data-flip). */
  rerender(focusKey?: string): void;
  toast(text: string, kind?: 'ok' | 'warn' | 'error', action?: { label: string; run: () => void }): void;
  /** After a list move/removal: save, re-render (focus `key`), offer "Annuler" for a removal. */
  listChanged(key: string, removed?: { name: string; undo: () => void }): void;
  /** Expanded product cards (by row key). */
  expanded: Set<string>;
}
