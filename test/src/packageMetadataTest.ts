import { checkMetadata } from "app-builder-lib/internal"
import { TmpDir } from "builder-util"
import fsExtra from "fs-extra"
import * as path from "path"
import { describe, expect, test } from "vitest"

function checkDependencies(dependencies: Record<string, string>, projectDir: string) {
  const metadata: any = {
    name: "test-app",
    version: "1.0.0",
    description: "test",
    author: "test",
    dependencies,
  }
  checkMetadata(metadata, metadata, "package.json", "package.json", projectDir)
}

/**
 * Creates a temp project dir. When `installedUpdaterVersion` is set, a fake installed
 * electron-updater is written to `<dir>/node_modules/electron-updater/package.json`.
 */
async function withProjectDir<T>(installedUpdaterVersion: string | null, fn: (projectDir: string) => T): Promise<T> {
  const tmpDir = new TmpDir("eb-package-metadata-test")
  try {
    const projectDir = await tmpDir.createTempDir()
    if (installedUpdaterVersion != null) {
      await fsExtra.outputJson(path.join(projectDir, "node_modules", "electron-updater", "package.json"), {
        name: "electron-updater",
        version: installedUpdaterVersion,
      })
    }
    return fn(projectDir)
  } finally {
    await tmpDir.cleanup()
  }
}

describe("checkMetadata electron-updater version validation", () => {
  describe("electron-updater not installed (declared specifier fallback)", () => {
    test("accepts pnpm catalog: specifier", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).not.toThrow()
      })
    })

    test("accepts pnpm named catalog specifier", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:default" }, projectDir)).not.toThrow()
      })
    })

    test("accepts workspace: specifier", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "workspace:*" }, projectDir)).not.toThrow()
      })
    })

    test("accepts semver version satisfying the minimum", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.2.1" }, projectDir)).not.toThrow()
      })
    })

    test("rejects too-old electron-updater version", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^3.0.0" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })
  })

  describe("electron-updater installed (resolved version validation)", () => {
    test("accepts catalog: specifier when installed version satisfies the minimum", async () => {
      await withProjectDir("6.6.0", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).not.toThrow()
      })
    })

    test("rejects catalog: specifier when installed version is too old", async () => {
      await withProjectDir("3.0.0", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })

    test("rejects too-old installed version even when the declared range satisfies the minimum", async () => {
      await withProjectDir("3.0.0", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.0.0" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })
  })
})
