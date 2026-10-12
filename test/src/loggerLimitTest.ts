import { Logger } from "builder-util"
import { LogLimiter } from "builder-util-runtime/internal"
import type { LoggerLike } from "builder-util-runtime"
import { describe, test, vi } from "vitest"

// Each test builds its own Logger, so the counters never leak between (concurrent) tests.
const newLogger = () => {
  const logger = new Logger(process.stdout)
  const info = vi.spyOn(logger, "info").mockImplementation(() => undefined)
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)
  const error = vi.spyOn(logger, "error").mockImplementation(() => undefined)
  const debug = vi.spyOn(logger, "debug").mockImplementation(() => undefined)
  return { logger, info, warn, error, debug }
}

describe("Logger.limit / Logger.once", () => {
  test("once emits a key a single time and forwards fields and message unchanged", ({ expect }) => {
    const { logger, warn } = newLogger()

    expect(logger.once("k").warn({ file: "a" }, "first")).toBe(true)
    expect(logger.once("k").warn({ file: "b" }, "second")).toBe(false)

    expect(warn.mock.calls).toEqual([[{ file: "a" }, "first"]])
  })

  test("the quota is per key, and shared by every level of that key", ({ expect }) => {
    const { logger, info, warn, error } = newLogger()

    logger.once("a").info("a-info")
    logger.once("a").warn("a-warn")
    logger.once("b").error("b-error")

    expect(info.mock.calls).toEqual([["a-info"]])
    expect(warn).not.toHaveBeenCalled()
    expect(error.mock.calls).toEqual([["b-error"]])
  })

  test("limit emits up to max times, then reports itself exhausted", ({ expect }) => {
    const { logger, warn } = newLogger()
    const limited = () => logger.limit({ key: "retry", max: 3 })

    for (let i = 0; i < 5; i++) {
      limited().warn({ attempt: i }, "retrying")
    }

    expect(warn.mock.calls.map(it => it[0])).toEqual([{ attempt: 0 }, { attempt: 1 }, { attempt: 2 }])
    expect(limited().isExhausted).toBe(true)
    expect(logger.limit({ key: "other", max: 3 }).isExhausted).toBe(false)
  })

  test("a scope object gets its own quota, separate from the process-wide one", ({ expect }) => {
    const { logger, warn } = newLogger()
    const packagerA = {}
    const packagerB = {}

    logger.once("unsigned", packagerA).warn("a")
    logger.once("unsigned", packagerA).warn("a again")
    logger.once("unsigned", packagerB).warn("b")
    logger.once("unsigned").warn("process-wide")

    expect(warn.mock.calls.map(it => it[0])).toEqual(["a", "b", "process-wide"])
    expect(logger.once("unsigned", packagerA).isExhausted).toBe(true)
    expect(logger.once("unsigned", {}).isExhausted).toBe(false)
  })

  test("a debug message suppressed by the debug level does not use up the quota", ({ expect }) => {
    const { logger, debug } = newLogger()
    const debugEnabled = vi.spyOn(logger, "isDebugEnabled", "get").mockReturnValue(false)

    expect(logger.once("d").debug(null, "suppressed")).toBe(false)
    expect(logger.once("d").isExhausted).toBe(false)

    debugEnabled.mockReturnValue(true)
    expect(logger.once("d").debug(null, "shown")).toBe(true)
    expect(logger.once("d").debug(null, "again")).toBe(false)
    expect(debug.mock.calls).toEqual([[null, "shown"]])
  })

  test("resetLimits re-arms one key, one scope, or everything", ({ expect }) => {
    const { logger, warn } = newLogger()
    const scope = {}
    const emitAll = () => {
      logger.once("a").warn("a")
      logger.once("b").warn("b")
      logger.once("a", scope).warn("scoped")
    }

    emitAll()
    logger.resetLimits("a")
    emitAll()
    logger.resetLimits(undefined, scope)
    emitAll()
    logger.resetLimits()
    emitAll()

    expect(warn.mock.calls.map(it => it[0])).toEqual(["a", "b", "scoped", "a", "scoped", "a", "b", "scoped"])
  })

  test("separate Logger instances keep separate counts", ({ expect }) => {
    const first = newLogger()
    const second = newLogger()

    first.logger.once("k").warn("first")
    second.logger.once("k").warn("second")

    expect(first.warn).toHaveBeenCalledTimes(1)
    expect(second.warn).toHaveBeenCalledTimes(1)
  })
})

