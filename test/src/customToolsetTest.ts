import { afterEach, beforeEach } from "vitest"
import { clearCustomToolsetCache, getCustomToolsetPath } from "app-builder-lib/src/toolsets/custom"
import type { ToolsetCustom } from "app-builder-lib/internal"

function dirToolset(dir: string): ToolsetCustom {
  return { url: `file://${dir}` }
}

beforeEach(() => {
  clearCustomToolsetCache()
})

afterEach(() => {
  clearCustomToolsetCache()
})

describe("getCustomToolsetPath memoization", { sequential: true }, () => {
  test("returns same Promise for identical args", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const toolset = dirToolset(dir)
    const p1 = getCustomToolsetPath(toolset, "")
    const p2 = getCustomToolsetPath(toolset, "")
    expect(p1).toBe(p2)
  })

  test("concurrent calls resolve to the same path", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const toolset = dirToolset(dir)
    const [r1, r2, r3] = await Promise.all([getCustomToolsetPath(toolset, ""), getCustomToolsetPath(toolset, ""), getCustomToolsetPath(toolset, "")])
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
    expect(r1).toBe(dir)
  })

  test("different url produces different cache entry", async ({ expect, tmpDir }) => {
    const dir1 = await tmpDir.createTempDir()
    const dir2 = await tmpDir.createTempDir()
    const p1 = getCustomToolsetPath(dirToolset(dir1), "")
    const p2 = getCustomToolsetPath(dirToolset(dir2), "")
    expect(p1).not.toBe(p2)
  })

  test("different resourcesDir produces different cache entry", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const toolset = dirToolset(dir)
    const p1 = getCustomToolsetPath(toolset, "")
    const p2 = getCustomToolsetPath(toolset, "/some/other/resources")
    expect(p1).not.toBe(p2)
  })

  test("clearCustomToolsetCache forces re-resolution", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const toolset = dirToolset(dir)
    const p1 = getCustomToolsetPath(toolset, "")
    clearCustomToolsetCache()
    const p2 = getCustomToolsetPath(toolset, "")
    expect(p1).not.toBe(p2)
  })

  test("directory type resolves to the directory path", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const result = await getCustomToolsetPath(dirToolset(dir), "")
    expect(result).toBe(dir)
  })
})
