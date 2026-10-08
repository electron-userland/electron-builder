import { Arch, log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { vi } from "vitest"
import { locateStoredMemberRegions } from "app-builder-lib/src/targets/differentialUpdateInfoBuilder"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"

// buildAppPackage only needs these packager fields and archives with the 7za toolset, so no
// Electron download is involved.
function createTarget(outDir: string, differentialPackage: boolean | "store-asar") {
  const packager: any = { config: { nsis: { differentialPackage } }, metadata: {}, appInfo: { sanitizedName: "app", version: "1.0.0" }, compression: "normal" }
  return new NsisTarget(packager, outDir, "nsis", { refCount: 0 } as any)
}

async function createAppOutDir(root: string, arch: Arch, withAsar: boolean) {
  const appOutDir = path.join(root, `win-${Arch[arch]}-unpacked`)
  await fs.mkdir(path.join(appOutDir, "resources", "app"), { recursive: true })
  await fs.writeFile(path.join(appOutDir, "app.exe"), "exe")
  await fs.writeFile(path.join(appOutDir, "resources", "app", "index.js"), "console.log('hi')")
  if (withAsar) {
    await fs.writeFile(path.join(appOutDir, "resources", "app.asar"), "asar")
  }
  return appOutDir
}

const isStoreAsarWarning = (call: Array<any>) => String(call[1]).includes('"store-asar" has no effect')

describe("nsis differentialPackage store-asar", { concurrent: false }, () => {
  test("warns once per target when resources/app.asar is missing", async ({ expect, tmpDir }) => {
    const root = await tmpDir.getTempDir({ prefix: "store-asar-missing" })
    const target = createTarget(root, "store-asar")
    const warn = vi.spyOn(log, "warn")
    try {
      for (const arch of [Arch.x64, Arch.arm64]) {
        const { fileInfo, storedMemberFiles } = await target.buildAppPackage(await createAppOutDir(root, arch, false), arch)
        // the package is still built, just without a stored asar member — and the missing asar is not
        // reported as a stored member, so locating the members in the installer never stat()s it
        expect((await fs.stat(fileInfo.path)).size).toBeGreaterThan(0)
        expect(storedMemberFiles).toEqual([])
        expect(await locateStoredMemberRegions(fileInfo.path, storedMemberFiles)).toEqual([])
      }
      expect(warn.mock.calls.filter(isStoreAsarWarning)).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when resources/app.asar exists", async ({ expect, tmpDir }) => {
    const root = await tmpDir.getTempDir({ prefix: "store-asar-present" })
    const target = createTarget(root, "store-asar")
    const warn = vi.spyOn(log, "warn")
    try {
      const appOutDir = await createAppOutDir(root, Arch.x64, true)
      const { storedMemberFiles } = await target.buildAppPackage(appOutDir, Arch.x64)
      expect(storedMemberFiles).toEqual([path.join(appOutDir, "resources", "app.asar")])
      expect(warn.mock.calls.filter(isStoreAsarWarning)).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when store-asar is not requested", async ({ expect, tmpDir }) => {
    const root = await tmpDir.getTempDir({ prefix: "store-asar-off" })
    const target = createTarget(root, true)
    const warn = vi.spyOn(log, "warn")
    try {
      const { storedMemberFiles } = await target.buildAppPackage(await createAppOutDir(root, Arch.x64, false), Arch.x64)
      expect(storedMemberFiles).toEqual([])
      expect(warn.mock.calls.filter(isStoreAsarWarning)).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })
})
