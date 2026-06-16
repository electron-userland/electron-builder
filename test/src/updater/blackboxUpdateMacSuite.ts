import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxMacTests(): void {
  test("x64", optionsForFlakyE2E, async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.x64)
  })
  test("universal", optionsForFlakyE2E, async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.universal)
  })
  // only will update on arm64 mac
  test.ifEnv(process.arch === "arm64")("arm64", optionsForFlakyE2E, async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.arm64)
  })
}
