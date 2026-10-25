import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Platform } from "app-builder-lib"
import { ArchiveTarget } from "app-builder-lib/src/targets/ArchiveTarget"
import { Arch } from "builder-util"
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
  // the zip/7z archive of a pack is still reading appOutDir when Squirrel.Windows (a sync target) starts building it
  function createBuild() {
    const events: Array<string> = []
    let finishZip: () => void = () => {}
    const zipDone = new Promise<void>(resolve => (finishZip = resolve))
    const packager: any = {
      config: {},
      platform: Platform.WINDOWS,
      platformOptions: {},
      pendingPackWork: new Map(),
      appInfo: { version: "1.0.0", name: "app" },
      expandArtifactNamePattern: () => "artifact",
      // stands in for the archiving: the queued zip task stops here (by throwing) once released
      emitArtifactBuildStarted: async ({ targetPresentableName, arch }: { targetPresentableName: string; arch: Arch }) => {
        if (targetPresentableName === "zip" && arch === Arch.x64) {
          await zipDone
          events.push("zip done")
          throw new Error("archive stub")
        }
      },
    }
    const zip = new ArchiveTarget("zip", "/out", packager)

    const squirrel: any = Object.create(SquirrelWindowsTarget.prototype)
    squirrel.options = {}
    squirrel.outDir = "/out"
    squirrel.packager = packager
    squirrel.buildQueueManager = { add: vi.fn(() => events.push("installer queued")) }
    squirrel.computeEffectiveDistOptions = async () => ({ vendorDirectory: "/vendor" })
    squirrel.generateStubExecutableExe = vi.fn(async () => events.push("stub written"))
    return { events, finishZip, packager, zip, squirrel }
  }

  test("waits for the archive of the same pack before writing the stub into appOutDir, even once finishBuild() drained it", async () => {
    const { events, finishZip, zip, squirrel } = createBuild()
    const appOutDir = "/out/win-unpacked"
    await zip.build(appOutDir, Arch.x64)
    // packager.ts calls finishBuild() of the async targets right after pack(), before Squirrel reaches its wait
    const zipFinished = expect(zip.finishBuild()).rejects.toThrow("archive stub")

    const build = squirrel.build(appOutDir, Arch.x64)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(squirrel.generateStubExecutableExe).not.toHaveBeenCalled()

    finishZip()
    await build
    expect(events).toEqual(["zip done", "stub written", "installer queued"])
    await zipFinished
  })

  test("waits for the archive of another arch when the app dir is shared (prepackaged)", async () => {
    const { events, finishZip, zip, squirrel } = createBuild()
    const appOutDir = "/prepackaged"
    await zip.build(appOutDir, Arch.x64)

    const build = squirrel.build(appOutDir, Arch.ia32)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(squirrel.generateStubExecutableExe).not.toHaveBeenCalled()

    finishZip()
    await build
    expect(events).toEqual(["zip done", "stub written", "installer queued"])
    await expect(zip.finishBuild()).rejects.toThrow("archive stub")
  })

  test("does not wait for the archive of another arch in its own app dir", async () => {
    const { events, zip, squirrel } = createBuild()
    // the x64 archive never finishes
    await zip.build("/out/win-unpacked", Arch.x64)
    await squirrel.build("/out/win-ia32-unpacked", Arch.ia32)
    expect(events).toEqual(["stub written", "installer queued"])
  }, 5000)
})
