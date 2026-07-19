import { checkMetadata } from "app-builder-lib/internal"
import { TmpDir } from "builder-util"
import fsExtra from "fs-extra"
import Module from "node:module"
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
 * electron-updater is written to `<dir>/node_modules/electron-updater/package.json`,
 * merged with any `extraPackageJson` fields (e.g. an `exports` map).
 */
async function withProjectDir<T>(installedUpdaterVersion: string | null, fn: (projectDir: string) => T, extraPackageJson: Record<string, unknown> = {}): Promise<T> {
  const tmpDir = new TmpDir("eb-package-metadata-test")
  try {
    const projectDir = await tmpDir.createTempDir()
    if (installedUpdaterVersion != null) {
      await fsExtra.outputJson(path.join(projectDir, "node_modules", "electron-updater", "package.json"), {
        name: "electron-updater",
        version: installedUpdaterVersion,
        ...extraPackageJson,
      })
    }
    // pnpm's bin shims export NODE_PATH pointing at the repo's virtual store, and require.resolve
    // consults NODE_PATH-derived global paths even when the `paths` option is set — which makes the
    // workspace electron-updater resolvable from ANY directory. Clear it for the duration of the
    // callback so the temp project dir behaves like a real user project.
    const savedNodePath = process.env.NODE_PATH
    delete process.env.NODE_PATH
    ;(Module as any)._initPaths()
    try {
      return fn(projectDir)
    } finally {
      if (savedNodePath != null) {
        process.env.NODE_PATH = savedNodePath
      }
      ;(Module as any)._initPaths()
    }
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

    test("accepts yarn berry patch: specifier resolving to a satisfying version", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "patch:electron-updater@npm%3A6.6.2#~/.yarn/patches/electron-updater-npm-6.6.2-abc.patch" }, projectDir)).not.toThrow()
      })
    })

    test("rejects yarn berry patch: specifier resolving to a too-old version", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "patch:electron-updater@npm%3A3.0.0#~/.yarn/patches/electron-updater-npm-3.0.0-abc.patch" }, projectDir)).toThrow(
          /At least electron-updater 4\.0\.0 is recommended/
        )
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

    test("falls back to skipping catalog: validation when the installed exports map does not expose ./package.json", async () => {
      // electron-updater 7.0.0-alpha.4 ships an exports map without "./package.json", so
      // require.resolve("electron-updater/package.json") throws ERR_PACKAGE_PATH_NOT_EXPORTED
      // and the check falls back to the declared specifier (catalog: is skipped)
      await withProjectDir(
        "3.0.0",
        projectDir => {
          expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).not.toThrow()
        },
        {
          exports: {
            ".": { require: "./dist/index.js" },
            "./internal": { require: "./dist/indexInternal.js" },
          },
        }
      )
    })

    test("validates the installed version for catalog: when the exports map exposes ./package.json", async () => {
      await withProjectDir(
        "3.0.0",
        projectDir => {
          expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
        },
        {
          exports: {
            ".": { require: "./dist/index.js" },
            "./internal": { require: "./dist/indexInternal.js" },
            "./package.json": "./package.json",
          },
        }
      )
    })
  })
})
