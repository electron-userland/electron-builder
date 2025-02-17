type Handler = (...args: any[]) => Promise<void> | void

export type EventMap = {
  [key: string]: Handler
}

interface TypedEventEmitter<Events extends EventMap> {
  on<E extends keyof Events>(event: E, listener: Events[E]): this
  off<E extends keyof Events>(event: E, listener: Events[E]): this
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<boolean> | boolean
}

export class AsyncEventEmitter<T extends EventMap> implements TypedEventEmitter<T> {
  private readonly listeners: Map<keyof T, Handler[] | undefined> = new Map()

  on<E extends keyof T>(event: E, listener: T[E]): this {
    let listeners = this.listeners.get(event)
    if (!listeners) {
      listeners = []
    }
    listeners.push(listener)
    this.listeners.set(event, listeners)
    return this
  }

  off<E extends keyof T>(event: E, listener: T[E]): this {
    const listeners = this.listeners.get(event)?.filter(l => l !== listener)
    if (!listeners?.length) {
      this.listeners.delete(event)
      return this
    }
    this.listeners.set(event, listeners)
    return this
  }

  async emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>): Promise<boolean> {
    const eventListeners = this.listeners.get(event) || []
    if (!eventListeners.length) {
      return false
    }
    await Promise.all(eventListeners.map(listener => listener(...args)))
    return true
  }
}
