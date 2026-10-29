import { Arch, Configuration, WinPackager } from "app-builder-lib"
import type { Defines } from "app-builder-lib/internal"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { mkdir } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, vi } from "vitest"

// nsis.allowUnelevatedPerMachineUpdate → ALLOW_UNELEVATED_PER_MACHINE_UPDATE, offline: a real WinPackager over a minimal fake Packager
// (as in nsisInstallerStoreTest.ts), with `effectiveOptionComputed` capturing the defines and stopping before makensis.

afterEach(() => {
  vi.restoreAllMocks()
})

const isNoEffectLog = (call: Array<any>) => String(call[call.length - 1]).includes("allowUnelevatedPerMachineUpdate has no effect")

async function computeDefines(tmpDir: TmpDir, nsis: Configuration["nsis"]) {
  const projectDir = await tmpDir.getTempDir({ prefix: "nsis-unelevated-update" })
  await mkdir(path.join(projectDir, "win-unpacked", "resources"), { recursive: true })
  const captured: Array<Defines> = []
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", nsis },
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
  const target = new NsisTarget(packager, projectDir, "nsis", packageHelper)
  const warn = vi.spyOn(log, "warn")
  warn.mockClear()
  await (target as any).buildInstaller(new Map([[Arch.x64, path.join(projectDir, "win-unpacked")]]))
  if (captured.length !== 1) {
    throw new Error(`expected one installer, got ${captured.length}`)
  }
  return { defined: "ALLOW_UNELEVATED_PER_MACHINE_UPDATE" in captured[0], noEffectWarnings: warn.mock.calls.filter(isNoEffectLog).length }
}

test("allowUnelevatedPerMachineUpdate is off by default", async ({ expect, tmpDir }) => {
  expect(await computeDefines(tmpDir, { oneClick: false })).toStrictEqual({ defined: false, noEffectWarnings: 0 })
  expect(await computeDefines(tmpDir, { oneClick: false, allowUnelevatedPerMachineUpdate: false })).toStrictEqual({ defined: false, noEffectWarnings: 0 })
})

test("allowUnelevatedPerMachineUpdate defines ALLOW_UNELEVATED_PER_MACHINE_UPDATE for an assisted per-user installer", async ({ expect, tmpDir }) => {
  expect(await computeDefines(tmpDir, { oneClick: false, allowUnelevatedPerMachineUpdate: true })).toStrictEqual({ defined: true, noEffectWarnings: 0 })
})

test("allowUnelevatedPerMachineUpdate warns that it has no effect with oneClick or perMachine", async ({ expect, tmpDir }) => {
  // the define is still passed: the templates gate on ONE_CLICK and INSTALL_MODE_PER_ALL_USERS themselves
  expect(await computeDefines(tmpDir, { allowUnelevatedPerMachineUpdate: true })).toStrictEqual({ defined: true, noEffectWarnings: 1 })
  expect(await computeDefines(tmpDir, { oneClick: false, perMachine: true, allowUnelevatedPerMachineUpdate: true })).toStrictEqual({ defined: true, noEffectWarnings: 1 })
})
