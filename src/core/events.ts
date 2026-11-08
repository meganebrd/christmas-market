/** Tiny typed event bus. */
export class EventBus<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<(p: any) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  once<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload[0]);
      } catch (err) {
        console.error(`[givrelune] event handler for "${String(type)}" failed`, err);
      }
    }
  }

  /** Promise that resolves on the next event of this type. */
  wait<K extends keyof E>(type: K): Promise<E[K]> {
    return new Promise((resolve) => this.once(type, resolve));
  }
}
