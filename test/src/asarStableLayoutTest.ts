import { readAsar, readAsarHeader } from "app-builder-lib/src/asar/asar"
import { AsarContentUnit } from "app-builder-lib/src/asar/asarAlign"
import {
  applyStableAsarLayout,
  applyStableLayoutOption,
  planStableLayout,
  STABLE_LAYOUT_MAX_FREE_RATIO,
  StableLayoutParams,
  validateStableLayoutOptions,
} from "app-builder-lib/src/asar/asarStableLayout"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { Platform } from "app-builder-lib"
import { InvalidConfigurationError } from "builder-util"
import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { app, appThrows, linuxDirTarget } from "./helpers/packTester.js"

type Asar = { createPackage(src: string, dest: string): Promise<void>; extractFile(archive: string, filename: string): Buffer }
const asar = () => dynamicImport<Asar>("@electron/asar")

const PARAMS: StableLayoutParams = { alignment: 512, growthMargin: 0, maxFreeRatio: STABLE_LAYOUT_MAX_FREE_RATIO }

function units(...specs: Array<[string, number, number?]>): Array<AsarContentUnit> {
  let cursor = 0
  return specs.map(([p, size, offset]) => {
    const unit = { paths: [p], size, offset: offset ?? cursor }
    cursor = unit.offset + size
    return unit
  })
}

function byPath(list: Array<AsarContentUnit>, offsets: Array<number>): Map<string, number> {
  return new Map(list.map((unit, index) => [unit.paths[0], offsets[index]]))
}

describe("planStableLayout", () => {
  test("without a previous layout: aligned, in the given order, each file followed by its growth margin", ({ expect }) => {
    const current = units(["a", 100], ["b", 1000], ["empty", 0], ["c", 10])
    expect(planStableLayout(current, null, PARAMS).offsets).toEqual([0, 512, 0, 1536])
    expect(planStableLayout(current, null, { ...PARAMS, growthMargin: 0.5 }).offsets).toEqual([0, 512, 0, 2048])
    expect(planStableLayout(current, null, { ...PARAMS, alignment: 1 }).offsets).toEqual([0, 100, 0, 1100])
  })

  test("is deterministic and a fixed point: re-planning against its own result keeps every offset", ({ expect }) => {
    const current = units(["a", 100], ["b", 1000], ["c", 10])
    const first = planStableLayout(current, null, PARAMS)
    expect(planStableLayout(current, null, PARAMS)).toEqual(first)
    const laidOut = current.map((unit, index) => ({ ...unit, offset: first.offsets[index] }))
    const again = planStableLayout(current, laidOut, PARAMS)
    expect(again.offsets).toEqual(first.offsets)
    expect(again).toMatchObject({ kept: 3, filled: 0, appended: 0, compacted: false, freedBytes: 0 })
  })

  test("a new file goes after the previous content, wherever it sorts", ({ expect }) => {
    const previous = units(["b", 1000, 0], ["c", 1000, 1024], ["d", 1000, 2048])
    const current = units(["a-new", 300], ["b", 1000], ["c", 1000], ["d", 1000])
    const plan = planStableLayout(current, previous, PARAMS)
    expect(byPath(current, plan.offsets)).toEqual(
      new Map([
        ["a-new", 3072],
        ["b", 0],
        ["c", 1024],
        ["d", 2048],
      ])
    )
    expect(plan).toMatchObject({ kept: 3, appended: 1 })
  })

  test("a file grows within its slot in place; one that outgrows it moves and shifts nothing", ({ expect }) => {
    const previous = units(["a", 1000, 0], ["b", 1000, 1024], ["c", 1000, 2048])
    const grownInSlot = planStableLayout(units(["a", 1024], ["b", 1000], ["c", 1000]), previous, PARAMS)
    expect(grownInSlot.offsets).toEqual([0, 1024, 2048])

    const outgrown = units(["a", 1025], ["b", 1000], ["c", 1000])
    const plan = planStableLayout(outgrown, previous, { ...PARAMS, maxFreeRatio: 1 })
    expect(byPath(outgrown, plan.offsets)).toEqual(
      new Map([
        ["a", 3072],
        ["b", 1024],
        ["c", 2048],
      ])
    )
    expect(plan).toMatchObject({ kept: 2, appended: 1, freedBytes: 1024 })
  })

  test("a removed file frees its slot for a new file that fits", ({ expect }) => {
    const previous = units(["a", 1000, 0], ["b", 4000, 1024], ["c", 1000, 5120])
    const current = units(["a", 1000], ["c", 1000], ["new", 3000])
    const plan = planStableLayout(current, previous, { ...PARAMS, maxFreeRatio: 1 })
    expect(byPath(current, plan.offsets)).toEqual(
      new Map([
        ["a", 0],
        ["c", 5120],
        ["new", 1024],
      ])
    )
    expect(plan).toMatchObject({ kept: 2, filled: 1, appended: 0 })
  })

  test("compacts when the freed slots exceed the threshold", ({ expect }) => {
    const previous = units(["a", 1000, 0], ["b", 4000, 1024], ["c", 1000, 5120])
    const current = units(["a", 1000], ["c", 1000])
    const plan = planStableLayout(current, previous, PARAMS)
    expect(plan.compacted).toBe(true)
    expect(plan.offsets).toEqual([0, 1024])
  })

  test("entries that share content move together; two files that shared a slot do not both claim it", ({ expect }) => {
    const previous: Array<AsarContentUnit> = [
      { paths: ["x", "y"], offset: 0, size: 100 },
      { paths: ["z"], offset: 512, size: 100 },
    ]
    const current: Array<AsarContentUnit> = [
      { paths: ["x"], offset: 0, size: 100 },
      { paths: ["y"], offset: 100, size: 90 },
      { paths: ["z"], offset: 190, size: 100 },
    ]
    const plan = planStableLayout(current, previous, { ...PARAMS, maxFreeRatio: 1 })
    expect(plan.offsets).toEqual([0, 1024, 512])
  })
})

