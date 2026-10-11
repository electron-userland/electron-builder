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
    const counts = this.counts(scope, true)!
    const count = counts.get(key) ?? 0
    if (count >= max) {
      return false
    }
    counts.set(key, count + 1)
    return true
  }

  /** Whether `key` has already been emitted `max` times — lets a call site skip computing an expensive message. */
  isExhausted(key: string, max = 1, scope?: object): boolean {
    return (this.counts(scope, false)?.get(key) ?? 0) >= max
  }

  /**
   * Forgets recorded emissions: of one key (in the default scope, or in `scope`), of every key in `scope`, or —
   * with no arguments — of everything. Intended for tests.
   */
  reset(key?: string, scope?: object): void {
    if (key == null && scope == null) {
      this.ownCounts.clear()
      this.scopedCounts = new WeakMap()
      return
    }
    if (key == null) {
      this.scopedCounts.delete(scope!)
      return
    }
    this.counts(scope, false)?.delete(key)
  }

  private counts(scope: object | undefined, create: boolean): Map<string, number> | undefined {
    if (scope == null) {
      return this.ownCounts
    }
    let counts = this.scopedCounts.get(scope)
    if (counts == null && create) {
      counts = new Map()
      this.scopedCounts.set(scope, counts)
    }
    return counts
  }
}
