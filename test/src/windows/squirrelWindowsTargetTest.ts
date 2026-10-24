import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Arch, AsyncTaskManager } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows/src/SquirrelWindowsTarget"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { arch as osArch } from "os"
import * as path from "path"
import { tmpdir } from "os"

describe("SquirrelWindowsTarget.select7zipArch", () => {
  let tmpDir: string
  let t: any

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-7z-test-"))
    t = Object.create(SquirrelWindowsTarget.prototype)
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  test("copies arch-specific 7z.exe and 7z.dll when both are present", async () => {
    const arch = osArch()
    await writeFile(path.join(tmpDir, `7z-${arch}.exe`), "exe-content")
    await writeFile(path.join(tmpDir, `7z-${arch}.dll`), "dll-content")

    t.select7zipArch(tmpDir)

    expect(await readFile(path.join(tmpDir, "7z.exe"), "utf8")).toBe("exe-content")
    expect(await readFile(path.join(tmpDir, "7z.dll"), "utf8")).toBe("dll-content")
  })

  test("skips copy and leaves existing 7z.exe unchanged when arch-specific exe is absent", async () => {
    await writeFile(path.join(tmpDir, "7z.exe"), "original-exe")

    t.select7zipArch(tmpDir)

    expect(await readFile(path.join(tmpDir, "7z.exe"), "utf8")).toBe("original-exe")
  })

  test("copies exe but skips dll when only arch-specific exe is present", async () => {
    const arch = osArch()
    await writeFile(path.join(tmpDir, `7z-${arch}.exe`), "exe-only")
    await writeFile(path.join(tmpDir, "7z.exe"), "original-exe")

    t.select7zipArch(tmpDir)

    expect(await readFile(path.join(tmpDir, "7z.exe"), "utf8")).toBe("exe-only")
    // 7z.dll was never created — should still not exist
    await expect(readFile(path.join(tmpDir, "7z.dll"), "utf8")).rejects.toThrow()
  })
})

describe("SquirrelWindowsTarget.build", () => {
  test("waits for queued archive work of the same pack before writing the stub into appOutDir", async () => {
    const events: Array<string> = []
    let finishZip: () => void = () => {}
    const zipTarget = { buildQueueManager: new AsyncTaskManager(new CancellationToken()) }
    zipTarget.buildQueueManager.add(async () => {
      await new Promise<void>(resolve => (finishZip = resolve))
      events.push("zip done")
    })

    const t: any = Object.create(SquirrelWindowsTarget.prototype)
    t.options = {}
    t.outDir = "/out"
    t.buildQueueManager = { add: vi.fn(() => events.push("installer queued")) }
    t.packager = {
      appInfo: { version: "1.0.0", name: "app" },
      expandArtifactNamePattern: () => "Setup.exe",
      emitArtifactBuildStarted: async () => {},
      getPackTargets: () => [zipTarget, t],
    }
    t.computeEffectiveDistOptions = async () => ({ vendorDirectory: "/vendor" })
    t.generateStubExecutableExe = vi.fn(async () => events.push("stub written"))

    const build = t.build("/out/win-unpacked", Arch.x64)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(t.generateStubExecutableExe).not.toHaveBeenCalled()

    finishZip()
    await build
    expect(events).toEqual(["zip done", "stub written", "installer queued"])
  })
})