describe("LogLimiter", () => {
  test("take records emissions up to max, per key and per scope", ({ expect }) => {
    const limiter = new LogLimiter()
    const scope = {}

    expect([limiter.take("k", 2), limiter.take("k", 2), limiter.take("k", 2)]).toEqual([true, true, false])
    expect(limiter.take("k", 1, scope)).toBe(true)
    expect(limiter.take("k", 1, scope)).toBe(false)
    expect(limiter.isExhausted("k", 2)).toBe(true)
    expect(limiter.isExhausted("unknown")).toBe(false)
    expect(limiter.isExhausted("k", 1, {})).toBe(false)
  })

  test("raising max for a key lets it emit again", ({ expect }) => {
    const limiter = new LogLimiter()
    limiter.take("k", 1)

    expect(limiter.take("k", 1)).toBe(false)
    expect(limiter.take("k", 2)).toBe(true)
  })

  describe("reset", () => {
    // records "a" and "b" in the default scope, in `scope` and in `otherScope`, and returns which of them are exhausted
    const setup = () => {
      const limiter = new LogLimiter()
      const scope = {}
      const otherScope = {}
      for (const s of [undefined, scope, otherScope]) {
        limiter.take("a", 1, s)
        limiter.take("b", 1, s)
      }
      const exhausted = () =>
        Object.fromEntries(Object.entries({ own: undefined, scope, otherScope }).map(([name, s]) => [name, [limiter.isExhausted("a", 1, s), limiter.isExhausted("b", 1, s)]]))
      return { limiter, scope, exhausted }
    }

    test("with no arguments forgets everything", ({ expect }) => {
      const { limiter, exhausted } = setup()
      limiter.reset()
      expect(exhausted()).toEqual({ own: [false, false], scope: [false, false], otherScope: [false, false] })
    })

    test("with a key only forgets that key in the default scope", ({ expect }) => {
      const { limiter, exhausted } = setup()
      limiter.reset("a")
      expect(exhausted()).toEqual({ own: [false, true], scope: [true, true], otherScope: [true, true] })
    })

    test("with a scope only forgets every key of that scope", ({ expect }) => {
      const { limiter, scope, exhausted } = setup()
      limiter.reset(undefined, scope)
      expect(exhausted()).toEqual({ own: [true, true], scope: [false, false], otherScope: [true, true] })
    })

    test("with a key and a scope forgets that key in that scope", ({ expect }) => {
      const { limiter, scope, exhausted } = setup()
      limiter.reset("a", scope)
      expect(exhausted()).toEqual({ own: [true, true], scope: [false, true], otherScope: [true, true] })
    })

    test("of a key or scope with nothing recorded is a no-op", ({ expect }) => {
      const { limiter, exhausted } = setup()
      limiter.reset("unknown")
      limiter.reset(undefined, {})
      limiter.reset("a", {})
      expect(exhausted()).toEqual({ own: [true, true], scope: [true, true], otherScope: [true, true] })
    })
  })

  test("a primitive scope from untyped callers counts in the default scope instead of throwing", ({ expect }) => {
    const limiter = new LogLimiter()
    const primitive = "not-an-object" as unknown as object

    expect(limiter.take("k", 1, primitive)).toBe(true)
    expect(limiter.take("k", 1, primitive)).toBe(false)
    expect(limiter.isExhausted("k")).toBe(true)
    expect(limiter.isExhausted("k", 1, primitive)).toBe(true)
    expect(() => limiter.reset(undefined, primitive)).not.toThrow()
    limiter.reset("k", primitive)
    expect(limiter.isExhausted("k")).toBe(false)
    expect(limiter.wrap(() => newTarget(), { key: "w", scope: primitive }).warn("m")).toBe(true)
  })
})

const newTarget = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })

