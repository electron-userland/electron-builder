import { ToolsetConfig } from "app-builder-lib"
import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runTest, windowsVmPromise } from "./blackboxUpdateHelpers"

export function registerBlackboxWinTests(winCodeSign: ToolsetConfig["winCodeSign"]): void {
  describe.heavy("windows", optionsForFlakyE2E, () => {
    test("nsis", async (context: TestContext) => {
      if (process.platform !== "win32" && (await windowsVmPromise) == null) {
        context.skip()
      }
      await runTest(context, "nsis", "", Arch.x64, { winCodeSign })
    })
  })
}
