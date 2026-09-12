// Benchmark (opt-in, never runs in CI): what does a ONE-LINE source change under app.asar cost on the
// wire with electron-builder + NSIS + electron-updater differential updates, and how does that cost
// move when the stored (Copy) asar region of the package is chunked with smaller content-defined
// blocks than the default 8/16/32 KiB Rabin chunker?
//
//   BENCH=1 TEST_FILES=differentialOneLineBenchTest pnpm ci:test
//
// Env knobs (all optional):
//   BENCH_ASAR_MB         target asar size in MiB                       (default 32)
//   BENCH_FILES           number of files in the synthetic app          (default 3000)
//   BENCH_RANGE_OVERHEAD  per-HTTP-range overhead in bytes              (default 120)
//   BENCH_OUT             directory to write results.json / results.md  (default: console only)
//   BENCH_ASAR_ALIGN      asar content alignment in bytes, 0 = off      (default 0; e.g. 512, 4096)
//
// BENCH_ASAR_ALIGN simulates an asar whose content region is laid out with every file's content
// start aligned to a fixed granularity (zero padding between files). The asar JSON header stores each
// file's `offset` as a decimal string, so a length change of ONE file shifts the offset of EVERY later
// file and re-downloads most of the header. With alignment, a small growth stays inside the file's own
// padding and no later offset moves (unless it crosses an alignment boundary). @electron/asar cannot
// lay out with padding today, so the asar produced by createPackage is re-laid out by a post-pass
// (`alignAsar` below) into `<name>.aligned.asar`, which is then used for the stored-asar rows (the
// compressed control keeps the original). The aligned asar is read back with @electron/asar's
// extractFile and compared byte-for-byte to the sources — a spec-conforming reader only follows the
// header's offset/size, so gaps between files are tolerated.
//
// Wire cost model (per update):
//   download bytes (sum of DOWNLOAD operations from electron-updater's computeOperations)
//   + new blockmap (gzipped; electron-updater re-downloads it in full on every update — only the
//     OLD blockmap is cached locally)
//   + #DOWNLOAD ranges × BENCH_RANGE_OVERHEAD (multipart range request overhead)
//
// The 7z package is built with exactly the options NsisTarget.buildAppPackage uses for a
// differential-aware installer (withoutDir, compression "normal", installTimeDecodable, dictSize 1,
// solid off) with `storedPaths: ["resources/app.asar"]` (PR #10186), and — as a control — the same
// options WITHOUT storedPaths (asar compressed with the rest, the pre-PR "100 % of the member"
// baseline). The 7z is embedded verbatim in the NSIS exe, so it is a faithful proxy for the installer.
//
// The region sweep targets `buildBlockMap(..., { regions })` (BuildBlockMapOptions). If the tree
// under test does not honor `regions` yet, the region rows are skipped and only the default rows run.

