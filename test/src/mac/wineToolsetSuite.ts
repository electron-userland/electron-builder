import type { ToolsetConfig } from "app-builder-lib/internal"
import { getWineToolset } from "app-builder-lib/src/toolsets/wine"
import { exists } from "builder-util"
import * as path from "path"

export function registerWineToolsetTests(toolsets: ToolsetConfig): void {
  const { wine } = toolsets

  describe.ifEnv(process.platform !== "win32")(`getWineToolset [wine=${wine}]`, () => {
    test(`getWineToolset resolves path [wine=${wine}]`, async ({ expect }) => {
      const result = await getWineToolset(wine, "")
      expect(result.execPath).toBeTruthy()
      if (process.platform === "linux") {
        // Linux ships no portable bundle for string/null configs — falls back to the host wine binary.
        expect(result.execPath).toBe("wine")
      } else {
        // macOS downloads a bundle (legacy 4.0.1 for null/0.0.0, or wine@1.0.1) → absolute path.
        expect(path.isAbsolute(result.execPath)).toBe(true)
        expect(await exists(result.execPath)).toBe(true)
      }
    })

    // Bundle env vars (WINEPREFIX / DYLD_FALLBACK_LIBRARY_PATH) are only set on the macOS bundle path;
    // the Linux host-wine fallback returns just the default env.
    if (process.platform !== "linux") {
      test(`wine=${wine} bundle sets env vars`, async ({ expect }) => {
        const result = await getWineToolset(wine, "")
        const env = result.env
        expect(env.DYLD_FALLBACK_LIBRARY_PATH).toBeTruthy()
        expect(env.WINEPREFIX).toBeTruthy()
        expect(env.WINEDEBUG).toBeTruthy()
      })
    }
  })
}
