// Benchmark: how much does app.asar layout churn cost a differential update with the v3 block map, and how much of
// it do a stable layout (`asar.stableLayout`) and per-file growth margins win back?
//
// It runs in CI as a small smoke (200 files, ~2 MiB) whose assertions — the stable layout keeps every untouched
// file's offset, and costs no more than the default layout for an insertion — are exercised on every run; the
// table is only logged. The full-size run quoted in the `asar.stableLayout` docs is opt-in:
//
//   BENCH=1 TEST_FILES=asarLayoutBenchTest pnpm ci:test
//
// Env knobs (all optional):
//   BENCH            1 = full size and verbose output
//   BENCH_FILES      number of files in the synthetic app   (default 2000 full, 200 smoke)
//   BENCH_ASAR_MB    target packed size in MiB              (default 24 full, 2 smoke)
//   BENCH_RELEASES   length of the release chain            (default 10 full, 2 smoke)
//
// What is measured: the stored app.asar ALONE (as it sits verbatim in a `store-asar` NSIS package), chunked exactly
// like production chunks a stored asar for the v3 map — STORED_MEMBER_CHUNKER_V3 over the whole archive and a forced
// block boundary at every packed file (`asarContentBoundaries`). Wire cost of v1 → v2 is the updater's plan:
// DOWNLOAD bytes from computeOperations after multipart gap coalescing, plus the v3 map bytes the fetcher pulls
// (first request + unmatched super-group entries + unmatched group records), plus 120 B per range.
//
// The synthetic app mimics a bundled Electron app: ~85 % of the files under node_modules (many small files, a few
// MB-sized vendor bundles, a couple of native addons), the app's own dist/ (one large main bundle, many chunks) and
// some binary assets. Text is JS-like so its size distribution and block behaviour are realistic; content is a pure
// function of (path, revision) so v1 / v2 differ only where a scenario says so.

import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { alignAsarContent } from "app-builder-lib/src/asar/asarAlign"
import { applyStableAsarLayout, STABLE_LAYOUT_MAX_FREE_RATIO } from "app-builder-lib/src/asar/asarStableLayout"
import { buildBlockMapV3 } from "app-builder-lib/src/targets/blockmap/blockmapV3"
import { asarContentBoundaries, STORED_MEMBER_CHUNKER_V3 } from "app-builder-lib/src/targets/differentialUpdateInfoBuilder"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { decodeBlockMapV3, toBlockMap } from "builder-util-runtime/internal"
import { coalesce, firstRangeSize, planRecordStage, planSuperStage } from "electron-updater/src/differentialDownloader/blockMapV3Fetcher"
import { coalesceDownloadGaps, computeOperations, downloadGapCoalesceThreshold, OperationKind } from "electron-updater/src/differentialDownloader/downloadPlanBuilder"
import { Logger } from "electron-updater/src/types"
import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { Readable } from "stream"
import { describe, it } from "vitest"

const FULL_SIZE = process.env.BENCH === "1"
const FILE_COUNT = Number(process.env.BENCH_FILES ?? (FULL_SIZE ? 2000 : 200))
const ASAR_MB = Number(process.env.BENCH_ASAR_MB ?? (FULL_SIZE ? 24 : 2))
const RELEASES = Number(process.env.BENCH_RELEASES ?? (FULL_SIZE ? 10 : 2))
const RANGE_OVERHEAD = 120

function say(message: string): void {
  if (FULL_SIZE) {
    console.log(message)
  }
}

// ─── deterministic synthetic app ──────────────────────────────────────────────

function seedOf(text: string): number {
  return createHash("sha1").update(text).digest().readUInt32LE(0)
}

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

const WORDS = (
  "state props value result data item index count buffer stream handler callback options config context request response " +
  "error message payload token session user account cache entry node parent child element target source output input " +
  "queue worker task promise resolve reject emit listener event channel window document render update mount unmount"
).split(" ")

function jsText(seed: number, size: number): Buffer {
  const rand = mulberry32(seed)
  const parts: Array<string> = []
  let length = 0
  while (length < size) {
    const a = WORDS[Math.floor(rand() * WORDS.length)]
    const b = WORDS[Math.floor(rand() * WORDS.length)]
    const n = Math.floor(rand() * 100000)
    const line = rand() < 0.5 ? `  const ${a}${n} = ${b}.${a}(${n});\n` : `  if (${a}.${b} !== ${n}) { return ${b}[${n}] }\n`
    parts.push(line)
    length += line.length
  }
  return Buffer.from(parts.join("")).subarray(0, size)
}

