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

describe.sequential("getPath7za memoization", () => {
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

describe.sequential("setSevenZipPath override", () => {
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
