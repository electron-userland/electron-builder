import * as path from "path"
import { BaseSequencer, TestSpecification } from "vitest/node"
import { loadCache } from "./cache"
import { DEFAULT_FILE_MS, SupportedPlatforms } from "./smart-config"

export default class SmartSequencer extends BaseSequencer {
  readonly cache = loadCache()

  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const currentPlatform = process.platform as SupportedPlatforms
    const estimatedDuration = files.reduce((sum, f) => {
      const basename = path.basename(f.moduleId)
      const stat = this.cache.files[basename]
      const base = stat?.platformRuns?.[currentPlatform]?.avgMs ?? DEFAULT_FILE_MS
      return sum + base
    }, 0)

    console.log()
    console.log("Test Platform:", currentPlatform)
    console.log("Estimated test duration:", formatDuration(estimatedDuration))
    console.log()
    console.log(`Test files:`)
    files
      .sort((a, b) => path.basename(a.moduleId).localeCompare(path.basename(b.moduleId)))
      .forEach(f => {
        const file = path.basename(f.moduleId)
        const stat = this.cache.files[file]
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
      const basename = path.basename(file.moduleId)
      const fileStats = this.cache.files[basename]

      if (fileStats?.hasHeavyTests) {
        heavyFiles.push(file)
      } else {
        regularFiles.push(file)
      }
    }

    // Sort heavy files by duration (longest first) to run them early
    const sortedHeavy = heavyFiles.sort((a, b) => {
      const A = this.cache.files[path.basename(a.moduleId)]
      const B = this.cache.files[path.basename(b.moduleId)]
      const aScore = (A?.unstable ? 1_000_000 : 0) + (A?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      const bScore = (B?.unstable ? 1_000_000 : 0) + (B?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      return bScore - aScore
    })

    // Sort regular files by priority (unstable/long first)
    const sortedRegular = regularFiles.sort((a, b) => {
      const A = this.cache.files[path.basename(a.moduleId)]
      const B = this.cache.files[path.basename(b.moduleId)]
      const aScore = (A?.unstable ? 1_000_000 : 0) + (A?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      const bScore = (B?.unstable ? 1_000_000 : 0) + (B?.platformRuns?.[currentPlatform]?.avgMs ?? 0)
      return bScore - aScore
    })

    // Heavy tests run first, then regular tests
    // This allows heavy tests to claim workers early and run sequentially
    return [...sortedHeavy, ...sortedRegular]
  }
}

function formatDuration(ms?: number): string {
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