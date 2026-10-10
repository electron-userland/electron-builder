import { Arch, WinPackager } from "app-builder-lib"
import { hasUpdaterConfig } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"

// The installer copies itself into the updater cache (APP_INSTALLER_STORE_FILE) only as electron-updater's base
// for a differential download, and electron-updater finds that cache through app-update.yml. An app packed
// without one gets no copy (KEEP_INSTALLER_FOR_UPDATER stays undefined), so nothing is left behind (#9505).

const packager: Pick<WinPackager, "getResourcesDir"> = { getResourcesDir: appOutDir => path.join(appOutDir, "resources") }

async function packedApps(tmpDir: TmpDir, withUpdateConfig: Array<boolean>) {
  const archs = new Map<Arch, string>()
  const order = [Arch.x64, Arch.arm64, Arch.ia32]
  for (const [i, hasConfig] of withUpdateConfig.entries()) {
    const appOutDir = await tmpDir.getTempDir({ prefix: "win-unpacked" })
    await mkdir(path.join(appOutDir, "resources"), { recursive: true })
    if (hasConfig) {
      await writeFile(path.join(appOutDir, "resources", "app-update.yml"), "provider: generic\nurl: https://example.com/updates\n")
    }
    archs.set(order[i], appOutDir)
  }
  return archs
}

test("an app without app-update.yml gets no installer copy", async ({ expect, tmpDir }) => {
  expect(await hasUpdaterConfig(packager, await packedApps(tmpDir, [false]))).toBe(false)
  expect(await hasUpdaterConfig(packager, await packedApps(tmpDir, [false, false]))).toBe(false)
})

test("an app with app-update.yml keeps the installer copy for electron-updater", async ({ expect, tmpDir }) => {
  expect(await hasUpdaterConfig(packager, await packedApps(tmpDir, [true]))).toBe(true)
  // one installer for several archs: the copy is kept when any packed arch can update
  expect(await hasUpdaterConfig(packager, await packedApps(tmpDir, [false, true]))).toBe(true)
})