import { archive, ArchiveOptions } from "app-builder-lib/src/targets/archive"
import { buildBlockMap, BuildBlockMapOptions, ChunkerParams } from "app-builder-lib/src/targets/blockmap/blockmap"
import { configureDifferentialAwareArchiveOptions } from "app-builder-lib/src/targets/differentialUpdateInfoBuilder"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { BlockMap } from "builder-util-runtime"
import { computeOperations, OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { Logger } from "electron-updater/src/types"
import * as fs from "fs/promises"
import * as path from "path"
import * as zlib from "zlib"
import { describe, it } from "vitest"

// ─── parameters ───────────────────────────────────────────────────────────────

const ASAR_MB = Number(process.env.BENCH_ASAR_MB ?? 32)
const FILE_COUNT = Number(process.env.BENCH_FILES ?? 3000)
const RANGE_OVERHEAD = Number(process.env.BENCH_RANGE_OVERHEAD ?? 120)
const BENCH_OUT = process.env.BENCH_OUT
const ASAR_ALIGN = Number(process.env.BENCH_ASAR_ALIGN ?? 0)

const KiB = 1024
const DEFAULT_CONFIG_NAME = "default (8/16/32 KiB everywhere)"

interface SweepConfig {
  name: string
  /** Chunker applied to the asar region; null = no regions (default chunker everywhere). */
  asarChunker: ChunkerParams | null
}

const SWEEP: Array<SweepConfig> = [
  { name: DEFAULT_CONFIG_NAME, asarChunker: null },
  { name: "asar 4/8/16 KiB", asarChunker: { min: 4 * KiB, avg: 8 * KiB, max: 16 * KiB } },
  { name: "asar 2/4/8 KiB", asarChunker: { min: 2 * KiB, avg: 4 * KiB, max: 8 * KiB } },
  { name: "asar 1/2/4 KiB", asarChunker: { min: 1 * KiB, avg: 2 * KiB, max: 4 * KiB } },
  { name: "asar 512/1024/2048 B", asarChunker: { min: 512, avg: 1024, max: 2048 } },
]

// ─── deterministic synthetic app ──────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box–Muller standard normal from two uniforms
function gaussian(rand: () => number): number {
  const u = 1 - rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const WORDS = (
  "state props value result data item index count buffer stream handler callback options config context request response " +
  "error message payload token session user account cache entry node parent child element target source output input " +
  "queue worker task promise resolve reject emit listener event channel window document render update mount unmount " +
  "store dispatch action reducer selector module export import default async await static private public readonly " +
  "length offset size total chunk block hash digest encode decode parse format serialize normalize validate transform"
).split(" ")

function makeIdentifiers(rand: () => number, count: number): Array<string> {
  const ids: Array<string> = []
  for (let i = 0; i < count; i++) {
    const a = WORDS[Math.floor(rand() * WORDS.length)]
    const b = WORDS[Math.floor(rand() * WORDS.length)]
    ids.push(rand() < 0.4 ? a : a + b.charAt(0).toUpperCase() + b.slice(1))
  }
  return ids
}

// JS-like text: a handful of statement templates over a shared identifier vocabulary and random
// literals — compresses roughly like real bundled JS (≈3-4×), unlike either random bytes or a
// repeated string.
function makeJsLine(rand: () => number, ids: Array<string>, indent: number): string {
  const id = () => ids[Math.floor(rand() * ids.length)]
  const num = () => String(Math.floor(rand() * 100000))
  const pad = "  ".repeat(indent)
  switch (Math.floor(rand() * 9)) {
    case 0:
      return `${pad}const ${id()} = ${id()}(${id()}, ${num()});`
    case 1:
      return `${pad}if (${id()}.${id()} !== ${num()}) {`
    case 2:
      return `${pad}return ${id()}[${num()}] + ${id()}.${id()};`
    case 3:
      return `${pad}// ${id()} ${id()} ${id()} ${num()}`
    case 4:
      return `${pad}export function ${id()}${num()}(${id()}, ${id()}) {`
    case 5:
      return `${pad}}`
    case 6:
      return `${pad}${id()}.${id()} = require("./${id()}/${id()}.js");`
    case 7:
      return `${pad}this.${id()}.push({ ${id()}: ${num()}, ${id()}: "${id()}" });`
    default:
      return `${pad}${id()}.${id()}(${id()} => ${id()}(${id()}, ${num()}));`
  }
}

function makeJsFile(rand: () => number, ids: Array<string>, targetBytes: number): string {
  const lines: Array<string> = []
  let size = 0
  let indent = 0
  while (size < targetBytes) {
    const line = makeJsLine(rand, ids, indent)
    if (line.endsWith("{")) {
      indent = Math.min(indent + 1, 4)
    } else if (line.trim() === "}") {
      indent = Math.max(indent - 1, 0)
    }
    lines.push(line)
    size += line.length + 1
  }
  return lines.join("\n") + "\n"
}

interface SyntheticApp {
  /** relative path → content, in asar (sorted-path) order */
  files: Map<string, string>
  totalBytes: number
  bundlePaths: Array<string>
}

function generateApp(seed: number, fileCount: number, targetBytes: number): SyntheticApp {
  const rand = mulberry32(seed)
  const ids = makeIdentifiers(rand, 400)
  const dirsA = ["src", "src", "src", "lib", "dist", "node_modules/@scope/core", "node_modules/left-pad", "node_modules/ui-kit", "assets/js"]
  const dirsB = ["components", "util", "store", "api", "views", "helpers", "vendor", "renderer", "main"]

  const bundleCount = 4
  const bundleShare = 0.06 // each bundle ≈ 6 % of the asar
  const bundleBytes = Math.round(targetBytes * bundleShare)
  const smallTarget = targetBytes - bundleCount * bundleBytes
  const smallCount = Math.max(fileCount - bundleCount, 1)

  // log-normal-ish sizes (σ = 1.1) scaled so they sum to smallTarget, min 200 B
  const raw: Array<number> = []
  for (let i = 0; i < smallCount; i++) {
    raw.push(Math.exp(1.1 * gaussian(rand)))
  }
  const rawSum = raw.reduce((a, b) => a + b, 0)
  const sizes = raw.map(r => Math.max(200, Math.round((r / rawSum) * smallTarget)))

  const files = new Map<string, string>()
  const bundlePaths: Array<string> = []
  for (let i = 0; i < smallCount; i++) {
    const a = dirsA[Math.floor(rand() * dirsA.length)]
    const b = dirsB[Math.floor(rand() * dirsB.length)]
    const depth = rand()
    const dir = depth < 0.35 ? a : depth < 0.8 ? `${a}/${b}` : `${a}/${b}/${dirsB[Math.floor(rand() * dirsB.length)]}`
    const name = `${ids[Math.floor(rand() * ids.length)]}${i}.js`
    files.set(`${dir}/${name}`, makeJsFile(rand, ids, sizes[i]))
  }
  for (let i = 0; i < bundleCount; i++) {
    const p = `dist/bundle-${i}.js`
    bundlePaths.push(p)
    files.set(p, makeJsFile(rand, ids, bundleBytes))
  }
  files.set("package.json", JSON.stringify({ name: "bench-app", version: "1.0.0", main: "dist/bundle-0.js" }, null, 2) + "\n")

  // asar packs in sorted-path order (crawlfs sorts); keep the same order here so "middle of the
  // asar" can be reasoned about from this map.
  const sorted = new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  let totalBytes = 0
  for (const content of sorted.values()) {
    totalBytes += Buffer.byteLength(content)
  }
  return { files: sorted, totalBytes, bundlePaths }
}

async function writeTree(root: string, files: Map<string, string>): Promise<void> {
  const dirs = new Set<string>()
  for (const rel of files.keys()) {
    dirs.add(path.dirname(path.join(root, rel)))
  }
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true })
  }
  for (const [rel, content] of files) {
    await fs.writeFile(path.join(root, rel), content)
  }
}

