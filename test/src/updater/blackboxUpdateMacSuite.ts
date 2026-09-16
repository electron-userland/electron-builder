import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, optionsForFlakyMultiHopE2E, runKeyRotationTest, runSignedManifestTest, runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxMacTests(): void {
  describe("mac auto-update", () => {
    test("x64", optionsForFlakyE2E, async (context: TestContext) => {
      await runTest(context, "zip", "", Arch.x64)
    })
    // Ed25519-signed latest-mac.yml (runtime-generated key): the installed app verifies the manifest before updating.
    test("x64 - signed update manifest", optionsForFlakyE2E, async (context: TestContext) => {
      await runSignedManifestTest(context, "zip", "", Arch.x64)
    })
    // Key rotation A → [A, B] → B over three builds, including manifests the installed app must refuse.
    test("x64 - key rotation", optionsForFlakyMultiHopE2E, async (context: TestContext) => {
      await runKeyRotationTest(context, "zip", "", Arch.x64)
    })
    test("universal", optionsForFlakyE2E, async (context: TestContext) => {
      await runTest(context, "zip", "", Arch.universal)
    })
    // only will update on arm64 mac
    test.ifEnv(process.arch === "arm64")("arm64", optionsForFlakyE2E, async (context: TestContext) => {
      await runTest(context, "zip", "", Arch.arm64)
    })
  })
}
