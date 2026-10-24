import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Platform } from "app-builder-lib"
import { ArchiveTarget } from "app-builder-lib/src/targets/ArchiveTarget"
import { Arch } from "builder-util"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows/src/SquirrelWindowsTarget"
import { existsSync } from "fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
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
  async function createBuild(root: string, appOutDir: string) {
    const vendorDirectory = path.join(root, "vendor")
    await mkdir(vendorDirectory)
    await mkdir(appOutDir)
    await writeFile(path.join(vendorDirectory, "Squirrel.exe"), "Squirrel.exe")

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
    const zip = new ArchiveTarget("zip", root, packager)

    const squirrel: any = Object.create(SquirrelWindowsTarget.prototype)
    squirrel.options = {}
    squirrel.outDir = root
    squirrel.packager = packager
    // the queued installer work must find every file Squirrel adds to appOutDir already there
    squirrel.buildQueueManager = {
      add: vi.fn(() => events.push(existsSync(path.join(appOutDir, "Squirrel.exe")) ? "installer queued (Squirrel.exe in appOutDir)" : "installer queued")),
    }
    squirrel.computeEffectiveDistOptions = async () => ({ vendorDirectory })
    squirrel.generateStubExecutableExe = vi.fn(async () => events.push("stub written"))
    return { events, finishZip, zip, squirrel }
  }

  test("waits for the archive of the same pack before writing into appOutDir, even once finishBuild() drained it", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appOutDir = path.join(root, "win-unpacked")
    const { events, finishZip, zip, squirrel } = await createBuild(root, appOutDir)
    await zip.build(appOutDir, Arch.x64)
    // packager.ts calls finishBuild() of the async targets right after pack(), before Squirrel reaches its wait
    const zipFinished = expect(zip.finishBuild()).rejects.toThrow("archive stub")

    const build = squirrel.build(appOutDir, Arch.x64)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(squirrel.generateStubExecutableExe).not.toHaveBeenCalled()
    expect(existsSync(path.join(appOutDir, "Squirrel.exe"))).toBe(false)

    finishZip()
    await build
    expect(events).toEqual(["zip done", "stub written", "installer queued (Squirrel.exe in appOutDir)"])
    await zipFinished
  })

  test("does not wait for the archive of another arch", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appOutDir = path.join(root, "win-ia32-unpacked")
    const { events, zip, squirrel } = await createBuild(root, appOutDir)
    // the x64 archive never finishes
    await zip.build(path.join(root, "win-unpacked"), Arch.x64)
    await squirrel.build(appOutDir, Arch.ia32)
    expect(events).toEqual(["stub written", "installer queued (Squirrel.exe in appOutDir)"])
  }, 5000)
})