// ─── on real archives ─────────────────────────────────────────────────────────

function makeTree(): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  let seed = 11
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0)
  for (let i = 0; i < 40; i++) {
    const size = i === 0 ? 0 : 100 + (next() % 3000)
    const buf = Buffer.alloc(size)
    for (let j = 0; j < size; j++) {
      buf[j] = next() & 0xff
    }
    files.set(i % 3 === 0 ? `lib/mod${i}.js` : `src/deep/file${i}.txt`, buf)
  }
  // identical content: @electron/asar stores it once
  files.set("lib/copy-of-mod3.js", files.get("lib/mod3.js")!)
  files.set("package.json", Buffer.from(JSON.stringify({ name: "stable", main: "lib/mod0.js" })))
  return files
}

async function pack(tmp: string, name: string, files: Map<string, Buffer>): Promise<string> {
  const src = path.join(tmp, `${name}-src`)
  for (const [rel, content] of files) {
    await fs.mkdir(path.dirname(path.join(src, rel)), { recursive: true })
    await fs.writeFile(path.join(src, rel), content)
  }
  const out = path.join(tmp, `${name}.asar`)
  await (await asar()).createPackage(src, out)
  return out
}

async function entries(file: string): Promise<Map<string, any>> {
  const result = new Map<string, any>()
  const walk = (node: any, prefix: string) => {
    for (const [name, child] of Object.entries<any>(node.files ?? {})) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (child.files != null) {
        walk(child, rel)
      } else {
        result.set(rel, child)
      }
    }
  }
  walk(JSON.parse((await readAsarHeader(file)).header), "")
  return result
}

/** Every file reads back byte-identical through both readers, and its recorded integrity matches what is read. */
async function expectValidArchive(expect: any, file: string, files: Map<string, Buffer>): Promise<void> {
  const electronAsar = await asar()
  const ownReader = await readAsar(file)
  const header = await entries(file)
  for (const [rel, content] of files) {
    const native = rel.split("/").join(path.sep)
    expect(electronAsar.extractFile(file, native).equals(content), `extractFile(${rel})`).toBe(true)
    expect((await ownReader.readFile(native)).equals(content), `readFile(${rel})`).toBe(true)
    const integrity = header.get(rel).integrity
    expect(integrity.hash, `${rel} integrity`).toBe(createHash("sha256").update(content).digest("hex"))
  }
}

