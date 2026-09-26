import { Arch, Configuration, WinPackager } from "app-builder-lib"
import type { Defines } from "app-builder-lib/internal"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { AppPackageHelper, CopyElevateHelper } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { log } from "builder-util"
import { writeFile } from "fs/promises"
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

async function computePayload(tmpDir: TmpDir, config: Configuration) {
  const projectDir = await tmpDir.createTempDir({ prefix: "nsis-use-zip" })
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
  const warn = vi.spyOn(log, "warn")
  const target = new NsisTarget(new WinPackager(fakePackagerInfo as any), projectDir, "nsis", new AppPackageHelper(new CopyElevateHelper()))
  archive.mockImplementation(async (_format: string, outFile: string) => {
    await writeFile(outFile, "")
    return outFile
  })
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
