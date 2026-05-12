import { Arch } from "electron-builder"
import { ToolsetConfig } from "app-builder-lib"
import { TestContext } from "vitest"
import { runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxWinTests(winCodeSign: ToolsetConfig["winCodeSign"]): void {
  describe.heavy.ifWindows("windows", { sequential: true, retry: 2 }, () => {
    test("nsis", async (context: TestContext) => {
      await runTest(context, "nsis", "", Arch.x64, { winCodeSign })
    })
  })
}
