import type { ToolsetConfig } from "app-builder-lib/internal"
import { getWineToolset } from "app-builder-lib/src/toolsets/wine"
import { exists } from "builder-util"
import * as path from "path"

export function registerWineToolsetTests(toolsets: ToolsetConfig): void {
  const { wine } = toolsets
  const isLegacy = wine === "0.0.0"

  describe.ifEnv(process.platform !== "win32" && isLegacy)(`getWineToolset [wine=${wine}]`, () => {
    test(`getWineToolset resolves path [wine=${wine}]`, async ({ expect }) => {
      const result = await getWineToolset(wine, "")
      expect(result.execPath).toBeTruthy()
      if (process.platform === "linux") {
        // Linux always uses system wine for default/legacy versions — execPath is "wine", not absolute.
        expect(result.execPath).toBe("wine")
      } else {
        // macOS: legacy bundle (0.0.0 → wine-4.0.1-mac) is downloaded; path is absolute.
        expect(path.isAbsolute(result.execPath)).toBe(true)
        expect(await exists(result.execPath)).toBe(true)
      }
    })

    if (!isLegacy) {
      test(`wine@${wine} bundle sets env vars`, async ({ expect }) => {
        const result = await getWineToolset(wine, "")
        const env = result.env
        expect(env.DYLD_FALLBACK_LIBRARY_PATH).toBeTruthy()
        expect(env.WINEPREFIX).toBeTruthy()
        expect(env.WINEDEBUG).toBeTruthy()
      })
    }
  })
}
