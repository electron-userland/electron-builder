import * as nodeFs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"
import { log } from "builder-util"

// getElectronVersion is the public entry point; passing an explicit config with no
// electronVersion bypasses getConfig and falls through to computeElectronVersion.
import { getElectronVersion } from "app-builder-lib/out/electron/electronVersion"

function rangeLogMessage(version: string): string {
  return (
    `Electron version "${version}" is a range, not a fixed version. electron-builder requires an exact version because it downloads platform-specific binaries for a specific release — a range cannot be resolved without electron installed in node_modules. ` +
    `Pin the version in package.json (e.g. "15.3.0" instead of "^15.3.0") or set "electronVersion" explicitly in your electron-builder config.`
  )
}

function rangeErrorMessage(version: string): string {
  return `Cannot compute electron version from installed node modules - version ("${version}") is not fixed in project.\nSee https://github.com/electron-userland/electron-builder/issues/3984#issuecomment-504968246`
}

// sequence.concurrent is enabled globally; describe.sequential prevents concurrent tests from
// overwriting the shared `tmpDir` and from accumulating/clearing vi.spyOn(log) state mid-test.
describe.sequential("getElectronVersion (version resolution from package.json)", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), "electron-version-test-"))
    // Spy on the shared log singleton so the same instance used by electronVersion.ts is intercepted.
    vi.spyOn(log, "error").mockImplementation(() => {})
    vi.spyOn(log, "info").mockImplementation(() => {})
    vi.spyOn(log, "warn").mockImplementation(() => {})
  })

  afterEach(async () => {
    await nodeFs.rm(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function writePackageJson(content: object) {
    await nodeFs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify(content))
  }

  // Pass {} as config so getElectronVersion skips getConfig() and calls computeElectronVersion directly.
  function resolveVersion() {
    return getElectronVersion(tmpDir, {})
  }

  test("returns exact version from devDependencies when electron is not installed", async ({ expect }) => {
    await writePackageJson({ devDependencies: { electron: "15.3.0" } })
    await expect(resolveVersion()).resolves.toBe("15.3.0")
    expect(log.error).not.toHaveBeenCalled()
  })

  test("returns exact version from dependencies when electron is not installed", async ({ expect }) => {
    await writePackageJson({ dependencies: { electron: "20.1.0" } })
    await expect(resolveVersion()).resolves.toBe("20.1.0")
    expect(log.error).not.toHaveBeenCalled()
  })

  test("calls log.error and throws when version is a caret range", async ({ expect }) => {
    const version = "^15.3.0"
    await writePackageJson({ devDependencies: { electron: version } })
    await expect(resolveVersion()).rejects.toMatchObject({ message: rangeErrorMessage(version) })
    expect(log.error).toHaveBeenCalledOnce()
    expect(log.error).toHaveBeenCalledWith({ version }, rangeLogMessage(version))
  })

  test("calls log.error and throws when version is a tilde range", async ({ expect }) => {
    const version = "~15.3.0"
    await writePackageJson({ devDependencies: { electron: version } })
    await expect(resolveVersion()).rejects.toMatchObject({ message: rangeErrorMessage(version) })
    expect(log.error).toHaveBeenCalledOnce()
    expect(log.error).toHaveBeenCalledWith({ version }, rangeLogMessage(version))
  })

  test("error message tells user to pin or set electronVersion in config", async ({ expect }) => {
    const version = "^15.3.0"
    await writePackageJson({ devDependencies: { electron: version } })
    await expect(resolveVersion()).rejects.toMatchObject({ message: rangeErrorMessage(version) })
    expect(log.error).toHaveBeenCalledWith({ version }, rangeLogMessage(version))
  })

  test("throws without log.error when no electron dependency is found", async ({ expect }) => {
    await writePackageJson({ devDependencies: { react: "18.0.0" } })
    await expect(resolveVersion()).rejects.toThrow(/none of the possible electron modules are installed/)
    expect(log.error).not.toHaveBeenCalled()
  })

  test("throws without log.error when package.json does not exist", async ({ expect }) => {
    await expect(resolveVersion()).rejects.toThrow(/none of the possible electron modules are installed/)
    expect(log.error).not.toHaveBeenCalled()
  })
})
