import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises"
import * as path from "path"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import("sharp") = require("sharp")

export type IconFormat = "icns" | "ico" | "set"

export interface IconInfo {
  file: string
  size: number
}

export interface IconConvertResult {
  icons: IconInfo[]
  isFallback: boolean
  error?: string
  errorCode?: string
}

// ICNS size variants and their Apple OSType codes (ported from Go icns.go)
const ICNS_EXPECTED_SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICNS_SIZE_TO_TYPES: Record<number, string[]> = {
  16: ["icp4"],
  32: ["ic11"],
  64: ["ic12"],
  128: ["ic07"],
  256: ["ic08", "ic13"],
  512: ["ic09", "ic14"],
  1024: ["ic10"],
}
const ICNS_MAGIC = Buffer.from([0x69, 0x63, 0x6e, 0x73]) // "icns"

// Linux icon set sizes (from go icns-to-png.go icnsTypeToSize)
const SET_SIZES = [16, 32, 48, 64, 128, 256, 512]

// ─── ICNS writer ───────────────────────────────────────────────────────────

function buildIcnsEntry(size: number, png: Buffer): Buffer {
  const types = ICNS_SIZE_TO_TYPES[size]
  // Each OSType produces one entry: 4-byte ostype + 4-byte length (data + 8) + png data
  const parts: Buffer[] = []
  const lengthBuf = Buffer.allocUnsafe(4)
  lengthBuf.writeUInt32BE(png.length + 8, 0)
  for (const ostype of types) {
    parts.push(Buffer.from(ostype, "ascii"), lengthBuf, png)
  }
  return Buffer.concat(parts)
}

async function convertToIcns(sourceFile: string, sizeToPath: Map<number, string>, maxSize: number, outFile: string): Promise<void> {
  const entries: Buffer[] = []

  for (const size of ICNS_EXPECTED_SIZES) {
    if (size > maxSize) {
      continue
    } // never upscale

    let pngData: Buffer
    const existingPath = sizeToPath.get(size)
    if (existingPath) {
      pngData = await readFile(existingPath)
    } else {
      if (size === 16) {
        // Go: skip 16×16 unless explicitly provided (AppIcon Generator doesn't generate from source)
        continue
      }
      pngData = await sharp(sourceFile).resize(size, size, { kernel: "lanczos3", fit: "fill" }).png().toBuffer()
    }

    entries.push(await buildIcnsEntry(size, pngData))
  }

  const body = Buffer.concat(entries)
  const totalLen = Buffer.allocUnsafe(4)
  totalLen.writeUInt32BE(body.length + 8, 0)

  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, Buffer.concat([ICNS_MAGIC, totalLen, body]))
}

// ─── ICO writer ─────────────────────────────────────────────────────────────

async function convertToIco(sourceFile: string, maxSize: number, outFile: string): Promise<void> {
  // ICO format: 6-byte header + N×16-byte directory entries + raw PNG data
  // We embed a single 256×256 PNG (max accepted by Windows for app icons)
  const icoSize = Math.min(maxSize, 256)
  const pngData = await sharp(sourceFile).resize(icoSize, icoSize, { kernel: "lanczos3", fit: "fill" }).png().toBuffer()

  // ICO directory header (single image)
  const header = Buffer.allocUnsafe(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = ICO
  header.writeUInt16LE(1, 4) // image count

  // Directory entry (16 bytes)
  const dirEntry = Buffer.allocUnsafe(16)
  dirEntry.writeUInt8(icoSize >= 256 ? 0 : icoSize, 0) // width (0 = 256)
  dirEntry.writeUInt8(icoSize >= 256 ? 0 : icoSize, 1) // height
  dirEntry.writeUInt8(0, 2) // color count
  dirEntry.writeUInt8(0, 3) // reserved
  dirEntry.writeUInt16LE(1, 4) // color planes
  dirEntry.writeUInt16LE(32, 6) // bits per pixel
  dirEntry.writeUInt32LE(pngData.length, 8) // image data size
  dirEntry.writeUInt32LE(6 + 16, 12) // offset to image data

  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, Buffer.concat([header, dirEntry, pngData]))
}

