import { Metadata } from "app-builder-lib"
// checkMetadata is marked @internal, so it is stripped from the published .d.ts —
// import the implementation directly like electronGetTest does for parseExpectedChecksum.
import * as packageMetadataInternal from "app-builder-lib/src/util/packageMetadata"
import fsExtra from "fs-extra"
import Module from "node:module"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterAll, describe, expect, test, vi } from "vitest"

const { checkMetadata } = packageMetadataInternal as any

const tmpDir = new TmpDir("eb-package-metadata-test")
afterAll(() => tmpDir.cleanup())

function checkUpdaterDependency(updaterVersion: string, appDir: string) {
  const metadata: Metadata = {
    name: "test-app",
    version: "1.0.0",
    description: "test",
    author: { name: "test" },
    dependencies: { "electron-updater": updaterVersion },
  }
  const appPackageFile = path.join(appDir, "package.json")
  checkMetadata(metadata, metadata, appPackageFile, appPackageFile)
}

/**
 * Creates a temp project dir. When `installedUpdaterVersion` is set, a fake installed
 * electron-updater is written to `<dir>/node_modules/electron-updater/package.json`.
 */
async function withProjectDir(installedUpdaterVersion: string | null, fn: (projectDir: string) => void | Promise<void>): Promise<void> {
  const projectDir = await tmpDir.getTempDir({ prefix: "project" })
  await fsExtra.ensureDir(projectDir)
  if (installedUpdaterVersion != null) {
    await fsExtra.outputJson(path.join(projectDir, "node_modules", "electron-updater", "package.json"), { name: "electron-updater", version: installedUpdaterVersion })
  }
  // pnpm's bin shims export NODE_PATH pointing at the repo's virtual store, and require.resolve consults
  // NODE_PATH-derived global paths even when the `paths` option is set — which could make the workspace
  // electron-updater resolvable from any directory. Unset it so the temp project dir behaves like a real user project.
  vi.stubEnv("NODE_PATH", undefined)
  ;(Module as any)._initPaths()
  try {
    await fn(projectDir)
  } finally {
    vi.unstubAllEnvs()
    ;(Module as any)._initPaths()
  }
}

const updater7Error = /requires an app built with electron-builder 27: electron-updater 7 rejects the update configuration that electron-builder 26 writes/

describe("checkMetadata electron-updater version", () => {
  describe("electron-updater not installed (declared specifier)", () => {
    test.each(["6.8.12", "^6.3.9", "~6.0.0", ">=6", "^4.0.0", "patch:electron-updater@npm%3A6.6.2#~/.yarn/patches/electron-updater-npm-6.6.2-abc.patch"])(
      "accepts electron-updater %s",
      async updaterVersion => {
        await withProjectDir(null, projectDir => {
          expect(() => checkUpdaterDependency(updaterVersion, projectDir)).not.toThrow()
        })
      }
    )

    test("rejects too-old electron-updater", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkUpdaterDependency("^3.0.0", projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })

    // electron-updater 7 rejects the app-update.yml electron-builder 26 writes, so installs of such a build could never update
    test.each([
      "7.0.0-alpha.13",
      "^7.0.0-alpha.5",
      "7.0.0",
      "^7.1.0",
      "7.x",
      ">=7.0.0-alpha.13",
      "patch:electron-updater@npm%3A7.0.0-alpha.13#~/.yarn/patches/electron-updater-npm-7.0.0-alpha.13-abc.patch",
    ])("rejects electron-updater %s", async updaterVersion => {
      await withProjectDir(null, projectDir => {
        expect(() => checkUpdaterDependency(updaterVersion, projectDir)).toThrow(updater7Error)
      })
    })

    test("the electron-updater 7 error links the migration guide and names both fixes", async () => {
      await withProjectDir(null, projectDir => {
        expect(() => checkUpdaterDependency("7.0.0-alpha.13", projectDir)).toThrow(
          /Build with electron-builder 27, or keep electron-updater 6 \(e\.g\. "\^6\.8\.12"\)\. See https:\/\/www\.electron\.build\/docs\/migration\/v26-to-v27/
        )
      })
    })
  })

  describe("electron-updater installed (installed version decides)", () => {
    // a loose range installs electron-updater 7 once it is npm `latest` (a bare "*" already fails the 4.0.0 minimum check)
    test.each([
      [">=6", "7.0.0"],
      [">=4.0.0", "7.1.0"],
      [">=6.0.0", "7.0.0-alpha.13"],
    ])("rejects declared %s with installed %s", async (declared, installed) => {
      await withProjectDir(installed, projectDir => {
        expect(() => checkUpdaterDependency(declared, projectDir)).toThrow(
          `electron-updater ${installed} (installed for "${declared}") requires an app built with electron-builder 27`
        )
      })
    })

    test.each([
      [">=6", "6.8.12"],
      [">=4.0.0", "6.3.9"],
    ])("accepts declared %s with installed %s", async (declared, installed) => {
      await withProjectDir(installed, projectDir => {
        expect(() => checkUpdaterDependency(declared, projectDir)).not.toThrow()
      })
    })

    test("resolves electron-updater hoisted above the app directory (two package.json layout)", async () => {
      await withProjectDir("7.0.0", projectDir => {
        expect(() => checkUpdaterDependency(">=6", path.join(projectDir, "app"))).toThrow(updater7Error)
      })
    })
  })
})
