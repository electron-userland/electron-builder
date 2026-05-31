import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
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

// Create a minimal PNG for testing
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

  it("converts icon directory with named-size PNGs to ICNS with correct entries", async () => {
    // The fixture icons/ dir has 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512 PNGs.
    // Pass it directly so collectIconsFromDir picks up the numbered files.
    const iconsDir = path.join(TEST_APP_ICONS, "icons")
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([iconsDir], [], [], "icns", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    const data = await readFile(result.icons[0].file)
    expect(data.toString("ascii", 0, 4)).toBe("icns")

    const entries = parseIcns(data)
    // 256px entry must be present (fixture has 256x256.png)
    expect(entries.has("ic08") || entries.has("ic13")).toBe(true)
    // 512px entry must be present (fixture has 512x512.png)
    expect(entries.has("ic09") || entries.has("ic14")).toBe(true)
    // 128px entry must be present (fixture has 128x128.png)
    expect(entries.has("ic07")).toBe(true)
    // 1024px must NOT be present — the fixture has no 1024×1024, so upscaling should be skipped
    expect(entries.has("ic10")).toBe(false)
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

  it("returns an existing ICNS file directly without conversion", async () => {
    const icnsFile = path.join(TEST_APP_ICONS, "icon.icns")
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([icnsFile], [], [], "icns", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    // Direct passthrough returns the source file unchanged, with size=0
    expect(result.icons[0].file).toBe(icnsFile)
    expect(result.icons[0].size).toBe(0)
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

  it("returns an existing ICO file directly and parses its max dimension", async () => {
    // icon.ico fixture has images up to 256×256
    const icoFile = path.join(TEST_APP_ICONS, "icon.ico")
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([icoFile], [], [], "ico", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    expect(result.icons[0].file).toBe(icoFile)
    expect(result.icons[0].size).toBeGreaterThanOrEqual(256)
  })

  it("rejects an ICO file whose largest image is below 256px", async () => {
    // incorrect.ico fixture is a valid ICO but only 32×32
    const tooSmallIco = path.join(TEST_APP_ICONS, "incorrect.ico")
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([tooSmallIco], [], [], "ico", outDir)

    expect(result.error).toBeDefined()
    expect(result.errorCode).toBe("ERR_ICON_TOO_SMALL")
  })

  it("rejects a file with an invalid ICO magic with ERR_ICON_UNKNOWN_FORMAT", async () => {
    // Write a file with .ico extension but corrupt magic bytes
    const badIco = path.join(tmpDir, "bad.ico")
    const fakePng = await makePng(256)
    await writeFile(badIco, fakePng) // PNG magic, not ICO magic
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([badIco], [], [], "ico", outDir)

    expect(result.error).toBeDefined()
    expect(result.errorCode).toBe("ERR_ICON_UNKNOWN_FORMAT")
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
    // Should return the existing files with valid pixel dimensions
    for (const icon of result.icons) {
      expect(icon.size).toBeGreaterThan(0)
    }
    // The fixture has 256×256 and 512×512 — both must appear
    const sizes = result.icons.map(i => i.size)
    expect(sizes).toContain(256)
    expect(sizes).toContain(512)
  })

  it("returns an SVG source as-is for set format with size 1024", async () => {
    const svgFile = path.join(tmpDir, "icon.svg")
    // Minimal SVG content — just needs to exist on disk
    await writeFile(svgFile, '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024"/></svg>')
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([svgFile], [], [], "set", outDir)

    expect(result.error).toBeUndefined()
    expect(result.icons).toHaveLength(1)
    expect(result.icons[0].file).toBe(svgFile)
    expect(result.icons[0].size).toBe(1024)
  })

  it("converts ICNS source to a set of sized PNGs", async () => {
    const icnsFile = path.join(TEST_APP_ICONS, "icon.icns")
    const outDir = path.join(tmpDir, "out")

    const result = await convertIcon([icnsFile], [], [], "set", outDir)

    expect(result.error).toBeUndefined()
    // Should produce multiple icons of different sizes
    expect(result.icons.length).toBeGreaterThan(1)
    for (const icon of result.icons) {
      expect(icon.size).toBeGreaterThan(0)
    }
    // Icons must be sorted smallest-first
    const sizes = result.icons.map(i => i.size)
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
    }
  })
})

describe("convertIcon – file resolution", () => {
  it("resolves icon by name from roots directory", async () => {
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

describe("convertIcon – collectIconsFromDir filename filtering", () => {
  it("only picks up files with a pure-digit basename (anchored regex)", async () => {
    // Create a directory mixing legitimate icon files with incidental-digit names
    const iconsDir = path.join(tmpDir, "icons")
    await mkdir(iconsDir, { recursive: true })

    await writePng(512, path.join(iconsDir, "512.png"))       // valid: pure digit basename
    await writePng(256, path.join(iconsDir, "256x256.png"))    // valid: NxN form
    await writePng(128, path.join(iconsDir, "app2.png"))       // invalid: incidental digit
    await writePng(64, path.join(iconsDir, "icon-v2.png"))     // invalid: digit in suffix
    await writePng(32, path.join(iconsDir, "512backup.png"))   // invalid: digit is prefix but has suffix

    const outDir = path.join(tmpDir, "out")
    const result = await convertIcon([iconsDir], [], [], "set", outDir)

    expect(result.error).toBeUndefined()
    const sizes = result.icons.map(i => i.size)
    // Only 512 (from "512.png") and 256 (from "256x256.png") should be collected
    expect(sizes).toContain(512)
    expect(sizes).toContain(256)
    // app2, icon-v2, and 512backup must NOT be picked up as icons of size 2 or 512
    // Total collected: exactly 2 entries
    expect(result.icons).toHaveLength(2)
  })

  it("ignores non-PNG files and icon.png fallback when numbered PNGs exist", async () => {
    const iconsDir = path.join(tmpDir, "icons2")
    await mkdir(iconsDir, { recursive: true })

    await writePng(512, path.join(iconsDir, "512.png"))
    await writePng(256, path.join(iconsDir, "icon.png")) // fallback — should be ignored when numbered PNGs found
    await writeFile(path.join(iconsDir, "README.txt"), "not an image")

    const outDir = path.join(tmpDir, "out")
    const result = await convertIcon([iconsDir], [], [], "set", outDir)

    expect(result.error).toBeUndefined()
    // Only 512.png should be in the set; icon.png is the fallback slot, not a numbered entry
    const sizes = result.icons.map(i => i.size)
    expect(sizes).toContain(512)
    expect(sizes).not.toContain(256)
  })
})
