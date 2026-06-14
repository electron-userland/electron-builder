import * as fs from "fs-extra"
import * as path from "path"
import type { TestOptions } from "vitest"
import type { ToolsetConfig } from "app-builder-lib/internal"
import type { ConditionalChainProps } from "../typings/vitest"

export const WINE_VERSIONS: ToolsetConfig["wine"][] = ["0.0.0", "1.0.1"]

export const TEST_SRC_DIR = path.resolve(__dirname, "../src")
export const GENERATED_TESTS_DIR = path.resolve(TEST_SRC_DIR, "generated")

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
 */
export function getPlatformSuffix(chain?: SuiteChainKey[]): string {
  if (!chain) return "__"
  if (chain.includes("ifWindows")) return ".win."
  if (chain.includes("ifLinux")) return ".linux."
  if (chain.includes("ifMac")) return ".mac."
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
