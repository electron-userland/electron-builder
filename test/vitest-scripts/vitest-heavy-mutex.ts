import { beforeEach, afterEach } from "vitest"

/**
 * Heavy test mutex - ensures tests marked as heavy run sequentially.
 *
 * This prevents CPU overload when tests spawn external processes like:
 * - hdiutil (macOS DMG creation)
 * - snap/snapcraft (Linux snap packages)
 * - rpmbuild (RPM packages)
 * - makensis (Windows installers)
 * - etc.
 *
 * Usage:
 * ```typescript
 * import { test } from "./vitest-setup"
 *
 * test.heavy("builds DMG", async () => {
 *   await buildDMG()
 * })
 * ```
 */

class HeavyTestMutex {
  private queue: Array<() => void> = []
  private running = false

  async acquire(): Promise<void> {
    if (!this.running) {
      this.running = true
      return Promise.resolve()
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve)
    })
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.running = false
    }
  }
}

const heavyMutex = new HeavyTestMutex()
const heavyContexts = new WeakSet<any>()

beforeEach(
  async ctx => {
    // Vitest provides task metadata through context.task
    const task = (ctx as any).task
    if (!task) {
      return
    }

    // Check if this test has the heavy meta flag
    const meta = task.meta || {}
    if (meta.heavy === true) {
      heavyContexts.add(ctx)
      // Acquire mutex - this may wait indefinitely for previous heavy test to complete
      // The actual test timeout will be respected once the test starts
      await heavyMutex.acquire()
    }
  },
  // Infinite timeout for hook - test timeout is separate
  Infinity
)

afterEach(
  ctx => {
    if (heavyContexts.has(ctx)) {
      heavyContexts.delete(ctx)
      heavyMutex.release()
    }
  },
  // Infinite timeout for cleanup
  Infinity
)
