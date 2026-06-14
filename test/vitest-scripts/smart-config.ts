import * as path from "path"

export type TargetPlatform = "darwin" | "win32" | "linux" | "current"
export type SupportedPlatforms = Exclude<TargetPlatform, "current">

export const TEST_ROOT = "test/src"
export const TEST_FILES_PATTERN = process.env.TEST_FILES?.trim() || "*Test,*test"

export const CACHE_FILE = process.env.VITEST_SMART_CACHE_FILE || path.resolve(__dirname, "_vitest-smart-cache.json")

export const DEFAULT_FILE_MS = 2 * 60 * 1000
export const DEFAULT_TARGET_MS = 20 * 60 * 1000
export const TARGET_MS = Number(process.env.VITEST_TARGET_MS) || DEFAULT_TARGET_MS
export const SAFEGUARD_MAX_SHARDS = 14

export const SHARD_INDEX = process.env.VITEST_SHARD_INDEX != null ? Number(process.env.VITEST_SHARD_INDEX) : null

export const PLATFORM = process.platform as SupportedPlatforms

export const IS_MAC = PLATFORM === "darwin"
export const IS_WIN = PLATFORM === "win32"
export const IS_LINUX = PLATFORM === "linux"

export const UNSTABLE_FAIL_RATIO = 0.2
// Add here broken tests to exclude from smart sharding
// TODO: FIX ALL OF THESE 😅
export const skippedTests =
  process.env.SKIPPED_TESTS?.split(",")
    .map(s => s.trim())
    .filter(Boolean) ||
  [
    // These tests require running on a native Linux environment with Flatpak support
    // "flatpakTest",
    // These tests are run separately due to different docker images used for testing, and they are currently unstable in the CI environment
    // Test via `./test/src/linux/test-snap.sh`
    // "snapHeavyTest",
    // "snapTest",
    // General instability tests are below
    // None currently, but this is where we would add any test that is currently unstable in the CI environment and needs to be excluded from smart sharding until it can be fixed.
  ]
export const skipPerOSTests: Record<SupportedPlatforms, string[]> = {
  darwin: ["fpmTest", "macUpdaterTest", "blackboxUpdateTest"],
  linux: [],
  win32: [],
}