// Picks the change target: among non-bundle files in the middle 40–60 % of the asar order (so a
// length change shifts offsets for roughly half of the header entries and half of the content),
// the one closest to 12 KiB.
function pickTargetFile(app: SyntheticApp): string {
  const paths = [...app.files.keys()].filter(p => !app.bundlePaths.includes(p) && p !== "package.json")
  const lo = Math.floor(paths.length * 0.4)
  const hi = Math.ceil(paths.length * 0.6)
  let best = paths[lo]
  let bestDist = Infinity
  for (let i = lo; i < hi; i++) {
    const dist = Math.abs(app.files.get(paths[i])!.length - 12 * KiB)
    if (dist < bestDist) {
      bestDist = dist
      best = paths[i]
    }
  }
  return best
}

// Deterministic same-length edit of one line: bump the first digit (the target line is chosen to
// contain one — see changeMiddleLine).
function editLineSameLength(line: string): string {
  const digit = line.search(/[0-9]/)
  return line.slice(0, digit) + String((Number(line[digit]) + 1) % 10) + line.slice(digit + 1)
}

// Edits the first line at or after the middle of the file that contains a digit (a bare `}` line
// has nothing to bump), so the "same length" and "+7 bytes" variants touch the same line.
function changeMiddleLine(content: string, edit: (line: string) => string): string {
  const lines = content.split("\n")
  let idx = Math.floor(lines.length / 2)
  while (idx < lines.length - 1 && !/[0-9]/.test(lines[idx])) {
    idx++
  }
  lines[idx] = edit(lines[idx])
  return lines.join("\n")
}

// ─── asar / 7z helpers ─────────────────────────────────────────────────────────

interface AsarApi {
  createPackage(src: string, dest: string): Promise<void>
  extractFile(archive: string, filename: string): Buffer
}

/** asar layout: [0,8) size pickle, [8, 8+headerSize) header pickle (JSON), then file contents. */
function readAsarHeaderBytes(asar: Buffer): number {
  return 8 + asar.readUInt32LE(4)
}

interface AsarFileNode {
  offset?: string
  size?: number
  unpacked?: boolean
  link?: string
  files?: Record<string, AsarFileNode>
}

/**
 * Parses the asar header JSON. Pickle framing (chromium-pickle-js, as @electron/asar writes it):
 *   size pickle   = uint32 LE payload size (4) + uint32 LE header pickle length            → 8 bytes
 *   header pickle = uint32 LE payload size + int32 LE string byte length + utf8 bytes + zero padding to 4
 */
function parseAsarHeader(asar: Buffer): { headerPickle: Buffer; json: string } {
  const headerPickle = asar.subarray(8, readAsarHeaderBytes(asar))
  const stringLength = headerPickle.readInt32LE(4)
  return { headerPickle, json: headerPickle.toString("utf8", 8, 8 + stringLength) }
}

function serializeAsarHeader(json: string): Buffer {
  const stringLength = Buffer.byteLength(json)
  const payloadSize = 4 + stringLength + ((4 - (stringLength % 4)) % 4)
  const headerPickle = Buffer.alloc(4 + payloadSize)
  headerPickle.writeUInt32LE(payloadSize, 0)
  headerPickle.writeInt32LE(stringLength, 4)
  headerPickle.write(json, 8)
  const sizePickle = Buffer.alloc(8)
  sizePickle.writeUInt32LE(4, 0)
  sizePickle.writeUInt32LE(headerPickle.length, 4)
  return Buffer.concat([sizePickle, headerPickle])
}

/** All packed file nodes (in-archive content, i.e. neither unpacked nor links) keyed by archive path. */
function collectPackedFiles(root: AsarFileNode): Map<string, AsarFileNode> {
  const out = new Map<string, AsarFileNode>()
  const walk = (node: AsarFileNode, prefix: string) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const p = prefix === "" ? name : `${prefix}/${name}`
      if (child.files != null) {
        walk(child, p)
      } else if (child.offset != null && !child.unpacked && child.link == null) {
        out.set(p, child)
      }
    }
  }
  walk(root, "")
  return out
}

/** Packed files whose header `offset` differs between two asars (the entries whose header bytes must move). */
function countShiftedOffsets(oldAsar: Buffer, newAsar: Buffer): { shifted: number; total: number } {
  const oldFiles = collectPackedFiles(JSON.parse(parseAsarHeader(oldAsar).json))
  const newFiles = collectPackedFiles(JSON.parse(parseAsarHeader(newAsar).json))
  let shifted = 0
  for (const [p, node] of newFiles) {
    if (oldFiles.get(p)?.offset !== node.offset) {
      shifted++
    }
  }
  return { shifted, total: newFiles.size }
}

interface AlignedAsar {
  file: string
  originalBytes: number
  alignedBytes: number
  paddingBytes: number
  headerBytesBefore: number
  headerBytesAfter: number
}

/**
 * Re-lays out an asar so that every packed file's content starts at a multiple of `align` within the
 * content region (zero padding in between). Only the header `offset` strings change; `size` and
 * `integrity` describe the content and are kept as-is.
 */
