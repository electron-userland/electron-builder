import type { UpdateInfo } from "builder-util-runtime"
import { DebUpdater, type Logger } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { describe, test, vi } from "vitest"

const stubApp: AppAdapter = {
  name: "TestApp",
  version: "1.0.0",
  isPackaged: false,
  appUpdateConfigPath: "/tmp/does-not-exist-app-update.yml",
  userDataPath: "/tmp",
  baseCachePath: "/tmp",
  whenReady: () => Promise.resolve(),
  relaunch: () => {},
  quit: () => {},
  onQuit: () => {},
}

const unsignedInfo: UpdateInfo = {
  version: "2.0.0",
  files: [{ url: "App-2.0.0.exe", sha512: "hash", size: 100 }],
  path: "App-2.0.0.exe",
  sha512: "hash",
  releaseDate: "2026-01-01T00:00:00.000Z",
}

const VERIFICATION_DISABLED = "update manifest signature verification is disabled"

// own logger per updater: the default is the global console, which concurrent tests must not share
const newLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })

const newUpdater = (logger: Logger) => {
  const updater = new DebUpdater(null, stubApp)
  updater.updateManifestPublicKey = null
  updater.logger = logger
  return updater
}

const verify = (updater: DebUpdater) => (updater as any).verifyManifestSignature(unsignedInfo)
const limited = (updater: DebUpdater, key: string, max?: number): Required<Logger> => (updater as any).limitedLogger(key, max)

describe("AppUpdater limited logging", () => {
  test("the verification-disabled warning is announced once per updater instance", async ({ expect }) => {
    const firstLogger = newLogger()
    const secondLogger = newLogger()
    const first = newUpdater(firstLogger)
    const second = newUpdater(secondLogger)

    await verify(first)
    await verify(first)
    await verify(second)

    expect(firstLogger.warn.mock.calls.filter(it => String(it[0]).includes(VERIFICATION_DISABLED))).toHaveLength(1)
    expect(secondLogger.warn.mock.calls.filter(it => String(it[0]).includes(VERIFICATION_DISABLED))).toHaveLength(1)
  })

  test("the user-supplied logger is called as-is, and a logger set later receives what is left of the quota", ({ expect }) => {
    const before = newLogger()
    const after = newLogger()
    const updater = newUpdater(before)

    limited(updater, "k", 2).warn("one")
    updater.logger = after
    limited(updater, "k", 2).warn("two")
    limited(updater, "k", 2).warn("three")

    expect(before.warn.mock.calls).toEqual([["one"]])
    expect(after.warn.mock.calls).toEqual([["two"]])
    // the getter still hands back the user's own object, not a wrapper
    expect(updater.logger).toBe(after)
  })

  test("a logger without the optional debug() does not use up the quota", ({ expect }) => {
    const { info, warn, error } = newLogger()
    const updater = newUpdater({ info, warn, error })

    limited(updater, "d").debug("dropped")
    const withDebug = newLogger()
    updater.logger = withDebug
    limited(updater, "d").debug("shown")
    limited(updater, "d").debug("again")

    expect(withDebug.debug.mock.calls).toEqual([["shown"]])
  })
})
