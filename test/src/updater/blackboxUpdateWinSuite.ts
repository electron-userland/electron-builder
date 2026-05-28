import { ToolsetConfig } from "app-builder-lib"
import { ParallelsVmManager } from "app-builder-lib/out/vm/ParallelsVm"
import { copyFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { Arch } from "electron-builder"
import { spawn as nodeSpawn } from "child_process"
import * as path from "path"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runTest, windowsVmPromise } from "./blackboxUpdateHelpers"

// Spawn a process whose IMAGE NAME contains `appExeName` (e.g. "TestApp-helper.exe" when
// app is "TestApp.exe").  Returns cleanup and assertAlive functions.  This is used to
// reproduce issue #6865: the NSIS installer must not show the "app cannot be closed" dialog
// when a process with a *similar but different* name is running.
async function spawnSiblingProcess(vm: ParallelsVmManager | undefined, appExeName: string): Promise<{ cleanup: () => Promise<void>; assertAlive: () => Promise<void> }> {
  const siblingName = appExeName.replace(/\.exe$/i, "-helper.exe")
  // Process name without extension, used by Stop-Process / Get-Process
  const siblingBaseName = siblingName.replace(/\.exe$/i, "")

  if (vm != null) {
    // Use Join-Path instead of double-quoted path strings to avoid prlctl/cmd.exe
    // stripping double-quotes when they are passed through the -Command argument.
    await vm.exec("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$tmp = Join-Path $env:TEMP '${siblingName}'; ` +
        `Copy-Item (Join-Path $env:SystemRoot 'System32\\cmd.exe') $tmp -Force; ` +
        `Start-Process -FilePath $tmp -ArgumentList '/c ping -n 999 127.0.0.1' -WindowStyle Hidden`,
    ])
    return {
      cleanup: async () => {
        await vm
          .exec("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Stop-Process -Name '${siblingBaseName}' -Force -ErrorAction SilentlyContinue; ` +
              `Remove-Item (Join-Path $env:TEMP '${siblingName}') -Force -ErrorAction SilentlyContinue`,
          ])
          .catch(() => undefined)
      },
      assertAlive: async () => {
        await vm.exec("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `if (-not (Get-Process -Name '${siblingBaseName}' -ErrorAction SilentlyContinue)) { Write-Error 'Sibling process not found'; exit 1 }`,
        ])
      },
    }
  }

  // Native Windows: copy cmd.exe to %TEMP%\<sibling>.exe and start it detached
  const sysRoot = process.env["SystemRoot"] ?? "C:\\Windows"
  const siblingExe = path.join(tmpdir(), siblingName)
  copyFileSync(path.join(sysRoot, "System32", "cmd.exe"), siblingExe)
  const child = nodeSpawn(siblingExe, ["/c", "ping", "-n", "999", "127.0.0.1"], { detached: true, stdio: "ignore" })
  child.unref()
  return {
    cleanup: () => {
      try {
        process.kill(child.pid!)
      } catch {
        /* empty */
      }
      try {
        unlinkSync(siblingExe)
      } catch {
        /* empty */
      }
      return Promise.resolve()
    },
    assertAlive: () => {
      try {
        process.kill(child.pid!, 0)
      } catch {
        throw new Error(`Sibling process ${siblingName} (PID ${child.pid}) was unexpectedly killed during install`)
      }
      return Promise.resolve()
    },
  }
}

export function registerBlackboxWinTests(toolsets: Required<Pick<ToolsetConfig, "winCodeSign" | "nsis">>): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis", async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      await runTest(context, "nsis", "", Arch.x64, toolsets)
    })

    // Regression test for https://github.com/electron-userland/electron-builder/issues/6865:
    // The NSIS installer must not show the "cannot be closed" dialog when a process whose
    // IMAGE NAME *contains* the app exe name (but is not the app itself) is running.
    // The test spawns "TestApp-helper.exe" (copied from cmd.exe) before triggering the
    // auto-update install cycle.  If the false-positive process detection were still present
    // the installer would block on the dialog and the test would time out.
    test("nsis - installer succeeds with sibling process running", optionsForFlakyE2E, async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      const { cleanup, assertAlive } = await spawnSiblingProcess(vm, "TestApp.exe")
      try {
        await runTest(context, "nsis", "", Arch.x64, toolsets)
        await assertAlive()
      } finally {
        await cleanup()
      }
    })

    // Same regression test for the per-machine (INSTALL_MODE_PER_ALL_USERS) code path.
    // That path previously used nsProcess::FindProcess which performs prefix/partial matching
    // and falsely detects "TestApp-helper.exe" as "TestApp.exe".  With the old code the
    // installer exhausts its retry loop and quits (/SD IDCANCEL), causing runTest to fail.
    test("nsis - per-machine installer succeeds with sibling process running", optionsForFlakyE2E, async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      const { cleanup, assertAlive } = await spawnSiblingProcess(vm, "TestApp.exe")
      try {
        await runTest(context, "nsis", "", Arch.x64, toolsets, { nsis: { perMachine: true } })
        await assertAlive()
      } finally {
        await cleanup()
      }
    })
  })
}
