import { CancellationToken, Nullish } from "builder-util-runtime"

type Handler = (...args: any[]) => Promise<void> | void

type HandlerType = "system" | "user"

type Handle = { handler: Handler; type: HandlerType }

export type EventMap = {
  [key: string]: Handle
}

interface TypedEventEmitter<Events extends EventMap> {
  on<E extends keyof Events>(event: E, listener: Events[E]["handler"] | Nullish, priority: HandlerType): this
  off<E extends keyof Events>(event: E, listener: Events[E]["handler"] | Nullish): this
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]["handler"]>): Promise<boolean> | boolean
}

export class AsyncEventEmitter<T extends EventMap> implements TypedEventEmitter<T> {
  private readonly listeners: Map<keyof T, Handle[] | undefined> = new Map()
  private readonly cancellationToken = new CancellationToken()

  on<E extends keyof T>(event: E, listener: T[E]["handler"] | Nullish, priority: HandlerType = "system"): this {
    if (!listener) {
      return this
    }
    let listeners = this.listeners.get(event)
    if (!listeners) {
      listeners = []
    }
    listeners.push({ handler: listener, type: priority })
    this.listeners.set(event, listeners)
    return this
  }

  off<E extends keyof T>(event: E, listener: T[E]["handler"] | Nullish): this {
    const listeners = this.listeners.get(event)?.filter(l => l.handler !== listener)
    if (!listeners?.length) {
      this.listeners.delete(event)
      return this
    }
    this.listeners.set(event, listeners)
    return this
  }

  async emit<E extends keyof T>(event: E, ...args: Parameters<T[E]["handler"]>): Promise<boolean> {
    const eventListeners = this.listeners.get(event) || []
    if (!eventListeners.length) {
      return false
    }
    const emitInternal = async (listeners: Handle[]) => {
      for (const listener of listeners) {
        if (this.cancellationToken.cancelled) {
          return false
        }
        await listener.handler(...args)
      }
      return true
    }
    if (!(await emitInternal(eventListeners.filter(l => l.type === "system")))) {
      return false
    }
    // user handlers are always last
    if (!(await emitInternal(eventListeners.filter(l => l.type === "user")))) {
      return false
    }
    return true
  }
}
