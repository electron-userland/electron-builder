import { Arch } from "electron-builder"
import { ToolsetConfig } from "app-builder-lib"
import { TestContext } from "vitest"
import { runTest } from "./blackboxUpdateHelpers"

const optionsForFlakyE2E = { sequential: true, retry: 2 }

export function registerBlackboxLinuxTests(appimage: ToolsetConfig["appimage"]): void {
  describe(`appimage tool: ${appimage}`, optionsForFlakyE2E, () => {
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "arm64")("AppImage - arm64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.arm64, { appimage })
    })

    // only works on x64, so this will fail on arm64 macs due to arch mismatch
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - x64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.x64, { appimage })
    })
  })
}
