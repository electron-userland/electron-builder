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

describe("getPath7za memoization", { sequential: true }, () => {
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

describe("setSevenZipVersion pinning", { sequential: true }, () => {
  const downloadedRelease = () => vi.mocked(downloadBuilderToolset).mock.calls.at(-1)![0]

  test("default (no pin) downloads the newest bundle with its checksums", async ({ expect }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
    const { getPath7za } = await freshImport()
    await getPath7za()

    const options = downloadedRelease()
    expect(options.releaseName).toBe("7zip@1.0.1")
    expect(options.checksums!["7zip-linux-x64.tar.gz"]).toBe("c6c2d744f5e71f100e7631786bca78b6f1738734454e8dd4bf6078d4895765f7")
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

      expect(downloadedRelease().releaseName).toBe("7zip@1.0.1")
    }
  })

  test("pinning resets the resolution cache so the pinned version is downloaded", async ({ expect }) => {
    const downloadMock = vi.mocked(downloadBuilderToolset)
    downloadMock.mockResolvedValue("/fake/tooldir")
    const { getPath7za, setSevenZipVersion } = await freshImport()

    await getPath7za()
    expect(downloadedRelease().releaseName).toBe("7zip@1.0.1")

    setSevenZipVersion("1.0.0")
    await getPath7za()
    expect(downloadMock).toHaveBeenCalledTimes(2)
    expect(downloadedRelease().releaseName).toBe("7zip@1.0.0")
  })
})

describe("setSevenZipPath override", { sequential: true }, () => {
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
