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
    const warned = warn.mock.calls.map(call => call[1] ?? (typeof call[0] === "string" ? call[0] : JSON.stringify(call[0])))
    expect(warned.some(m => m.includes("customSquirrelVendorDir") && m.includes("toolsets.squirrel"))).toBe(true)
    const infos = info.mock.calls.map(call => call[1] ?? (typeof call[0] === "string" ? call[0] : JSON.stringify(call[0])))
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

function messagesOf(spy: { mock: { calls: any[][] } }): string[] {
  return spy.mock.calls.map(call => call[1] ?? (typeof call[0] === "string" ? call[0] : JSON.stringify(call[0])))
}

// Issue #10273: a config that is only ever passed as `electron-builder --config <name>` is not auto-detected.
test("no config found: names every auto-detected file and hints --config", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "migrate-schema-cli" })
  await fs.writeFile(path.join(projectDir, "the.spice.must.flow.cjs"), "module.exports = {}\n")
  const error = vi.spyOn(log, "error").mockImplementation(() => undefined)
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`)
  }) as any)
  try {
    await expect(migrateSchema({ "project-dir": projectDir, "dry-run": true })).rejects.toThrow("process.exit(1)")
    const errors = messagesOf(error)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("electron-builder.{yml,yaml,json,json5,toml,js,cjs,mjs,ts}")
    expect(errors[0]).toContain('"build" key of package.json')
    expect(errors[0]).toContain("electron-builder migrate-schema --config <path>")
  } finally {
    vi.restoreAllMocks()
  }
})

test("missing --config file reports only that file, not the auto-detection hint", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "migrate-schema-cli" })
  const error = vi.spyOn(log, "error").mockImplementation(() => undefined)
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`)
  }) as any)
  try {
    await expect(migrateSchema({ "project-dir": projectDir, config: "missing.cjs" })).rejects.toThrow("process.exit(1)")
    expect(messagesOf(error)).toEqual(["config file not found"])
  } finally {
    vi.restoreAllMocks()
  }
})

// Issue #10274: v27 ignores the v26 custom NSIS bundle. The warning must name the setting, never its url or checksum.
const SECRET_URL = "https://downloads.example.com/nsisbi.7z?token=s3cr3t-token"
const SECRET_CHECKSUM = "374cfc092fd1bd1898472df627549ecc165b0d6ba88e82deba085673aec95336"

test("custom-named JS config via --config: warns about nsis.customNsisBinary without printing its values", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "migrate-schema-cli" })
  const source = `module.exports = { nsis: { oneClick: false, customNsisBinary: { url: "${SECRET_URL}", checksum: "${SECRET_CHECKSUM}" } } }\n`
  await fs.writeFile(path.join(projectDir, "the.spice.must.flow.cjs"), source)
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
  try {
    await migrateSchema({ "project-dir": projectDir, config: "the.spice.must.flow.cjs" })
    const warned = messagesOf(warn)
    expect(warned.some(m => m.includes("`nsis.customNsisBinary` is ignored by electron-builder v27") && m.includes("toolsets.nsis"))).toBe(true)
    expect(warned.join("\n")).not.toContain(SECRET_URL)
    expect(warned.join("\n")).not.toContain(SECRET_CHECKSUM)
    expect(messagesOf(info).some(m => m.includes("already up to date"))).toBe(false)
    expect(await fs.readFile(path.join(projectDir, "the.spice.must.flow.cjs"), "utf8")).toBe(source)
  } finally {
    vi.restoreAllMocks()
  }
})

test("static config with only a warn-only key: warns, is not rewritten, and is not 'already up to date'", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.createTempDir({ prefix: "migrate-schema-cli" })
  const configPath = path.join(projectDir, "electron-builder.json")
  const source = JSON.stringify({ appId: "a", nsisWeb: { customNsisResources: { url: SECRET_URL, checksum: SECRET_CHECKSUM, version: "1" } } }, null, 2)
  await fs.writeFile(configPath, source)
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
  try {
    await migrateSchema({ "project-dir": projectDir })
    const warned = messagesOf(warn)
    expect(warned.some(m => m.includes("`nsisWeb.customNsisResources`"))).toBe(true)
    expect(warned.join("\n")).not.toContain(SECRET_CHECKSUM)
    expect(messagesOf(info).some(m => m.includes("already up to date"))).toBe(false)
    expect(await fs.readFile(configPath, "utf8")).toBe(source)
  } finally {
    vi.restoreAllMocks()
  }
})
