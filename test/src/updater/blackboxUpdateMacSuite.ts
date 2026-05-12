import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxMacTests(): void {
  test("x64", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.x64)
  })
  test("universal", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.universal)
  })
  // only will update on arm64 mac
  test.ifEnv(process.arch === "arm64")("arm64", async (context: TestContext) => {
    await runTest(context, "zip", "", Arch.arm64)
  })
}