// ─── Set writer (Linux) ──────────────────────────────────────────────────────

async function buildLinuxSet(sourceFile: string, maxSize: number, outDir: string): Promise<IconInfo[]> {
  await mkdir(outDir, { recursive: true })
  const result: IconInfo[] = [{ file: sourceFile, size: maxSize }]

  await Promise.all(
    SET_SIZES.filter(s => s < maxSize).map(async size => {
      const outFile = path.join(outDir, `icon_${size}x${size}.png`)
      await sharp(sourceFile).resize(size, size, { kernel: "lanczos3", fit: "fill" }).png().toFile(outFile)
      result.push({ file: outFile, size })
    })
  )

  result.sort((a, b) => a.size - b.size)
  return result
}

// ─── File resolution (matches go fileResolver.go + icon-converter.go) ────────

function imageHasExtension(name: string, format: string): boolean {
  return name.endsWith("." + format) || name.endsWith(".png") || name.endsWith(".ico") || name.endsWith(".svg") || name.endsWith(".icns")
}

function buildSourceCandidates(sources: string[], format: IconFormat): string[] {
  const result: string[] = []
  for (const src of sources) {
    if (imageHasExtension(src, format)) {
      result.push(src)
    } else {
      if (format !== "set") {
        result.push(src + "." + format)
      }
      result.push(src)
      result.push(src + ".png")
      if (format !== "icns") {
        result.push(src + ".icns")
        if (format !== "ico") {
          result.push(src + ".ico")
        }
      }
    }
  }
  // Auto-append standard fallback names (mirrors go createCommonIconSources)
  for (const [nameBase, setName] of [
    ["icon", "icons"],
    ["icon", "icon"],
  ] as [string, string][]) {
    if (format !== "set") {
      result.push(nameBase + "." + format)
    }
    result.push(setName)
    result.push(nameBase + ".png")
    if (format !== "icns") {
      result.push(nameBase + ".icns")
      if (format !== "ico") {
        result.push(nameBase + ".ico")
      }
    }
  }
  return result
}

async function resolveSourceFile(candidates: string[], roots: string[]): Promise<{ resolved: string; isDir: boolean } | null> {
  for (const candidate of candidates) {
    const absPath = path.isAbsolute(candidate) ? path.normalize(candidate) : null
    const searchPaths = absPath ? [absPath] : roots.map(r => path.join(r, candidate))

    for (const p of searchPaths) {
      try {
        const s = await stat(p)
        return { resolved: p, isDir: s.isDirectory() }
      } catch {
        // not found, try next
      }
    }
  }
  return null
}

// ─── Directory icon collection (go collect-icons.go) ────────────────────────

async function collectIconsFromDir(dir: string): Promise<{ icons: IconInfo[]; fallbackFile: string | null }> {
  const entries = await readdir(dir)
  const sizeMap = new Map<number, IconInfo>()
  let fallbackFile: string | null = null

  for (const name of entries) {
    if (!name.endsWith(".png") && !name.endsWith(".PNG")) {
      continue
    }
    if (name === "icon.png") {
      fallbackFile = path.join(dir, name)
      continue
    }
    const match = name.match(/(\d+)/)
    if (!match) {
      continue
    }
    const size = parseInt(match[1], 10)
    if (isNaN(size)) {
      continue
    }
    const filePath = path.join(dir, name)
    const existing = sizeMap.get(size)
    if (!existing || name.length < path.basename(existing.file).length) {
      sizeMap.set(size, { file: filePath, size })
    }
  }

  const icons = Array.from(sizeMap.values()).sort((a, b) => a.size - b.size)
  return { icons, fallbackFile }
}

// ─── ICO header parser (sharp does not support .ico input) ──────────────────

