import * as path from "path"

export type TargetPlatform = "darwin" | "win32" | "linux" | "current"
export type SupportedPlatforms = Exclude<TargetPlatform, "current">

export const TEST_ROOT = "test/src"

/**
 * The `TEST_FILES` override as a list of trimmed, non-empty filename substrings, or `undefined` when it is unset or
 * blank. A blank value is not an override: docker/run-tests.sh always passes `-e TEST_FILES="${TEST_FILES:-}"`, so inside
 * the container an unset variable arrives as `""` — and `"".split(",")` would yield `[""]`, which `name.includes("")`
 * matches for every directory entry (helpers, shell scripts, dockerfiles …). Every reader of `TEST_FILES` goes through
 * this helper so they agree on what "no override" means. Read on each call so tests can stub the variable.
 */
export function getTestFilesOverride(): string[] | undefined {
  const tokens = (process.env.TEST_FILES ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
  return tokens.length > 0 ? tokens : undefined
}

/**
 * Basename globs (without `.ts`) of the four test-file classes vitest admits when there is no `TEST_FILES` override:
 * `*Test` / `*test` (unit-level) and `*.e2e` / `*__e2e` (installer-reading, see isE2eTestFile in file-discovery.ts).
 * With an override, run-vitest.ts expands each token instead (see buildIncludeGlobs there).
 */
export const DEFAULT_TEST_FILE_GLOBS: ReadonlyArray<string> = ["*Test", "*test", "*.e2e", "*__e2e"]

/**
 * Which class of test files discovery admits (see file-discovery.ts):
 *  - `all`  (default) — every `*Test.ts` plus every e2e file (`*.e2e.ts`, generated `*__e2e.ts`)
 *  - `unit` — only `*Test.ts`: tests that stop once the app directory is assembled (dir targets,
 *             `afterPackTestHook`, `effectiveOptionComputed`, thrown-config tests)
 *  - `e2e`  — only the e2e files: tests that build the installer / archive and read it back
 *
 * `TEST_FILES` is an explicit override and always wins over the mode.
 */
export type TestMode = "all" | "unit" | "e2e"
const TEST_MODES: ReadonlyArray<TestMode> = ["all", "unit", "e2e"]
const rawTestMode = process.env.TEST_MODE?.trim() || "all"
if (!TEST_MODES.includes(rawTestMode as TestMode)) {
  throw new Error(`Invalid TEST_MODE "${rawTestMode}" — expected one of ${TEST_MODES.join(", ")}`)
}
export const TEST_MODE = rawTestMode as TestMode

export const CACHE_FILE = process.env.VITEST_SMART_CACHE_FILE || path.resolve(__dirname, "_vitest-smart-cache.json")

// The smart reporter, cache, and sequencer are data-collection plumbing. Their per-test
// progress lines, in-progress heartbeat, cache load/save chatter, and plan dump duplicate
// vitest's default reporter and interleave with its output (especially failure summaries),
// so they're silent by default. Set SMART_REPORTER_VERBOSE=true to restore them for local
// debugging. Cache-collection and sorting still run regardless of this flag.
export const SMART_REPORTER_VERBOSE = process.env.SMART_REPORTER_VERBOSE !== "false" && !process.env.CI

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
    // "flatpak.e2e",
    // These tests are run separately due to different docker images used for testing, and they are currently unstable in the CI environment
    // Test via `./test/src/linux/test-snap.sh`
    // "snapHeavy.e2e",
    // "snapTest",
    // General instability tests are below
    // None currently, but this is where we would add any test that is currently unstable in the CI environment and needs to be excluded from smart sharding until it can be fixed.
  ]
export const skipPerOSTests: Record<SupportedPlatforms, string[]> = {
  darwin: ["fpm.e2e"],
  linux: [],
  win32: [],
}
