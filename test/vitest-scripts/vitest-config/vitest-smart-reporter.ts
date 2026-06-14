import * as path from "path"
import type { Reporter, TestCase, TestModule } from "vitest/node"
import { FileStats, loadCache, saveCache, TestStats } from "./cache.js"
import { UNSTABLE_FAIL_RATIO, SupportedPlatforms } from "./smart-config.js"

const defaultStat: TestStats = {
  platformRuns: {
    win32: { runs: 0, fails: 0, avgMs: 0 },
    darwin: { runs: 0, fails: 0, avgMs: 0 },
    linux: { runs: 0, fails: 0, avgMs: 0 },
  },
  heavy: false,
}

export const TEST_SRC_ROOT = path.resolve(__dirname, "../../src")

const shouldResetSnapshot = process.env.RESET_VITEST_SHARD_CACHE === "true"

export default class SmarterReporter implements Reporter {
  private readonly cache = shouldResetSnapshot ? { tests: {}, files: {} } : loadCache()
  private readonly fileDurations = new Map<string, number>()
  private readonly fileFails = new Map<string, number>()
  private readonly fileHasHeavy = new Map<string, boolean>()
  private readonly inProgressTests = new Map<string, number>() // moduleRelPath::fullName → startMs
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // Get current platform
  currentPlatform = process.platform as SupportedPlatforms

  onInit() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const running = [...this.inProgressTests.entries()]
      if (running.length === 0) {
        return
      }
      const lines = running.map(([name, start]) => `  ⏳ ${name} (${Math.floor((now - start) / 1000)}s)`).join("\n")
      process.stdout.write(`\n[still running]\n${lines}\n`)
    }, 30_000)
  }

  onTestCaseReady(test: TestCase) {
    const id = `${path.relative(TEST_SRC_ROOT, test.module.moduleId).split(path.sep).join("/")}::${test.fullName}`
    this.inProgressTests.set(id, Date.now())
    process.stdout.write(`\n[test ready] 🏃 ${test.fullName}\n`)
  }

  onTestCaseResult(test: TestCase) {
    const id = `${path.relative(TEST_SRC_ROOT, test.module.moduleId).split(path.sep).join("/")}::${test.fullName}`
    this.inProgressTests.delete(id)
    const dur = test.diagnostic()?.duration ?? 0
    const testResult = test.result().state
    const status = (() => {
      switch (testResult) {
        case "passed":
          return "✅"
        case "failed":
          return "❌"
        case "skipped":
          return "⏭️"
        default:
          return "❔"
      }
    })()
    process.stdout.write(`\n${status} ${id} (${Math.round(dur / 1000)}s)\n`)

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
    const newFails = prevFails + (testResult === "failed" ? 1 : 0)
    const newAvg = shouldResetSnapshot ? dur : (prevAvg * prevRuns + dur) / newRuns

    platformRuns[this.currentPlatform] = { runs: newRuns, fails: newFails, avgMs: newAvg }

    const isHeavy = meta.heavy === true

    this.cache.tests[id] = {
      platformRuns,
      heavy: isHeavy,
    }

    const file = path.relative(TEST_SRC_ROOT, test.module.moduleId).split(path.sep).join("/")
    this.fileDurations.set(file, (this.fileDurations.get(file) ?? 0) + dur)
    if (testResult === "failed") {
      this.fileFails.set(file, (this.fileFails.get(file) ?? 0) + 1)
    }
    if (isHeavy) {
      this.fileHasHeavy.set(file, true)
    }
  }

  onTestModuleEnd(mod: TestModule) {
    const file = path.relative(TEST_SRC_ROOT, mod.moduleId).split(path.sep).join("/")
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

    // Ensure platform objects exist (migration from v0 - can delete after next cache reset)
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

    platformRuns[this.currentPlatform] = {
      runs: newPlatformRuns,
      fails: totalFails,
      avgMs: shouldResetSnapshot ? dur : (prevPlatformAvg * prevPlatformRuns + dur) / newPlatformRuns,
    }

    this.cache.files[file] = {
      unstable: failRatio > UNSTABLE_FAIL_RATIO,
      hasHeavyTests: hasHeavy || prev.hasHeavyTests,
      platformRuns,
    }
  }

  onTestRunEnd() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    saveCache(this.cache)
  }
}