async function alignAsar(src: string, dest: string, align: number): Promise<AlignedAsar> {
  const original = await fs.readFile(src)
  const { headerPickle, json } = parseAsarHeader(original)
  // self-check of the hand-rolled pickle framing against what @electron/asar wrote
  if (!serializeAsarHeader(json).subarray(8).equals(headerPickle)) {
    throw new Error(`pickle re-serialization of ${src} does not round-trip`)
  }
  const header = JSON.parse(json) as AsarFileNode
  const contentStart = readAsarHeaderBytes(original)
  const files = [...collectPackedFiles(header).values()].sort((a, b) => parseInt(a.offset!, 10) - parseInt(b.offset!, 10))
  const chunks: Array<Buffer> = []
  let cursor = 0
  let contentBytes = 0
  for (const node of files) {
    const aligned = Math.ceil(cursor / align) * align
    if (aligned > cursor) {
      chunks.push(Buffer.alloc(aligned - cursor))
    }
    const start = contentStart + parseInt(node.offset!, 10)
    chunks.push(original.subarray(start, start + node.size!))
    node.offset = String(aligned)
    cursor = aligned + node.size!
    contentBytes += node.size!
  }
  const newHeader = serializeAsarHeader(JSON.stringify(header))
  const aligned = Buffer.concat([newHeader, ...chunks])
  await fs.writeFile(dest, aligned)
  return {
    file: dest,
    originalBytes: original.length,
    alignedBytes: aligned.length,
    paddingBytes: cursor - contentBytes,
    headerBytesBefore: contentStart,
    headerBytesAfter: newHeader.length,
  }
}

/** Byte offset of the verbatim asar inside the 7z, or -1 when it is not stored verbatim. */
function locateAsar(pkg: Buffer, asar: Buffer): number {
  const probe = asar.subarray(0, Math.min(asar.length, 4096))
  let from = 0
  for (;;) {
    const idx = pkg.indexOf(probe, from)
    if (idx < 0) {
      return -1
    }
    if (idx + asar.length <= pkg.length && pkg.compare(asar, 0, asar.length, idx, idx + asar.length) === 0) {
      return idx
    }
    from = idx + 1
  }
}

function nsisArchiveOptions(stored: boolean): ArchiveOptions {
  // exactly NsisTarget.buildAppPackage for a differential-aware build (elevate.exe injection aside)
  return configureDifferentialAwareArchiveOptions({
    withoutDir: true,
    compression: "normal",
    installTimeDecodable: true,
    excluded: null,
    storedPaths: stored ? ["resources/app.asar"] : null,
  })
}

async function readBlockMap(file: string): Promise<BlockMap> {
  return JSON.parse(zlib.gunzipSync(await fs.readFile(file)).toString()) as BlockMap
}

const quietLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined }

// ─── measurement ──────────────────────────────────────────────────────────────

interface PackageInfo {
  file: string
  size: number
  asarOffset: number // -1 if not stored verbatim
  asarSize: number
  asarHeaderBytes: number
}

interface Row {
  config: string
  blocksTotal: number
  blocksInAsar: number
  blockMapGzBytes: number
  downloadBytes: number
  downloadHeader: number
  downloadContent: number
  downloadOutside: number
  ranges: number
  totalWire: number
  deltaVsDefault: number
  copyOps: number
}

