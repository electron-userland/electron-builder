import { ToolsetConfig } from "app-builder-lib"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runWebInstallerInstallOnNextLaunchTest, runWebInstallerRejectedTest, runWebInstallerUpdateTest, windowsVmPromise } from "./blackboxUpdateHelpers"

// NSIS web installer (nsis-web) update cycles. Each register function adds a single test (plus the opt-in per-machine variant) and
// generate-toolset-tests-windows.ts emits one file per function and toolset combination: the CI sharder packs whole files, and each
// of these tests builds two versions, installs one and updates it (~15 min), so they don't share a file. Per file,
// timeout × (1 + retry) stays at or below 40 min, under the 60-minute cap of the Windows job.

type WebWinToolsets = Required<Pick<ToolsetConfig, "winCodeSign" | "nsis" | "wine">>

/** Generated once per NSIS version: the web installer that installs v1 and v2 is built with the NSIS toolset. */
export function registerBlackboxWebWinUpdateTests(toolsets: WebWinToolsets): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis-web - full update cycle", { ...optionsForFlakyE2E, retry: 1 }, async (context: TestContext) => {
      if (process.platform !== "win32") {
        context.skip()
      }
      await runWebInstallerUpdateTest(context, toolsets)
    })

    // Per-machine: the update installer is started through elevate.exe and writes to Program Files, which needs an elevated
    // session (see "nsis - per-machine full update cycle" in blackboxUpdateWinSuite.ts).
    test.ifEnv(process.env.RUN_PER_MACHINE_UPDATE_TEST === "true")(
      "nsis-web - per-machine full update cycle",
      { ...optionsForFlakyE2E, retry: 1 },
      async (context: TestContext) => {
        if (process.platform !== "win32") {
          context.skip()
        }
        await runWebInstallerUpdateTest(context, toolsets, { nsis: { perMachine: true } })
      }
    )
  })
}

/** Generated for the newest NSIS version. */
export function registerBlackboxWebWinNextLaunchTests(toolsets: WebWinToolsets): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis-web - install on next launch", { ...optionsForFlakyE2E, retry: 1 }, async (context: TestContext) => {
      if (process.platform !== "win32") {
        context.skip()
      }
      await runWebInstallerInstallOnNextLaunchTest(context, toolsets)
    })
  })
}

/**
 * Generated for the newest NSIS version (the web installer is built but never run). Installs plain nsis, so the VM works as well.
 */
export function registerBlackboxWebWinRejectedTests(toolsets: WebWinToolsets): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis - web-installer update is rejected", { ...optionsForFlakyE2E, retry: 1 }, async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      await runWebInstallerRejectedTest(context, toolsets)
    })
  })
}
