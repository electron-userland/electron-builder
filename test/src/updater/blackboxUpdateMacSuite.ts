import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, optionsForFlakyMultiHopE2E, runKeyRotationTest, runSignedManifestTest, runTest } from "./blackboxUpdateHelpers"

/** The mac blackbox auto-update e2e cases; each name is also the vitest test name (and so part of the snapshot key). */
export type MacBlackboxCase = "x64" | "x64 - signed update manifest" | "x64 - key rotation" | "universal" | "arm64"

type MacBlackboxCaseDefinition = {
  options: typeof optionsForFlakyE2E | typeof optionsForFlakyMultiHopE2E
  /** Squirrel.Mac only updates an arm64 build on an arm64 host, so the case is a no-op elsewhere. */
  arm64HostOnly?: boolean
  run: (context: TestContext) => Promise<void>
}

const macBlackboxCases: Record<MacBlackboxCase, MacBlackboxCaseDefinition> = {
  x64: { options: optionsForFlakyE2E, run: context => runTest(context, "zip", "", Arch.x64) },
  // Ed25519-signed latest-mac.yml (runtime-generated key): the installed app verifies the manifest before updating.
  "x64 - signed update manifest": { options: optionsForFlakyE2E, run: context => runSignedManifestTest(context, "zip", "", Arch.x64) },
  // Key rotation A → [A, B] → B over three builds, including manifests the installed app must refuse.
  "x64 - key rotation": { options: optionsForFlakyMultiHopE2E, run: context => runKeyRotationTest(context, "zip", "", Arch.x64) },
  universal: { options: optionsForFlakyE2E, run: context => runTest(context, "zip", "", Arch.universal) },
  arm64: { options: optionsForFlakyE2E, arm64HostOnly: true, run: context => runTest(context, "zip", "", Arch.arm64) },
}

/**
 * Register mac blackbox auto-update cases under `mac auto-update`. Every case is a full build → install → launch →
 * update cycle (6-16 min each on the macOS CI runner, ~51 min for all five back to back), and the CI sharder
 * bin-packs whole FILES, so each case lives in its own `test/src/updater/mac/blackboxUpdate*Test.ts` and passes
 * its name here; that lets the sharder place the cases on different shards while the describe path — and thus
 * every snapshot key (`mac > mac auto-update > <case> N`) — stays identical to when they shared one file.
 *
 * With no arguments all cases are registered (the original single-file layout).
 */
export function registerBlackboxMacTests(...cases: MacBlackboxCase[]): void {
  const selected = cases.length > 0 ? cases : (Object.keys(macBlackboxCases) as MacBlackboxCase[])
  describe("mac auto-update", () => {
    for (const name of selected) {
      const { options, arm64HostOnly, run } = macBlackboxCases[name]
      const testFn = arm64HostOnly ? test.ifEnv(process.arch === "arm64") : test
      testFn(name, options, run)
    }
  })
}
