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
// app is "TestApp.exe").  Returns a cleanup function that kills the sibling and removes the
// temp executable.  This is used to reproduce issue #6865: the NSIS installer must not show
// the "app cannot be closed" dialog when a process with a *similar but different* name is running.
async function spawnSiblingProcess(vm: ParallelsVmManager | undefined, appExeName: string): Promise<() => Promise<void>> {
  const siblingName = appExeName.replace(/\.exe$/i, "-helper.exe")

  if (vm != null) {
    // Parallels VM: copy cmd.exe to %TEMP%\<sibling>.exe and start it
    await vm.exec("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$tmp = "$env:TEMP\\${siblingName}"; ` +
        `Copy-Item "$env:SystemRoot\\System32\\cmd.exe" $tmp -Force; ` +
        `$global:_siblingPid = (Start-Process -FilePath $tmp -ArgumentList '/c ping -n 999 127.0.0.1' -PassThru -WindowStyle Hidden).Id`,
    ])
    return async () => {
      await vm
        .exec("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Stop-Process -Id $global:_siblingPid -Force -ErrorAction SilentlyContinue; ` + `Remove-Item "$env:TEMP\\${siblingName}" -Force -ErrorAction SilentlyContinue`,
        ])
        .catch(() => undefined)
    }
  }

  // Native Windows: copy cmd.exe to %TEMP%\<sibling>.exe and start it detached
  const sysRoot = process.env["SystemRoot"] ?? "C:\\Windows"
  const siblingExe = path.join(tmpdir(), siblingName)
  copyFileSync(path.join(sysRoot, "System32", "cmd.exe"), siblingExe)
  const child = nodeSpawn(siblingExe, ["/c", "ping", "-n", "999", "127.0.0.1"], { detached: true, stdio: "ignore" })
  child.unref()
  return async () => {
    try {
      process.kill(child.pid!)
    } catch {}
    try {
      unlinkSync(siblingExe)
    } catch {}
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
      const cleanup = await spawnSiblingProcess(vm, "TestApp.exe")
      try {
        await runTest(context, "nsis", "", Arch.x64, toolsets)
      } finally {
        await cleanup()
      }
    })
  })
}
