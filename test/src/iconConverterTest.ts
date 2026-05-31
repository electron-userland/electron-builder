import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import * as os from "os"
import * as path from "path"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import("sharp") = require("sharp")
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { convertIcon } from "app-builder-lib/out/util/iconConverter"

const FIXTURES = path.join(__dirname, "../fixtures")
const TEST_APP_ICONS = path.join(FIXTURES, "test-app-one/build")

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "icon-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// Create a minimal 512×512 PNG for testing
async function makePng(size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 100, g: 150, b: 200, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
}

async function writePng(size: number, filePath: string): Promise<void> {
  await writeFile(filePath, await makePng(size))
}

function parseIcns(data: Buffer): Map<string, Buffer> {
  const magic = data.toString("ascii", 0, 4)
  if (magic !== "icns") throw new Error(`Not an ICNS file (got ${magic})`)
  const entries = new Map<string, Buffer>()
  let offset = 8
  while (offset < data.length) {
    if (offset + 8 > data.length) break
    const ostype = data.toString("ascii", offset, offset + 4)
    const len = data.readUInt32BE(offset + 4)
    if (len < 8) break
    entries.set(ostype, data.subarray(offset + 8, offset + len))
    offset += len
  }
  return entries
}

describe("convertIcon – ICNS output", () => {
  it("converts a 512×512 PNG to a valid ICNS file", async () => {
    const srcFile = path.join(tmpDir, "icon.png")
    await writePng(512, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "icns", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    const outFile = result.icons[0].file
    const data = await readFile(outFile)

    // Validate ICNS magic
    expect(data.toString("ascii", 0, 4)).toBe("icns")
    // Total length field should match actual file size
    expect(data.readUInt32BE(4)).toBe(data.length)

    // Parse entries — must contain ic09 (512px) and/or ic08 (256px)
    const entries = parseIcns(data)
    expect(entries.has("ic09") || entries.has("ic14")).toBe(true)
    expect(entries.has("ic08") || entries.has("ic13")).toBe(true)
  })

  it("uses pre-built sized PNGs from icon directory", async () => {
    // The fixture build dir has icons/ (16,32,48,64,128,256,512) and icon.icns.
    // With empty sources, the auto-fallback resolves icon.icns directly (size 0)
    // OR converts the icons/ directory to an ICNS. Either way the icon path
    // must be a valid non-empty result.
    const iconsDir = TEST_APP_ICONS
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([], [], [iconsDir], "icns", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons.length).toBeGreaterThan(0)
    // The first result must be a readable file
    const { readFile: rf } = await import("fs/promises")
    const data = await rf(result.icons[0].file)
    expect(data.length).toBeGreaterThan(0)
  })

  it("does not upscale — skips sizes larger than source", async () => {
    // 512px source: should produce 512 and below, but NOT 1024
    const srcFile = path.join(tmpDir, "icon.png")
    await writePng(512, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "icns", outDir)

    expect(result.error).toBeUndefined()
    const data = await readFile(result.icons[0].file)
    const entries = parseIcns(data)
    // 1024 should NOT be present (upscaling is forbidden)
    expect(entries.has("ic10")).toBe(false) // 1024px would require upscaling
    // 512 and 256 should be present
    expect(entries.has("ic09") || entries.has("ic14")).toBe(true)
    expect(entries.has("ic08") || entries.has("ic13")).toBe(true)
  })

  it("rejects a source PNG smaller than 512px with an error", async () => {
    const srcFile = path.join(tmpDir, "small.png")
    await writePng(128, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "icns", outDir)

    expect(result.error).toBeDefined()
    expect(result.errorCode).toBeDefined()
    expect(result.icons).toHaveLength(0)
  })

  it("returns isFallback=true and uses fallback sources when primary is missing", async () => {
    const fallbackFile = path.join(tmpDir, "fallback.png")
    await writePng(512, fallbackFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon(["nonexistent.png"], [fallbackFile], [tmpDir], "icns", outDir)

    expect(result.error).toBeUndefined()
    expect(result.isFallback).toBe(true)
    expect(result.icons.length).toBeGreaterThan(0)
  })
})

describe("convertIcon – ICO output", () => {
  it("converts a 512×512 PNG to a valid ICO file", async () => {
    const srcFile = path.join(tmpDir, "icon.png")
    await writePng(512, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "ico", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    const data = await readFile(result.icons[0].file)

    // ICO magic: first 4 bytes = 00 00 01 00
    expect(data[0]).toBe(0)
    expect(data[1]).toBe(0)
    expect(data[2]).toBe(1)
    expect(data[3]).toBe(0)
    // Image count = 1
    expect(data.readUInt16LE(4)).toBe(1)
  })

  it("clamps ICO output to 256×256 even for larger source", async () => {
    const srcFile = path.join(tmpDir, "icon.png")
    await writePng(1024, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "ico", outDir)

    expect(result.error).toBeUndefined()
    const data = await readFile(result.icons[0].file)
    const dirWidth = data[6] // width=0 means 256
    expect(dirWidth).toBe(0) // 0 = 256 in ICO format
  })

  it("rejects source smaller than 256px", async () => {
    const srcFile = path.join(tmpDir, "tiny.png")
    await writePng(64, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "ico", outDir)

    expect(result.error).toBeDefined()
  })
})

describe("convertIcon – set output (Linux)", () => {
  it("returns source PNG directly for set format (matches Go behavior)", async () => {
    // Go returns a single icon for PNG→set (PNG already has target extension .png)
    const srcFile = path.join(tmpDir, "icon.png")
    await writePng(512, srcFile)
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([srcFile], [], [tmpDir], "set", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    expect(result.icons[0].file).toBe(srcFile)
    expect(result.icons[0].size).toBe(512)
  })

  it("uses pre-existing sized PNGs from a directory", async () => {
    const iconsDir = path.join(TEST_APP_ICONS, "icons")
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([iconsDir], [], [], "set", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons.length).toBeGreaterThan(0)
    // Should return the existing files, not regenerate them
    for (const icon of result.icons) {
      expect(icon.size).toBeGreaterThan(0)
    }
  })
})

describe("convertIcon – file resolution", () => {
  it("resolves icon by name from roots directory", async () => {
    const { mkdir } = await import("fs/promises")
    const buildDir = path.join(tmpDir, "build")
    await mkdir(buildDir, { recursive: true })
    const iconPath = path.join(buildDir, "icon.png")
    await writePng(512, iconPath)
    const outDir = path.join(tmpDir, "out")

    // Source = "icon" (no extension), roots = [buildDir]
    const result = await convertIcon(["icon"], [], [buildDir], "icns", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons.length).toBeGreaterThan(0)
  })

  it("returns empty icons when no source found and no fallback", async () => {
    const outDir = path.join(tmpDir, "out")
    const result = await convertIcon([], [], [tmpDir], "icns", outDir)
    expect(result.icons).toHaveLength(0)
  })
})