interface VariantResult {
  variant: string
  description: string
  /** header entries whose `offset` string differs from v1, in the asar the stored rows use (aligned when BENCH_ASAR_ALIGN is set) */
  offsetsShifted: { shifted: number; total: number }
  stored: Array<Row>
  compressed: Array<Row>
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

function countBlocksInRange(map: BlockMap, start: number, end: number): number {
  let n = 0
  let off = map.files[0].offset
  for (const size of map.files[0].sizes) {
    if (overlap(off, off + size, start, end) > 0) {
      n++
    }
    off += size
  }
  return n
}

function measure(config: string, oldMap: BlockMap, newMap: BlockMap, newPkg: PackageInfo, newMapGzBytes: number): Row {
  const ops = computeOperations(oldMap, newMap, quietLogger)
  const headerStart = newPkg.asarOffset
  const headerEnd = headerStart + newPkg.asarHeaderBytes
  const asarEnd = headerStart + newPkg.asarSize
  let downloadBytes = 0
  let header = 0
  let content = 0
  let ranges = 0
  let copyOps = 0
  for (const op of ops) {
    if (op.kind !== OperationKind.DOWNLOAD) {
      copyOps++
      continue
    }
    ranges++
    downloadBytes += op.end - op.start
    if (newPkg.asarOffset >= 0) {
      header += overlap(op.start, op.end, headerStart, headerEnd)
      content += overlap(op.start, op.end, headerEnd, asarEnd)
    }
  }
  return {
    config,
    blocksTotal: newMap.files[0].sizes.length,
    blocksInAsar: newPkg.asarOffset >= 0 ? countBlocksInRange(newMap, headerStart, asarEnd) : 0,
    blockMapGzBytes: newMapGzBytes,
    downloadBytes,
    downloadHeader: header,
    downloadContent: content,
    downloadOutside: downloadBytes - header - content,
    ranges,
    totalWire: downloadBytes + newMapGzBytes + ranges * RANGE_OVERHEAD,
    deltaVsDefault: 0,
    copyOps,
  }
}

// ─── reporting ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-US")
const pct = (n: number, base: number) => (base === 0 ? "n/a" : `${((100 * n) / base).toFixed(1)} %`)

function renderTable(rows: Array<Row>): string {
  const lines = [
    "| config | blocks in asar (total) | new blockmap gz | download bytes (header / content / outside) | #ranges | total wire | Δ vs default |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ]
  for (const r of rows) {
    const delta =
      r.deltaVsDefault === 0
        ? "—"
        : `${r.deltaVsDefault > 0 ? "+" : ""}${fmt(r.deltaVsDefault)} (${r.deltaVsDefault > 0 ? "+" : ""}${pct(r.deltaVsDefault, r.totalWire - r.deltaVsDefault)})`
    lines.push(
      `| ${r.config} | ${fmt(r.blocksInAsar)} (${fmt(r.blocksTotal)}) | ${fmt(r.blockMapGzBytes)} | ${fmt(r.downloadBytes)} (${fmt(r.downloadHeader)} / ${fmt(r.downloadContent)} / ${fmt(r.downloadOutside)}) | ${fmt(r.ranges)} | ${fmt(r.totalWire)} | ${delta} |`
    )
  }
  return lines.join("\n")
}

function conclusions(result: VariantResult): Array<string> {
  const out: Array<string> = []
  const stored = result.stored
  const best = stored.reduce((a, b) => (b.totalWire < a.totalWire ? b : a))
  const def = stored.find(r => r.config === DEFAULT_CONFIG_NAME)!
  const control = result.compressed.find(r => r.config === DEFAULT_CONFIG_NAME)!
  out.push(
    `- stored asar, default chunker: ${fmt(def.totalWire)} B on the wire vs ${fmt(control.totalWire)} B for the compressed-asar control (${pct(def.totalWire, control.totalWire)} of control).`
  )
  if (stored.length > 1) {
    out.push(`- minimum total wire: "${best.config}" at ${fmt(best.totalWire)} B (${pct(best.totalWire, def.totalWire)} of the default row).`)
    // rows are in decreasing block-size order; the crossover is the first step where shrinking the
    // blocks further no longer pays because blockmap growth (+ range overhead) exceeds the download saving
    let crossover: string | null = null
    for (let i = 1; i < stored.length; i++) {
      if (stored[i].totalWire > stored[i - 1].totalWire) {
        const dlSaved = stored[i - 1].downloadBytes - stored[i].downloadBytes
        const bmGrowth = stored[i].blockMapGzBytes - stored[i - 1].blockMapGzBytes
        const rangeGrowth = (stored[i].ranges - stored[i - 1].ranges) * RANGE_OVERHEAD
        crossover = `- crossover: going from "${stored[i - 1].config}" to "${stored[i].config}" saves ${fmt(dlSaved)} B of download but adds ${fmt(bmGrowth)} B of blockmap and ${fmt(rangeGrowth)} B of range overhead — blockmap growth outweighs block savings from here on.`
        break
      }
    }
    out.push(crossover ?? "- no crossover inside the sweep: every step to smaller asar blocks still lowered the total wire cost.")
  }
  return out
}

// ─── the benchmark ────────────────────────────────────────────────────────────

describe.runIf(process.env.BENCH === "1")("differential one-line-change benchmark", () => {
  it("sweeps asar chunk sizes and reports the wire cost of a one-line change", { timeout: 60 * 60 * 1000 }, async ({ expect, tmpDir }) => {
    const work = await tmpDir.getTempDir({ prefix: "one-line-bench" })
    const asar = await dynamicImport<AsarApi>("@electron/asar")
    const t0 = Date.now()
    const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

    // 1. synthetic app + v1 asar
    const app = generateApp(20260912, FILE_COUNT, ASAR_MB * 1024 * 1024)
    const srcDir = path.join(work, "app-src")
    await writeTree(srcDir, app.files)
    const asarDir = path.join(work, "asars")
    await fs.mkdir(asarDir, { recursive: true })
    const v1Asar = path.join(asarDir, "v1.asar")
    await asar.createPackage(srcDir, v1Asar)
    const v1AsarBytes = await fs.readFile(v1Asar)
    const target = pickTargetFile(app)
    const targetContent = app.files.get(target)!
    const asarOrderIndex = [...app.files.keys()].indexOf(target)
    console.log(
      `[bench] app: ${app.files.size} files, ${fmt(app.totalBytes)} B of source → v1 asar ${fmt(v1AsarBytes.length)} B ` +
        `(header ${fmt(readAsarHeaderBytes(v1AsarBytes))} B); change target "${target}" (${fmt(targetContent.length)} B, ` +
        `file ${asarOrderIndex + 1}/${app.files.size} in asar order) [${elapsed()}]`
    )

    // 1b. optional alignment post-pass: the stored rows use `<name>.aligned.asar`. Every aligned asar
    //     is read back through @electron/asar (extractFile) and compared byte-for-byte to the source
    //     tree it was packed from — this also shows a spec-conforming reader tolerates the gaps.
    const alignedAsars = new Map<string, AlignedAsar>()
    const alignAndVerify = async (file: string, expected: Map<string, string>): Promise<string> => {
      if (!(ASAR_ALIGN > 0)) {
        return file
      }
      const out = file.replace(/\.asar$/, ".aligned.asar")
      const info = await alignAsar(file, out, ASAR_ALIGN)
      alignedAsars.set(file, info)
      for (const [rel, content] of expected) {
        expect(asar.extractFile(out, rel).equals(Buffer.from(content)), `aligned ${path.basename(out)}: extractFile("${rel}") must match the source`).toBe(true)
      }
      console.log(
        `[bench] aligned ${path.basename(file)} to ${ASAR_ALIGN} B: ${fmt(info.originalBytes)} → ${fmt(info.alignedBytes)} B ` +
          `(+${fmt(info.paddingBytes)} B padding, ${pct(info.paddingBytes, info.originalBytes)}; header ${fmt(info.headerBytesBefore)} → ${fmt(info.headerBytesAfter)} B); ` +
          `extractFile verified ${expected.size} files [${elapsed()}]`
      )
      return out
    }
    // v1: every file; v2 variants: a sample around the change (the target itself is compared to its mutated content)
    const v1StoredAsar = await alignAndVerify(v1Asar, app.files)
    const sampleFiles = (mutated: Map<string, string>): Map<string, string> => {
      const paths = [...mutated.keys()]
      const picks = new Set([0, Math.max(0, asarOrderIndex - 1), asarOrderIndex, Math.min(paths.length - 1, asarOrderIndex + 1), paths.length - 1])
      const out = new Map<string, string>([["package.json", mutated.get("package.json")!]])
      for (const i of picks) {
        out.set(paths[i], mutated.get(paths[i])!)
      }
      for (const [rel, content] of mutated) {
        if (app.files.get(rel) !== content) {
          out.set(rel, content)
        }
      }
      return out
    }

    // 2. v2 variants (pack from the same tree, mutating then restoring the one file)
    const variants: Array<{ id: string; description: string; asar: string; storedAsar: string }> = []
    const packVariant = async (id: string, description: string, mutated: Map<string, string>, mutate: () => Promise<void>, restore: () => Promise<void>) => {
      await mutate()
      const out = path.join(asarDir, `v2-${id}.asar`)
      await asar.createPackage(srcDir, out)
      await restore()
      const storedAsar = await alignAndVerify(out, sampleFiles(mutated))
      variants.push({ id, description, asar: out, storedAsar })
    }
    const withTarget = (content: string): Map<string, string> => new Map([...app.files, [target, content]])
    const targetAbs = path.join(srcDir, target)
    const sameLength = changeMiddleLine(targetContent, editLineSameLength)
    await packVariant(
      "same-length",
      "one line changed in a mid-sized file, same length",
      withTarget(sameLength),
      () => fs.writeFile(targetAbs, sameLength),
      () => fs.writeFile(targetAbs, targetContent)
    )
    const plus7 = changeMiddleLine(targetContent, line => line + " // fix")
    await packVariant(
      "plus-7-bytes",
      "one line changed with +7 bytes (shifts every later offset in header and content)",
      withTarget(plus7),
      () => fs.writeFile(targetAbs, plus7),
      () => fs.writeFile(targetAbs, targetContent)
    )
    // +600 B on one line: larger than a 512 B alignment slot, so with BENCH_ASAR_ALIGN=512 the file is
    // guaranteed to spill into the next slot and every later offset shifts again (the failure mode).
    const plus600 = changeMiddleLine(targetContent, line => line + " // " + "fix ".repeat(149))
    await packVariant(
      "plus-600-bytes",
      "one line changed with +600 bytes (crosses a 512 B alignment boundary)",
      withTarget(plus600),
      () => fs.writeFile(targetAbs, plus600),
      () => fs.writeFile(targetAbs, targetContent)
    )
    const addedRel = path.posix.join(path.posix.dirname(target), "added-feature.js")
    const addedAbs = path.join(srcDir, addedRel)
    const addedContent = makeJsFile(mulberry32(7), makeIdentifiers(mulberry32(8), 50), 2 * KiB)
    await packVariant(
      "new-small-file",
      `new ${fmt(addedContent.length)} B file added next to the target file`,
      new Map([...app.files, [addedRel, addedContent]]),
      () => fs.writeFile(addedAbs, addedContent),
      () => fs.rm(addedAbs)
    )
    console.log(`[bench] packed ${variants.length} v2 asars [${elapsed()}]`)

    // 3. 7z packages exactly as NsisTarget builds them (stored asar) + control (compressed asar).
    //    The non-asar payload is identical between versions, like an app whose only change is in
    //    the asar (a real build would also touch the exe's version resource — out of scope here).
    const pkgSrc = path.join(work, "pkg-src")
    await fs.mkdir(path.join(pkgSrc, "resources"), { recursive: true })
    await fs.mkdir(path.join(pkgSrc, "locales"), { recursive: true })
    const outsideRand = mulberry32(99)
    const exe = Buffer.alloc(1536 * KiB)
    for (let i = 0; i < exe.length; i++) {
      exe[i] = Math.floor(outsideRand() * 256)
    }
    await fs.writeFile(path.join(pkgSrc, "bench-app.exe"), exe)
    await fs.writeFile(path.join(pkgSrc, "locales", "en-US.pak"), makeJsFile(mulberry32(5), makeIdentifiers(mulberry32(6), 300), 400 * KiB))
    await fs.writeFile(path.join(pkgSrc, "LICENSE.electron.txt"), makeJsFile(mulberry32(3), makeIdentifiers(mulberry32(4), 100), 64 * KiB))
    await fs.writeFile(path.join(pkgSrc, "resources", "app-update.yml"), "provider: generic\nurl: https://example.invalid/updates\n")

    const pkgDir = path.join(work, "packages")
    await fs.mkdir(pkgDir, { recursive: true })
    const buildPackage = async (name: string, asarFile: string, stored: boolean): Promise<PackageInfo> => {
      await fs.copyFile(asarFile, path.join(pkgSrc, "resources", "app.asar"))
      const file = path.join(pkgDir, `${name}-${stored ? "stored" : "compressed"}.7z`)
      const started = Date.now()
      await archive("7z", file, pkgSrc, nsisArchiveOptions(stored))
      const pkg = await fs.readFile(file)
      const asarBytes = await fs.readFile(asarFile)
      const asarOffset = locateAsar(pkg, asarBytes)
      if (stored) {
        expect(asarOffset, `stored asar must appear verbatim in ${file}`).toBeGreaterThanOrEqual(0)
      } else {
        expect(asarOffset, `compressed asar must not appear verbatim in ${file}`).toBe(-1)
      }
      console.log(
        `[bench] 7z ${path.basename(file)}: ${fmt(pkg.length)} B in ${((Date.now() - started) / 1000).toFixed(1)}s` + (stored ? `, asar at offset ${fmt(asarOffset)}` : "")
      )
      return { file, size: pkg.length, asarOffset, asarSize: asarBytes.length, asarHeaderBytes: readAsarHeaderBytes(asarBytes) }
    }
    const v1Stored = await buildPackage("v1", v1StoredAsar, true)
    const v1Compressed = await buildPackage("v1", v1Asar, false)
    const v2Packages = new Map<string, { stored: PackageInfo; compressed: PackageInfo }>()
    for (const v of variants) {
      v2Packages.set(v.id, { stored: await buildPackage(`v2-${v.id}`, v.storedAsar, true), compressed: await buildPackage(`v2-${v.id}`, v.asar, false) })
    }
    console.log(`[bench] all packages built [${elapsed()}]`)

    // 4./5. blockmaps: one per (package, config); packages are reused across configs.
    const bmDir = path.join(work, "blockmaps")
    await fs.mkdir(bmDir, { recursive: true })
    let bmCounter = 0
    const buildMap = async (pkg: PackageInfo, chunker: ChunkerParams | null): Promise<{ map: BlockMap; gzBytes: number }> => {
      const out = path.join(bmDir, `${path.basename(pkg.file)}.${bmCounter++}.blockmap`)
      const options: BuildBlockMapOptions | undefined = chunker == null ? undefined : { regions: [{ offset: pkg.asarOffset, size: pkg.asarSize, chunker }] }
      await buildBlockMap(pkg.file, "gzip", out, options)
      return { map: await readBlockMap(out), gzBytes: (await fs.stat(out)).size }
    }

    // Detect whether this tree honors `regions`: chunk the v1 stored asar with the finest sweep
    // chunker and compare the block layout inside the asar region against the default build.
    const v1StoredDefault = await buildMap(v1Stored, null)
    const finest = SWEEP[SWEEP.length - 1].asarChunker!
    const v1StoredFinest = await buildMap(v1Stored, finest)
    const regionsHonored =
      countBlocksInRange(v1StoredFinest.map, v1Stored.asarOffset, v1Stored.asarOffset + v1Stored.asarSize) >
      countBlocksInRange(v1StoredDefault.map, v1Stored.asarOffset, v1Stored.asarOffset + v1Stored.asarSize)
    const configs = regionsHonored ? SWEEP : SWEEP.filter(c => c.asarChunker == null)
    if (!regionsHonored) {
      console.log("[bench] region-aware chunker not available in this tree — region rows skipped")
    }
    console.log(`[bench] v1 stored default blockmap: ${fmt(v1StoredDefault.map.files[0].sizes.length)} blocks, ${fmt(v1StoredDefault.gzBytes)} B gz [${elapsed()}]`)

    const v1Maps = new Map<string, { map: BlockMap; gzBytes: number }>()
    for (const c of configs) {
      v1Maps.set(c.name, c.asarChunker == null ? v1StoredDefault : c.name === SWEEP[SWEEP.length - 1].name ? v1StoredFinest : await buildMap(v1Stored, c.asarChunker))
    }
    const v1CompressedMap = await buildMap(v1Compressed, null)

    const results: Array<VariantResult> = []
    const v1StoredAsarBytes = await fs.readFile(v1StoredAsar)
    for (const v of variants) {
      const pkgs = v2Packages.get(v.id)!
      const offsetsShifted = countShiftedOffsets(v1StoredAsarBytes, await fs.readFile(v.storedAsar))
      const stored: Array<Row> = []
      for (const c of configs) {
        const newMap = await buildMap(pkgs.stored, c.asarChunker)
        stored.push(measure(c.name, v1Maps.get(c.name)!.map, newMap.map, pkgs.stored, newMap.gzBytes))
      }
      const defaultTotal = stored.find(r => r.config === DEFAULT_CONFIG_NAME)!.totalWire
      for (const r of stored) {
        r.deltaVsDefault = r.totalWire - defaultTotal
      }
      const controlMap = await buildMap(pkgs.compressed, null)
      const compressed = [measure(DEFAULT_CONFIG_NAME, v1CompressedMap.map, controlMap.map, pkgs.compressed, controlMap.gzBytes)]
      results.push({ variant: v.id, description: v.description, offsetsShifted, stored, compressed })
      console.log(`[bench] measured variant ${v.id}: ${fmt(offsetsShifted.shifted)}/${fmt(offsetsShifted.total)} header offsets shifted [${elapsed()}]`)
    }

    // 6. report
    const md: Array<string> = []
    md.push(`# Differential update cost of a one-line change under app.asar${ASAR_ALIGN > 0 ? ` (asar content aligned to ${fmt(ASAR_ALIGN)} B)` : ""}`)
    md.push("")
    md.push(
      `Synthetic app: ${fmt(app.files.size)} files, asar ${fmt(v1AsarBytes.length)} B (header ${fmt(readAsarHeaderBytes(v1AsarBytes))} B); ` +
        `packages: stored ${fmt(v1Stored.size)} B / compressed control ${fmt(v1Compressed.size)} B; ` +
        `range overhead ${RANGE_OVERHEAD} B; region-aware chunker ${regionsHonored ? "available" : "NOT available (region rows skipped)"}.`
    )
    md.push("")
    md.push(
      "total wire = DOWNLOAD bytes + new blockmap (gz) + #ranges × overhead. Download bytes are classified by where they land in the NEW package: asar header (JSON directory) / asar file contents / outside the asar (7z headers, other members)."
    )
    const v1Aligned = alignedAsars.get(v1Asar)
    if (v1Aligned != null) {
      md.push("")
      md.push(
        `Alignment: stored rows use the asar re-laid out with every file's content start at a multiple of ${fmt(ASAR_ALIGN)} B ` +
          `(compressed control keeps the original). Padding overhead (v1): ${fmt(v1Aligned.paddingBytes)} B, ${pct(v1Aligned.paddingBytes, v1Aligned.originalBytes)} of the original asar ` +
          `(${fmt(v1Aligned.originalBytes)} → ${fmt(v1Aligned.alignedBytes)} B; header ${fmt(v1Aligned.headerBytesBefore)} → ${fmt(v1Aligned.headerBytesAfter)} B). ` +
          `Aligned asars read back correctly with @electron/asar extractFile.`
      )
    }
    for (const r of results) {
      md.push("")
      md.push(`## ${r.variant} — ${r.description}`)
      md.push("")
      md.push(`Header entries whose offset shifted vs v1: ${fmt(r.offsetsShifted.shifted)} / ${fmt(r.offsetsShifted.total)}.`)
      md.push("")
      md.push(`### stored asar (storedPaths: ["resources/app.asar"])`)
      md.push("")
      md.push(renderTable(r.stored))
      md.push("")
      md.push(`### control: asar compressed with the rest (no storedPaths)`)
      md.push("")
      md.push(renderTable(r.compressed))
      md.push("")
      md.push("Conclusions:")
      md.push(...conclusions(r))
    }
    md.push("")
    const overallBest = results.map(r => r.stored.reduce((a, b) => (b.totalWire < a.totalWire ? b : a)).config)
    md.push(`Best config per variant: ${results.map((r, i) => `${r.variant} → "${overallBest[i]}"`).join("; ")}.`)
    const report = md.join("\n")
    console.log(`\n${report}\n\n[bench] done in ${elapsed()}`)

    if (BENCH_OUT) {
      await fs.mkdir(BENCH_OUT, { recursive: true })
      await fs.writeFile(path.join(BENCH_OUT, "results.md"), report + "\n")
      await fs.writeFile(
        path.join(BENCH_OUT, "results.json"),
        JSON.stringify(
          {
            params: { asarMb: ASAR_MB, fileCount: FILE_COUNT, rangeOverhead: RANGE_OVERHEAD, regionsHonored, asarAlign: ASAR_ALIGN },
            alignment:
              v1Aligned == null
                ? null
                : {
                    align: ASAR_ALIGN,
                    paddingOverhead: `${fmt(v1Aligned.paddingBytes)} B (${pct(v1Aligned.paddingBytes, v1Aligned.originalBytes)} of the original asar)`,
                    asars: Object.fromEntries([...alignedAsars].map(([src, info]) => [path.basename(src), info])),
                  },
            app: { files: app.files.size, sourceBytes: app.totalBytes, asarBytes: v1AsarBytes.length, asarHeaderBytes: readAsarHeaderBytes(v1AsarBytes), target },
            packages: { v1Stored, v1Compressed, v2: Object.fromEntries(v2Packages) },
            results,
          },
          null,
          2
        )
      )
      console.log(`[bench] wrote ${path.join(BENCH_OUT, "results.md")} and results.json`)
    }

    // sanity: the stored default row must beat the compressed control for every variant
    for (const r of results) {
      const def = r.stored.find(it => it.config === DEFAULT_CONFIG_NAME)!
      expect(def.totalWire).toBeLessThan(r.compressed[0].totalWire)
      expect(def.downloadBytes).toBeGreaterThan(0)
    }
  })
})
