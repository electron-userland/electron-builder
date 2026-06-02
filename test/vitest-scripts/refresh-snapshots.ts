#!/usr/bin/env ts-node

import { spawnSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { generateTests } from "./generate-tests"
import { GENERATED_TESTS_DIR } from "./generate-toolset-tests-shared"
import { LINUX_SUITE_METADATA } from "./generate-toolset-tests-linux"
import { MAC_SUITE_METADATA } from "./generate-toolset-tests-mac"
import { WINDOWS_SUITE_METADATA } from "./generate-toolset-tests-windows"

// ─── Types ───────────────────────────────────────────────────────────────────

type Target = "linux" | "mac" | "windows" | "any"

interface SuiteMetadata {
  name: string
  chain?: string[]
}

// ─── Platform filter ─────────────────────────────────────────────────────────

const PLATFORM_GATE_KEYS = new Set(["ifMac", "ifNotMac", "ifWindows", "ifNotWindows", "ifLinux", "ifNotLinux"])

function suiteRunsOnTarget(chain: string[] | undefined, target: Target): boolean {
  if (target === "any") {
    return !chain?.some(c => PLATFORM_GATE_KEYS.has(c))
  }
  const platformChain = chain?.filter(c => PLATFORM_GATE_KEYS.has(c)) ?? []
  if (platformChain.length === 0) return true
  return platformChain.every(key => {
    if (key === "ifMac") return target === "mac"
    if (key === "ifWindows") return target === "windows"
    if (key === "ifLinux") return target === "linux"
    if (key === "ifNotMac") return target !== "mac"
    if (key === "ifNotWindows") return target !== "windows"
    if (key === "ifNotLinux") return target !== "linux"
    return true
  })
}

// ─── Snapshot cleanup ────────────────────────────────────────────────────────

function deleteStaleGeneratedSnapshots(): void {
  // Snapshots for generated tests live under test/snapshots/generated/
  const snapshotsGenDir = path.resolve(__dirname, "../../snapshots/generated")
  if (!fs.existsSync(snapshotsGenDir)) return

  let deleted = 0
  for (const suite of fs.readdirSync(snapshotsGenDir)) {
    const suiteSnapDir = path.join(snapshotsGenDir, suite)
    if (!fs.statSync(suiteSnapDir).isDirectory()) continue

    for (const snapFile of fs.readdirSync(suiteSnapDir)) {
      if (!snapFile.endsWith(".js.snap")) continue
      const testFile = snapFile.replace(".js.snap", ".ts")
      const testPath = path.join(GENERATED_TESTS_DIR, suite, testFile)
      if (!fs.existsSync(testPath)) {
        fs.rmSync(path.join(suiteSnapDir, snapFile))
        console.log(`  deleted stale snapshot: ${suite}/${snapFile}`)
        deleted++
      }
    }
  }
  if (deleted === 0) {
    console.log("  no stale snapshots found")
  }
}

// ─── File list ───────────────────────────────────────────────────────────────

function resolveMatchingSuites(target: Target): SuiteMetadata[] {
  const all: SuiteMetadata[] = [...WINDOWS_SUITE_METADATA, ...MAC_SUITE_METADATA, ...LINUX_SUITE_METADATA]
  return all.filter(s => suiteRunsOnTarget(s.chain, target))
}

function resolveGeneratedFiles(suiteNames: Set<string>): string[] {
  if (!fs.existsSync(GENERATED_TESTS_DIR)) return []
  const files: string[] = []
  for (const suite of fs.readdirSync(GENERATED_TESTS_DIR)) {
    if (!suiteNames.has(suite)) continue
    const suiteDir = path.join(GENERATED_TESTS_DIR, suite)
    if (!fs.statSync(suiteDir).isDirectory()) continue
    for (const f of fs.readdirSync(suiteDir)) {
      if (f.endsWith("Test.ts")) files.push(f.replace(/\.ts$/, ""))
    }
  }
  return files.sort()
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(): { command: string; target: Target; updateSnapshots: boolean } {
  const args = process.argv.slice(2)

  const command = args[0]
  if (command !== "start" && command !== "print") {
    console.error(`Usage: ts-node refresh-snapshots.ts <start|print> --target <linux|mac|windows|any> [--update-snapshots]`)
    process.exit(1)
  }

  const targetIdx = args.indexOf("--target")
  const targetArg = targetIdx >= 0 ? args[targetIdx + 1] : undefined
  if (!targetArg || !["linux", "mac", "windows", "any"].includes(targetArg)) {
    console.error(`--target must be one of: linux, mac, windows, any`)
    process.exit(1)
  }

  return { command, target: targetArg as Target, updateSnapshots: args.includes("--update-snapshots") }
}

function main(): void {
  const { command, target, updateSnapshots } = parseArgs()

  console.log(`\n=== refresh-snapshots: ${command} --target ${target} ===\n`)

  // 1. Regenerate all generated test files so we have the current set
  console.log("Regenerating test suite...")
  generateTests()

  // 2. Determine which suites match the target
  const matchingSuites = resolveMatchingSuites(target)
  const suiteNames = new Set(matchingSuites.map(s => s.name))

  // 3. Delete stale snapshots
  console.log("\nCleaning stale generated snapshots...")
  deleteStaleGeneratedSnapshots()

  // 4. Resolve the actual generated file stems for the matching suites
  const generatedFiles = resolveGeneratedFiles(suiteNames)
  const testFilesPattern = matchingSuites.map(s => s.name).join(",")

  if (command === "print") {
    console.log(`\nTEST_FILES pattern:\n  ${testFilesPattern}\n`)
    console.log(`Resolved generated files (${generatedFiles.length}):`)
    for (const f of generatedFiles) {
      console.log(`  ${f}`)
    }
    return
  }

  // command === "start"
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TEST_FILES: testFilesPattern,
    SKIP_GENERATE: "true",
  }
  if (updateSnapshots) {
    env.UPDATE_SNAPSHOT = "true"
  }

  console.log(`\nStarting vitest with TEST_FILES=${testFilesPattern}${updateSnapshots ? " (updating snapshots)" : ""}\n`)

  const result = spawnSync("ts-node", [path.join(__dirname, "run-vitest.ts")], { env, stdio: "inherit" })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

main()
