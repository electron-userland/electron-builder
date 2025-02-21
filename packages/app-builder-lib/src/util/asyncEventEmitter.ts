import { log } from "builder-util"
import { CancellationToken, Nullish } from "builder-util-runtime"

type Handler = (...args: any[]) => Promise<void> | void

export type HandlerType = "system" | "user"

type Handle = { handler: Handler | Promise<Handler | Nullish>; type: HandlerType }

export type EventMap = {
  [key: string]: Handler
}

interface TypedEventEmitter<Events extends EventMap> {
  on<E extends keyof Events>(event: E, listener: Events[E] | Nullish, type: HandlerType): this
  off<E extends keyof Events>(event: E, listener: Events[E] | Nullish): this
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<{ emittedSystem: boolean; emittedUser: boolean }>
  filterListeners<E extends keyof Events>(event: E, type: HandlerType): Handle[]
  clear(): void
}

export class AsyncEventEmitter<T extends EventMap> implements TypedEventEmitter<T> {
  private readonly listeners: Map<keyof T, Handle[] | undefined> = new Map()
  private readonly cancellationToken = new CancellationToken()

  on<E extends keyof T>(event: E, listener: T[E] | Promise<T[E] | Nullish> | Nullish, type: HandlerType = "system"): this {
    if (!listener) {
      return this
    }
    const listeners = this.listeners.get(event) ?? []
    listeners.push({ handler: listener, type })
    this.listeners.set(event, listeners)
    return this
  }

  off<E extends keyof T>(event: E, listener: T[E] | Nullish): this {
    const listeners = this.listeners.get(event)?.filter(l => l.handler !== listener)
    if (!listeners?.length) {
      this.listeners.delete(event)
      return this
    }
    this.listeners.set(event, listeners)
    return this
  }

  async emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>): Promise<{ emittedSystem: boolean; emittedUser: boolean }> {
    const result = { emittedSystem: false, emittedUser: false }

    const eventListeners = this.listeners.get(event) || []
    if (!eventListeners.length) {
      log.debug({ event }, "no event listeners found")
      return result
    }

    const emitInternal = async (listeners: Handle[]) => {
      for (const listener of listeners) {
        if (this.cancellationToken.cancelled) {
          return false
        }
        const handler = await Promise.resolve(listener.handler)
        await Promise.resolve(handler?.(...args))
      }
      return true
    }

    result.emittedSystem = await emitInternal(eventListeners.filter(l => l.type === "system"))
    // user handlers are always last
    result.emittedUser = await emitInternal(eventListeners.filter(l => l.type === "user"))

    return result
  }

  filterListeners<E extends keyof T>(event: E, type: HandlerType | undefined): Handle[] {
    const listeners = this.listeners.get(event) ?? []
    if (type) {
      return listeners.filter(l => l.type === type)
    }
    return listeners
  }

  clear() {
    this.listeners.clear()
  }
}
