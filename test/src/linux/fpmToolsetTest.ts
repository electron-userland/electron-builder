import { beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset
// downloader and assert the release descriptor it is asked for.
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { fpmChecksums, getFpmArchiveName, getFpmPath } from "app-builder-lib/src/toolsets/fpm"
import { InvalidConfigurationError } from "builder-util"
import * as path from "path"

const FAKE_TOOLSET = "/fake/fpm-toolset"
const GITHUB_ORG_REPO = "electron-userland/electron-builder-binaries"

// Every host fpm is bundled for, with the archive-name suffix its release asset uses.
const HOSTS: Array<[NodeJS.Platform, string, string]> = [
  ["linux", "x64", "linux-amd64"],
  ["linux", "arm64", "linux-arm64v8"],
  ["linux", "ia32", "linux-i386"],
  ["darwin", "arm64", "darwin-arm64"],
  ["darwin", "x64", "darwin-x86_64"],
]

describe("getFpmArchiveName", () => {
  // fpm@2.2.1 assets are named after fpm 1.17.0 / Ruby 3.4.3; the pin must keep resolving them.
  test.each(HOSTS)('"2.2.1" on %s-%s resolves the fpm 1.17.0 / Ruby 3.4.3 archive', (platform, arch, suffix) => {
    const filename = getFpmArchiveName("2.2.1", platform, arch)
    expect(filename).toBe(`fpm-1.17.0-ruby-3.4.3-${suffix}.7z`)
    expect(Object.keys(fpmChecksums["2.2.1"])).toContain(filename)
  })

  // fpm@2.3.1 names its assets after fpm 1.18.0 / Ruby 3.4.12.
  test.each(HOSTS)('"2.3.1" on %s-%s resolves the fpm 1.18.0 / Ruby 3.4.12 archive', (platform, arch, suffix) => {
    const filename = getFpmArchiveName("2.3.1", platform, arch)
    expect(filename).toBe(`fpm-1.18.0-ruby-3.4.12-${suffix}.7z`)
    expect(Object.keys(fpmChecksums["2.3.1"])).toContain(filename)
  })

  test("every version publishes exactly one archive per supported host", () => {
    for (const [version, checksums] of Object.entries(fpmChecksums)) {
      const names = Object.keys(checksums)
      expect(names, version).toHaveLength(HOSTS.length)
      for (const [platform, arch] of HOSTS) {
        const filename = getFpmArchiveName(version, platform, arch)
        expect(
          names.filter(it => it === filename),
          `${version} ${platform}-${arch}`
        ).toHaveLength(1)
      }
    }
  })

  test.each(["9.9.9", "2.3.0", "constructor", "__proto__", "toString", "hasOwnProperty"])('an unknown version "%s" throws instead of indexing the checksum table', version => {
    expect(() => getFpmArchiveName(version, "linux", "x64")).toThrow(InvalidConfigurationError)
    expect(() => getFpmArchiveName(version, "linux", "x64")).toThrow(
      `Unknown toolsets.fpm version "${version}". Known versions: ${Object.keys(fpmChecksums).join(", ")} (or "latest")`
    )
  })

  test.each([
    ["freebsd", "x64"],
    ["openbsd", "arm64"],
    ["aix", "ppc64"],
  ] as Array<[NodeJS.Platform, string]>)("a host with no published bundle (%s-%s) throws instead of picking another platform's archive", (platform, arch) => {
    for (const version of Object.keys(fpmChecksums)) {
      expect(() => getFpmArchiveName(version, platform, arch)).toThrow(InvalidConfigurationError)
      expect(() => getFpmArchiveName(version, platform, arch)).toThrow(`fpm@${version} has no bundle for ${platform}-${arch}`)
    }
  })
})

describe("fpmChecksums", () => {
  // Making 2.3.1 the default must stay additive: 2.2.1 keeps its own archive names and checksums.
  test("2.3.1 is added alongside 2.2.1, which keeps its checksums", () => {
    expect(Object.keys(fpmChecksums)).toEqual(["2.2.1", "2.3.1"])
    expect(fpmChecksums["2.2.1"]).toEqual({
      "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "2ef73acbcbfd26503369cb3a9b0345aa7fae251d69130537ee6ff47b402f828e",
      "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "50eff4214e3e30e2a8bbc35854f80acabb3260ea9e87f5835c60f898eedb320e",
      "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "553f047eacbc63423bae1eca5958bcdc720c1f6f4135cb815f5ec99f48d3bd55",
      "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "e44b60765367cd11b0b9fa5f1966762137ee45ec02d49a3e9668475031e97873",
      "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "f4091110728de8259dcab181761e74141b4b65d409a26e642c7271bd0b61eab4",
    })
    expect(fpmChecksums["2.3.1"]).toEqual({
      "fpm-1.18.0-ruby-3.4.12-darwin-arm64.7z": "40846b25ece8b24f30b6cbe3838a7cf3fd05b7e8f2133a50b6ef6f1ee12ba7c3",
      "fpm-1.18.0-ruby-3.4.12-darwin-x86_64.7z": "4299d345d906be224b47885ca1bb87b6a2cf688e1b04024d480987b051c68f76",
      "fpm-1.18.0-ruby-3.4.12-linux-amd64.7z": "25c7518f5187047fbd0268c8150f9fb795058f851c3954a0407bee7ed199ff87",
      "fpm-1.18.0-ruby-3.4.12-linux-arm64v8.7z": "ffa94aff17e68137867a4d2e63cebb4ff041ab7d360ec429430f0369162db983",
      "fpm-1.18.0-ruby-3.4.12-linux-i386.7z": "7b53b41729dbbcd75d3f4da16ae310d9dae6892b276c9d443e4e3e64990540c0",
    })
  })

  test("every checksum entry is a single sha256 value", () => {
    for (const [version, checksums] of Object.entries(fpmChecksums)) {
      for (const [name, value] of Object.entries(checksums)) {
        expect(value, `${version} ${name}`).toMatch(/^[0-9a-f]{64}$/)
      }
    }
  })
})

// The bundled toolset is never resolved on Windows (getFpmPath requires a custom toolset there).
describe.skipIf(process.platform === "win32")("getFpmPath", () => {
  let tmpDir: string

  // The context's `tmpDir` fixture (vitest-tmpdir.ts) cleans up after each test.
  beforeEach(async context => {
    tmpDir = await context.tmpDir.createTempDir({ prefix: "eb-fpm-toolset-test" })
    vi.mocked(downloadBuilderToolset).mockReset()
    vi.mocked(downloadBuilderToolset).mockResolvedValue(FAKE_TOOLSET)
  })

  test.each([
    ["latest", "latest"],
    ["undefined", undefined],
    ["null", null],
  ])("%s resolves to the newest bundle (2.3.1)", async (_label, toolset) => {
    const fpmPath = await getFpmPath(toolset as any, tmpDir)
    expect(fpmPath).toBe(path.resolve(FAKE_TOOLSET, "fpm"))
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "fpm@2.3.1",
      filenameWithExt: getFpmArchiveName("2.3.1", process.platform, process.arch),
      checksums: fpmChecksums["2.3.1"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0].filenameWithExt).toMatch(/^fpm-1\.18\.0-ruby-3\.4\.12-/)
  })

  test('an explicit "2.2.1" pin still downloads its own fpm 1.17.0 archive, not the new default', async () => {
    await getFpmPath("2.2.1", tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "fpm@2.2.1",
      filenameWithExt: getFpmArchiveName("2.2.1", process.platform, process.arch),
      checksums: fpmChecksums["2.2.1"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0].filenameWithExt).toMatch(/^fpm-1\.17\.0-ruby-3\.4\.3-/)
  })

  test("an unknown pinned version is rejected before any download", async () => {
    // Without a checksum entry the downloader would run with integrity verification disabled, so an
    // unknown version (only reachable through a programmatic / unvalidated config) must fail fast.
    const promise = getFpmPath("9.9.9" as any, tmpDir)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(`Unknown toolsets.fpm version "9.9.9"`)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})
