import * as path from "path"
import type { Reporter, TestCase, TestModule } from "vitest/node"
import { FileStats, loadCache, saveCache, TestStats } from "./cache"
import { UNSTABLE_FAIL_RATIO, SupportedPlatforms } from "./smart-config"

const defaultStat: TestStats = {
  platformRuns: {
    win32: { runs: 0, fails: 0, avgMs: 0 },
    darwin: { runs: 0, fails: 0, avgMs: 0 },
    linux: { runs: 0, fails: 0, avgMs: 0 },
  },
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
    const dur = test.diagnostic()?.duration ?? 0
    const failed = test.result().state === "failed"

    // Access meta through the test task
    const meta = (test as any).meta || {}

    const prev: TestStats = this.cache.tests[id] ?? { ...defaultStat }

    // Ensure platform objects exist
    const platformRuns = {
      win32: { runs: 0, fails: 0, avgMs: 0 },
      darwin: { runs: 0, fails: 0, avgMs: 0 },
      linux: { runs: 0, fails: 0, avgMs: 0 },
      ...prev.platformRuns,
    }

    const prevRuns = platformRuns[this.currentPlatform].runs
    const prevFails = platformRuns[this.currentPlatform].fails
    const prevAvg = platformRuns[this.currentPlatform].avgMs

    const newRuns = prevRuns + 1
    const newFails = prevFails + (failed ? 1 : 0)
    const newAvg = (prevAvg * prevRuns + dur) / newRuns

    platformRuns[this.currentPlatform] = { runs: newRuns, fails: newFails, avgMs: newAvg }

    const isHeavy = meta.heavy === true

    this.cache.tests[id] = {
      platformRuns,
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
      unstable: false,
      hasHeavyTests: false,
      platformRuns: {
        win32: { runs: 0, fails: 0, avgMs: 0 },
        darwin: { runs: 0, fails: 0, avgMs: 0 },
        linux: { runs: 0, fails: 0, avgMs: 0 },
      },
    }

    // Ensure platform objects exist
    const platformRuns = {
      win32: { runs: 0, fails: 0, avgMs: 0 },
      darwin: { runs: 0, fails: 0, avgMs: 0 },
      linux: { runs: 0, fails: 0, avgMs: 0 },
      ...prev.platformRuns,
    }

    const prevPlatformRuns = platformRuns[this.currentPlatform].runs
    const prevPlatformFails = platformRuns[this.currentPlatform].fails
    const prevPlatformAvg = platformRuns[this.currentPlatform].avgMs

    const newPlatformRuns = prevPlatformRuns + 1
    const totalFails = prevPlatformFails + fails
    const failRatio = totalFails / newPlatformRuns

    platformRuns[this.currentPlatform] = { runs: newPlatformRuns, fails: totalFails, avgMs: (prevPlatformAvg * prevPlatformRuns + dur) / newPlatformRuns }

    this.cache.files[file] = {
      unstable: failRatio > UNSTABLE_FAIL_RATIO,
      hasHeavyTests: hasHeavy || prev.hasHeavyTests,
      platformRuns,
    }
  }

  onTestRunEnd() {
    saveCache(this.cache)
  }
}