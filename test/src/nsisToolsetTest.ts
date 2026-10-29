import { afterEach, describe, vi } from "vitest"

vi.mock("app-builder-lib/src/util/electronGet", () => ({
  downloadBuilderToolset: vi.fn(),
}))

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { getMakeNsisPath, getNsisElevatePath, getNsisPluginsPath, isNsisLoggingSupported, nsisChecksums } from "app-builder-lib/src/toolsets/nsis"
import * as fs from "fs/promises"
import * as path from "path"

const BUNDLE_3_12 = "nsis-bundle-3.12.tar.gz"
const BUNDLE_3_13 = "nsis-bundle-3.13.tar.gz"
const BUNDLE_3_13_LOG = "nsis-bundle-3.13-log.tar.gz"
const downloaded = () => vi.mocked(downloadBuilderToolset).mock.calls.at(-1)![0]

afterEach(() => {
  vi.clearAllMocks()
})

describe("toolsets.nsis version resolution", { concurrent: false }, () => {
  test.for([
    ["unset", undefined],
    ['"latest"', "latest"],
    ['"2.0.4"', "2.0.4"],
  ] as const)("%s downloads the default nsis@2.0.4 bundle with its checksum", async ([, nsis], { expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle")
    const makensis = await getMakeNsisPath(nsis, await tmpDir.getTempDir())

    expect(downloaded()).toEqual({
      releaseName: "nsis@2.0.4",
      filenameWithExt: BUNDLE_3_13,
      checksums: { [BUNDLE_3_13]: "c18e9ad9684cf4c5bbd7b768cbf1b056d40771d7bd9ae1b513346452decf89d2" },
    })
    // the unified bundle's entrypoint script sets NSISDIR itself
    expect(makensis).toEqual({ path: path.resolve("/fake/nsis-bundle", process.platform === "win32" ? "makensis.cmd" : "makensis") })
  })

  test('a "1.2.1" pin still downloads the nsis@1.2.1 bundle with its own checksum', async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle")
    await getMakeNsisPath("1.2.1", await tmpDir.getTempDir())

    expect(downloaded()).toEqual({
      releaseName: "nsis@1.2.1",
      filenameWithExt: BUNDLE_3_12,
      checksums: { [BUNDLE_3_12]: "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4" },
    })
  })

  test('a "0.0.0" pin still downloads the legacy NSIS 3.0.4.1 bundle', async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-legacy")
    const makensis = await getMakeNsisPath("0.0.0", await tmpDir.getTempDir())

    expect(downloaded().releaseName).toBe("nsis-3.0.4.1")
    expect(downloaded().filenameWithExt).toBe("nsis-3.0.4.1.7z")
    // the legacy bundle has no entrypoint script, so NSISDIR is set explicitly
    expect(makensis.env).toEqual({ NSISDIR: "/fake/nsis-legacy" })
  })

  test("keeps the checksums of every published bundle", ({ expect }) => {
    expect(Object.keys(nsisChecksums)).toEqual(["0.0.0", "1.2.1", "2.0.4"])
    expect(nsisChecksums["1.2.1"]).toEqual({ [BUNDLE_3_12]: "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4" })
    expect(nsisChecksums["2.0.4"]).toEqual({
      [BUNDLE_3_13]: "c18e9ad9684cf4c5bbd7b768cbf1b056d40771d7bd9ae1b513346452decf89d2",
      [BUNDLE_3_13_LOG]: "1803e6d45c91f6ed7860935940073fdc7857d52f2dabe123352c4676aeb635c7",
    })
  })

  test("does not offer nsis@2.0.3, which 2.0.4 replaces (its bundles lacked plugin and elevate license files)", ({ expect }) => {
    expect(nsisChecksums).not.toHaveProperty(["2.0.3"])
  })
})

