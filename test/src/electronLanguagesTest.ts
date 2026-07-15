import { Platform } from "app-builder-lib"
import { removeUnusedLanguagesIfNeeded } from "app-builder-lib/src/electron/ElectronFramework"
import { BeforeCopyExtraFilesOptions } from "app-builder-lib/src/Framework"
import { mkdir, readdir, writeFile } from "fs/promises"
import * as path from "path"

// Unit tests for locale cleanup driven by `electronLanguages` (https://github.com/electron-userland/electron-builder/issues/10006).
// A minimal fake packager is pointed at a fake app output directory populated with locale files.

function fakeOptions(platform: Platform, appOutDir: string, electronLanguages: string | string[]): BeforeCopyExtraFilesOptions {
  const packager = {
    platform,
    platformOptions: {},
    config: { electronLanguages },
    getResourcesDir: () => path.join(appOutDir, "resources"),
    getMacOsElectronFrameworkResourcesDir: () => path.join(appOutDir, "framework-resources"),
  }
  return { packager, appOutDir, asarIntegrity: null, platformName: platform.nodeName } as unknown as BeforeCopyExtraFilesOptions
}

// win/linux: locale files live in `<appOutDir>/locales/*.pak`
async function createPakLocales(appOutDir: string, languages: string[]): Promise<string> {
  const dir = path.join(appOutDir, "locales")
  await mkdir(dir, { recursive: true })
  for (const language of languages) {
    await writeFile(path.join(dir, `${language}.pak`), "")
  }
  return dir
}

// mac: locale dirs live in both resources dirs as `<language>.lproj`
async function createLprojLocales(appOutDir: string, languages: string[]): Promise<string[]> {
  const dirs = [path.join(appOutDir, "resources"), path.join(appOutDir, "framework-resources")]
  for (const dir of dirs) {
    for (const language of languages) {
      await mkdir(path.join(dir, `${language}.lproj`), { recursive: true })
    }
  }
  return dirs
}

describe("removeUnusedLanguagesIfNeeded", () => {
  test("bare language keeps region-qualified locales", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    const dir = await createPakLocales(appOutDir, ["en-US", "en-GB", "de", "fr"])
    await removeUnusedLanguagesIfNeeded(fakeOptions(Platform.WINDOWS, appOutDir, ["en"]))
    expect((await readdir(dir)).sort()).toEqual(["en-GB.pak", "en-US.pak"])
  })

  test("region-qualified language keeps only the exact locale", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    const dir = await createPakLocales(appOutDir, ["en-US", "en-GB", "de"])
    await removeUnusedLanguagesIfNeeded(fakeOptions(Platform.WINDOWS, appOutDir, "en-US"))
    expect(await readdir(dir)).toEqual(["en-US.pak"])
  })

  test("matching is case-insensitive and supports underscore separators", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    const dir = await createPakLocales(appOutDir, ["en_US", "de"])
    await removeUnusedLanguagesIfNeeded(fakeOptions(Platform.LINUX, appOutDir, ["EN-us", "PT"]))
    expect(await readdir(dir)).toEqual(["en_US.pak"])
  })

  test("region-qualified language keeps mac's bare .lproj dir", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    const dirs = await createLprojLocales(appOutDir, ["en", "de", "fr"])
    await removeUnusedLanguagesIfNeeded(fakeOptions(Platform.MAC, appOutDir, ["en-US"]))
    for (const dir of dirs) {
      expect(await readdir(dir)).toEqual(["en.lproj"])
    }
  })

  test("refuses to delete every locale when nothing matches", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    const dir = await createPakLocales(appOutDir, ["de", "fr"])
    await removeUnusedLanguagesIfNeeded(fakeOptions(Platform.WINDOWS, appOutDir, ["xx"]))
    expect((await readdir(dir)).sort()).toEqual(["de.pak", "fr.pak"])
  })
})
