// 极简类型安全事件发射器（宿主核心逻辑使用，避免对 vscode/Node EventEmitter 的依赖）。

type Listener<T> = (payload: T) => void;

export class TypedEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<E extends keyof EventMap>(event: E, listener: Listener<EventMap[E]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set!.delete(listener as Listener<never>);
    };
  }

  emit<E extends keyof EventMap>(event: E, payload: EventMap[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<EventMap[E]>)(payload);
      } catch {
        // 监听器异常不得影响事件循环
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