describe("toolsets.nsis bundle selection by installerDebugLogging", { concurrent: false }, () => {
  test.for([
    ["unset", undefined],
    ['"latest"', "latest"],
    ['"2.0.4"', "2.0.4"],
  ] as const)("%s with debugLogging downloads the log-enabled nsis@2.0.4 bundle with its checksum", async ([, nsis], { expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle-log")
    const makensis = await getMakeNsisPath(nsis, await tmpDir.getTempDir(), { debugLogging: true })

    expect(downloaded()).toEqual({
      releaseName: "nsis@2.0.4",
      filenameWithExt: BUNDLE_3_13_LOG,
      checksums: { [BUNDLE_3_13_LOG]: "1803e6d45c91f6ed7860935940073fdc7857d52f2dabe123352c4676aeb635c7" },
    })
    expect(makensis).toEqual({ path: path.resolve("/fake/nsis-bundle-log", process.platform === "win32" ? "makensis.cmd" : "makensis") })
  })

  test("debugLogging: false downloads the default nsis@2.0.4 bundle", async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle")
    await getMakeNsisPath("2.0.4", await tmpDir.getTempDir(), { debugLogging: false })
    expect(downloaded().filenameWithExt).toBe(BUNDLE_3_13)
  })

  test("the two nsis@2.0.4 bundles download under different file names, so their cache entries never mix", async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValue("/fake/nsis-bundle")
    const dir = await tmpDir.getTempDir()
    await getMakeNsisPath("2.0.4", dir, { debugLogging: true })
    await getMakeNsisPath("2.0.4", dir)
    await getMakeNsisPath("2.0.4", dir, { debugLogging: true })

    // downloadBuilderToolset keys the archive cache and the extract dir by release and file name
    expect(vi.mocked(downloadBuilderToolset).mock.calls.map(([it]) => `${it.releaseName}/${it.filenameWithExt}`)).toEqual([
      `nsis@2.0.4/${BUNDLE_3_13_LOG}`,
      `nsis@2.0.4/${BUNDLE_3_13}`,
      `nsis@2.0.4/${BUNDLE_3_13_LOG}`,
    ])
  })

  test("plugins and elevate.exe come from the same bundle as makensis", async ({ expect, tmpDir }) => {
    const bundle = await tmpDir.getTempDir({ prefix: "nsis-bundle-log" })
    await fs.mkdir(path.join(bundle, "plugins"), { recursive: true })
    await fs.writeFile(path.join(bundle, "elevate.exe"), "")
    vi.mocked(downloadBuilderToolset).mockResolvedValue(bundle)
    const resourcesDir = await tmpDir.getTempDir()

    expect(await getNsisPluginsPath("2.0.4", resourcesDir, { debugLogging: true })).toBe(path.resolve(bundle, "plugins"))
    expect(downloaded().filenameWithExt).toBe(BUNDLE_3_13_LOG)
    expect(await getNsisElevatePath("2.0.4", resourcesDir, { debugLogging: true })).toBe(path.resolve(bundle, "elevate.exe"))
    expect(downloaded().filenameWithExt).toBe(BUNDLE_3_13_LOG)
  })

  test('a "1.2.1" pin has no log-enabled bundle and keeps downloading its only bundle', async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle")
    await getMakeNsisPath("1.2.1", await tmpDir.getTempDir(), { debugLogging: true })

    expect(downloaded()).toEqual({
      releaseName: "nsis@1.2.1",
      filenameWithExt: BUNDLE_3_12,
      checksums: { [BUNDLE_3_12]: "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4" },
    })
  })

  test('a "0.0.0" pin has no log-enabled bundle and keeps downloading the legacy bundle', async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-legacy")
    await getMakeNsisPath("0.0.0", await tmpDir.getTempDir(), { debugLogging: true })
    expect(downloaded().filenameWithExt).toBe("nsis-3.0.4.1.7z")
  })
})

describe("isNsisLoggingSupported", () => {
  test.for([
    ["unset", true, undefined],
    ['"latest"', true, "latest"],
    ['"2.0.4"', true, "2.0.4"],
    ['"1.2.1"', false, "1.2.1"],
    ['"0.0.0"', false, "0.0.0"],
  ] as const)("%s is log-enabled: %s", ([, supported, nsis], { expect }) => {
    expect(isNsisLoggingSupported(nsis)).toBe(supported)
  })

  test("a custom bundle is assumed to be log-enabled", ({ expect }) => {
    expect(isNsisLoggingSupported({ url: "file:///opt/nsis-log" })).toBe(true)
  })
})
