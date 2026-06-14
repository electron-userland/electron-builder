import { afterEach, beforeEach } from "vitest"
import * as path from "path"
import * as os from "os"
import { mkdir, rm } from "fs/promises"
import { clearCustomToolsetCache, getCustomToolsetPath } from "app-builder-lib/src/toolsets/custom"
import type { ToolsetCustom } from "app-builder-lib/internal"

const FAKE_DIR = path.join(os.tmpdir(), "custom-toolset-memo-test")
const FAKE_DIR_2 = path.join(os.tmpdir(), "custom-toolset-memo-test-2")

function dirToolset(dir = FAKE_DIR): ToolsetCustom {
  return { url: `file://${dir}` }
}

beforeEach(async () => {
  clearCustomToolsetCache()
  await Promise.all([mkdir(FAKE_DIR, { recursive: true }), mkdir(FAKE_DIR_2, { recursive: true })])
})

afterEach(async () => {
  clearCustomToolsetCache()
  await Promise.all([rm(FAKE_DIR, { recursive: true, force: true }), rm(FAKE_DIR_2, { recursive: true, force: true })])
})

// sequence.concurrent is enabled globally; tests share module-level clearCustomToolsetCache() + fixed dir paths — sequential prevents cache races.
describe.sequential("getCustomToolsetPath memoization", () => {
  test("returns same Promise for identical args", ({ expect }) => {
    const toolset = dirToolset()
    const p1 = getCustomToolsetPath(toolset, "")
    const p2 = getCustomToolsetPath(toolset, "")
    expect(p1).toBe(p2)
  })

  test("concurrent calls resolve to the same path", async ({ expect }) => {
    const toolset = dirToolset()
    const [r1, r2, r3] = await Promise.all([getCustomToolsetPath(toolset, ""), getCustomToolsetPath(toolset, ""), getCustomToolsetPath(toolset, "")])
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
    expect(r1).toBe(FAKE_DIR)
  })

  test("different url produces different cache entry", ({ expect }) => {
    const p1 = getCustomToolsetPath(dirToolset(FAKE_DIR), "")
    const p2 = getCustomToolsetPath(dirToolset(FAKE_DIR_2), "")
    expect(p1).not.toBe(p2)
  })

  test("different resourcesDir produces different cache entry", ({ expect }) => {
    const toolset = dirToolset()
    const p1 = getCustomToolsetPath(toolset, "")
    const p2 = getCustomToolsetPath(toolset, "/some/other/resources")
    expect(p1).not.toBe(p2)
  })

  test("clearCustomToolsetCache forces re-resolution", ({ expect }) => {
    const toolset = dirToolset()
    const p1 = getCustomToolsetPath(toolset, "")
    clearCustomToolsetCache()
    const p2 = getCustomToolsetPath(toolset, "")
    expect(p1).not.toBe(p2)
  })

  test("directory type resolves to the directory path", async ({ expect }) => {
    const result = await getCustomToolsetPath(dirToolset(), "")
    expect(result).toBe(FAKE_DIR)
  })
})