function binary(seed: number, size: number): Buffer {
  const rand = mulberry32(seed)
  const buf = Buffer.allocUnsafe(size)
  for (let i = 0; i < size; i += 4) {
    buf.writeUInt32LE((rand() * 4294967296) >>> 0, Math.min(i, size - 4))
  }
  return buf
}

interface FileSpec {
  /** content revision: bumping it (with `edit`) changes the content */
  size: number
  kind: "js" | "bin"
  /** in-place edits applied on top of the base content: [position fraction, inserted bytes, replaced bytes] */
  edits: Array<[number, number, number]>
}

type Tree = Map<string, FileSpec>

function makeTree(fileCount: number, totalBytes: number): Tree {
  const rand = mulberry32(42)
  const tree: Tree = new Map()
  const lognormal = (median: number, sigma: number) => Math.round(median * Math.exp(sigma * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())))
  const appFiles = Math.round(fileCount * 0.12)
  const assetFiles = Math.round(fileCount * 0.03)
  const moduleFiles = fileCount - appFiles - assetFiles
  const packages = Math.max(3, Math.round(moduleFiles / 30))
  for (let i = 0; i < moduleFiles; i++) {
    const pkg = `pkg-${String(i % packages).padStart(3, "0")}`
    const isAddon = i % 400 === 7
    const name = isAddon ? `build/Release/addon${i}.node` : i % 30 === 0 ? "package.json" : `lib/${WORDS[i % WORDS.length]}/m${i}.js`
    tree.set(`node_modules/${pkg}/${name}`, { size: Math.max(16, lognormal(isAddon ? 200_000 : 3_000, 1.2)), kind: isAddon ? "bin" : "js", edits: [] })
  }
  for (let i = 0; i < appFiles; i++) {
    tree.set(`dist/${i === 0 ? "main" : `chunk-${i}`}.js`, { size: Math.max(64, lognormal(6_000, 1)), kind: "js", edits: [] })
  }
  for (let i = 0; i < assetFiles; i++) {
    tree.set(`assets/img${i}.png`, { size: Math.max(64, lognormal(40_000, 0.8)), kind: "bin", edits: [] })
  }
  // scale to the target size with a few MB-sized vendor bundles and a large main bundle, like real apps
  const current = [...tree.values()].reduce((sum, it) => sum + it.size, 0)
  const rest = Math.max(0, totalBytes - current)
  tree.get("dist/main.js")!.size += Math.round(rest * 0.3)
  const vendors = [...tree.keys()].filter(it => it.endsWith(".js") && it.startsWith("node_modules/")).filter((_, i) => i % 97 === 3)
  for (const vendor of vendors) {
    tree.get(vendor)!.size += Math.round((rest * 0.7) / vendors.length)
  }
  return tree
}

function content(file: string, spec: FileSpec): Buffer {
  let data = spec.kind === "js" ? jsText(seedOf(file), spec.size) : binary(seedOf(file), spec.size)
  for (const [at, inserted, replaced] of spec.edits) {
    const position = Math.floor(data.length * at)
    const patch = jsText(seedOf(`${file}@${at}`), inserted)
    data = Buffer.concat([data.subarray(0, position), patch, data.subarray(Math.min(data.length, position + replaced))])
  }
  return data
}

function cloneTree(tree: Tree): Tree {
  return new Map([...tree].map(([file, spec]) => [file, { ...spec, edits: [...spec.edits] }]))
}

function appPaths(tree: Tree): Array<string> {
  return [...tree.keys()].filter(it => it.startsWith("dist/chunk-")).sort()
}

// ─── scenarios (v1 → v2) ──────────────────────────────────────────────────────

interface Scenario {
  name: string
  apply: (tree: Tree, release: number) => void
}

function pick<T>(items: Array<T>, count: number, seed: number): Array<T> {
  const rand = mulberry32(seed)
  const copy = [...items]
  const result: Array<T> = []
  while (result.length < count && copy.length > 0) {
    result.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
  }
  return result
}

