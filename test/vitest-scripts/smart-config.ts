import * as path from "path"

export const SLOW_TEST_MS = 3 * 60 * 1000
export const FLAKE_FAIL_RATIO = 0.2

export type TargetPlatform = "darwin" | "win32" | "linux" | "current"
export type SupportedPlatforms = Exclude<TargetPlatform, "current">

export const TEST_ROOT = "test/src"
export const TEST_FILES_PATTERN = process.env.TEST_FILES?.trim() || "*Test,*test"

export const CACHE_FILE = process.env.VITEST_SMART_CACHE_FILE || path.resolve(__dirname, "_vitest-smart-cache.json")

export const DEFAULT_FILE_MS = 60 * 1000
export const DEFAULT_TARGET_MS = 20 * 60 * 1000
export const TARGET_MS = Number(process.env.VITEST_TARGET_MS) || DEFAULT_TARGET_MS

export const SHARD_INDEX = process.env.VITEST_SHARD_INDEX != null ? Number(process.env.VITEST_SHARD_INDEX) : null

export const PLATFORM = process.platform as SupportedPlatforms

export const IS_MAC = PLATFORM === "darwin"
export const IS_WIN = PLATFORM === "win32"
export const IS_LINUX = PLATFORM === "linux"

export function normalizePath(p: string) {
  return p.split(path.sep).join("/")
}

// Add here unstable tests to exclude from smart sharding
// TODO: FIX ALL OF THESE 😅
const unstableTests = [
  // General instability
  "snapHeavyTest",
  "blackboxUpdateTest",
]
const unstablePerOSTests: Record<SupportedPlatforms, string[]> = {
  darwin: ["fpmTest", "macUpdaterTest"],
  linux: ["flatpakTest"],
  win32: ["msiWrappedTest", "appxTest"],
}

export function isUnstableTest(file: string, platform: TargetPlatform): boolean {
  const key: SupportedPlatforms = platform !== "current" ? platform : PLATFORM
  return unstableTests.some(t => file.includes(t)) || unstablePerOSTests[key]?.some(t => file.includes(t)) || false
}
