import * as path from "path"
import type { Reporter, TestCase, TestModule } from "vitest/node"
import { FileStats, loadCache, saveCache, TestStats } from "./cache"
import { FLAKE_FAIL_RATIO, SLOW_TEST_MS } from "./smart-config"
import { SupportedPlatforms } from "./smart-config"

const defaultStat: TestStats = {
  runs: 0,
  fails: 0,
  avgMs: 0,
  slow: false,
  heavy: false,
}

export default class SmarterReporter implements Reporter {
  cache = loadCache()
  fileDurations = new Map<string, number>()
  fileFails = new Map<string, number>()
  fileHasHeavy = new Map<string, boolean>()

  // Get current platform
  currentPlatform = process.platform as SupportedPlatforms

  onTestCaseResult(test: TestCase) {
    const id = test.fullName
    const dur = test.module.diagnostic().duration ?? 0
    const failed = test.result().state === "failed"

    // Access meta through the test task
    const meta = (test as any).meta || {}

    const prev: TestStats = this.cache.tests[id] ?? { ...defaultStat }
    const runs = prev.runs + 1
    const avgMs = (prev.avgMs * prev.runs + dur) / runs
    const fails = prev.fails + (failed ? 1 : 0)
    const isHeavy = meta.heavy === true // don't rely on previous tests, always reset off latest test `meta`

    this.cache.tests[id] = {
      runs,
      fails,
      avgMs,
      slow: avgMs > SLOW_TEST_MS,
      heavy: isHeavy,
    }

    const file = path.basename(test.module.moduleId)
    this.fileDurations.set(file, (this.fileDurations.get(file) ?? 0) + dur)
    if (failed) {
      this.fileFails.set(file, (this.fileFails.get(file) ?? 0) + 1)
    }
    if (isHeavy) {
      this.fileHasHeavy.set(file, true)
    }
  }

  onTestModuleEnd(mod: TestModule) {
    const file = path.basename(mod.moduleId)
    const dur = this.fileDurations.get(file) ?? 0
    const fails = this.fileFails.get(file) ?? 0
    const hasHeavy = this.fileHasHeavy.get(file) ?? false

    const prev: FileStats = this.cache.files[file] ?? {
      runs: 0,
      fails: 0,
      avgMs: 0,
      unstable: false,
      hasHeavyTests: false,
      platformAvgMs: { win32: 0, darwin: 0, linux: 0 },
      platformRuns: { win32: 0, darwin: 0, linux: 0 },
    }

    const runs = prev.runs + 1
    const avgMs = (prev.avgMs * prev.runs + dur) / runs
    const totalFails = prev.fails + fails
    const failRatio = totalFails / runs

    // Update platform-specific stats
    const base = { win32: 0, darwin: 0, linux: 0 }
    const platformAvgMs = { ...base, ...prev.platformAvgMs }
    const platformRuns = { ...base, ...prev.platformRuns }

    if (platformAvgMs && platformRuns) {
      const prevPlatformRuns = platformRuns[this.currentPlatform] || 0
      const prevPlatformAvg = platformAvgMs[this.currentPlatform] || 0
      const newPlatformRuns = prevPlatformRuns + 1
      const newPlatformAvg = (prevPlatformAvg * prevPlatformRuns + dur) / newPlatformRuns

      platformAvgMs[this.currentPlatform] = newPlatformAvg
      platformRuns[this.currentPlatform] = newPlatformRuns
    }

    this.cache.files[file] = {
      runs,
      fails: totalFails,
      avgMs,
      unstable: failRatio > FLAKE_FAIL_RATIO,
      hasHeavyTests: hasHeavy || prev.hasHeavyTests,
      platformAvgMs,
      platformRuns,
    }
  }

  onTestRunEnd() {
    saveCache(this.cache)
  }
}
