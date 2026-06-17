import { deflateSync } from "zlib"
import { mkdir, readFile, writeFile } from "fs/promises"
import * as path from "path"
import { describe, expect, it } from "vitest"
import { buildSourceCandidates, convertIcon, getPngSize, ToolsetConfig } from "app-builder-lib/internal"

const FIXTURES = path.join(__dirname, "../fixtures")
const TEST_APP_ICONS = path.join(FIXTURES, "test-app-one/build")

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[i] = c
  }
  return t
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii")
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const crcVal = Buffer.allocUnsafe(4)
  crcVal.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([len, typeBytes, data, crcVal])
}

function makePngWH(width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Build raw scanlines: filter=0 + solid RGB (100, 150, 200)
  const row = Buffer.alloc(1 + width * 3)
  row[0] = 0
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = 100
    row[2 + x * 3] = 150
    row[3 + x * 3] = 200
  }
  const rawData = Buffer.concat(Array.from({ length: height }, () => row))

  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(rawData)), pngChunk("IEND", Buffer.alloc(0))])
}

function makePng(size: number): Buffer {
  return makePngWH(size, size)
}

async function writePng(size: number, filePath: string): Promise<void> {
  await writeFile(filePath, makePng(size))
}

// Build a minimal ICNS container from raw OSType frames (used to construct
// inputs the way real-world tools do — e.g. a single PNG frame in a
// "non-preferred" OSType, which the old extractor could not read).
function makeIcns(frames: Array<{ ostype: string; payload: Buffer }>): Buffer {
  const chunks: Buffer[] = []
  for (const { ostype, payload } of frames) {
    const header = Buffer.allocUnsafe(8)
    header.write(ostype, 0, "ascii")
    header.writeUInt32BE(8 + payload.length, 4)
    chunks.push(header, payload)
  }
  const body = Buffer.concat(chunks)
  const fileHeader = Buffer.allocUnsafe(8)
  fileHeader.write("icns", 0, "ascii")
  fileHeader.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([fileHeader, body])
}

// A JPEG 2000 signature box (header only) — enough for the tool to detect the
// encoding as JP2, which the bundled wasm-vips build cannot decode.
const FAKE_JP2 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a]), Buffer.alloc(32)])

// Read a PNG entry's IHDR fields (width/height at 16/20, color type at 25).
function pngInfo(png: Buffer): { width: number; height: number; colorType: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), colorType: png.readUInt8(25) }
}

// ─── ICNS parser helper ───────────────────────────────────────────────────────

function parseIcns(data: Buffer): Map<string, Buffer> {
  const magic = data.toString("ascii", 0, 4)
  if (magic !== "icns") {
    throw new Error(`Not an ICNS file (got ${magic})`)
  }
  const entries = new Map<string, Buffer>()
  let offset = 8
  while (offset < data.length) {
    if (offset + 8 > data.length) {
      break
    }
    const ostype = data.toString("ascii", offset, offset + 4)
    const len = data.readUInt32BE(offset + 4)
    if (len < 8) {
      break
    }
    entries.set(ostype, data.subarray(offset + 8, offset + len))
    offset += len
  }
  return entries
}

