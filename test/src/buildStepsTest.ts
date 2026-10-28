import { Arch, Platform, Target } from "app-builder-lib"
import { assertArchSupported, assertPlatformBuildableOnHost, partitionTargetsToFinish, resolvePoolCount, runUntilCancelled } from "app-builder-lib/src/buildSteps"
import { MAX_FILE_REQUESTS } from "builder-util"
import { describe, expect, test } from "vitest"

class StubTarget extends Target {
  readonly outDir = ""
  readonly options = null

  constructor(
    name: string,
    isAsyncSupported: boolean,
    private readonly finished: Array<string>
  ) {
    super(name, isAsyncSupported)
  }

  build(): Promise<void> {
    return Promise.resolve()
  }

  async finishBuild(): Promise<void> {
    await Promise.resolve()
    this.finished.push(this.name)
  }
}

describe("assertPlatformBuildableOnHost", () => {
  test("macOS can be built on macOS and Linux, not on Windows; Windows and Linux everywhere", () => {
    for (const platform of ["darwin", "linux"] as const) {
      expect(() => assertPlatformBuildableOnHost(Platform.MAC, { platform })).not.toThrow()
    }
    expect(() => assertPlatformBuildableOnHost(Platform.MAC, { platform: "win32" })).toThrow(/Build for macOS is supported only on macOS/)
    for (const platform of ["darwin", "linux", "win32"] as const) {
      expect(() => assertPlatformBuildableOnHost(Platform.WINDOWS, { platform })).not.toThrow()
      expect(() => assertPlatformBuildableOnHost(Platform.LINUX, { platform })).not.toThrow()
    }
  })
})

describe("assertArchSupported", () => {
  const electron44 = { name: "electron", version: "44.0.0" }

  test("rejects an arch Electron no longer builds", () => {
    expect(() => assertArchSupported(Platform.WINDOWS, Arch.ia32, { prepackaged: null, framework: electron44, config: {} })).toThrow(/does not provide windows ia32 builds/)
    expect(() => assertArchSupported(Platform.WINDOWS, Arch.x64, { prepackaged: null, framework: electron44, config: {} })).not.toThrow()
    expect(() => assertArchSupported(Platform.WINDOWS, Arch.ia32, { prepackaged: null, framework: { name: "electron", version: "43.1.0" }, config: {} })).not.toThrow()
  })

  test("is skipped for a prepackaged app and for another framework", () => {
    expect(() => assertArchSupported(Platform.WINDOWS, Arch.ia32, { prepackaged: "/app", framework: electron44, config: {} })).not.toThrow()
    expect(() => assertArchSupported(Platform.WINDOWS, Arch.ia32, { prepackaged: undefined, framework: { name: "custom", version: "44.0.0" }, config: {} })).not.toThrow()
  })
})

describe("resolvePoolCount", () => {
  test("packs one arch at a time unless concurrency.jobs says otherwise", () => {
    expect(resolvePoolCount(undefined)).toEqual({ poolCount: 1, requested: 1, warning: null })
    expect(resolvePoolCount(null)).toEqual({ poolCount: 1, requested: 1, warning: null })
    expect(resolvePoolCount(0)).toEqual({ poolCount: 1, requested: 1, warning: null })
    expect(resolvePoolCount(4.7)).toEqual({ poolCount: 4, requested: 4, warning: null })
    expect(resolvePoolCount(MAX_FILE_REQUESTS)).toEqual({ poolCount: MAX_FILE_REQUESTS, requested: MAX_FILE_REQUESTS, warning: null })
  })

  test("clamps an invalid count to 1 and keeps a count above MAX_FILE_REQUESTS, with a warning", () => {
    expect(resolvePoolCount(0.5)).toEqual({ poolCount: 1, requested: 0, warning: "invalid" })
    expect(resolvePoolCount(-3)).toEqual({ poolCount: 1, requested: -3, warning: "invalid" })
    expect(resolvePoolCount(MAX_FILE_REQUESTS + 1)).toEqual({ poolCount: MAX_FILE_REQUESTS + 1, requested: MAX_FILE_REQUESTS + 1, warning: "aboveMaxFileRequests" })
  })
})

describe("finishing the targets", () => {
  test("splits the targets into the ones that finish on their own and the ones finished one after another, in order, leaving out skipped ones", () => {
    const finished: Array<string> = []
    const targets = [new StubTarget("nsis", true, finished), new StubTarget("appx", false, finished), new StubTarget("zip", true, finished), new StubTarget("msi", false, finished)]
    const skipped = new Set(["zip"])

    const { async, sync } = partitionTargetsToFinish(targets, target => skipped.has(target.name))
    expect(async.map(it => it.name)).toEqual(["nsis"])
    expect(sync.map(it => it.name)).toEqual(["appx", "msi"])
    expect(finished).toEqual([])
  })

  test("runs the sync finishers one after another and starts none once cancelled", async () => {
    const finished: Array<string> = []
    const token = { cancelled: false }
    const targets = [new StubTarget("appx", false, finished), new StubTarget("msi", false, finished), new StubTarget("pkg", false, finished)]
    const started: Array<string> = []

    await runUntilCancelled(
      targets.map(target => async () => {
        started.push(target.name)
        // nothing else runs while one finishes
        expect(finished).toEqual(started.slice(0, -1))
        await target.finishBuild()
        token.cancelled = target.name === "msi"
      }),
      token
    )
    expect(finished).toEqual(["appx", "msi"])
  })

  test("runs actions added while running, as the finalize tasks may be", async () => {
    const ran: Array<number> = []
    const actions: Array<() => Promise<void>> = []
    actions.push(async () => {
      ran.push(1)
      actions.push(() => Promise.resolve(void ran.push(2)))
    })
    await runUntilCancelled(actions, { cancelled: false })
    expect(ran).toEqual([1, 2])
  })
})