const editInPlace = (tree: Tree, seed: number, count: number) => {
  for (const file of pick(appPaths(tree), count, seed)) {
    tree.get(file)!.edits.push([0.5, 40, 40])
  }
}
const grow = (tree: Tree, seed: number, count: number) => {
  const rand = mulberry32(seed)
  for (const file of pick(appPaths(tree), count, seed + 1)) {
    tree.get(file)!.edits.push([0.4, 20 + Math.floor(rand() * 180), 0])
  }
}
const addEarly = (tree: Tree, seed: number, count: number) => {
  for (let i = 0; i < count; i++) {
    tree.set(`node_modules/pkg-000/lib/added-${seed}-${i}.js`, { size: 2_000 + i * 1_500, kind: "js", edits: [] })
  }
  tree.set(`dist/chunk-added-${seed}.js`, { size: 5_000, kind: "js", edits: [] })
}
const remove = (tree: Tree, seed: number, count: number) => {
  for (const file of pick(
    [...tree.keys()].filter(it => it.startsWith("node_modules/") && it.endsWith(".js")),
    count,
    seed
  )) {
    tree.delete(file)
  }
}

const SCENARIOS: Array<Scenario> = [
  { name: "edit 5 files in place (same length)", apply: (tree, r) => editInPlace(tree, 100 + r, 5) },
  { name: "grow 5 app files by 20-200 B", apply: (tree, r) => grow(tree, 200 + r, 5) },
  { name: "grow main bundle by 3 KB", apply: tree => tree.get("dist/main.js")!.edits.push([0.6, 3_000, 0]) },
  { name: "add 3 dependency files + 1 app file", apply: (tree, r) => addEarly(tree, 300 + r, 3) },
  { name: "remove 3 dependency files", apply: (tree, r) => remove(tree, 400 + r, 3) },
  {
    name: "mixed: grow 5, add 4, remove 2, edit 3",
    apply: (tree, r) => {
      grow(tree, 500 + r, 5)
      addEarly(tree, 600 + r, 3)
      remove(tree, 700 + r, 2)
      editInPlace(tree, 800 + r, 3)
    },
  },
]

// ─── layouts ──────────────────────────────────────────────────────────────────

interface Layout {
  name: string
  /** stream order of the packed files */
  order: (files: Array<string>) => Array<string>
  /** post-pass on the packed archive, given the previous release's archive of the same layout (null for the first) */
  post?: (asarFile: string, previous: string | null) => Promise<void>
}

/** What AsarPackager does by default: dependencies first, the app last; addons last in each set; by path otherwise. */
function defaultOrder(files: Array<string>): Array<string> {
  const key = (file: string) => [file.startsWith("node_modules/") ? 0 : 1, file.endsWith(".node") ? 1 : 0] as const
  return [...files].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    return ka[0] - kb[0] || ka[1] - kb[1] || (a < b ? -1 : a > b ? 1 : 0)
  })
}

function hashOrder(files: Array<string>): Array<string> {
  const hash = new Map(files.map(it => [it, createHash("sha1").update(it).digest("hex")]))
  return [...files].sort((a, b) => (hash.get(a)! < hash.get(b)! ? -1 : 1))
}

const stable = (alignment: number, growthMargin: number) => async (asarFile: string, previous: string | null) => {
  await applyStableAsarLayout(asarFile, previous, { alignment, growthMargin, maxFreeRatio: STABLE_LAYOUT_MAX_FREE_RATIO })
}

const LAYOUTS: Array<Layout> = [
  { name: "default", order: defaultOrder },
  { name: "default + contentAlignment 512", order: defaultOrder, post: f => alignAsarContent(f, 512).then(() => undefined) },
  { name: "hash(path) order + align 512", order: hashOrder, post: f => alignAsarContent(f, 512).then(() => undefined) },
  { name: "stable", order: defaultOrder, post: stable(1, 0) },
  { name: "stable + align 512", order: defaultOrder, post: stable(512, 0) },
  { name: "stable + align 512 + 2 % margin", order: defaultOrder, post: stable(512, 0.02) },
]

type ElectronAsar = { createPackageFromStreams(dest: string, streams: Array<any>): Promise<void> }

