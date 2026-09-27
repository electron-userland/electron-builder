import { Arch, log } from "builder-util"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"
// load the package entry first: importing NsisTarget on its own enters the platformPackager <-> index
// import cycle mid-way and LinuxPackager then extends an undefined PlatformPackager
import "app-builder-lib/src"
import { NsisTarget } from "app-builder-lib/src/targets/nsis/NsisTarget"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-nsis-store-asar-"))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// buildAppPackage only needs these packager fields and archives with the 7za toolset, so no
// Electron download is involved.
function createTarget(outDir: string, differentialPackage: boolean | "store-asar") {
  const packager: any = { config: { nsis: { differentialPackage } }, info: { metadata: {} }, appInfo: { sanitizedName: "app", version: "1.0.0" }, compression: "normal" }
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
  test("warns once per target when resources/app.asar is missing", async ({ expect }) => {
    const root = tmpDir
    const target = createTarget(root, "store-asar")
    const warn = vi.spyOn(log, "warn")
    try {
      for (const arch of [Arch.x64, Arch.arm64]) {
        const info = await target.buildAppPackage(await createAppOutDir(root, arch, false), arch)
        // the package is still built, just without a stored asar member
        expect((await fs.stat(info.path)).size).toBeGreaterThan(0)
      }
      expect(warn.mock.calls.filter(isStoreAsarWarning)).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when resources/app.asar exists", async ({ expect }) => {
    const root = tmpDir
    const target = createTarget(root, "store-asar")
    const warn = vi.spyOn(log, "warn")
    try {
      await target.buildAppPackage(await createAppOutDir(root, Arch.x64, true), Arch.x64)
      expect(warn.mock.calls.filter(isStoreAsarWarning)).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn when store-asar is not requested", async ({ expect }) => {
    const root = tmpDir
    const target = createTarget(root, true)
    const warn = vi.spyOn(log, "warn")
    try {
      await target.buildAppPackage(await createAppOutDir(root, Arch.x64, false), Arch.x64)
      expect(warn.mock.calls.filter(isStoreAsarWarning)).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })
})
