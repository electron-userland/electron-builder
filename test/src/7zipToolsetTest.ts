import { afterEach, describe, vi } from "vitest"

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
  return { ...actual, chmod: vi.fn().mockResolvedValue(undefined) }
})
vi.mock("app-builder-lib/src/util/electronGet", () => ({
  downloadBuilderToolset: vi.fn(),
}))

import { downloadBuilderToolset } from "app-builder-lib/internal"

// Each test re-imports the module so the module-level `_resolvedPath` and `_customPath` caches are reset.
async function freshImport() {
  vi.resetModules()
  return import("app-builder-lib/src/toolsets/7zip")
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("getPath7za memoization", { concurrent: false }, () => {
  test("returns the resolved path on success", async ({ expect }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
    const { getPath7za } = await freshImport()
    const p = await getPath7za()
    expect(p).toContain("7za")
  })

  test("on failure, resets the cache so a second call can retry", async ({ expect }) => {
    const downloadMock = vi.mocked(downloadBuilderToolset)
    downloadMock.mockRejectedValueOnce(new Error("network error"))
    downloadMock.mockResolvedValueOnce("/fake/tooldir")

    const { getPath7za } = await freshImport()

    // First call fails
    await expect(getPath7za()).rejects.toThrow("network error")

    // Second call should trigger a fresh download (not return the cached rejection)
    const result = await getPath7za()
    expect(result).toContain("7za")
    expect(downloadMock).toHaveBeenCalledTimes(2)
  })

  test("concurrent calls during a pending resolve share one download", async ({ expect }) => {
    const downloadMock = vi.mocked(downloadBuilderToolset)
    downloadMock.mockResolvedValue("/fake/tooldir")

    const { getPath7za } = await freshImport()
    const [a, b] = await Promise.all([getPath7za(), getPath7za()])
    expect(a).toBe(b)
    expect(downloadMock).toHaveBeenCalledTimes(1)
  })
})

describe("setSevenZipVersion pinning", { concurrent: false }, () => {
  const downloadedRelease = () => vi.mocked(downloadBuilderToolset).mock.calls.at(-1)![0]

  test("default (no pin) downloads the newest bundle with its checksums", async ({ expect }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
    const { getPath7za } = await freshImport()
    await getPath7za()

    const options = downloadedRelease()
    expect(options.releaseName).toBe("7zip@1.1.0")
    expect(options.githubOrgRepo).toBe("electron-userland/electron-builder-binaries")
    // 7-Zip 26.05 bundle: one pinned sha256 per published platform/arch asset of the 7zip@1.1.0 release
    expect(options.checksums).toEqual({
      "7zip-linux-ia32.tar.gz": "cd5d5255fc2f5a65f8d248f42ed5cbe5f9f6f701a12a26f40631740ef400794f",
      "7zip-darwin-arm64.tar.gz": "4d04c3a7c4c10b4b70cf25ab4e5ed6be7a141e98aefc536a87174ddb0bc3c050",
      "7zip-darwin-x86_64.tar.gz": "4d04c3a7c4c10b4b70cf25ab4e5ed6be7a141e98aefc536a87174ddb0bc3c050",
      "7zip-linux-arm64.tar.gz": "6250e76fe2c0af4247cc9ad41f6f9365ae95deae23a2592f42ba005cc20d8939",
      "7zip-win-arm64.tar.gz": "25aabfe776ffcd7dc172479beb06dd0505fd0b4e89451ceedb99efbd255ef829",
      "7zip-win-ia32.tar.gz": "020186756c2b370c7f840fb90a78e0b2e556fdcd6d356bc4f412021bd78cda5d",
      "7zip-win-x64.tar.gz": "032e591acc4c0eb3f2e1fc05ff3ec867e57f63369c74d13c0c73f973cae5fd6a",
      "7zip-linux-x64.tar.gz": "98ac470cf076f19241b5ee259e135de0adc3c3b8076c41682d6468c2a9990845",
    })
    expect(Object.keys(options.checksums!)).toContain(options.filenameWithExt)
  })

  // Making 1.1.0 the default must stay additive: every earlier pin keeps its own release and checksums.
  test.for([
    { version: "1.0.1", linuxX64: "c6c2d744f5e71f100e7631786bca78b6f1738734454e8dd4bf6078d4895765f7", winX64: "db50b64348d9560b875a00bd7e02f02b5f7f4b54ff5efa5908c38858c89c9f33" },
    { version: "1.0.0", linuxX64: "d151bb44b2a9d9bfc52813ce4cac042916394a0ab8a56bd5d221a5dc9ef8d5d7", winX64: "be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3" },
  ] as const)("an explicit '$version' pin still downloads that release with its own checksums", async ({ version, linuxX64, winX64 }, { expect }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
    const { getPath7za, setSevenZipVersion } = await freshImport()

    setSevenZipVersion(version)
    await getPath7za()

    const options = downloadedRelease()
    expect(options.releaseName).toBe(`7zip@${version}`)
    expect(Object.keys(options.checksums!)).toHaveLength(8)
    expect(options.checksums!["7zip-linux-x64.tar.gz"]).toBe(linuxX64)
    expect(options.checksums!["7zip-win-x64.tar.gz"]).toBe(winX64)
  })

  test("an explicit '1.0.0' pin downloads 7zip@1.0.0 with the 1.0.0 checksums", async ({ expect }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
    const { getPath7za, setSevenZipVersion } = await freshImport()

    setSevenZipVersion("1.0.0")
    await getPath7za()

    const options = downloadedRelease()
    expect(options.releaseName).toBe("7zip@1.0.0")
    expect(options.checksums!["7zip-linux-x64.tar.gz"]).toBe("d151bb44b2a9d9bfc52813ce4cac042916394a0ab8a56bd5d221a5dc9ef8d5d7")
  })

  test("'latest' / null / undefined resolve to the newest bundle", async ({ expect }) => {
    for (const version of ["latest", null, undefined] as const) {
      vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
      const { getPath7za, setSevenZipVersion } = await freshImport()

      setSevenZipVersion(version)
      await getPath7za()

      expect(downloadedRelease().releaseName).toBe("7zip@1.1.0")
    }
  })

  test("pinning resets the resolution cache so the pinned version is downloaded", async ({ expect }) => {
    const downloadMock = vi.mocked(downloadBuilderToolset)
    downloadMock.mockResolvedValue("/fake/tooldir")
    const { getPath7za, setSevenZipVersion } = await freshImport()

    await getPath7za()
    expect(downloadedRelease().releaseName).toBe("7zip@1.1.0")

    setSevenZipVersion("1.0.0")
    await getPath7za()
    expect(downloadMock).toHaveBeenCalledTimes(2)
    expect(downloadedRelease().releaseName).toBe("7zip@1.0.0")
  })
})

describe("setSevenZipPath override", { concurrent: false }, () => {
  test("returns the custom path without downloading", async ({ expect }) => {
    const downloadMock = vi.mocked(downloadBuilderToolset)
    const { getPath7za, setSevenZipPath } = await freshImport()

    setSevenZipPath("/custom/bin/7za")
    const result = await getPath7za()

    expect(result).toBe("/custom/bin/7za")
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("custom path is memoized like the default path", async ({ expect }) => {
    const { getPath7za, setSevenZipPath } = await freshImport()

    setSevenZipPath("/custom/bin/7za")
    const [a, b] = await Promise.all([getPath7za(), getPath7za()])
    expect(a).toBe(b)
  })
})
