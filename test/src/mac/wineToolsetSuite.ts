import { exists } from "builder-util"
import * as path from "path"
import { getWineToolset } from "app-builder-lib/out/toolsets/wine"
import type { ToolsetConfig } from "app-builder-lib/src/configuration"

export function registerWineToolsetTests(toolsets: ToolsetConfig): void {
  const { wine } = toolsets
  const isLegacy = wine === "0.0.0" || wine == null

  test(`getWineToolset resolves path [wine=${wine}]`, async ({ expect }) => {
    const result = await getWineToolset(wine)
    expect(result.execPath).toBeTruthy()
    if (isLegacy) {
      // Legacy/system wine — no bundle download, just the "wine" command
      expect(result.execPath).toBe("wine")
    } else {
      // Downloaded bundle — must be an absolute path that exists on disk
      expect(path.isAbsolute(result.execPath)).toBe(true)
      expect(await exists(result.execPath)).toBe(true)
    }
  })

  if (!isLegacy) {
    test(`wine@${wine} bundle sets macOS-specific env vars`, async ({ expect }) => {
      const result = await getWineToolset(wine)
      const env = result.env
      expect(env.DYLD_FALLBACK_LIBRARY_PATH).toBeTruthy()
      expect(env.WINEPREFIX).toBeTruthy()
      expect(env.WINEDEBUG).toBeTruthy()
    })
  }
}
