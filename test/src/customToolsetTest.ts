import { InvalidConfigurationError } from "builder-util"
import { promises as fs } from "fs"
import * as path from "path"
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

describe("getCustomToolsetPath memoization", { concurrent: false }, () => {
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

describe("custom toolset checksum", { concurrent: false }, () => {
  const docsUrl = "https://www.electron.build/docs/toolsets#custom-toolset-checksum"

  async function archiveToolset(tmpDir: { createTempDir: (options?: { prefix: string }) => Promise<string> }, checksum?: string): Promise<ToolsetCustom> {
    const dir = await tmpDir.createTempDir({ prefix: "custom-toolset-checksum" })
    const archive = path.join(dir, "bundle.tar.gz")
    await fs.writeFile(archive, "not a real archive")
    return { url: `file://${archive}`, checksum }
  }

  test("a missing checksum names the format and links to the docs", async ({ expect, tmpDir }) => {
    const error = await getCustomToolsetPath(await archiveToolset(tmpDir), "").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("64 lowercase hex characters")
    expect(error.message).toContain(docsUrl)
  })

  test.for([
    ["a v26-style base64 SHA-512", "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q=="],
    ["a sha256: prefixed value", "sha256:56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4"],
    ["a truncated hex value", "56997fdefe25e7928a1a"],
  ] as const)("rejects %s before extracting, without echoing it", async ([, checksum], { expect, tmpDir }) => {
    const error = await getCustomToolsetPath(await archiveToolset(tmpDir, checksum), "").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("base64 SHA-512")
    expect(error.message).toContain(docsUrl)
    expect(error.message).not.toContain(checksum)
  })
})
