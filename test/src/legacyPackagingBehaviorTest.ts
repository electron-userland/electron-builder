import { checkMetadata } from "app-builder-lib/internal"
import { log } from "builder-util"
import { createTargets, Platform } from "electron-builder"
import { promises as fs } from "fs"
import * as path from "path"
import { describe, expect, test, vi } from "vitest"

const srcRoot = path.join(__dirname, "..", "..", "packages")

const validMetadata = { name: "test-app", version: "1.0.0", description: "d", author: { name: "A", email: "a@example.com" } } as any

function runCheckMetadata(devMetadata: any): string | null {
  try {
    checkMetadata(validMetadata, devMetadata, "/app/package.json", "/dev/package.json", "/project")
    return null
  } catch (e: any) {
    return e.message
  }
}

describe("root-level directories in package.json", () => {
  // The key sits outside the validated Configuration object, so nothing else catches it: v27 ignores
  // it and the build silently writes to the default `dist` instead of the configured directory.
  test("is rejected and names the build.directories replacement", () => {
    const message = runCheckMetadata({ ...validMetadata, directories: { output: "release" } })
    expect(message).not.toBeNull()
    expect(message).toContain("no longer read by electron-builder v27")
    expect(message).toContain('"build": { "directories": {"output":"release"} }')
    expect(message).toContain("migrate-schema")
  })

  test("directories under build is accepted", () => {
    expect(runCheckMetadata({ ...validMetadata, build: { directories: { output: "release" } } })).toBeNull()
  })

  test("a package.json without directories is accepted", () => {
    expect(runCheckMetadata(validMetadata)).toBeNull()
  })
})

describe('arch "all" no longer includes ia32', () => {
  test("createTargets warns once for non-mac platforms", async () => {
    const source = await fs.readFile(path.join(srcRoot, "electron-builder", "src", "builder.ts"), "utf8")
    expect(source).toContain("warnAboutArchAllExpansion")
    expect(source).toContain('.once("arch-all-expansion")')
    // macOS "all" still expands to x64 + arm64 + universal and never included ia32, so it must stay quiet.
    expect(source).toContain("platforms.some(platform => platform !== Platform.MAC)")
  })

  test("createTargets announces the expansion once per process, and not for mac-only builds", () => {
    log.resetLimits("arch-all-expansion")
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    try {
      createTargets([Platform.MAC], null, "all")
      expect(warn).not.toHaveBeenCalled()
      createTargets([Platform.WINDOWS], null, "all")
      createTargets([Platform.LINUX, Platform.WINDOWS], null, "all")
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatchObject({ expandsTo: "x64, arm64" })
    } finally {
      warn.mockRestore()
      log.resetLimits("arch-all-expansion")
    }
  })

  test("the warning names the new expansion and the explicit-ia32 escape hatch", async () => {
    const source = await fs.readFile(path.join(srcRoot, "electron-builder", "src", "builder.ts"), "utf8")
    expect(source).toContain('expandsTo: "x64, arm64"')
    expect(source).toContain("electronVersion <= 43.x")
  })
})

describe("deprecated Electron packages are no longer rejected", () => {
  test.each(["electron-prebuilt", "electron-rebuild", "electron-nightly"])("%s is covered", async name => {
    const source = await fs.readFile(path.join(srcRoot, "app-builder-lib", "src", "util", "appFileCopier.ts"), "utf8")
    expect(source).toContain(`"${name}"`)
  })

  test("the warning explains that v26 rejected these and v27 ships them", async () => {
    const source = await fs.readFile(path.join(srcRoot, "app-builder-lib", "src", "util", "appFileCopier.ts"), "utf8")
    expect(source).toContain("warnAboutDeprecatedElectronPackages")
    expect(source).toContain("electron-builder <= 26 rejected this outright")
    expect(source).toContain("ignoredProductionDependencies")
  })

  test("only non-excluded packages warn — an ignored one is not being shipped", async () => {
    const source = await fs.readFile(path.join(srcRoot, "app-builder-lib", "src", "util", "appFileCopier.ts"), "utf8")
    expect(source).toContain("nodeModules.filter(it => !it.excluded && it.name in DEPRECATED_ELECTRON_PACKAGES)")
  })
})
