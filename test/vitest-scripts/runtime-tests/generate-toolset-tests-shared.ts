import * as fs from "fs-extra"
import * as path from "path"
import type { TestOptions } from "vitest"
import type { ConditionalChainProps } from "../../typings/vitest"

export const TEST_SRC_DIR = path.resolve(__dirname, "../../src")
export const GENERATED_TESTS_DIR = path.resolve(TEST_SRC_DIR, "generated")
export const SNAPSHOTS_GEN_DIR = path.resolve(TEST_SRC_DIR, "snapshots", "generated")

export type SuiteChainKey = keyof ConditionalChainProps<never>

/**
 * Returns the platform filename suffix for a generated test file based on its describe chain.
 *
 * `platformAllowed()` in file-discovery.ts gates files by ".win.", ".linux.", or ".mac." in their
 * path. Without these markers, a Windows-only generated test would appear in the Linux shard plan
 * (and vice versa) and permanently show "unknown" timing because it never actually runs there.
 *
 * Examples:
 *   ["ifWindows"]        → ".win."   → foo.win.Test.ts  (excluded from Linux / macOS plans)
 *   ["ifLinux"]          → ".linux." → foo.linux.Test.ts (excluded from Windows / macOS plans)
 *   ["ifMac"]            → ".mac."   → foo.mac.Test.ts
 *   ["ifNotWindows"]     → "__"      → foo__Test.ts (runs on Linux + macOS; no marker needed)
 *   ["heavy", "ifLinux"] → ".linux." → foo.linux.Test.ts
 *   undefined / []       → "__"      → foo__Test.ts (cross-platform)
 *
 * The `Test.ts` tail becomes `e2e.ts` for suites flagged `e2e` (see getTestFileSuffix).
 */
export function getPlatformSuffix(chain?: SuiteChainKey[]): string {
  if (!chain) {
    return "__"
  }
  if (chain.includes("ifWindows")) {
    return ".win."
  }
  if (chain.includes("ifLinux")) {
    return ".linux."
  }
  if (chain.includes("ifMac")) {
    return ".mac."
  }
  return "__"
}

export interface DescribeConfig {
  readonly name: string
  readonly chain?: SuiteChainKey[]
}

export interface SuiteConfig {
  readonly name: string
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  readonly registerFn: Function
  readonly importPath: string
  readonly describeConfig: DescribeConfig
  readonly describeOptions?: TestOptions
  /**
   * The suite builds installers/archives and inspects them, so its generated files are emitted as `*.e2e.ts`
   * (selected by `TEST_MODE=all|e2e`, see smart-config.ts) instead of `*Test.ts` (`TEST_MODE=all|unit`).
   */
  readonly e2e?: boolean
}

/**
 * Filename tail of a generated test file: `Test.ts` for suites that stop at the app directory, `e2e.ts` for
 * suites flagged {@link SuiteConfig.e2e}. Always preceded by the platform suffix from {@link getPlatformSuffix},
 * e.g. `portable__wcs-1.0.0__nsis-0.0.0.win.e2e.ts` or `nsisWine__wine-1.0.1__e2e.ts` — both forms are what
 * `isE2eTestFile` (file-discovery.ts) recognises.
 */
export function getTestFileSuffix(suite: Pick<SuiteConfig, "e2e">): string {
  return suite.e2e ? "e2e.ts" : "Test.ts"
}

export function buildDescribeCall(chain?: SuiteChainKey[]): string {
  if (!chain || chain.length === 0) {
    // ex: describe("linux", () => { ... })
    return "describe"
  }
  // requires the additional `.` prefix to properly chain the calls — ex: describe.ifLinux("linux", () => { ... })
  return `describe.${chain.join(".")}`
}

// Creates a Function whose .name equals `name` — use with `satisfies keyof typeof _Module` for type-safe fn references
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function namedFn(name: string): Function {
  const f = function () {}
  Object.defineProperty(f, "name", { value: name })
  return f
}

export function cleanAndEnsureDir(dir: string): void {
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, f), { recursive: true, force: true })
    }
  } else {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Returns a POSIX-style relative import path from generatedDir to the suite file under testSrcDir
export function resolveImportPath(generatedDir: string, testSrcDir: string, srcRelativePath: string): string {
  return path.relative(generatedDir, path.resolve(testSrcDir, srcRelativePath)).split(path.sep).join("/")
}
