import { ToolsetConfig } from "app-builder-lib"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, windowsVmPromise } from "./blackboxUpdateHelpers"
import { runNsisAuthenticodeTest, runNsisInstallerChecksTest, runNsisNextLaunchModesTest } from "./blackboxUpdateRuntimeChecks"

// The checks of electron-updater 7 on NSIS updates (blackboxUpdateRuntimeChecks.ts). Each register function adds a single test, and
// generate-toolset-tests-windows.ts emits one file per function, built with the newest toolsets only (the toolsets take no part in what
// the updater checks): the CI sharder packs whole files, and each test builds two versions and runs several launches. Per file,
// timeout × (1 + retry) stays at or below 40 min, under the 60-minute cap of the Windows job.

type WinChecksToolsets = Required<Pick<ToolsetConfig, "winCodeSign" | "nsis" | "wine">>

const options = { ...optionsForFlakyE2E, retry: 1 }

/** Native Windows or a Parallels VM: a verifier stub stands in for the Authenticode verification of the untrusted test certificate. */
export function registerBlackboxNsisInstallerChecksTests(toolsets: WinChecksToolsets): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis - installer version and autoUpdater.publisherName (custom verifier)", options, async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      await runNsisInstallerChecksTest(context, toolsets)
    })
  })
}

/** Native Windows or a Parallels VM. */
export function registerBlackboxNsisNextLaunchModesTests(toolsets: WinChecksToolsets): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis - install on next launch: manual, then the default autoInstallEvent", options, async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      await runNsisNextLaunchModesTest(context, toolsets)
    })
  })
}

/** Native Windows (a `.win.` file), elevated: the test certificate is trusted in LocalMachine\Root (skipped when it cannot be). */
export function registerBlackboxNsisAuthenticodeTests(toolsets: WinChecksToolsets): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis - Authenticode verification against a trusted certificate", options, async (context: TestContext) => {
      await runNsisAuthenticodeTest(context, toolsets)
    })
  })
}
