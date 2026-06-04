import { afterEach, beforeEach, describe, expect, test } from "vitest"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows/out/SquirrelWindowsTarget"
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

    expect((await readFile(path.join(tmpDir, "7z.exe"), "utf8"))).toBe("exe-content")
    expect((await readFile(path.join(tmpDir, "7z.dll"), "utf8"))).toBe("dll-content")
  })

  test("skips copy and leaves existing 7z.exe unchanged when arch-specific exe is absent", async () => {
    await writeFile(path.join(tmpDir, "7z.exe"), "original-exe")

    t.select7zipArch(tmpDir)

    expect((await readFile(path.join(tmpDir, "7z.exe"), "utf8"))).toBe("original-exe")
  })

  test("copies exe but skips dll when only arch-specific exe is present", async () => {
    const arch = osArch()
    await writeFile(path.join(tmpDir, `7z-${arch}.exe`), "exe-only")
    await writeFile(path.join(tmpDir, "7z.exe"), "original-exe")

    t.select7zipArch(tmpDir)

    expect((await readFile(path.join(tmpDir, "7z.exe"), "utf8"))).toBe("exe-only")
    // 7z.dll was never created — should still not exist
    await expect(readFile(path.join(tmpDir, "7z.dll"), "utf8")).rejects.toThrow()
  })
})
