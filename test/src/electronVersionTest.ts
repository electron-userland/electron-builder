import * as nodeFs from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"
import { log } from "builder-util"

// getElectronVersion is the public entry point; passing an explicit config with no
// electronVersion bypasses getConfig and falls through to computeElectronVersion.
import { getElectronVersion } from "app-builder-lib/internal"

function rangeLogMessage(version: string): string {
  return (
    `Electron version "${version}" is a range, not a fixed version. electron-builder requires an exact version because it downloads platform-specific binaries for a specific release — a range cannot be resolved without electron installed in node_modules. ` +
    `Pin the version in package.json (e.g. "15.3.0" instead of "^15.3.0") or set "electronVersion" explicitly in your electron-builder config.`
  )
}

function rangeErrorMessage(version: string): string {
  return `Cannot compute electron version from installed node modules - version ("${version}") is not fixed in project.\nSee https://github.com/electron-userland/electron-builder/issues/3984#issuecomment-504968246`
}

describe("getElectronVersion (version resolution from package.json)", { sequential: true }, () => {
  beforeEach(() => {
    // Spy on the shared log singleton so the same instance used by electronVersion.ts is intercepted.
    vi.spyOn(log, "error").mockImplementation(() => {})
    vi.spyOn(log, "info").mockImplementation(() => {})
    vi.spyOn(log, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function writePackageJson(tmpDir: string, content: object) {
    await nodeFs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify(content))
  }

  // Pass {} as config so getElectronVersion skips getConfig() and calls computeElectronVersion directly.
  function resolveVersion(tmpDir: string) {
    return getElectronVersion(tmpDir, {})
  }

  test("returns exact version from devDependencies when electron is not installed", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await writePackageJson(tmpDirPath, { devDependencies: { electron: "15.3.0" } })
    await expect(resolveVersion(tmpDirPath)).resolves.toBe("15.3.0")
    expect(vi.mocked(log).error).not.toHaveBeenCalled()
  })

  test("returns exact version from dependencies when electron is not installed", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await writePackageJson(tmpDirPath, { dependencies: { electron: "20.1.0" } })
    await expect(resolveVersion(tmpDirPath)).resolves.toBe("20.1.0")
    expect(vi.mocked(log).error).not.toHaveBeenCalled()
  })

  test("calls log.error and throws when version is a caret range", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const version = "^15.3.0"
    await writePackageJson(tmpDirPath, { devDependencies: { electron: version } })
    await expect(resolveVersion(tmpDirPath)).rejects.toMatchObject({ message: rangeErrorMessage(version) })
    expect(vi.mocked(log).error).toHaveBeenCalledOnce()
    expect(vi.mocked(log).error).toHaveBeenCalledWith({ version }, rangeLogMessage(version))
  })

  test("calls log.error and throws when version is a tilde range", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const version = "~15.3.0"
    await writePackageJson(tmpDirPath, { devDependencies: { electron: version } })
    await expect(resolveVersion(tmpDirPath)).rejects.toMatchObject({ message: rangeErrorMessage(version) })
    expect(vi.mocked(log).error).toHaveBeenCalledOnce()
    expect(vi.mocked(log).error).toHaveBeenCalledWith({ version }, rangeLogMessage(version))
  })

  test("error message tells user to pin or set electronVersion in config", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const version = "^15.3.0"
    await writePackageJson(tmpDirPath, { devDependencies: { electron: version } })
    await expect(resolveVersion(tmpDirPath)).rejects.toMatchObject({ message: rangeErrorMessage(version) })
    expect(vi.mocked(log).error).toHaveBeenCalledWith({ version }, rangeLogMessage(version))
  })

  test("throws without log.error when no electron dependency is found", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await writePackageJson(tmpDirPath, { devDependencies: { react: "18.0.0" } })
    await expect(resolveVersion(tmpDirPath)).rejects.toThrow(/none of the possible electron modules are installed/)
    expect(vi.mocked(log).error).not.toHaveBeenCalled()
  })

  test("throws without log.error when package.json does not exist", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await expect(resolveVersion(tmpDirPath)).rejects.toThrow(/none of the possible electron modules are installed/)
    expect(vi.mocked(log).error).not.toHaveBeenCalled()
  })
})
