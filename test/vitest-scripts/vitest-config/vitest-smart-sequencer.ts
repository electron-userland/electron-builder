import { BaseSequencer, TestSpecification } from "vitest/node"
import { getFileStats, loadCache } from "./cache"
import { detectHeavyFile } from "./file-discovery"
import { DEFAULT_FILE_MS, getMaxWorkers, SupportedPlatforms } from "./smart-config"

export default class SmartSequencer extends BaseSequencer {
  readonly cache = loadCache()

  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const currentPlatform = process.platform as SupportedPlatforms
    const estimatedDuration = files.reduce((sum, f) => {
      const { stat } = getFileStats(this.cache, f)
      const base = stat?.platformRuns?.[currentPlatform]?.avgMs ?? DEFAULT_FILE_MS
      return sum + base
    }, 0)

    console.log()
    console.log("Test Platform:", currentPlatform)
    console.log("Estimated test duration:", formatDuration(estimatedDuration))
    console.log()
    console.log(`Test files:`)
    ;[...files]
      .sort((a, b) => getFileStats(this.cache, b).file.localeCompare(getFileStats(this.cache, a).file))
      .forEach(f => {
        const { stat, file } = getFileStats(this.cache, f)
        const time = stat?.platformRuns?.[currentPlatform]?.avgMs
        console.log(`  - ${file} (${formatDuration(time)})${stat?.unstable ? " [unstable]" : ""}`)
      })
    console.log()

    // Flatten shards back into file list, preserving shard order
    return Promise.resolve(this.sortByPriority(files, currentPlatform))
  }

  private sortByPriority(files: TestSpecification[], currentPlatform: SupportedPlatforms): TestSpecification[] {
    // Separate heavy test files from regular ones
    const heavyFiles: TestSpecification[] = []
    const regularFiles: TestSpecification[] = []

    for (const file of files) {
      const { stat } = getFileStats(this.cache, file)

      if (stat?.hasHeavyTests || detectHeavyFile(file.moduleId)) {
        heavyFiles.push(file)
      } else {
        regularFiles.push(file)
      }
    }

    // Sort heavy files by duration (longest first) to run them early
    const sortedHeavy = heavyFiles.sort((a, b) => {
      const { stat: A } = getFileStats(this.cache, a)
      const { stat: B } = getFileStats(this.cache, b)
      const aScore = (A?.unstable ? 1_000_000 : 0) + (A?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      const bScore = (B?.unstable ? 1_000_000 : 0) + (B?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      return bScore - aScore
    })

    // Sort regular files by priority (unstable/long first)
    const sortedRegular = regularFiles.sort((a, b) => {
      const { stat: A } = getFileStats(this.cache, a)
      const { stat: B } = getFileStats(this.cache, b)
      const aScore = (A?.unstable ? 1_000_000 : 0) + (A?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      const bScore = (B?.unstable ? 1_000_000 : 0) + (B?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      return bScore - aScore
    })

    // One worker: heavy tests run first, then regular tests.
    // Several workers: heavy tests take turns across all of them (vitest-heavy-mutex.ts), so a worker that picks up a heavy file while
    // another one runs is idle until its turn. Hand the files out heavy first, then one heavy file after every (workers - 1) regular
    // ones, so the heavy lane is always busy while the other workers keep taking regular files.
    const workers = getMaxWorkers(currentPlatform)
    if (workers <= 1 || sortedHeavy.length === 0) {
      return [...sortedHeavy, ...sortedRegular]
    }
    const ordered: TestSpecification[] = []
    for (const heavy of sortedHeavy) {
      ordered.push(heavy, ...sortedRegular.splice(0, workers - 1))
    }
    return [...ordered, ...sortedRegular]
  }
}

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) {
    return "unknown"
  }
  if (ms < 1000) {
    return `~${Math.round(ms)}ms`
  }
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) {
    return `~${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds ? `~${minutes}m ${seconds}s` : `~${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `~${hours}h ${remainingMinutes}m` : `~${hours}h`
}
