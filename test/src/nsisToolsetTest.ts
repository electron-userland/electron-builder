import { afterEach, describe, vi } from "vitest"

vi.mock("app-builder-lib/src/util/electronGet", () => ({
  downloadBuilderToolset: vi.fn(),
}))

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { getMakeNsisPath, isNsisLoggingSupported, nsisChecksums } from "app-builder-lib/src/toolsets/nsis"
import * as path from "path"

const BUNDLE = "nsis-bundle-3.12.tar.gz"
const downloaded = () => vi.mocked(downloadBuilderToolset).mock.calls.at(-1)![0]

afterEach(() => {
  vi.clearAllMocks()
})

describe("toolsets.nsis version resolution", { concurrent: false }, () => {
  test.for([
    ["unset", undefined],
    ['"latest"', "latest"],
    ['"2.0.2"', "2.0.2"],
  ] as const)("%s downloads the nsis@2.0.2 bundle with its checksum", async ([, nsis], { expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle")
    const makensis = await getMakeNsisPath(nsis, await tmpDir.getTempDir())

    expect(downloaded()).toEqual({
      releaseName: "nsis@2.0.2",
      filenameWithExt: BUNDLE,
      checksums: { [BUNDLE]: "83d80ee578cb19008b2a99e4fccfb5e7c023cc9bb791eb38f6048fccc875f62c" },
    })
    // the unified bundle's entrypoint script sets NSISDIR itself
    expect(makensis).toEqual({ path: path.resolve("/fake/nsis-bundle", process.platform === "win32" ? "makensis.cmd" : "makensis") })
  })

  test('a "1.2.1" pin still downloads the nsis@1.2.1 bundle with its own checksum', async ({ expect, tmpDir }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/nsis-bundle")
    await getMakeNsisPath("1.2.1", await tmpDir.getTempDir())

    expect(downloaded()).toEqual({
      releaseName: "nsis@1.2.1",
      filenameWithExt: BUNDLE,
      checksums: { [BUNDLE]: "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4" },
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
    expect(Object.keys(nsisChecksums)).toEqual(["0.0.0", "1.2.1", "2.0.2"])
  })
})

describe("isNsisLoggingSupported", () => {
  test.for([
    ["unset", true, undefined],
    ['"latest"', true, "latest"],
    ['"2.0.2"', true, "2.0.2"],
    ['"1.2.1"', false, "1.2.1"],
    ['"0.0.0"', false, "0.0.0"],
  ] as const)("%s is log-enabled: %s", ([, supported, nsis], { expect }) => {
    expect(isNsisLoggingSupported(nsis)).toBe(supported)
  })

  test("a custom bundle is assumed to be log-enabled", ({ expect }) => {
    expect(isNsisLoggingSupported({ url: "file:///opt/nsis-log" })).toBe(true)
  })
})
