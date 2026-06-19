import * as fs from "fs"
import * as path from "path"
import { PLATFORM, SupportedPlatforms, TargetPlatform, TEST_ROOT, skipPerOSTests, skippedTests } from "./smart-config.js"

export function platformAllowed(file: string, platform: TargetPlatform = "current"): boolean {
  const resolved: SupportedPlatforms = platform === "current" ? PLATFORM : platform

  // Filename infix gate (e.g. "*.mac.Test.ts" only runs on macOS)
  if (file.includes(".mac.")) {
    return resolved === "darwin"
  }
  if (file.includes(".win.")) {
    return resolved === "win32"
  }
  if (file.includes(".linux.")) {
    return resolved === "linux"
  }

  // Content gate: a file whose top-level suites/tests are all gated to other platforms
  // (e.g. `describe.heavy.ifLinux(...)`) would otherwise be bin-packed into every platform's
  // shards and skip at runtime, inflating shard-duration estimates. See detectFilePlatforms.
  const gated = detectFilePlatforms(file)
  return gated == null || gated.has(resolved)
}

// Platform gate operators (from vitest-setup.ts) → the platforms a gated block CAN run on.
const GATE_PLATFORMS: Record<string, SupportedPlatforms[]> = {
  ifMac: ["darwin"],
  ifWindows: ["win32"],
  ifLinux: ["linux"],
  ifNotMac: ["win32", "linux"],
  ifNotWindows: ["darwin", "linux"],
  ifNotLinux: ["darwin", "win32"],
  // Runs natively on Windows and via Wine on Linux; skipped on macOS (see vitest-setup.ts).
  ifWindowsOrWine: ["win32", "linux"],
}

const ALL_PLATFORMS: readonly SupportedPlatforms[] = ["win32", "darwin", "linux"]

// Matches a top-level (column 0) test entry point and captures its chained operators,
// e.g. "describe.heavy.ifLinux(" → ".heavy.ifLinux". The trailing "[.(]" prevents matching
// identifiers that merely start with these names (e.g. "describeSomething(").
const TOP_LEVEL_BLOCK = /^(?:describe|test|it|skip)((?:\.[A-Za-z0-9]+)*)\s*[.(]/

/**
 * Statically determine which platforms a test file's suites/tests can run on, by reading the
 * platform gates (`describe.ifLinux(...)`, `test.ifMac(...)`, etc.) on its top-level blocks.
 *
 * Sharding (smart-shard-count.ts / run-vitest.ts) assigns files to shards before vitest evaluates
 * them, so a file whose entire suite is gated away from a platform (e.g. blackboxInstallTest's
 * `describe.heavy.ifLinux`) would still be counted toward that platform's shards and skip at
 * runtime — inflating shard-duration estimates. This lets discovery drop it up front.
 *
 * Returns the UNION of platforms across all top-level blocks: a file is excluded from a platform
 * only when every top-level block is gated away from it. Returns null when no gate can be
 * determined (no recognizable top-level block, or an ungated block that runs everywhere), meaning
 * "keep on all platforms" — the safe default that never silently drops real tests.
 */
export function detectFilePlatforms(file: string): Set<SupportedPlatforms> | null {
  let content: string
  try {
    content = fs.readFileSync(file, "utf8")
  } catch {
    return null
  }

  const allowed = new Set<SupportedPlatforms>()
  let sawBlock = false

  for (const line of content.split("\n")) {
    const match = TOP_LEVEL_BLOCK.exec(line)
    if (!match) {
      continue
    }
    sawBlock = true

    let platforms: SupportedPlatforms[] = [...ALL_PLATFORMS]
    for (const token of match[1].split(".").filter(Boolean)) {
      const gate = GATE_PLATFORMS[token]
      if (gate) {
        platforms = platforms.filter(p => gate.includes(p))
      }
    }
    for (const p of platforms) {
      allowed.add(p)
    }

    // An ungated (or env-only) top-level block runs everywhere — nothing left to exclude.
    if (allowed.size === ALL_PLATFORMS.length) {
      return null
    }
  }

  return sawBlock ? allowed : null
}

const testOverride = process.env.TEST_FILES?.trim()?.split(",")

function collectTests(dir: string, platform: TargetPlatform = "current", out: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return out
  }

  for (const name of fs.readdirSync(dir)) {
    const isOverrideMatch = testOverride?.some(toMatch => name.includes(toMatch)) ?? false
    if ([".ts.map", ".js.map", ".d.ts", ".snap"].some(ext => name.endsWith(ext)) || ["node_modules", "out"].includes(name) || (!isOverrideMatch && isSkippedTest(name, platform))) {
      continue
    }

    const full = path.join(dir, name)

    if (!name.startsWith(".") && fs.statSync(full).isDirectory()) {
      collectTests(full, platform, out)
    } else {
      if (isOverrideMatch || name.endsWith("Test.ts") || name.endsWith("test.ts")) {
        out.push(normalizePath(full))
      }
    }
  }

  return out
}

export function getAllTestFiles(platform: TargetPlatform = "current"): string[] {
  return collectTests(TEST_ROOT, platform).filter(file => platformAllowed(file, platform))
}

function isSkippedTest(file: string, platform: TargetPlatform): boolean {
  const skippedTestsList = process.env.SKIPPED_TESTS?.trim()
  if (skippedTestsList) {
    const toSkip = skippedTestsList.split(",")
    if (toSkip.some(s => file.includes(s))) {
      return true
    }
    return false
  }
  const key: SupportedPlatforms = platform !== "current" ? platform : PLATFORM
  return skippedTests.some(t => file.includes(t)) || skipPerOSTests[key]?.some(t => file.includes(t)) || false
}

function normalizePath(p: string) {
  return p.split(path.sep).join("/")
}
