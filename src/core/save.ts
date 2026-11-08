import type { Settings } from './contracts';

export interface SaveData {
  version: 1;
  introSeen: boolean;
  stars: string[];
  visitedStalls: string[];
  minigames: Record<string, { best: number; won: boolean }>;
  settings: Settings;
  flags: Record<string, boolean | number | string>;
}

const KEY = 'givrelune:save:v1';

const DEFAULT: SaveData = {
  version: 1,
  introSeen: false,
  stars: [],
  visitedStalls: [],
  minigames: {},
  settings: { muted: false, music: 0.6, sfx: 0.8, quality: 'auto', reducedMotion: false },
  flags: {},
};

/** localStorage-backed save. Survives private mode (falls back to memory). */
export class SaveStore {
  data: SaveData;
  private persist: boolean;

  constructor(opts: { persist?: boolean } = {}) {
    this.persist = opts.persist ?? true;
    this.data = structuredClone(DEFAULT);
    if (!this.persist) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed, settings: { ...this.data.settings, ...(parsed.settings ?? {}) } };
      }
    } catch {
      /* ignore */
    }
  }

  update(fn: (d: SaveData) => void) {
    fn(this.data);
    this.write();
  }

  flag<T extends boolean | number | string>(key: string, value?: T): T | undefined {
    if (value !== undefined) this.update((d) => (d.flags[key] = value));
    return this.data.flags[key] as T | undefined;
  }

  reset() {
    this.data = structuredClone(DEFAULT);
    this.write();
  }

  private write() {
    if (!this.persist) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}
