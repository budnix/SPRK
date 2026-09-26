/** Prosta szyna zdarzeń (publish/subscribe). */
export class EventBus {
  #handlers = new Map();

  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.#handlers.get(event)?.delete(fn);
  }

  emit(event, payload) {
    for (const fn of this.#handlers.get(event) || []) fn(payload);
    for (const fn of this.#handlers.get('*') || []) fn(event, payload);
  }
}
