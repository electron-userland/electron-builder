import * as path from "path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AppImageUpdater, DebUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/out/AppAdapter"
import type { InstallOptions } from "electron-updater/out/BaseUpdater"

const stubApp: AppAdapter = {
  name: "TestApp",
  version: "1.0.0",
  isPackaged: false,
  appUpdateConfigPath: "/tmp/app-update.yml",
  userDataPath: "/tmp",
  baseCachePath: "/tmp",
  whenReady: () => Promise.resolve(),
  relaunch: () => {},
  quit: () => {},
  onQuit: () => {},
}

const installOpts: InstallOptions = { isSilent: false, isForceRunAfter: false, isAdminRightsRequired: false }

// ─── BaseUpdater.sanitizeEnvPath — PATH sanitization ─────────────────────────
// Tests the extracted helper directly (vi.spyOn on ESM module exports is not
// possible; testing the pure function avoids that limitation entirely).

describe.ifNotWindows("BaseUpdater sanitizeEnvPath PATH handling", () => {
  let updater: DebUpdater

  beforeEach(() => {
    updater = new DebUpdater(null, stubApp)
    vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const sanitize = (p: string) => (updater as any).sanitizeEnvPath(p)

  it("removes a relative prefix from a mixed PATH", () => {
    const result = sanitize("./evil:/usr/bin:/usr/local/bin")
    const entries = result.split(path.delimiter)
    expect(entries).not.toContain("./evil")
    expect(entries).toContain("/usr/bin")
    expect(entries).toContain("/usr/local/bin")
  })

  it("removes a bare dot entry", () => {
    const result = sanitize(".:/usr/local/bin")
    expect(result.split(path.delimiter)).not.toContain(".")
    expect(result).toContain("/usr/local/bin")
  })

  it("removes a parent-traversal relative entry", () => {
    const result = sanitize("../bin:/usr/bin")
    expect(result.split(path.delimiter)).not.toContain("../bin")
    expect(result).toContain("/usr/bin")
  })

  it("keeps all absolute entries intact and in order", () => {
    expect(sanitize("/usr/sbin:/usr/bin:/sbin:/bin")).toBe("/usr/sbin:/usr/bin:/sbin:/bin")
  })

  it("produces an empty string when all entries are relative", () => {
    expect(sanitize("./a:../b:relative/c")).toBe("")
  })

  it("handles an already-empty PATH", () => {
    expect(sanitize("")).toBe("")
  })
})

// ─── AppImageUpdater.doInstall — APPIMAGE env var validation ─────────────────

describe("AppImageUpdater doInstall APPIMAGE env handling", () => {
  let updater: AppImageUpdater
  const originalAppimage = process.env.APPIMAGE

  beforeEach(() => {
    updater = new AppImageUpdater(null, stubApp)
    // Prevent real subprocess calls
    vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalAppimage == null) {
      delete process.env.APPIMAGE
    } else {
      process.env.APPIMAGE = originalAppimage
    }
  })

  it("throws when APPIMAGE is not set", () => {
    delete process.env.APPIMAGE
    expect(() => (updater as any).doInstall(installOpts)).toThrow()
  })

  it("throws when APPIMAGE is a relative path", () => {
    process.env.APPIMAGE = "relative/path/app.AppImage"
    expect(() => (updater as any).doInstall(installOpts)).toThrow(/not a valid absolute path/)
  })

  it("throws when APPIMAGE is a bare filename", () => {
    process.env.APPIMAGE = "app.AppImage"
    expect(() => (updater as any).doInstall(installOpts)).toThrow(/not a valid absolute path/)
  })

  it("proceeds past validation when APPIMAGE is a valid absolute path", () => {
    process.env.APPIMAGE = "/opt/app/myapp.AppImage"
    // It should fail AFTER the validation check (on unlinkSync since the file doesn't exist)
    // but NOT with our validation error message
    expect(() => (updater as any).doInstall(installOpts)).not.toThrow(/not a valid absolute path/)
  })
})