async function packTree(asar: ElectronAsar, tree: Tree, layout: Layout, out: string, previous: string | null): Promise<void> {
  const streams: Array<any> = []
  const dirs = new Set<string>()
  for (const file of layout.order([...tree.keys()])) {
    const parts = file.split("/")
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join(path.sep)
      if (!dirs.has(dir)) {
        dirs.add(dir)
        streams.push({ type: "directory", path: dir, unpacked: false })
      }
    }
    const spec = tree.get(file)!
    const data = content(file, spec)
    streams.push({
      type: "file",
      path: file.split("/").join(path.sep),
      unpacked: false,
      stat: { mode: 0o644, size: data.length },
      streamGenerator: () => Readable.from([data]),
    })
  }
  await asar.createPackageFromStreams(out, streams)
  await layout.post?.(out, previous)
}

// ─── measurement ──────────────────────────────────────────────────────────────

const quietLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined }

async function blockMap(asarFile: string): Promise<Buffer> {
  const size = (await fs.stat(asarFile)).size
  const region = { offset: 0, size, chunker: STORED_MEMBER_CHUNKER_V3 }
  const boundaries = await asarContentBoundaries([{ file: asarFile, region }])
  const out = `${asarFile}.blockmap`
  await buildBlockMapV3(asarFile, out, { regions: [region], boundaries })
  const map = await fs.readFile(out)
  await fs.rm(out)
  return map
}

interface Cost {
  /** asar bytes downloaded */
  download: number
  /** of which inside the asar header */
  header: number
  /** v3 map bytes fetched */
  map: number
  ranges: number
  wire: number
}

function measure(oldV3: Buffer, newV3: Buffer, newHeaderEnd: number): Cost {
  const oldMap = decodeBlockMapV3(oldV3)
  const newMap = decodeBlockMapV3(newV3)
  const firstRequest = Math.min(firstRangeSize(oldMap.header), newV3.length)
  const superStage = planSuperStage(oldMap, newMap.header, newMap.supers, firstRequest)
  const groupRanges = coalesce(superStage.fetch)
  const recordRanges = coalesce(planRecordStage(oldMap, newMap.header, newMap.supers, newMap.groups, superStage.superMatch, firstRequest).fetch)
  const mapBytes = firstRequest + [...groupRanges, ...recordRanges].reduce((sum, it) => sum + it.end - it.start, 0)
  const ops = coalesceDownloadGaps(computeOperations(toBlockMap(oldMap), toBlockMap(newMap), quietLogger), downloadGapCoalesceThreshold(true))
  let download = 0
  let header = 0
  let ranges = 1 + groupRanges.length + recordRanges.length
  for (const op of ops) {
    if (op.kind === OperationKind.DOWNLOAD) {
      ranges++
      download += op.end - op.start
      header += Math.max(0, Math.min(op.end, newHeaderEnd) - op.start)
    }
  }
  return { download, header, map: mapBytes, ranges, wire: download + mapBytes + ranges * RANGE_OVERHEAD }
}

async function headerEnd(asarFile: string): Promise<number> {
  return 8 + (await readAsarHeader(asarFile)).size
}

async function offsetsOf(asarFile: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const walk = (node: any, prefix: string) => {
    for (const [name, child] of Object.entries<any>(node.files ?? {})) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (child.files != null) {
        walk(child, rel)
      } else if (child.offset != null) {
        result.set(rel, child.offset)
      }
    }
  }
  walk(JSON.parse((await readAsarHeader(asarFile)).header), "")
  return result
}

const fmt = (n: number) => n.toLocaleString("en-US")
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