describe("applyStableAsarLayout", () => {
  test("keeps untouched files at their offsets across an insertion, a growth and a removal", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const v1Files = makeTree()
    const v1 = await pack(tmp, "v1", v1Files)
    await applyStableAsarLayout(v1, null, PARAMS)
    await expectValidArchive(expect, v1, v1Files)

    const v2Files = new Map(v1Files)
    v2Files.set("lib/aaa-inserted-first.js", Buffer.from("module.exports = 1\n".repeat(50)))
    v2Files.set("src/deep/file2.txt", Buffer.concat([v1Files.get("src/deep/file2.txt")!, Buffer.alloc(4000, 1)]))
    v2Files.delete("src/deep/file4.txt")
    const v2 = await pack(tmp, "v2", v2Files)
    // the tree is tiny, so the two freed slots are a large share of it: keep the threshold out of the way
    const plan = await applyStableAsarLayout(v2, v1, { ...PARAMS, maxFreeRatio: 0.5 })
    expect(plan.compacted).toBe(false)
    await expectValidArchive(expect, v2, v2Files)

    const before = await entries(v1)
    const after = await entries(v2)
    for (const [rel, entry] of after) {
      if (entry.size > 0) {
        expect(parseInt(entry.offset, 10) % 512, `${rel} @ ${entry.offset}`).toBe(0)
      }
      if (rel !== "src/deep/file2.txt" && before.has(rel)) {
        expect(entry.offset, `${rel} must keep its offset`).toBe(before.get(rel).offset)
      }
    }
    expect(after.get("src/deep/file2.txt").offset).not.toBe(before.get("src/deep/file2.txt").offset)
    // de-duplicated content stays shared
    expect(after.get("lib/copy-of-mod3.js").offset).toBe(after.get("lib/mod3.js").offset)
    // the header keeps @electron/asar's entry order
    expect([...after.keys()].filter(it => before.has(it))).toEqual([...before.keys()].filter(it => after.has(it)))
  })

  test("is deterministic: the same inputs give a byte-identical archive", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const files = makeTree()
    const previous = await pack(tmp, "previous", files)
    await applyStableAsarLayout(previous, null, { ...PARAMS, growthMargin: 0.1 })
    const changed = new Map(files)
    changed.set("lib/new.js", Buffer.from("new"))
    const a = await pack(tmp, "a", changed)
    const b = await pack(tmp, "b", changed)
    await applyStableAsarLayout(a, previous, PARAMS)
    await applyStableAsarLayout(b, previous, PARAMS)
    expect((await fs.readFile(a)).equals(await fs.readFile(b))).toBe(true)
  })

  test("a missing previous archive starts a new layout", async ({ expect, tmpDir }) => {
    const tmp = await tmpDir.createTempDir()
    const files = makeTree()
    const file = await pack(tmp, "first", files)
    const plan = await applyStableLayoutOption(file, tmp, { previous: "does-not-exist/app.asar", growthMargin: 0.05 }, 512)
    expect(plan.kept).toBe(0)
    await expectValidArchive(expect, file, files)
  })

  test("validates the option", ({ expect }) => {
    for (const bad of [
      null,
      "app.asar",
      {},
      { previous: "" },
      { previous: "a.asar", growthMargin: -0.1 },
      { previous: "a.asar", growthMargin: 2 },
      { previous: "a.asar", growthMargin: "1" },
    ]) {
      expect(() => validateStableLayoutOptions(bad), JSON.stringify(bad)).toThrow(InvalidConfigurationError)
    }
    expect(() => validateStableLayoutOptions({ previous: "a.asar" })).not.toThrow()
    expect(() => validateStableLayoutOptions({ previous: "a.asar", growthMargin: 0.02 })).not.toThrow()
  })
})

// Through the packager: the default layout is untouched (contiguous, as @electron/asar writes it), and with the option the
// second build keeps the first build's offsets.
test.ifNotWindows("asar.stableLayout keeps the previous build's offsets; the default layout is unchanged", async ({ expect, tmpDir }) => {
  const keep = await tmpDir.createTempDir()
  const previous = path.join(keep, "previous-app.asar")
  const contiguous = (header: Map<string, any>) => {
    const packed = [...header.values()].filter(e => e.offset != null && !e.unpacked).sort((a, b) => parseInt(a.offset, 10) - parseInt(b.offset, 10))
    let end = 0
    for (const e of packed) {
      const offset = parseInt(e.offset, 10)
      if (offset !== end && !(e.size === 0 || offset < end)) {
        return false
      }
      end = Math.max(end, offset + e.size)
    }
    return true
  }
  await app(
    expect,
    { targets: linuxDirTarget },
    { packed: async context => expect(contiguous(await entries(path.join(context.getResources(Platform.LINUX), "app.asar")))).toBe(true) }
  )
  await app(
    expect,
    { targets: linuxDirTarget, config: { asar: { contentAlignment: 512, stableLayout: { previous } } } },
    { packed: async context => fs.copyFile(path.join(context.getResources(Platform.LINUX), "app.asar"), previous) }
  )
  const first = await entries(previous)
  await app(
    expect,
    { targets: linuxDirTarget, config: { asar: { contentAlignment: 512, stableLayout: { previous } } } },
    {
      projectDirCreated: projectDir => fs.writeFile(path.join(projectDir, "aaa-added-first.js"), "module.exports = 42\n"),
      packed: async context => {
        const second = await entries(path.join(context.getResources(Platform.LINUX), "app.asar"))
        // the new file sorts first: without the stable layout it would shift every other app file
        expect(second.has("aaa-added-first.js")).toBe(true)
        expect([...first.values()].filter(e => e.offset != null).length).toBeGreaterThan(1)
        for (const [rel, entry] of first) {
          if (entry.offset != null && second.has(rel) && second.get(rel).size === entry.size) {
            expect(second.get(rel).offset, rel).toBe(entry.offset)
          }
        }
      },
    }
  )
})

test.ifNotWindows("an invalid asar.stableLayout fails before packing", ({ expect }) =>
  appThrows(expect, { targets: linuxDirTarget, config: { asar: { stableLayout: { previous: "a.asar", growthMargin: 5 } } } }, {}, error => {
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("asar.stableLayout.growthMargin")
  })
)
