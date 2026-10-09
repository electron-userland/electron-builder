import { InvalidConfigurationError } from "builder-util"
import { createHash } from "crypto"
import { promises as fs } from "fs"
import * as path from "path"
import * as tar from "tar"
import { afterEach, beforeEach, vi } from "vitest"
import { clearCustomToolsetCache, getCustomToolsetPath } from "app-builder-lib/src/toolsets/custom"
import type { ToolsetCustom } from "app-builder-lib/internal"

function dirToolset(dir: string): ToolsetCustom {
  return { url: `file://${dir}` }
}

type TempDirs = { createTempDir: (options?: { prefix: string }) => Promise<string> }

// the documented v26 customNsisBinary default checksum (base64-encoded SHA-512)
const V26_SHA512_BASE64 = "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q=="

const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex")
const sha512Base64 = (data: Buffer | string) => createHash("sha512").update(data).digest("base64")

/** A minimal bundle.tar.gz with one top-level folder (stripped on extraction) holding `files`. */
async function createTarGz(tmpDir: TempDirs, files: Record<string, string>): Promise<string> {
  const dir = await tmpDir.createTempDir({ prefix: "custom-toolset-archive" })
  await fs.mkdir(path.join(dir, "bundle"))
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, "bundle", name), content)
  }
  const archive = path.join(dir, "bundle.tar.gz")
  await tar.create({ gzip: true, file: archive, cwd: dir }, ["bundle"])
  return archive
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

  async function archiveToolset(tmpDir: TempDirs, checksum?: string): Promise<ToolsetCustom> {
    const dir = await tmpDir.createTempDir({ prefix: "custom-toolset-checksum" })
    const archive = path.join(dir, "bundle.tar.gz")
    await fs.writeFile(archive, "not a real archive")
    return { url: `file://${archive}`, checksum }
  }

  test("a missing checksum names both formats and links to the docs", async ({ expect, tmpDir }) => {
    const error = await getCustomToolsetPath(await archiveToolset(tmpDir), "").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("shasum -a 256 <archive>")
    expect(error.message).toContain("openssl dgst -sha512 -binary <archive> | openssl base64 -A")
    expect(error.message).toContain(docsUrl)
  })

  test.for([
    ["a sha256: prefixed value", "sha256:56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4"],
    ["a sha512- prefixed value", `sha512-${V26_SHA512_BASE64}`],
    ["a truncated hex value", "56997fdefe25e7928a1a"],
    ["a SHA-512 in hex", "ab".repeat(64)],
  ] as const)("rejects %s before extracting, without echoing it", async ([, checksum], { expect, tmpDir }) => {
    const error = await getCustomToolsetPath(await archiveToolset(tmpDir, checksum), "").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("SHA-512 as 88 base64 characters")
    expect(error.message).toContain(docsUrl)
    expect(error.message).not.toContain(checksum)
  })

  test("equivalent spellings of a checksum share one memoized resolution", async ({ expect, tmpDir }) => {
    const toolset = await archiveToolset(tmpDir, sha256Hex("x"))
    const lower = getCustomToolsetPath(toolset, "")
    const upper = getCustomToolsetPath({ ...toolset, checksum: ` ${sha256Hex("x").toUpperCase()} ` }, "")
    expect(upper).toBe(lower)
    // the placeholder archive does not match the checksum; swallow the rejection
    await lower.catch(() => {})
  })
})

// A local file:// archive is hashed and verified before it is extracted (and the user's file is never touched).
describe("custom toolset file:// archive verification", { concurrent: false }, () => {
  let cacheDir: string

  beforeEach(async context => {
    cacheDir = await context.tmpDir.createTempDir({ prefix: "custom-toolset-cache" })
    vi.stubEnv("ELECTRON_BUILDER_CACHE", cacheDir)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test.for([
    ["a lowercase SHA-256 hex", sha256Hex],
    ["an uppercase SHA-256 hex", (data: Buffer | string) => sha256Hex(data).toUpperCase()],
    ["a base64 SHA-512 (v26 format)", sha512Base64],
  ] as const)("extracts an archive whose checksum is %s", async ([, checksumOf], { expect, tmpDir }) => {
    const archive = await createTarGz(tmpDir, { sentinel: "verified" })
    const result = await getCustomToolsetPath({ url: `file://${archive}`, checksum: checksumOf(await fs.readFile(archive)) }, "")
    expect(await fs.readFile(path.join(result, "sentinel"), "utf8")).toBe("verified")
    expect(result.startsWith(path.join(cacheDir, "custom-toolsets") + path.sep)).toBe(true)
  })

  test("a base64 SHA-512 names the cache directory after the hex digest, never after the base64 value", async ({ expect, tmpDir }) => {
    const archive = await createTarGz(tmpDir, { sentinel: "verified" })
    const data = await fs.readFile(archive)
    const result = await getCustomToolsetPath({ url: `file://${archive}`, checksum: sha512Base64(data) }, "")
    const hexPrefix = createHash("sha512").update(data).digest("hex").substring(0, 8)
    expect(path.basename(result)).toMatch(new RegExp(`^${hexPrefix}-[0-9a-z]+$`))
    expect(path.dirname(result)).toBe(path.join(cacheDir, "custom-toolsets"))
  })

  test.for([
    ["SHA-256 hex", sha256Hex],
    ["base64 SHA-512", sha512Base64],
  ] as const)("a %s mismatch fails before extracting and leaves the user's archive in place", async ([, checksumOf], { expect, tmpDir }) => {
    const archive = await createTarGz(tmpDir, { sentinel: "tampered" })
    const original = await fs.readFile(archive)
    const expected = checksumOf("the archive the checksum was computed for")
    const actual = checksumOf(original)

    const error = await getCustomToolsetPath({ url: `file://${archive}`, checksum: expected }, "").catch(e => e)

    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(archive)
    expect(error.message).toContain(expected)
    expect(error.message).toContain(actual)
    expect(error.message).toContain("left in place")
    // the user's file is untouched and nothing was extracted
    expect(Buffer.compare(await fs.readFile(archive), original)).toBe(0)
    const extracted = await fs.readdir(path.join(cacheDir, "custom-toolsets")).catch(() => [])
    expect(extracted).toEqual([])
  })

  test("a changed archive is caught on the next resolution instead of reusing the previous extraction", async ({ expect, tmpDir }) => {
    const archive = await createTarGz(tmpDir, { sentinel: "v1" })
    const toolset = { url: `file://${archive}`, checksum: sha256Hex(await fs.readFile(archive)) }
    const first = await getCustomToolsetPath(toolset, "")
    expect(await fs.readFile(path.join(first, "sentinel"), "utf8")).toBe("v1")

    // replace the archive in place, keeping the configured checksum
    const replacement = await createTarGz(tmpDir, { sentinel: "v2" })
    await fs.copyFile(replacement, archive)
    clearCustomToolsetCache()

    await expect(getCustomToolsetPath(toolset, "")).rejects.toThrow(/sha256 checksum mismatch/)
  })
})
