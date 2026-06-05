import { ToolsetConfig } from "app-builder-lib"
import { ParallelsVmManager } from "app-builder-lib/internal"
import { copyFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { Arch, Configuration } from "electron-builder"
import { spawn as nodeSpawn } from "child_process"
import * as path from "path"
import { TestContext } from "vitest"
import { deepAssign, TmpDir } from "builder-util"
import { ApplicationUpdatePaths, doBuild, optionsForFlakyE2E, runTest, windowsVmPromise } from "./blackboxUpdateHelpers"
import { installWindowsVm } from "./blackboxInstallWindows"

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
    test("nsis", optionsForFlakyE2E, async (context: TestContext) => {
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

    // Full per-machine update cycle: install old → trigger update → verify new version.
    // Requires native Windows AND the RUN_PER_MACHINE_UPDATE_TEST=true env var because the
    // detached NSIS update installer needs to write to C:\Program Files, which requires UAC
    // elevation that most CI runners cannot provide reliably without a pre-elevated session.
    test.ifEnv(process.env.RUN_PER_MACHINE_UPDATE_TEST === "true")("nsis - per-machine full update cycle", optionsForFlakyE2E, async (context: TestContext) => {
      if (process.platform !== "win32") {
        context.skip()
      }
      await runTest(context, "nsis", "", Arch.x64, toolsets, { nsis: { perMachine: true } })
    })

    // Same regression test for the per-machine (INSTALL_MODE_PER_ALL_USERS) code path.
    // That path previously used nsProcess::FindProcess which performs prefix/partial matching
    // and falsely detects "TestApp-helper.exe" as "TestApp.exe".
    //
    // The installer is run as SYSTEM via vm.spawn (prlctl exec without --current-user).
    // With the old code a MessageBox opens inside Windows Session 0 (non-interactive) and
    // hangs indefinitely — our 180 s PS timeout surfaces this as a failure (RED).
    // With the new code (findstr /B anchored match) no false positive is generated,
    // the installer completes normally, and assertAlive() confirms the sibling survived (GREEN).
    //
    // We bypass the full auto-update cycle here because the detached update installer
    // does not survive parent-process exit in Session 0; the initial install is sufficient
    // to exercise the INSTALL_MODE_PER_ALL_USERS FIND_PROCESS code path.
    test("nsis - per-machine installer succeeds with sibling process running", optionsForFlakyE2E, async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (vm == null) {
        context.skip()
      }

      const { expect } = context
      const tmpDir = new TmpDir("per-machine-sibling-test")
      const outDirs: ApplicationUpdatePaths[] = []
      const buildConfig = deepAssign({ toolsets } as Configuration, { nsis: { perMachine: true } } as Partial<Configuration>)
      await doBuild(expect, outDirs, "nsis", Arch.x64, tmpDir, /* isWindows */ true, buildConfig)

      const { cleanup, assertAlive } = await spawnSiblingProcess(vm, "TestApp.exe")
      try {
        // installWindowsVm runs the NSIS installer as SYSTEM (vm.spawn).
        // With old code: nsProcess::FindProcess detects sibling → dialog hangs in Session 0 → timeout → throws (RED)
        // With new code: findstr /B ignores sibling → install completes → assertAlive passes (GREEN)
        await installWindowsVm(outDirs[0].dir, Arch.x64, vm, true /* perMachine */)
        await assertAlive()
      } finally {
        await cleanup()
        // Silently wipe the per-machine installation so subsequent test runs start clean.
        // Using Remove-Item (no NSIS executable) avoids Interactive Services Detection
        // dialogs that appear when running the NSIS uninstaller as SYSTEM in Session 0.
        if (vm) {
          await vm
            .spawn("powershell.exe", [
              "-NonInteractive",
              "-Command",
              [
                `$d = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'TestApp'`,
                `Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue`,
                `@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall') | ForEach-Object { Get-ChildItem $_ -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty -Path $_.PSPath -Name DisplayName -ErrorAction SilentlyContinue).DisplayName -eq 'TestApp' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }`,
              ].join("; "),
            ])
            .catch(() => undefined)
        }
        await tmpDir.cleanup()
      }
    })
  })
}
