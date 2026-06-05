import { afterEach, describe, vi } from "vitest"

vi.mock("builder-util", async () => ({
  ...(await vi.importActual<typeof import("builder-util")>("builder-util")),
  resolveEnvToolsetPath: vi.fn().mockResolvedValue(null),
}))
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
  return { ...actual, chmod: vi.fn().mockResolvedValue(undefined) }
})
vi.mock("app-builder-lib/src/util/electronGet", () => ({
  downloadBuilderToolset: vi.fn(),
}))

import { downloadBuilderToolset } from "app-builder-lib/internal"

// Each test re-imports the module so the module-level `_resolvedPath` cache is reset.
async function freshGetPath7za() {
  vi.resetModules()
  const { getPath7za } = await import("app-builder-lib/internal")
  return getPath7za
}

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential("getPath7za memoization", () => {
  test("returns the resolved path on success", async ({ expect }) => {
    vi.mocked(downloadBuilderToolset).mockResolvedValueOnce("/fake/tooldir")
    const getPath7za = await freshGetPath7za()
    const p = await getPath7za()
    expect(p).toContain("7za")
  })

  test("on failure, resets the cache so a second call can retry", async ({ expect }) => {
    const downloadMock = vi.mocked(downloadBuilderToolset)
    downloadMock.mockRejectedValueOnce(new Error("network error"))
    downloadMock.mockResolvedValueOnce("/fake/tooldir")

    const getPath7za = await freshGetPath7za()

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

    const getPath7za = await freshGetPath7za()
    const [a, b] = await Promise.all([getPath7za(), getPath7za()])
    expect(a).toBe(b)
    expect(downloadMock).toHaveBeenCalledTimes(1)
  })
})
