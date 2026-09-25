import { log } from "builder-util"
import { promises as fs } from "fs"
import * as path from "path"
import { vi } from "vitest"
import { migrateSchema } from "../../packages/electron-builder/src/cli/migrate-schema"

// The returned-object tests in migrateProgrammaticSchemaTest cannot see what the CLI prints; a warning dropped on
// the "no-op" path left the user with "already up to date" and a build that then failed on the kept key.
test("JS/TS config with only a warn-only key prints the warning, not 'already up to date'", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "migrate-schema-cli" })
  const source = `module.exports = { squirrelWindows: { customSquirrelVendorDir: "./vendor" } }\n`
  await fs.writeFile(path.join(projectDir, "electron-builder.cjs"), source)
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
  try {
    await migrateSchema({ "project-dir": projectDir })
    const warned = warn.mock.calls.map(call => String(call[1] ?? call[0]))
    expect(warned.some(m => m.includes("customSquirrelVendorDir") && m.includes("toolsets.squirrel"))).toBe(true)
    const infos = info.mock.calls.map(call => String(call[1] ?? call[0]))
    expect(infos.some(m => m.includes("already up to date"))).toBe(false)
    // Warn-only: the file is never rewritten.
    expect(await fs.readFile(path.join(projectDir, "electron-builder.cjs"), "utf8")).toBe(source)
  } finally {
    warn.mockRestore()
    info.mockRestore()
  }
})

test("static config: electronDownload next to an existing electronGet never overwrites it", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "migrate-schema-cli" })
  const configPath = path.join(projectDir, "electron-builder.json")
  await fs.writeFile(
    configPath,
    JSON.stringify({ appId: "a", electronDownload: { mirror: "https://old/", isVerifyChecksum: false }, electronGet: { mirrorOptions: { mirror: "https://new/" } } }, null, 2)
  )
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  vi.spyOn(log, "info").mockImplementation(() => undefined)
  try {
    await migrateSchema({ "project-dir": projectDir })
    const written = JSON.parse(await fs.readFile(configPath, "utf8"))
    expect(written).toEqual({ appId: "a", electronGet: { mirrorOptions: { mirror: "https://new/" }, unsafelyDisableChecksums: true } })
    expect(warn.mock.calls.some(call => String(call[1]).includes("mirrorOptions.mirror"))).toBe(true)
  } finally {
    vi.restoreAllMocks()
  }
})