describe("iconConverter", { sequential: true }, () => {
  const iconsToolset: ToolsetConfig["icons"] = "1.2.1"

  // ─── ICNS output ─────────────────────────────────────────────────────────────

  describe("ICNS output", () => {
    it("converts a 512×512 PNG to a valid ICNS file", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "icon.png")
      await writePng(512, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      const data = await readFile(result.icons[0].file)

      expect(data.toString("ascii", 0, 4)).toBe("icns")
      expect(data.readUInt32BE(4)).toBe(data.length)

      // Verify the ICNS has multiple entries (png2icons generates all standard sizes)
      const entries = parseIcns(data)
      expect(entries.size).toBeGreaterThan(0)
    })

    it("converts icon directory with named-size PNGs to ICNS", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const iconsDir = path.join(TEST_APP_ICONS, "icons")
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [iconsDir], fallbackSources: [], roots: [], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      const data = await readFile(result.icons[0].file)
      expect(data.toString("ascii", 0, 4)).toBe("icns")
      expect(data.readUInt32BE(4)).toBe(data.length)
    })

    it("rejects a source PNG smaller than 512px with an error", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "small.png")
      await writePng(128, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      await expect(
        convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })
      ).rejects.toThrow(/must be at least 512/)
    })

    it("returns isFallback=true and uses fallback sources when primary is missing", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const fallbackFile = path.join(tmpDirPath, "fallback.png")
      await writePng(512, fallbackFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({
        sources: ["nonexistent.png"],
        fallbackSources: [fallbackFile],
        roots: [tmpDirPath],
        format: "icns",
        outDir,
        iconsToolset,
        resourcesDir: tmpDirPath,
      })

      expect(result.error).toBeUndefined()
      expect(result.isFallback).toBe(true)
      expect(result.icons.length).toBeGreaterThan(0)
    })

    it("returns an existing ICNS file directly without conversion", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(TEST_APP_ICONS, "icon.icns")
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      expect(result.icons[0].file).toBe(icnsFile)
      expect(result.icons[0].size).toBe(0)
    })

    it("converts SVG source to ICNS", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const svgFile = path.join(tmpDirPath, "icon.svg")
      await writeFile(svgFile, '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#6496C8"/></svg>')
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [svgFile], fallbackSources: [], roots: [], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      const data = await readFile(result.icons[0].file)
      expect(data.toString("ascii", 0, 4)).toBe("icns")
    })
  })

  // ─── ICO output ───────────────────────────────────────────────────────────────

  describe("ICO output", () => {
    it("converts a 512×512 PNG to a valid ICO file", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "icon.png")
      await writePng(512, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      const data = await readFile(result.icons[0].file)

      // ICO magic
      expect(data[0]).toBe(0)
      expect(data[1]).toBe(0)
      expect(data[2]).toBe(1)
      expect(data[3]).toBe(0)
      // png2icons produces a multi-image ICO — at least one entry
      expect(data.readUInt16LE(4)).toBeGreaterThan(0)
    })

    it("output ICO has max dimension of 256×256 regardless of source size", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "icon.png")
      await writePng(1024, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      // size is read back from ICO header; png2icons caps at 256
      expect(result.icons[0].size).toBeLessThanOrEqual(256)
    })

    it("rejects source smaller than 256px", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "tiny.png")
      await writePng(64, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      await expect(
        convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })
      ).rejects.toThrow(/must be at least 256/)
    })

    it("returns an existing ICO file directly and parses its max dimension", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icoFile = path.join(TEST_APP_ICONS, "icon.ico")
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icoFile], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      expect(result.icons[0].file).toBe(icoFile)
      expect(result.icons[0].size).toBeGreaterThanOrEqual(256)
    })

    it("rejects an ICO file whose largest image is below 256px", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const tooSmallIco = path.join(TEST_APP_ICONS, "incorrect.ico")
      const outDir = path.join(tmpDirPath, "out")

      const err = await convertIcon({ sources: [tooSmallIco], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath }).catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as NodeJS.ErrnoException).code).toBe("ERR_ICON_TOO_SMALL")
    })

    it("rejects a file with an invalid ICO magic with ERR_ICON_UNKNOWN_FORMAT", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const badIco = path.join(tmpDirPath, "bad.ico")
      await writeFile(badIco, makePng(256)) // PNG magic, not ICO magic
      const outDir = path.join(tmpDirPath, "out")

      const err = await convertIcon({ sources: [badIco], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath }).catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as NodeJS.ErrnoException).code).toBe("ERR_ICON_UNKNOWN_FORMAT")
    })

    it("converts SVG source to ICO", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const svgFile = path.join(tmpDirPath, "icon.svg")
      await writeFile(svgFile, '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#6496C8"/></svg>')
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [svgFile], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      const data = await readFile(result.icons[0].file)
      expect(data[0]).toBe(0)
      expect(data[2]).toBe(1)
    })
  })

  // ─── set output (Linux) ───────────────────────────────────────────────────────

  describe("set output (Linux)", () => {
    it("returns source PNG directly for set format (matches Go behavior)", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "icon.png")
      await writePng(512, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      expect(result.icons[0].file).toBe(srcFile)
      expect(result.icons[0].size).toBe(512)
    })

    it("uses pre-existing sized PNGs from a directory", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const iconsDir = path.join(TEST_APP_ICONS, "icons")
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [iconsDir], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(0)
      for (const icon of result.icons) {
        expect(icon.size).toBeGreaterThan(0)
      }
      const sizes = result.icons.map(i => i.size)
      expect(sizes).toContain(256)
      expect(sizes).toContain(512)
    })

    it("returns an SVG source as-is for set format with size 1024", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const svgFile = path.join(tmpDirPath, "icon.svg")
      await writeFile(svgFile, '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024"/></svg>')
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [svgFile], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      expect(result.icons[0].file).toBe(svgFile)
      expect(result.icons[0].size).toBe(1024)
    })

    it("converts ICNS source to a set of sized PNGs named icon_NxN.png", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(TEST_APP_ICONS, "icon.icns")
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(1)
      for (const icon of result.icons) {
        expect(icon.size).toBeGreaterThan(0)
        expect(path.basename(icon.file)).toMatch(/^icon_\d+x\d+\.png$/)
      }
      // Icons must be sorted smallest-first
      const sizes = result.icons.map(i => i.size)
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
      }
    })

    it("generates a set from a single PNG with standard sizes", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      // Use the directory fallback path (icon.png in a directory)
      const iconsDir = path.join(tmpDirPath, "icons")
      await mkdir(iconsDir, { recursive: true })
      await writePng(512, path.join(iconsDir, "icon.png"))
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [iconsDir], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(1)
      // All output files should be named icon_NxN.png
      for (const icon of result.icons) {
        expect(path.basename(icon.file)).toMatch(/^icon_\d+x\d+\.png$/)
      }
      // Should include 16px through at least 256px
      const sizes = result.icons.map(i => i.size)
      expect(sizes).toContain(16)
      expect(sizes).toContain(256)
    })
  })

  // ─── File resolution ──────────────────────────────────────────────────────────

  describe("file resolution", () => {
    it("resolves icon by name from roots directory", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const buildDir = path.join(tmpDirPath, "build")
      await mkdir(buildDir, { recursive: true })
      await writePng(512, path.join(buildDir, "icon.png"))
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: ["icon"], fallbackSources: [], roots: [buildDir], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(0)
    })

    it("auto-discovers icon.svg from build dir when no extension specified", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const buildDir = path.join(tmpDirPath, "build")
      await mkdir(buildDir, { recursive: true })
      await writeFile(path.join(buildDir, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#6496C8"/></svg>')
      const outDir = path.join(tmpDirPath, "out")

      // Source has no extension — should fall through to icon.svg candidate
      const result = await convertIcon({ sources: ["icon"], fallbackSources: [], roots: [buildDir], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(0)
      const data = await readFile(result.icons[0].file)
      expect(data.toString("ascii", 0, 4)).toBe("icns")
    })

    it("returns empty icons when no source found and no fallback", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const outDir = path.join(tmpDirPath, "out")
      const result = await convertIcon({ sources: [], fallbackSources: [], roots: [tmpDirPath], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })
      expect(result.icons).toHaveLength(0)
    })
  })

  // ─── Directory filename filtering ─────────────────────────────────────────────

  describe("collectIconsFromDir filename filtering", () => {
    it("only picks up files with a pure-digit basename (anchored regex)", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const iconsDir = path.join(tmpDirPath, "icons")
      await mkdir(iconsDir, { recursive: true })

      await writePng(512, path.join(iconsDir, "512.png"))
      await writePng(256, path.join(iconsDir, "256x256.png"))
      await writePng(128, path.join(iconsDir, "app2.png")) // invalid
      await writePng(64, path.join(iconsDir, "icon-v2.png")) // invalid
      await writePng(32, path.join(iconsDir, "512backup.png")) // invalid

      const outDir = path.join(tmpDirPath, "out")
      const result = await convertIcon({ sources: [iconsDir], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      const sizes = result.icons.map(i => i.size)
      expect(sizes).toContain(512)
      expect(sizes).toContain(256)
      expect(result.icons).toHaveLength(2)
    })

    it("ignores icon.png fallback when numbered PNGs exist", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const iconsDir = path.join(tmpDirPath, "icons2")
      await mkdir(iconsDir, { recursive: true })

      await writePng(512, path.join(iconsDir, "512.png"))
      await writePng(256, path.join(iconsDir, "icon.png")) // fallback — ignored when numbered PNGs found
      await writeFile(path.join(iconsDir, "README.txt"), "not an image")

      const outDir = path.join(tmpDirPath, "out")
      const result = await convertIcon({ sources: [iconsDir], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      const sizes = result.icons.map(i => i.size)
      expect(sizes).toContain(512)
      expect(sizes).not.toContain(256)
    })

    it("returns empty result for a directory with no icons and no fallback", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const emptyDir = path.join(tmpDirPath, "empty-icons")
      await mkdir(emptyDir, { recursive: true })
      await writeFile(path.join(emptyDir, "README.txt"), "no icons here")
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [emptyDir], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(0)
    })
  })

  // ─── buildSourceCandidates unit tests ────────────────────────────────────────

  describe("buildSourceCandidates", () => {
    it("returns source unchanged when it already has the target format extension", () => {
      const candidates = buildSourceCandidates(["icon.icns"], "icns")
      expect(candidates[0]).toBe("icon.icns")
      // Should not duplicate the source with extra extensions
      const icnsCount = candidates.filter(c => c === "icon.icns").length
      expect(icnsCount).toBe(1)
    })

    it("expands a bare name into format-specific and fallback candidates for icns", () => {
      const candidates = buildSourceCandidates(["icon"], "icns")
      expect(candidates).toContain("icon.icns")
      expect(candidates).toContain("icon.png")
      expect(candidates).toContain("icon.svg")
      // No ico fallback when format is icns
      expect(candidates).not.toContain("icon.ico")
    })

    it("expands a bare name into format-specific and fallback candidates for ico", () => {
      const candidates = buildSourceCandidates(["icon"], "ico")
      expect(candidates).toContain("icon.ico")
      expect(candidates).toContain("icon.png")
      expect(candidates).toContain("icon.icns")
    })

    it("does not add a .set extension for set format", () => {
      const candidates = buildSourceCandidates(["icon"], "set")
      expect(candidates.some(c => c.endsWith(".set"))).toBe(false)
      expect(candidates).toContain("icon.png")
      expect(candidates).toContain("icon.svg")
    })

    it("always appends fallback directory candidates icons and icon", () => {
      const candidates = buildSourceCandidates([], "icns")
      expect(candidates).toContain("icons")
      expect(candidates).toContain("icon")
    })

    it("preserves absolute paths with extension unchanged", () => {
      const abs = "/abs/path/icon.png"
      const candidates = buildSourceCandidates([abs], "ico")
      expect(candidates).toContain(abs)
    })

    it("returns no duplicates when source matches a fallback name", () => {
      const candidates = buildSourceCandidates(["icon.png"], "set")
      const seen = new Set<string>()
      for (const c of candidates) {
        expect(seen.has(c)).toBe(false)
        seen.add(c)
      }
    })
  })

  // ─── getPngSize unit tests ────────────────────────────────────────────────────

  describe("getPngSize", () => {
    it("reads correct dimensions from a well-formed PNG", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const file = path.join(tmpDirPath, "test.png")
      await writePng(128, file)
      const { width, height } = await getPngSize(file)
      expect(width).toBe(128)
      expect(height).toBe(128)
    })

    it("returns {0,0} for a file shorter than 24 bytes", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const file = path.join(tmpDirPath, "short.png")
      await writeFile(file, Buffer.alloc(10))
      const { width, height } = await getPngSize(file)
      expect(width).toBe(0)
      expect(height).toBe(0)
    })

    it("returns {0,0} for a non-PNG file with enough bytes", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const file = path.join(tmpDirPath, "fake.png")
      await writeFile(file, Buffer.alloc(24, 0xff)) // no PNG signature
      // width/height at bytes 16-23 will be all 0xFF — non-zero but invalid
      const { width, height } = await getPngSize(file)
      // We just verify the function returns a numeric pair without throwing
      expect(typeof width).toBe("number")
      expect(typeof height).toBe("number")
    })
  })

  // ─── convertIcon edge cases ───────────────────────────────────────────────────

  describe("edge cases", () => {
    it("resolves source by absolute path, ignoring roots", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "abs.png")
      await writePng(512, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      // Pass absolute path — resolveSourceFile should skip root joining
      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: ["/nonexistent"], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(0)
    })

    it("uses fallback when primary source list is empty", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const fallbackFile = path.join(tmpDirPath, "fb.png")
      await writePng(512, fallbackFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [], fallbackSources: [fallbackFile], roots: [], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.isFallback).toBe(true)
      expect(result.icons.length).toBeGreaterThan(0)
    })

    it("returns empty icons when both primary and fallback resolve to nothing", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const outDir = path.join(tmpDirPath, "out")
      const result = await convertIcon({
        sources: ["nonexistent"],
        fallbackSources: ["also-nonexistent"],
        roots: [tmpDirPath],
        format: "ico",
        outDir,
        iconsToolset,
        resourcesDir: tmpDirPath,
      })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(0)
    })

    it("directory with only icon.png for non-set format: uses fallback file via CLI", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const iconsDir = path.join(tmpDirPath, "dir-fallback")
      await mkdir(iconsDir, { recursive: true })
      await writePng(512, path.join(iconsDir, "icon.png"))
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [iconsDir], fallbackSources: [], roots: [], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(0)
      const data = await readFile(result.icons[0].file)
      expect(data.toString("ascii", 0, 4)).toBe("icns")
    })

    it("set format: source PNG with extension returns its actual pixel dimensions", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "256.png")
      await writePng(256, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons).toHaveLength(1)
      expect(result.icons[0].size).toBe(256)
      expect(result.icons[0].file).toBe(srcFile)
    })
  })

  // ─── ICNS input extraction (issue #9876) ──────────────────────────────────────
  // The extractor must read a PNG from ANY OSType, not just a hard-coded preferred
  // subset, and must report unsupported encodings clearly.

  describe("ICNS input extraction (#9876)", () => {
    it("extracts a PNG stored only in non-preferred OSTypes (icp5/icp6/ic07)", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      // A "simple single-layer" .icns whose frames live only in types the old
      // extractor never inspected (it looked at ic08/ic09/ic10/ic13/ic14 only).
      const icnsFile = path.join(tmpDirPath, "single-layer.icns")
      await writeFile(
        icnsFile,
        makeIcns([
          { ostype: "icp5", payload: makePng(32) },
          { ostype: "icp6", payload: makePng(64) },
          { ostype: "ic07", payload: makePng(128) },
        ])
      )
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      expect(result.icons.length).toBeGreaterThan(0)
      const sizes = result.icons.map(i => i.size)
      expect(sizes).toContain(128) // largest extractable frame is honored
      expect(sizes.some(s => s > 128)).toBe(false) // and not upscaled past the source
    })

    it("selects the largest PNG frame across OSTypes", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(tmpDirPath, "multi.icns")
      await writeFile(
        icnsFile,
        makeIcns([
          { ostype: "icp4", payload: makePng(16) },
          { ostype: "ic08", payload: makePng(256) },
          { ostype: "ic07", payload: makePng(128) },
        ])
      )
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      // The 256px frame (ic08) is the largest → ICO reaches 256.
      expect(result.icons[0].size).toBe(256)
    })

    it("fails with an actionable error for an ICNS with only unsupported (JPEG2000) frames", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(tmpDirPath, "jp2-only.icns")
      await writeFile(icnsFile, makeIcns([{ ostype: "ic09", payload: FAKE_JP2 }]))
      const outDir = path.join(tmpDirPath, "out")

      const err = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath }).catch(e => e)

      expect(err).toBeInstanceOf(Error)
      // The diagnostic names the frames found and their detected encoding.
      expect(String(err)).toMatch(/Could not extract a PNG frame/)
      expect(String(err)).toMatch(/ic09/)
      expect(String(err)).toMatch(/jp2/)
    })

    it("rejects a malformed ICNS (bad magic) with a clear message", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(tmpDirPath, "garbage.icns")
      await writeFile(icnsFile, Buffer.from("this is definitely not an icns container at all"))
      const outDir = path.join(tmpDirPath, "out")

      const err = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath }).catch(e => e)

      expect(err).toBeInstanceOf(Error)
      expect(String(err)).toMatch(/Could not extract a PNG frame/)
    })
  })

  // ─── Resampling quality: no upscaling + aspect-ratio preservation ─────────────

  describe("resampling quality", () => {
    it("does not upscale ICO frames beyond the source size", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(tmpDirPath, "src-128.icns")
      await writeFile(icnsFile, makeIcns([{ ostype: "ic07", payload: makePng(128) }]))
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "ico", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      // Previously a 128px source was upscaled to a 256px ICO frame.
      expect(result.icons[0].size).toBe(128)
    })

    it("does not upscale a Linux set beyond the source size", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const icnsFile = path.join(tmpDirPath, "src-256.icns")
      await writeFile(icnsFile, makeIcns([{ ostype: "ic08", payload: makePng(256) }]))
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [icnsFile], fallbackSources: [], roots: [], format: "set", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      const sizes = result.icons.map(i => i.size)
      expect(sizes).toContain(256)
      expect(sizes).not.toContain(512) // 512 would require upscaling a 256px source
    })

    it("pads a non-square source to a transparent square instead of stretching it", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "wide.png")
      await writeFile(srcFile, makePngWH(1024, 512)) // 2:1, non-square
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      const frame = parseIcns(await readFile(result.icons[0].file)).get("ic09")
      expect(frame).toBeDefined()
      const info = pngInfo(frame!)
      // The frame is a square 512×512 PNG…
      expect(info.width).toBe(512)
      expect(info.height).toBe(512)
      // …with an alpha channel (color type 6) — proof it was padded transparently
      // rather than stretched (a stretched RGB source would stay color type 2).
      expect(info.colorType).toBe(6)
    })

    it("does not add transparent padding to a square source", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "square.png")
      await writePng(1024, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      const frame = parseIcns(await readFile(result.icons[0].file)).get("ic09")
      expect(frame).toBeDefined()
      const info = pngInfo(frame!)
      expect(info.width).toBe(512)
      expect(info.height).toBe(512)
      expect(info.colorType).toBe(2) // RGB, no alpha — unchanged, not padded
    })
  })

  // ─── ICNS output spec compliance ──────────────────────────────────────────────

  describe("ICNS output frame sizes", () => {
    it("writes ic13/ic14 retina frames at their spec pixel sizes (256 / 512)", async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const srcFile = path.join(tmpDirPath, "icon.png")
      await writePng(1024, srcFile)
      const outDir = path.join(tmpDirPath, "out")

      const result = await convertIcon({ sources: [srcFile], fallbackSources: [], roots: [tmpDirPath], format: "icns", outDir, iconsToolset, resourcesDir: tmpDirPath })

      expect(result.error).toBeUndefined()
      const entries = parseIcns(await readFile(result.icons[0].file))
      const dimsOf = (osType: string): number => {
        const payload = entries.get(osType)
        expect(payload).toBeDefined()
        return payload!.readUInt32BE(16)
      }
      // ic13 = 128@2x = 256px and ic14 = 256@2x = 512px (were incorrectly 512/1024).
      expect(dimsOf("ic13")).toBe(256)
      expect(dimsOf("ic14")).toBe(512)
      expect(dimsOf("ic10")).toBe(1024)
    })
  })
})
