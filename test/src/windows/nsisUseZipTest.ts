import { Arch, Configuration, WinPackager } from "app-builder-lib"
import type { Defines } from "app-builder-lib/internal"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { WebInstallerTarget } from "app-builder-lib/src/targets/win/nsis/WebInstallerTarget"
import { AppPackageHelper, CopyElevateHelper } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { exists, log } from "builder-util"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, vi } from "vitest"

// `nsis.useZip` must pick the same format for the embedded app package (buildAppPackage) and for the
// installer's extractor (ZIP_COMPRESSION / COMPRESSION_METHOD). A real `WinPackager` is built over a
// minimal fake `Packager` (the pattern of webInstallerTest.ts); only the 7za invocation is stubbed, so
// the archive format NsisTarget requests is recorded without needing the toolset.

const archive = vi.hoisted(() => vi.fn())
vi.mock("app-builder-lib/src/targets/archive", async importOriginal => ({
  ...(await importOriginal<typeof import("app-builder-lib/src/targets/archive")>()),
  archive,
}))

afterEach(() => {
  vi.restoreAllMocks()
  archive.mockReset()
})

async function createWinPackager(tmpDir: TmpDir, config: Configuration) {
  const projectDir = await tmpDir.getTempDir({ prefix: "nsis-use-zip" })
  await mkdir(projectDir, { recursive: true })
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", ...config },
    metadata: { name: "TestApp", productName: "Test App", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar" } },
    devMetadata: null,
    options: {},
    projectDir,
    buildResourcesDir: path.join(projectDir, "build"),
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    framework: { defaultAppIdPrefix: "com.electron." },
  }
  archive.mockImplementation(async (_format: string, outFile: string) => {
    await writeFile(outFile, "")
    return outFile
  })
  return { packager: new WinPackager(fakePackagerInfo as any), projectDir }
}

function createTarget(packager: WinPackager, outDir: string, targetName: string, helper = new AppPackageHelper(new CopyElevateHelper())) {
  return targetName === "nsis-web" ? new WebInstallerTarget(packager, outDir, targetName, helper) : new NsisTarget(packager, outDir, targetName, helper)
}

async function computePayload(tmpDir: TmpDir, config: Configuration, targetName = "nsis") {
  const { packager, projectDir } = await createWinPackager(tmpDir, config)
  const warn = vi.spyOn(log, "warn")
  const target = createTarget(packager, projectDir, targetName)
  await target.buildAppPackage(projectDir, Arch.x64)
  const defines: Pick<Defines, "ZIP_COMPRESSION" | "COMPRESSION_METHOD"> = {}
  ;(target as any).configureDefinesForAllTypeOfInstaller(defines)
  return {
    archiveFormat: archive.mock.lastCall?.[0],
    zipCompression: "ZIP_COMPRESSION" in defines,
    compressionMethod: defines.COMPRESSION_METHOD,
    warnings: warn.mock.calls.map(it => it[it.length - 1]).filter(it => typeof it === "string" && it.includes("useZip")),
  }
}

test("nsis useZip is ignored (with a warning) for differential-aware builds, which always embed a 7z payload", async ({ expect, tmpDir }) => {
  const result = await computePayload(tmpDir, { nsis: { useZip: true } })
  expect(result).toStrictEqual({
    archiveFormat: "7z",
    zipCompression: false,
    compressionMethod: "7z",
    warnings: ["useZip is ignored because differential-aware builds always use a 7z payload"],
  })
})

test("nsis useZip with differentialPackage: false embeds and extracts a zip payload", async ({ expect, tmpDir }) => {
  const result = await computePayload(tmpDir, { nsis: { useZip: true, differentialPackage: false } })
  expect(result).toStrictEqual({ archiveFormat: "zip", zipCompression: true, compressionMethod: "zip", warnings: [] })
})

test("nsis-web never gets a zip package (with a warning), since the web installer only downloads and extracts 7z", async ({ expect, tmpDir }) => {
  const result = await computePayload(tmpDir, { nsisWeb: { useZip: true, differentialPackage: false } }, "nsis-web")
  expect(result).toStrictEqual({
    archiveFormat: "7z",
    zipCompression: false,
    compressionMethod: undefined,
    warnings: ["useZip is ignored because the web installer always uses a 7z package"],
  })
})

// nsis and portable share one AppPackageHelper (see WinPackager.createTargets); a cached package must
// only be reused by a target that would have built the very same archive.
async function packWithSharedHelper(tmpDir: TmpDir, config: Configuration) {
  const { packager, projectDir } = await createWinPackager(tmpDir, config)
  const helper = new AppPackageHelper(new CopyElevateHelper())
  const results = []
  for (const targetName of ["nsis", "portable"]) {
    const target = createTarget(packager, projectDir, targetName, helper)
    target.archs.set(Arch.x64, projectDir)
    results.push(await helper.packArch(Arch.x64, target))
  }
  const files = results.map(it => it.fileInfo.path)
  // both targets release the helper; every package it built is cleaned up exactly once
  await helper.finishBuild()
  await helper.finishBuild()
  const existing = await Promise.all(files.map(it => exists(it)))
  const leftovers = files.filter((_, i) => existing[i])
  return { archives: archive.mock.calls.map(it => [it[0], path.basename(it[1])]), sharedFile: files[0] === files[1], leftovers }
}

test("targets with different packaging settings don't share an app package", async ({ expect, tmpDir }) => {
  // nsis is differential-aware by default, portable never is
  expect(await packWithSharedHelper(tmpDir, {})).toStrictEqual({
    archives: [
      ["7z", "TestApp-1.1.0-x64.nsis.7z"],
      ["7z", "TestApp-1.1.0-x64-2.nsis.7z"],
    ],
    sharedFile: false,
    leftovers: [],
  })
  archive.mockClear()
  // a zip package built for nsis must not be embedded by portable, whose installer extracts 7z
  expect(await packWithSharedHelper(tmpDir, { nsis: { useZip: true, differentialPackage: false } })).toStrictEqual({
    archives: [
      ["zip", "TestApp-1.1.0-x64.nsis.zip"],
      ["7z", "TestApp-1.1.0-x64-2.nsis.7z"],
    ],
    sharedFile: false,
    leftovers: [],
  })
})

test("targets with identical packaging settings share one app package", async ({ expect, tmpDir }) => {
  expect(await packWithSharedHelper(tmpDir, { nsis: { differentialPackage: false, preCompressedFileExtensions: null } })).toStrictEqual({
    archives: [["7z", "TestApp-1.1.0-x64.nsis.7z"]],
    sharedFile: true,
    leftovers: [],
  })
})
