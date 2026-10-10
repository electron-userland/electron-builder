import { Arch, Configuration, WinPackager } from "app-builder-lib"
import type { Defines } from "app-builder-lib/internal"
import { hasUpdaterConfig, NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { WebInstallerTarget } from "app-builder-lib/src/targets/win/nsis/WebInstallerTarget"
import { log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, vi } from "vitest"

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

// The define wiring in NsisTarget.buildInstaller, offline and on every OS: a real `WinPackager` over a minimal fake `Packager`
// (the pattern of webInstallerTest.ts / nsisUseZipTest.ts), with the per-arch app package, icon and artifact events stubbed.
// `effectiveOptionComputed` captures the defines and stops before makensis. app-update.yml is written into the packed app's
// resources the way the packager writes it for a build with a publish configuration.

afterEach(() => {
  vi.restoreAllMocks()
})

const isUpdaterCopySkippedLog = (call: Array<any>) => String(call[call.length - 1]).includes("differential download cache is skipped")

async function computeInstallerDefines(tmpDir: TmpDir, targetName: "nsis" | "nsis-web" | "portable", withUpdateConfig: Array<boolean>, config: Configuration = {}) {
  const projectDir = await tmpDir.getTempDir({ prefix: "nsis-installer-store" })
  await mkdir(projectDir, { recursive: true })
  const captured: Array<Defines> = []
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", ...config },
    metadata: { name: "TestApp", productName: "Test App", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar" } },
    devMetadata: null,
    options: {
      effectiveOptionComputed: ([defines]: [Defines]) => {
        captured.push({ ...defines })
        // stop before makensis
        return Promise.resolve(true)
      },
    },
    projectDir,
    buildResourcesDir: path.join(projectDir, "build"),
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    // electron-based, so the packed app's resources dir is <appOutDir>/resources
    framework: { name: "electron", defaultAppIdPrefix: "com.electron." },
    cancellationToken: new CancellationToken(),
  }
  const packager = new WinPackager(fakePackagerInfo as any)
  vi.spyOn(packager, "emitArtifactBuildStarted").mockResolvedValue()
  vi.spyOn(packager, "emitArtifactBuildCompleted").mockResolvedValue()
  vi.spyOn(packager, "getIconPath").mockResolvedValue(null)
  const packageHelper: any = {
    refCount: 0,
    packArch: (arch: Arch) => Promise.resolve({ fileInfo: { path: path.join(projectDir, `app-${Arch[arch]}.nsis.7z`), sha512: "" }, unpackedSize: 0, storedMemberFiles: [] }),
  }
  const target =
    targetName === "nsis-web" ? new WebInstallerTarget(packager, projectDir, targetName, packageHelper) : new NsisTarget(packager, projectDir, targetName, packageHelper)
  const info = vi.spyOn(log, "info")
  // one installer per arch, as for a per-arch artifact name: the skipped-copy notice is still logged once
  for (const [arch, appOutDir] of await packedApps(tmpDir, withUpdateConfig)) {
    await (target as any).buildInstaller(new Map([[arch, appOutDir]]))
  }
  return {
    keepInstaller: captured.map(it => "KEEP_INSTALLER_FOR_UPDATER" in it),
    skippedLogs: info.mock.calls.filter(isUpdaterCopySkippedLog).length,
  }
}

test("nsis with a publish configuration (app-update.yml) defines KEEP_INSTALLER_FOR_UPDATER", async ({ expect, tmpDir }) => {
  expect(await computeInstallerDefines(tmpDir, "nsis", [true, true])).toStrictEqual({ keepInstaller: [true, true], skippedLogs: 0 })
})

test("nsis without app-update.yml does not define KEEP_INSTALLER_FOR_UPDATER and logs the skipped copy once", async ({ expect, tmpDir }) => {
  expect(await computeInstallerDefines(tmpDir, "nsis", [false, false])).toStrictEqual({ keepInstaller: [false, false], skippedLogs: 1 })
})

test("nsis-web never defines KEEP_INSTALLER_FOR_UPDATER (and does not log)", async ({ expect, tmpDir }) => {
  const config: Configuration = { publish: { provider: "generic", url: "https://example.com/updates" } }
  expect(await computeInstallerDefines(tmpDir, "nsis-web", [true], config)).toStrictEqual({ keepInstaller: [false], skippedLogs: 0 })
  expect(await computeInstallerDefines(tmpDir, "nsis-web", [false], config)).toStrictEqual({ keepInstaller: [false], skippedLogs: 0 })
})

test("portable never defines KEEP_INSTALLER_FOR_UPDATER (and does not log)", async ({ expect, tmpDir }) => {
  expect(await computeInstallerDefines(tmpDir, "portable", [true])).toStrictEqual({ keepInstaller: [false], skippedLogs: 0 })
  expect(await computeInstallerDefines(tmpDir, "portable", [false])).toStrictEqual({ keepInstaller: [false], skippedLogs: 0 })
})
