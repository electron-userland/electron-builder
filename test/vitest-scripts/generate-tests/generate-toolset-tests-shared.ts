import * as fs from "fs-extra"
import * as path from "path"
import type { TestOptions } from "vitest"
import type { ConditionalChainProps } from "../../typings/vitest"

export const TEST_SRC_DIR = path.resolve(__dirname, "../src")
export const GENERATED_TESTS_DIR = path.resolve(TEST_SRC_DIR, "generated")

export type SuiteChainKey = keyof ConditionalChainProps<never>

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
