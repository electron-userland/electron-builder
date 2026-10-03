import { Arch, exists, log } from "builder-util"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"
// load the package entry first: importing NsisTarget on its own enters the platformPackager <-> index
// import cycle mid-way and LinuxPackager then extends an undefined PlatformPackager
import "app-builder-lib/src"
import type { Configuration } from "app-builder-lib"
import type { Defines } from "app-builder-lib/src/targets/nsis/Defines"
import { NsisTarget } from "app-builder-lib/src/targets/nsis/NsisTarget"
import { WebInstallerTarget } from "app-builder-lib/src/targets/nsis/WebInstallerTarget"
import { AppPackageHelper, CopyElevateHelper } from "app-builder-lib/src/targets/nsis/nsisUtil"

// `nsis.useZip` must pick the same format for the embedded app package (buildAppPackage) and for the
// installer's extractor (ZIP_COMPRESSION / COMPRESSION_METHOD). NsisTarget is built over a minimal fake
// packager (the pattern of nsisStoreAsarTest.ts); only the 7za invocation is stubbed, so the archive
// format NsisTarget requests is recorded without needing the toolset.

const archive = vi.hoisted(() => vi.fn())
vi.mock("app-builder-lib/src/targets/archive", async importOriginal => ({
  ...(await importOriginal<typeof import("app-builder-lib/src/targets/archive")>()),
  archive,
}))

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-nsis-use-zip-"))
})

afterEach(async () => {
  vi.restoreAllMocks()
  archive.mockReset()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// buildAppPackage and configureDefinesForAllTypeOfInstaller only need these packager fields; the
// framework doesn't copy the elevate helper, so no toolset download is involved.
async function createFakePackager(config: Configuration) {
  const projectDir = await fs.mkdtemp(path.join(tmpDir, "project-"))
  const packager: any = {
    config: { appId: "org.electron-builder.testApp", ...config },
    info: { metadata: {}, framework: { isCopyElevateHelper: false } },
    appInfo: { sanitizedName: "TestApp", version: "1.1.0", productFilename: "Test App", updaterCacheDirName: "testapp-updater" },
    compression: "normal",
  }
  archive.mockImplementation(async (_format: string, outFile: string) => {
    await fs.writeFile(outFile, "")
    return outFile
  })
  return { packager, projectDir }
}

function createTarget(packager: any, outDir: string, targetName: string, helper = new AppPackageHelper(new CopyElevateHelper())) {
  return targetName === "nsis-web" ? new WebInstallerTarget(packager, outDir, targetName, helper) : new NsisTarget(packager, outDir, targetName, helper)
}

async function computePayload(config: Configuration, targetName = "nsis") {
  const { packager, projectDir } = await createFakePackager(config)
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

test("nsis useZip is ignored (with a warning) for differential-aware builds, which always embed a 7z payload", async ({ expect }) => {
  const result = await computePayload({ nsis: { useZip: true } })
  expect(result).toStrictEqual({
    archiveFormat: "7z",
    zipCompression: false,
    compressionMethod: "7z",
    warnings: ["useZip is ignored because differential-aware builds always use a 7z payload"],
  })
})

test("nsis useZip with differentialPackage: false embeds and extracts a zip payload", async ({ expect }) => {
  const result = await computePayload({ nsis: { useZip: true, differentialPackage: false } })
  expect(result).toStrictEqual({ archiveFormat: "zip", zipCompression: true, compressionMethod: "zip", warnings: [] })
})

test("nsis-web never gets a zip package (with a warning), since the web installer only downloads and extracts 7z", async ({ expect }) => {
  const result = await computePayload({ nsisWeb: { useZip: true, differentialPackage: false } }, "nsis-web")
  expect(result).toStrictEqual({
    archiveFormat: "7z",
    zipCompression: false,
    compressionMethod: undefined,
    warnings: ["useZip is ignored because the web installer always uses a 7z package"],
  })
})

// nsis and portable share one AppPackageHelper (see WinPackager.createTargets); a cached package must
// only be reused by a target that would have built the very same archive.
async function packWithSharedHelper(config: Configuration) {
  const { packager, projectDir } = await createFakePackager(config)
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

test("targets with different packaging settings don't share an app package", async ({ expect }) => {
  // nsis is differential-aware by default, portable never is
  expect(await packWithSharedHelper({})).toStrictEqual({
    archives: [
      ["7z", "TestApp-1.1.0-x64.nsis.7z"],
      ["7z", "TestApp-1.1.0-x64-2.nsis.7z"],
    ],
    sharedFile: false,
    leftovers: [],
  })
  archive.mockClear()
  // a zip package built for nsis must not be embedded by portable, whose installer extracts 7z
  expect(await packWithSharedHelper({ nsis: { useZip: true, differentialPackage: false } })).toStrictEqual({
    archives: [
      ["zip", "TestApp-1.1.0-x64.nsis.zip"],
      ["7z", "TestApp-1.1.0-x64-2.nsis.7z"],
    ],
    sharedFile: false,
    leftovers: [],
  })
})

test("targets with identical packaging settings share one app package", async ({ expect }) => {
  expect(await packWithSharedHelper({ nsis: { differentialPackage: false, preCompressedFileExtensions: null } })).toStrictEqual({
    archives: [["7z", "TestApp-1.1.0-x64.nsis.7z"]],
    sharedFile: true,
    leftovers: [],
  })
})
