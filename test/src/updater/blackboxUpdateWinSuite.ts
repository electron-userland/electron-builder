import { ToolsetConfig } from "app-builder-lib"
import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runTest, windowsVmPromise } from "./blackboxUpdateHelpers"

export function registerBlackboxWinTests(toolsets: ToolsetConfig): void {
  if (toolsets.winCodeSign == null) {
    throw new Error("Toolsets must be specified for Windows blackbox tests")
  }
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis", async (context: TestContext) => {
      const vm = await windowsVmPromise
      if (process.platform !== "win32" && vm == null) {
        context.skip()
      }
      await runTest(context, "nsis", "", Arch.x64, toolsets)
    })
  })
}
