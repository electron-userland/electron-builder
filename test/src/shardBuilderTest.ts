import * as fs from "fs"
import * as path from "path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { detectHeavyFile } from "../vitest-scripts/vitest-config/file-discovery"
import { computeShardCount, estimateShardMs, splitIntoShards, type WeightedFile } from "../vitest-scripts/vitest-config/shard-builder"
import { CI_PARALLELISM, getMaxWorkers, HEAVY_TARGET_MS, TARGET_MS } from "../vitest-scripts/vitest-config/smart-config"
import SmartSequencer from "../vitest-scripts/vitest-config/vitest-smart-sequencer"
import { isHeavyTest, ownDuration, serialEquivalentDuration } from "../vitest-scripts/vitest-config/vitest-smart-reporter"

const MIN = 60 * 1000

function file(filename: string, minutes: number, heavy = false): WeightedFile {
  return { filename, filepath: filename, weight: minutes * MIN, heavy }
}

function names(shards: WeightedFile[][]): string[][] {
  return shards.map(shard => shard.map(f => f.filename).sort())
}

function stubCiPlanning() {
  vi.stubEnv("CI", "true")
  vi.stubEnv("TEST_FILES", "")
  vi.stubEnv("VITEST_SHARD_COUNT", "")
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("shard planning with parallel workers", () => {
  test("a shard's wall time is its files spread over the workers, but never less than its heavy files run one after another", () => {
    expect(estimateShardMs([file("a", 30), file("b", 30)], 2)).toBe(30 * MIN)
    expect(estimateShardMs([file("a", 30, true), file("b", 10, true), file("c", 20)], 2)).toBe(40 * MIN)
    expect(estimateShardMs([file("a", 30), file("b", 30)])).toBe(60 * MIN)
  })

  test("the shard count divides the work by the platform's speed-up", () => {
    stubCiPlanning()
    const { speedup } = CI_PARALLELISM.linux
    const files = Array.from({ length: 10 }, (_, i) => file(`f${i}`, (TARGET_MS * speedup * 3) / 10 / MIN))
    expect(computeShardCount(files, "linux")).toBe(3)
  })

  test("the shard count leaves room for the heavy files, which never run in parallel", () => {
    stubCiPlanning()
    const heavy = Array.from({ length: 5 }, (_, i) => file(`heavy${i}`, HEAVY_TARGET_MS / MIN, true))
    expect(computeShardCount(heavy, "darwin")).toBe(5)
  })

  test("a scoped or local run is never smart-sharded", () => {
    vi.stubEnv("CI", "")
    expect(computeShardCount([file("a", 1000)], "darwin")).toBe(1)
    stubCiPlanning()
    vi.stubEnv("TEST_FILES", "dmg")
    expect(computeShardCount([file("a", 1000)], "darwin")).toBe(1)
  })

  test("heavy files are spread over the shards before the other files fill them up", () => {
    const shards = splitIntoShards([file("h1", 20, true), file("h2", 18, true), file("r1", 10), file("r2", 10), file("r3", 10), file("r4", 10)], 2, 2)
    expect(names(shards)).toEqual([
      ["h1", "r3", "r4"],
      ["h2", "r1", "r2"],
    ])
    expect(shards.map(shard => estimateShardMs(shard, 2) / MIN)).toEqual([20, 19])
  })

  test("with one file at a time it is plain longest-first packing", () => {
    const shards = splitIntoShards([file("a", 5), file("b", 4), file("c", 3), file("d", 3)], 2)
    expect(names(shards)).toEqual([
      ["a", "d"],
      ["b", "c"],
    ])
  })

  test("files are run one at a time locally and in TEST_FILES-scoped CI jobs unless VITEST_MAX_WORKERS says otherwise", () => {
    vi.stubEnv("CI", "")
    vi.stubEnv("VITEST_MAX_WORKERS", "")
    vi.stubEnv("TEST_FILES", "")
    expect(getMaxWorkers("darwin")).toBe(1)
    vi.stubEnv("CI", "true")
    expect(getMaxWorkers("darwin")).toBe(CI_PARALLELISM.darwin.workers)
    // the e2e auto-updater jobs install packages machine-wide from several files
    vi.stubEnv("TEST_FILES", "blackboxUpdateTest,blackboxInstallTest")
    expect(getMaxWorkers("linux")).toBe(1)
    vi.stubEnv("VITEST_MAX_WORKERS", "2")
    expect(getMaxWorkers("darwin")).toBe(2)
  })
})

describe("heavy test detection", () => {
  test("a file with a heavy suite or test is heavy, prose about one is not", async ({ tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "heavy-detection" })
    const write = (name: string, content: string) => {
      const target = path.join(dir, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
      return target
    }
    expect(detectHeavyFile(write("suiteTest.ts", `describe.heavy.ifLinux("deb", () => {})\n`))).toBe(true)
    expect(detectHeavyFile(write("testTest.ts", `test.ifMac.heavy("dmg", options, () => {})\n`))).toBe(true)
    expect(
      detectHeavyFile(
        write(
          "proseTest.ts",
          `// runs like describe.heavy("x", ...)\n  expect((test.heavy as any)("legacy", () => 1, 5)).toThrow()\n  write("a.ts", "describe.heavy(\\"deb\\", () => {})")\ndescribe("x", () => {})\n`
        )
      )
    ).toBe(false)
  })

  test("a generated toolset file is heavy when the suite module it registers is", async ({ tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "heavy-detection" })
    fs.mkdirSync(path.join(dir, "updater"), { recursive: true })
    fs.mkdirSync(path.join(dir, "generated", "blackboxWin"), { recursive: true })
    fs.writeFileSync(path.join(dir, "updater", "heavySuite.ts"), `export function registerHeavy() {\n  describe.heavy("windows", () => {})\n}\n`)
    fs.writeFileSync(path.join(dir, "updater", "lightSuite.ts"), `export function registerLight() {\n  describe("windows", () => {})\n}\n`)
    const generated = (name: string, suite: string, fn: string) => {
      const target = path.join(dir, "generated", "blackboxWin", name)
      fs.writeFileSync(target, `import { ${fn} } from "../../updater/${suite}"\n\ndescribe("blackboxWin", () => {\n  ${fn}({})\n})\n`)
      return target
    }
    expect(detectHeavyFile(generated("heavy__e2e.ts", "heavySuite", "registerHeavy"))).toBe(true)
    expect(detectHeavyFile(generated("light__e2e.ts", "lightSuite", "registerLight"))).toBe(false)
  })

  test("the reporter caches a heavy test's duration without its wait for the heavy-test mutex", () => {
    const reported = (duration: number, meta: Record<string, unknown>) => ({ diagnostic: () => ({ duration }), meta: () => meta }) as any
    expect(ownDuration(reported(10 * MIN, { heavy: true, heavyWaitMs: 4 * MIN }))).toBe(6 * MIN)
    expect(ownDuration(reported(10 * MIN, {}))).toBe(10 * MIN)
  })

  test("a duration from files running in parallel is cached in the serial unit the planner divides by the speed-up", () => {
    const reported = (duration: number) => ({ diagnostic: () => ({ duration }), meta: () => ({}) }) as any
    vi.stubEnv("TEST_FILES", "")
    vi.stubEnv("VITEST_MAX_WORKERS", "")
    vi.stubEnv("CI", "true")
    const { workers, speedup } = CI_PARALLELISM.linux
    expect(serialEquivalentDuration(reported(10 * MIN), "linux")).toBeCloseTo((10 * MIN * speedup) / workers)
    // one file at a time: as measured
    vi.stubEnv("TEST_FILES", "blackboxUpdateTest")
    expect(serialEquivalentDuration(reported(10 * MIN), "linux")).toBe(10 * MIN)
    vi.stubEnv("TEST_FILES", "")
    vi.stubEnv("CI", "")
    expect(serialEquivalentDuration(reported(10 * MIN), "linux")).toBe(10 * MIN)
  })

  test("the reporter finds the heavy flag of an enclosing suite", () => {
    const module = { type: "module", meta: () => ({}) }
    const heavySuite = { type: "suite", meta: () => ({ heavy: true }), parent: module }
    const plainSuite = { type: "suite", meta: () => ({}), parent: module }
    expect(isHeavyTest({ type: "test", meta: () => ({}), parent: heavySuite } as any)).toBe(true)
    expect(isHeavyTest({ type: "test", meta: () => ({ heavy: true }), parent: plainSuite } as any)).toBe(true)
    expect(isHeavyTest({ type: "test", meta: () => ({}), parent: plainSuite } as any)).toBe(false)
  })
})

describe("SmartSequencer with parallel workers", () => {
  test("hands one heavy file out after every (workers - 1) regular ones", async ({ tmpDir }) => {
    vi.stubEnv("CI", "true")
    vi.stubEnv("VITEST_MAX_WORKERS", "3")
    const dir = await tmpDir.getTempDir({ prefix: "sequencer" })
    fs.mkdirSync(dir, { recursive: true })
    const spec = (name: string, heavy: boolean) => {
      const moduleId = path.join(dir, name)
      fs.writeFileSync(moduleId, heavy ? `describe.heavy("x", () => {})\n` : `describe("x", () => {})\n`)
      return { moduleId } as any
    }
    const sequencer = Object.create(SmartSequencer.prototype) as SmartSequencer
    Object.defineProperty(sequencer, "cache", { value: { tests: {}, files: {} } })
    const order = (sequencer as any).sortByPriority([spec("h1.ts", true), spec("h2.ts", true), spec("r1.ts", false), spec("r2.ts", false), spec("r3.ts", false)], "linux")
    expect(order.map((it: any) => path.basename(it.moduleId))).toEqual(["h1.ts", "r1.ts", "r2.ts", "h2.ts", "r3.ts"])
  })
})
