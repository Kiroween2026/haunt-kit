// Owner: Yadnesh. Tiny typed event emitter.

export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    for (const h of this.handlers.get(event) ?? []) {
      try {
        (h as (p: Events[E]) => void)(payload);
      } catch (e) {
        // One broken handler must not stop the others.
        console.error(`haunt-kit: ${String(event)} handler threw`, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