describe("LogLimiter.wrap", () => {
  test("forwards every argument to the wrapped logger and returns whether it emitted", ({ expect }) => {
    const target = newTarget()
    const limited = new LogLimiter().wrap(() => target, { key: "k", max: 2 })

    expect(limited.warn("a", { file: "x" }, 3)).toBe(true)
    expect(limited.info("b")).toBe(true)
    expect(limited.error("c")).toBe(false)

    expect(target.warn.mock.calls).toEqual([["a", { file: "x" }, 3]])
    expect(target.info.mock.calls).toEqual([["b"]])
    expect(target.error).not.toHaveBeenCalled()
    expect(limited.isExhausted).toBe(true)
  })

  test("a logger without the optional debug() does not use up the quota", ({ expect }) => {
    const { info, warn, error } = newTarget()
    const limited = new LogLimiter().wrap((): LoggerLike => ({ info, warn, error }), { key: "k" })

    expect(limited.debug("dropped")).toBe(false)
    expect(limited.isExhausted).toBe(false)
    expect(limited.warn("shown")).toBe(true)
  })

  test("a level reported disabled by isLevelEnabled does not use up the quota", ({ expect }) => {
    const target = newTarget()
    let debugEnabled = false
    const isLevelEnabled = vi.fn((level: string) => level !== "debug" || debugEnabled)
    const limited = new LogLimiter().wrap(() => target, { key: "k", isLevelEnabled })

    expect(limited.debug("suppressed")).toBe(false)
    expect(limited.isExhausted).toBe(false)
    debugEnabled = true
    expect(limited.debug("shown")).toBe(true)
    expect(limited.debug("again")).toBe(false)

    expect(target.debug.mock.calls).toEqual([["shown"]])
    expect(isLevelEnabled).toHaveBeenCalledWith("debug")
  })

  test("the target is read on every call, so a logger set later receives what is left of the quota", ({ expect }) => {
    const before = newTarget()
    const after = newTarget()
    let current = before
    const limited = new LogLimiter().wrap(() => current, { key: "k", max: 2 })

    limited.warn("one")
    current = after
    limited.warn("two")
    limited.warn("three")

    expect(before.warn.mock.calls).toEqual([["one"]])
    expect(after.warn.mock.calls).toEqual([["two"]])
  })

  test("calls the method with the wrapped logger as this", ({ expect }) => {
    const target = {
      ...newTarget(),
      prefix: "p",
      warn: vi.fn(function (this: { prefix: string }, message: string) {
        return `${this.prefix}:${message}`
      }),
    }
    new LogLimiter().wrap(() => target, { key: "k" }).warn("m")

    expect(target.warn.mock.results[0].value).toBe("p:m")
  })

  test("wrappers of one limiter share the quota per key and scope, and reset re-arms it", ({ expect }) => {
    const target = newTarget()
    const limiter = new LogLimiter()
    const scope = {}
    const emitAll = () => [
      limiter.wrap(() => target, { key: "k" }).warn("process-wide"),
      limiter.wrap(() => target, { key: "k", scope }).warn("scoped"),
      limiter.wrap(() => target, { key: "k", scope: {} }).warn("other scope"),
    ]

    expect(emitAll()).toEqual([true, true, true])
    expect(emitAll()).toEqual([false, false, true])
    limiter.reset(undefined, scope)
    expect(emitAll()).toEqual([false, true, true])
    limiter.reset()
    expect(emitAll()).toEqual([true, true, true])
  })
})

// spies on the global console: sequential, and restores only its own spies (a restoreAllMocks would also undo other tests' spies)
describe("LogLimiter.wrap around console", { concurrent: false }, () => {
  test("emits each key once through console, including console.debug", ({ expect }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
    try {
      const limiter = new LogLimiter()
      const once = (key: string) => limiter.wrap(() => console, { key })

      expect(once("a").warn("a", 1)).toBe(true)
      expect(once("a").warn("a again")).toBe(false)
      expect(once("b").debug("b")).toBe(true)
      expect(once("b").warn("b as warn")).toBe(false)

      expect(warn.mock.calls).toEqual([["a", 1]])
      expect(debug.mock.calls).toEqual([["b"]])
    } finally {
      warn.mockRestore()
      debug.mockRestore()
    }
  })
})
