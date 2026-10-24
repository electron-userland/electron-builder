import type { ToolsetConfig } from "app-builder-lib/internal"
import { getWineToolset } from "app-builder-lib/src/toolsets/wine"
import { defaultExecutableLocations } from "builder-util/src/executables"
import { exists } from "builder-util"
import * as path from "path"

export function registerWineToolsetTests(toolsets: ToolsetConfig): void {
  const { wine } = toolsets

  // oxlint-disable-next-line typescript/no-base-to-string -- test title only; callers pass version strings, never a custom toolset object
  describe.ifEnv(process.platform !== "win32")(`getWineToolset [wine=${wine}]`, () => {
    // oxlint-disable-next-line typescript/no-base-to-string -- test title only; callers pass version strings, never a custom toolset object
    test(`getWineToolset resolves path [wine=${wine}]`, async ({ expect }) => {
      const result = await getWineToolset(wine, "")
      // Always an absolute path that exists, never a bare name looked up on PATH
      expect(path.isAbsolute(result.execPath)).toBe(true)
      expect(await exists(result.execPath)).toBe(true)
      if (process.platform === "linux") {
        // Linux ships no portable bundle for string/null configs — uses the host wine at one of its install locations.
        expect(defaultExecutableLocations("wine", "linux")).toContain(result.execPath)
      }
      // macOS downloads a bundle for the explicit versions (legacy 4.0.1 for 0.0.0, or wine@1.0.1).
    })

    // Bundle env vars (WINEPREFIX / DYLD_FALLBACK_LIBRARY_PATH) are only set on the macOS bundle path;
    // the Linux host-wine fallback returns just the default env.
    if (process.platform !== "linux") {
      // oxlint-disable-next-line typescript/no-base-to-string -- test title only; callers pass version strings, never a custom toolset object
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
