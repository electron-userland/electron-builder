export type LogLevel = "info" | "warn" | "debug" | "error"

export interface LogLimitOptions {
  /** Stable identifier of the message. Use an explicit key, not the message text: messages embed values (paths, platforms) that vary between calls. */
  readonly key: string
  /** How many times the message may be emitted. Defaults to 1. */
  readonly max?: number
  /**
   * Object whose lifetime bounds the count (a packager, a target, a build's cancellation token), so each one gets
   * its own quota and the counters are garbage-collected with it. Defaults to the limiter itself: once per process
   * for builder-util's `log` singleton, once per updater instance in electron-updater.
   */
  readonly scope?: object
}

/** Any logger with `info`/`warn`/`error` and an optional `debug` — builder-util's `Logger`, electron-updater's `Logger`, `console`. */
export interface LoggerLike {
  info(...args: any[]): unknown
  warn(...args: any[]): unknown
  error(...args: any[]): unknown
  debug?(...args: any[]): unknown
}

/**
 * The `info`/`warn`/`error`/`debug` methods of a wrapped logger `T` (taking the same arguments), each emitting only while
 * the limit allows. Each returns whether it emitted.
 */
export interface LimitedLogger<T extends LoggerLike = LoggerLike> {
  info(...args: Parameters<T["info"]>): boolean
  warn(...args: Parameters<T["warn"]>): boolean
  error(...args: Parameters<T["error"]>): boolean
  /** Does not consume the quota when the logger has no `debug` method or debug logging is disabled. */
  debug(...args: Parameters<NonNullable<T["debug"]>>): boolean
  /** Whether the limit has been reached, so a call site can skip computing an expensive message. */
  readonly isExhausted: boolean
}

/**
 * Counts how many times each keyed log message has been emitted, so a call site can say "log this at most N times"
 * instead of keeping its own `xxxWarned = false` flag or `Set` of already-warned keys.
 *
 * Counts are kept per scope: the default scope is the limiter itself (for the builder's process-wide `log`
 * singleton that means once per process), and passing an object (a packager, a target, a build's cancellation token)
 * gives that object its own counters, which are garbage-collected with it.
 */
export class LogLimiter {
  private readonly ownCounts = new Map<string, number>()
  private scopedCounts = new WeakMap<object, Map<string, number>>()

  /**
   * Records one emission of `key` and returns `true` when it is still within `max`; returns `false` (recording
   * nothing) once the limit is reached.
   */
  take(key: string, max = 1, scope?: object): boolean {
    const counts = this.countsFor(scope)
    const count = counts.get(key) ?? 0
    if (count >= max) {
      return false
    }
    counts.set(key, count + 1)
    return true
  }

  /** Whether `key` has already been emitted `max` times — lets a call site skip computing an expensive message. */
  isExhausted(key: string, max = 1, scope?: object): boolean {
    return (this.existingCounts(scope)?.get(key) ?? 0) >= max
  }

  /**
   * Forgets recorded emissions: of one key (in the default scope, or in `scope`), of every key in `scope`, or —
   * with no arguments — of everything. Intended for tests.
   */
  reset(key?: string, scope?: object): void {
    if (scope == null) {
      if (key == null) {
        this.ownCounts.clear()
        this.scopedCounts = new WeakMap()
      } else {
        this.ownCounts.delete(key)
      }
      return
    }
    if (key == null) {
      this.scopedCounts.delete(scope)
    } else {
      this.existingCounts(scope)?.delete(key)
    }
  }

  /**
   * Wraps the logger returned by `target` (read on every call, so a logger set later receives whatever quota is left)
   * so that each of its levels emits `key` at most `max` times. A call consumes the quota only when the logger has that
   * method and `isLevelEnabled` (if given) does not return `false` for the level.
   */
  wrap<T extends LoggerLike>(target: () => T, options: LogLimitOptions & { readonly isLevelEnabled?: (level: LogLevel) => boolean }): LimitedLogger<T> {
    const { key, max = 1, scope, isLevelEnabled } = options
    const emit = (level: LogLevel, args: unknown[]): boolean => {
      const logger: LoggerLike = target()
      const method = logger[level]
      if (method == null || isLevelEnabled?.(level) === false || !this.take(key, max, scope)) {
        return false
      }
      method.apply(logger, args)
      return true
    }
    const isExhausted = () => this.isExhausted(key, max, scope)
    return {
      info: (...args) => emit("info", args),
      warn: (...args) => emit("warn", args),
      error: (...args) => emit("error", args),
      debug: (...args) => emit("debug", args),
      get isExhausted() {
        return isExhausted()
      },
    }
  }

  /** The counters of `scope` (the limiter's own without one), or `undefined` when nothing has been recorded in `scope` yet. */
  private existingCounts(scope: object | undefined): Map<string, number> | undefined {
    return isWeakMapKey(scope) ? this.scopedCounts.get(scope) : this.ownCounts
  }

  /** The counters of `scope` (the limiter's own without one), created on first use. */
  private countsFor(scope: object | undefined): Map<string, number> {
    if (!isWeakMapKey(scope)) {
      return this.ownCounts
    }
    let counts = this.scopedCounts.get(scope)
    if (counts == null) {
      counts = new Map()
      this.scopedCounts.set(scope, counts)
    }
    return counts
  }
}

/**
 * `scope` is typed `object`, but an untyped JavaScript caller can still pass a primitive, which `WeakMap#set` rejects with a
 * `TypeError`: such a scope counts in the default scope instead, so that a log call never throws.
 */
function isWeakMapKey(scope: unknown): scope is object {
  return (typeof scope === "object" && scope !== null) || typeof scope === "function"
}