// Returns max dimension on success, or null if the file is not a valid ICO
// (magic = 0x00 0x00 0x01 0x00). Mirrors Go's IsIco() check.
async function getIcoMaxSize(filePath: string): Promise<number | null> {
  const buf = await readFile(filePath)
  // ICO magic: bytes 0-1 = 0x0000, bytes 2-3 = 0x0001
  if (buf.length < 6 || buf[0] !== 0 || buf[1] !== 0 || buf[2] !== 1 || buf[3] !== 0) {
    return null
  }
  const count = buf.readUInt16LE(4)
  let max = 0
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16
    if (off + 2 > buf.length) {
      break
    }
    // ICO: width/height byte of 0 means 256
    const w = buf[off] || 256
    const h = buf[off + 1] || 256
    if (w > max) {
      max = w
    }
    if (h > max) {
      max = h
    }
  }
  return max
}

// ─── Main conversion logic ───────────────────────────────────────────────────

async function doConvertIcon(candidates: string[], roots: string[], format: IconFormat, outDir: string): Promise<IconInfo[] | null> {
  const found = await resolveSourceFile(candidates, roots)
  if (!found) {
    return null
  }

  const { resolved, isDir } = found
  const outExt = format === "set" ? ".png" : "." + format

  // If source already has the target extension (and is not a directory), return it directly
  if (!isDir && resolved.endsWith(outExt)) {
    if (format === "icns") {
      return [{ file: resolved, size: 0 }]
    }
    if (format === "ico") {
      // sharp cannot read ICO; parse the header directly to get max dimension
      const size = await getIcoMaxSize(resolved)
      if (size === null) {
        return { error: `Icon is not a valid ICO file: ${resolved}`, errorCode: "ERR_ICON_UNKNOWN_FORMAT" } as any
      }
      if (size < 256) {
        return { error: `Icon must be at least 256x256 pixels, provided: ${size}x${size}`, errorCode: "ERR_ICON_TOO_SMALL" } as any
      }
      return [{ file: resolved, size }]
    }
    const meta = await sharp(resolved).metadata()
    const size = Math.max(meta.width ?? 0, meta.height ?? 0)
    return [{ file: resolved, size }]
  }

  // Handle SVG source for set format
  if (!isDir && resolved.endsWith(".svg") && format === "set") {
    return [{ file: resolved, size: 1024 }]
  }

  if (isDir) {
    // Directory: collect numbered PNGs, or fall back to icon.png
    const { icons, fallbackFile } = await collectIconsFromDir(resolved)

    if (format === "set") {
      if (icons.length > 0) {
        return icons
      }
      if (fallbackFile) {
        const meta = await sharp(fallbackFile).metadata()
        const maxSize = Math.max(meta.width ?? 0, meta.height ?? 0)
        return buildLinuxSet(fallbackFile, maxSize, outDir)
      }
      return null
    }

    if (icons.length > 0) {
      const sizeToPath = new Map(icons.map(i => [i.size, i.file]))
      const maxIcon = icons[icons.length - 1]
      const outFile = path.join(outDir, "icon" + outExt)
      if (format === "icns") {
        await convertToIcns(maxIcon.file, sizeToPath, maxIcon.size, outFile)
      } else {
        await convertToIco(maxIcon.file, maxIcon.size, outFile)
      }
      return [{ file: outFile, size: maxIcon.size }]
    }

    // No numbered PNGs — use icon.png fallback
    if (fallbackFile) {
      return doConvertSingleFile(fallbackFile, format, outDir)
    }
    return null
  }

  // Single file source: ICNS → ico or set (sharp cannot read ICNS natively)
  if (resolved.endsWith(".icns") && format !== "icns") {
    const data = await readFile(resolved)
    const extracted = await extractLargestFromIcns(data)
    if (!extracted) {
      return null
    }
    const meta = await sharp(extracted).metadata()
    const maxSize = Math.max(meta.width ?? 0, meta.height ?? 0)
    await mkdir(outDir, { recursive: true })
    if (format === "set") {
      const extractedPng = path.join(outDir, `icon_${maxSize}x${maxSize}.png`)
      await writeFile(extractedPng, extracted)
      return buildLinuxSet(extractedPng, maxSize, outDir)
    }
    // format === "ico": resize the extracted PNG to ≤256 and write ICO
    const icoSize = Math.min(maxSize, 256)
    const resized = await sharp(extracted).resize(icoSize, icoSize, { kernel: "lanczos3", fit: "fill" }).png().toBuffer()
    const outFile = path.join(outDir, "icon.ico")
    const header = Buffer.allocUnsafe(6)
    header.writeUInt16LE(0, 0)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(1, 4)
    const dir = Buffer.allocUnsafe(16)
    dir.writeUInt8(icoSize >= 256 ? 0 : icoSize, 0)
    dir.writeUInt8(icoSize >= 256 ? 0 : icoSize, 1)
    dir.writeUInt8(0, 2)
    dir.writeUInt8(0, 3)
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(resized.length, 8)
    dir.writeUInt32LE(6 + 16, 12)
    await writeFile(outFile, Buffer.concat([header, dir, resized]))
    return [{ file: outFile, size: icoSize }]
  }

  return doConvertSingleFile(resolved, format, outDir)
}

