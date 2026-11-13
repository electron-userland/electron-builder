import { ToolsetConfig } from "app-builder-lib"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, windowsVmPromise } from "./blackboxUpdateHelpers"
import { runNsisAuthenticodeTest, runNsisInstallerChecksTest, runNsisNextLaunchModesTest } from "./blackboxUpdateRuntimeChecks"

// The checks of electron-updater 7 on NSIS updates (blackboxUpdateRuntimeChecks.ts). Each register function adds a single test, and
// generate-toolset-tests-windows.ts emits one file per function, built with the newest toolsets only (the toolsets take no part in what
// the updater checks): the CI sharder packs whole files, and each test builds two versions and runs several launches. Per file,
// timeout × (1 + retry) stays at or below 40 min, under the 60-minute cap of the Windows job.

type WinChecksToolsets = Required<Pick<ToolsetConfig, "winCodeSign" | "nsis" | "wine">>

/** Registers the single test `name`, skipped without native Windows or a Parallels VM when `runsInVm`, else left to `run` (and its file). */
function registerNsisCheck(name: string, runsInVm: boolean, run: (context: TestContext) => Promise<void>): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test(name, { ...optionsForFlakyE2E, retry: 1 }, async (context: TestContext) => {
      if (runsInVm && process.platform !== "win32" && (await windowsVmPromise) == null) {
        context.skip()
      }
      await run(context)
    })
  })
}

/** Native Windows or a Parallels VM: a verifier stub stands in for the Authenticode verification of the untrusted test certificate. */
export function registerBlackboxNsisInstallerChecksTests(toolsets: WinChecksToolsets): void {
  registerNsisCheck("nsis - installer version and autoUpdater.publisherName (custom verifier)", true, context => runNsisInstallerChecksTest(context, toolsets))
}

/** Native Windows or a Parallels VM. */
export function registerBlackboxNsisNextLaunchModesTests(toolsets: WinChecksToolsets): void {
  registerNsisCheck("nsis - install on next launch: manual, then the default autoInstallEvent", true, context => runNsisNextLaunchModesTest(context, toolsets))
}

/** Native Windows (a `.win.` file), elevated: the test certificate is trusted in LocalMachine\Root (skipped when it cannot be). */
export function registerBlackboxNsisAuthenticodeTests(toolsets: WinChecksToolsets): void {
  registerNsisCheck("nsis - Authenticode verification against a trusted certificate", false, context => runNsisAuthenticodeTest(context, toolsets))
}