describe("asar layout benchmark", () => {
  it("measures the differential cost of layout churn per layout", { timeout: 60 * 60 * 1000 }, async ({ expect, tmpDir }) => {
    const work = await tmpDir.getTempDir({ prefix: "asar-layout-bench" })
    await fs.mkdir(work, { recursive: true })
    const asar = await dynamicImport<ElectronAsar>("@electron/asar")
    const v1 = makeTree(FILE_COUNT, ASAR_MB * 1024 * 1024)
    say(`[bench] ${fmt(v1.size)} files, ${fmt([...v1.values()].reduce((s, it) => s + it.size, 0))} B`)

    // ── single-step scenarios ──
    const rows: Array<{ scenario: string; layout: string; cost: Cost; size: number; shifted: number }> = []
    const baseSize = new Map<string, number>()
    for (const [layoutIndex, layout] of LAYOUTS.entries()) {
      const v1File = path.join(work, `v1-${layoutIndex}.asar`)
      await packTree(asar, v1, layout, v1File, null)
      const v1Map = await blockMap(v1File)
      const v1Offsets = await offsetsOf(v1File)
      baseSize.set(layout.name, (await fs.stat(v1File)).size)
      for (const [scenarioIndex, scenario] of SCENARIOS.entries()) {
        const v2 = cloneTree(v1)
        scenario.apply(v2, 1)
        const v2File = path.join(work, `v2-${layoutIndex}-${scenarioIndex}.asar`)
        await packTree(asar, v2, layout, v2File, v1File)
        const cost = measure(v1Map, await blockMap(v2File), await headerEnd(v2File))
        const v2Offsets = await offsetsOf(v2File)
        const shifted = [...v2Offsets].filter(([file, offset]) => v1Offsets.has(file) && v1Offsets.get(file) !== offset).length
        rows.push({ scenario: scenario.name, layout: layout.name, cost, size: (await fs.stat(v2File)).size, shifted })
        say(`[bench] ${layout.name} / ${scenario.name}: ${fmt(cost.wire)} B wire (${fmt(cost.header)} B header), ${shifted} shifted`)
        await fs.rm(v2File)
      }
      await fs.rm(v1File)
    }

    // ── release chain: the same mixed change every release, each built against the previous one ──
    const chain: Array<{ layout: string; total: number; mean: number; worst: number; size: number }> = []
    for (const [layoutIndex, layout] of LAYOUTS.entries()) {
      let tree = cloneTree(v1)
      let previous = path.join(work, `chain-${layoutIndex}-0.asar`)
      await packTree(asar, tree, layout, previous, null)
      let previousMap = await blockMap(previous)
      let total = 0
      let worst = 0
      for (let release = 1; release <= RELEASES; release++) {
        tree = cloneTree(tree)
        SCENARIOS[SCENARIOS.length - 1].apply(tree, release)
        const next = path.join(work, `chain-${layoutIndex}-${release}.asar`)
        await packTree(asar, tree, layout, next, previous)
        const nextMap = await blockMap(next)
        const cost = measure(previousMap, nextMap, await headerEnd(next))
        total += cost.wire
        worst = Math.max(worst, cost.wire)
        await fs.rm(previous)
        previous = next
        previousMap = nextMap
      }
      chain.push({ layout: layout.name, total, mean: total / RELEASES, worst, size: (await fs.stat(previous)).size })
      await fs.rm(previous)
    }

    // ── report ──
    const lines: Array<string> = []
    const defaultSize = baseSize.get("default")!
    lines.push(`asar: ${fmt(v1.size)} files, ${kb(defaultSize)} (default layout)`, "")
    lines.push("| scenario | layout | wire | of which header | map | shifted entries | asar size vs default |", "|---|---|---:|---:|---:|---:|---:|")
    for (const row of rows) {
      lines.push(
        `| ${row.scenario} | ${row.layout} | ${kb(row.cost.wire)} | ${kb(row.cost.header)} | ${kb(row.cost.map)} | ${fmt(row.shifted)} | +${(((baseSize.get(row.layout)! - defaultSize) / defaultSize) * 100).toFixed(2)} % |`
      )
    }
    lines.push("", `release chain: ${RELEASES} releases of the mixed change, each built against the previous one`, "")
    lines.push("| layout | mean wire / update | worst update | final asar size vs default v1 |", "|---|---:|---:|---:|")
    for (const row of chain) {
      lines.push(`| ${row.layout} | ${kb(row.mean)} | ${kb(row.worst)} | +${(((row.size - defaultSize) / defaultSize) * 100).toFixed(2)} % |`)
    }
    const report = lines.join("\n")
    say(report)
    if (process.env.BENCH_OUT != null) {
      await fs.writeFile(process.env.BENCH_OUT, report + "\n")
    }

    // ── smoke assertions (hold at every size) ──
    const row = (scenario: number, layout: string) => rows.find(it => it.scenario === SCENARIOS[scenario].name && it.layout === layout)!
    for (let scenario = 0; scenario < SCENARIOS.length; scenario++) {
      // untouched files never move under the stable layout
      expect(row(scenario, "stable + align 512").shifted, SCENARIOS[scenario].name).toBeLessThanOrEqual(10)
    }
    // an insertion shifts every later file in the default layout, none in the stable one
    expect(row(3, "default").shifted).toBeGreaterThan(0)
    expect(row(3, "stable").cost.wire).toBeLessThanOrEqual(row(3, "default").cost.wire)
  })
})