async function doConvertSingleFile(sourceFile: string, format: IconFormat, outDir: string): Promise<IconInfo[] | null> {
  const img = sharp(sourceFile)
  const meta = await img.metadata()
  const maxSize = Math.max(meta.width ?? 0, meta.height ?? 0)

  if (maxSize === 0) {
    return null
  }

  const recommendedMin = format === "icns" ? 512 : 256
  if (maxSize < recommendedMin) {
    return {
      error: `Icon must be at least ${recommendedMin}x${recommendedMin} pixels, provided: ${maxSize}x${maxSize}`,
      errorCode: "ERR_ICON_TOO_SMALL",
    } as any
  }

  const outExt = format === "set" ? ".png" : "." + format
  const outFile = path.join(outDir, "icon" + outExt)
  await mkdir(outDir, { recursive: true })

  if (format === "icns") {
    await convertToIcns(sourceFile, new Map([[maxSize, sourceFile]]), maxSize, outFile)
    return [{ file: outFile, size: maxSize }]
  }

  if (format === "ico") {
    await convertToIco(sourceFile, maxSize, outFile)
    return [{ file: outFile, size: maxSize }]
  }

  // set format from single file
  return buildLinuxSet(sourceFile, maxSize, outDir)
}

// Extract the largest PNG from an ICNS binary (used for "set" format from ICNS source)
async function extractLargestFromIcns(data: Buffer): Promise<Buffer | null> {
  // Preferred types in priority order (largest first)
  const preferred = ["ic10", "ic09", "ic14", "ic08", "ic13"]
  const typeMap = new Map<string, { offset: number; length: number }>()

  let offset = 8 // skip 8-byte ICNS header
  while (offset < data.length) {
    if (offset + 8 > data.length) {
      break
    }
    const ostype = data.toString("ascii", offset, offset + 4)
    const entryLen = data.readUInt32BE(offset + 4)
    if (entryLen < 8) {
      break
    }
    const dataLen = entryLen - 8
    if (!["info", "TOC ", "icnV", "name"].includes(ostype)) {
      typeMap.set(ostype, { offset: offset + 8, length: dataLen })
    }
    offset += entryLen
  }

  for (const t of preferred) {
    const entry = typeMap.get(t)
    if (entry) {
      return data.subarray(entry.offset, entry.offset + entry.length)
    }
  }
  return null
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert icon sources to the target format.
 * Matches the behavior of the app-builder Go binary's `icon` command.
 */
export async function convertIcon(sources: string[], fallbackSources: string[], roots: string[], format: IconFormat, outDir: string): Promise<IconConvertResult> {
  const candidates = buildSourceCandidates(sources, format)

  let icons = await doConvertIcon(candidates, roots, format, outDir)

  let isFallback = false
  if (icons == null) {
    const fallbackCandidates = buildSourceCandidates(fallbackSources, format)
    icons = await doConvertIcon(fallbackCandidates, roots, format, outDir)
    isFallback = true
  }

  // Check if doConvertSingleFile returned an error object
  if (icons != null && (icons as any).error != null) {
    const err = icons as any
    return { icons: [], isFallback, error: err.error, errorCode: err.errorCode }
  }

  return { icons: icons ?? [], isFallback }
}
