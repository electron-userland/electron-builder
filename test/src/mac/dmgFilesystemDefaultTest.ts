import { log } from "builder-util"
import { customizeDmg } from "dmg-builder/src/dmgUtil"
import * as fs from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

const MIGRATION_LINK = "https://www.electron.build/docs/migration/v27-runtime-changes#dmg-filesystem-defaults-to-apfs"

// runs customizeDmg against a stand-in dmgbuild that exits 0, and returns the settings it was handed
async function runCustomizeDmg(dir: string, filesystem?: "HFS+" | "APFS"): Promise<{ filesystem?: string }> {
  const fakeDmgbuild = path.join(dir, "dmgbuild")
  await fs.writeFile(fakeDmgbuild, "#!/bin/sh\nexit 0\n", { mode: 0o755 })
  vi.stubEnv("CUSTOM_DMGBUILD_PATH", fakeDmgbuild)

  const settingsFile = path.join(dir, `settings-${filesystem ?? "default"}.json`)
  const packager = {
    getResource: () => null,
    getWorkspaceRoot: () => Promise.resolve(dir),
    getTempFile: () => Promise.resolve(settingsFile),
    packagerOptions: {},
  } as any

  await customizeDmg({ appPath: path.join(dir, "App.app"), artifactPath: path.join(dir, "App.dmg"), volumeName: "App", specification: { filesystem }, packager })
  return JSON.parse(await fs.readFile(settingsFile, "utf-8"))
}

describe.runIf(process.platform !== "win32")("DMG filesystem default", () => {
  beforeEach(() => log.resetLimits())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test("announces the APFS default once per process when dmg.filesystem is not set", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "dmg-filesystem-default" })
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)

    expect((await runCustomizeDmg(dir)).filesystem).toBe("APFS")
    await runCustomizeDmg(dir)

    const announcements = info.mock.calls.filter(([, message]) => typeof message === "string" && message.includes(MIGRATION_LINK))
    expect(announcements).toHaveLength(1)
    expect(announcements[0][1]).toContain('Set dmg.filesystem to "HFS+" to keep the old format')
  })

  test.for(["HFS+", "APFS"] as const)("stays quiet when dmg.filesystem is %s", async (filesystem, { expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "dmg-filesystem-explicit" })
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)

    expect((await runCustomizeDmg(dir, filesystem)).filesystem).toBe(filesystem)

    expect(info.mock.calls.some(([, message]) => typeof message === "string" && message.includes(MIGRATION_LINK))).toBe(false)
  })
})
