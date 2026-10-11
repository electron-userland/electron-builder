import { Logger } from "builder-util"
import { LogLimiter } from "builder-util-runtime/internal"
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

    expect(info.mock.calls).toEqual([["a-info", undefined]])
    expect(warn).not.toHaveBeenCalled()
    expect(error.mock.calls).toEqual([["b-error", undefined]])
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
})
