import { Arch, Platform } from "electron-builder"
import * as path from "path"
import * as fs from "fs/promises"
import { archiveContains, listArchiveEntries, listArchiveMethods, NON_DECODABLE_NSIS_FILTER } from "../helpers/archiveHelper"
import { app, assertPack } from "../helpers/packTester"

// tests are heavy, to distribute tests across CircleCI machines evenly, these tests were moved from oneClickInstallerTest

test("web installer", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64, Arch.arm64),
      config: {
        publish: {
          provider: "s3",
          bucket: "develar",
          path: "test",
        },
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: true,
          enableNodeCliInspectArguments: true,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: true,
          grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
        },
      },
    },
    {
      packed: async context => {
        // The persistent web app package (*.nsis.7z) is the one place elevate.exe must live —
        // it is injected straight into the archive, never via appOutDir (#9852). This is the
        // cross-platform positive counterpart to the win-unpacked/Squirrel "absent" assertions.
        const archives = (await fs.readdir(context.outDir, { recursive: true })).filter(f => f.endsWith(".nsis.7z"))
        expect(archives.length, "expected at least one .nsis.7z web app package").toBeGreaterThan(0)
        for (const rel of archives) {
          const archivePath = path.join(context.outDir, rel)
          expect(await archiveContains(archivePath, "resources/elevate.exe"), `${rel} must contain resources/elevate.exe`).toBe(true)

          // #9983: the install-time Nsis7z decoder silently drops entries packed with a CPU branch
          // filter it can't read (BCJ2 on x64, ARM64 on arm64) — the main exe and every native
          // binary go missing. The whole payload (x64 + arm64, plus the appended elevate.exe) must
          // use only decoder-readable codecs (plain LZMA2/Copy or the single-stream BCJ).
          const methods = await listArchiveMethods(archivePath)
          expect(methods.length, `${rel} should report codec methods`).toBeGreaterThan(0)
          for (const method of methods) {
            expect(method, `${rel} entry packed with a non-decodable branch filter: "${method}"`).not.toMatch(NON_DECODABLE_NSIS_FILTER)
          }

          // Tie "no branch filter" to the literal #9983 symptom: the payload must actually contain
          // the main app exe (a PE that would have been the first thing silently dropped), not just
          // the appended elevate.exe and the data files.
          const entries = await listArchiveEntries(archivePath)
          const appExes = entries.filter(e => e.toLowerCase().endsWith(".exe") && !e.toLowerCase().endsWith("elevate.exe"))
          expect(appExes.length, `${rel} must contain the main app exe (PE files must not be dropped); entries: ${entries.join(", ")}`).toBeGreaterThan(0)
        }
      },
    }
  ))

test("web installer (default github)", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.ia32, Arch.x64, Arch.arm64),
    config: {
      publish: {
        provider: "github",
        // test form without owner
        repo: "foo/bar",
      },
    },
  }))

test("web installer, safe name on github", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      productName: "WorkFlowy",
      publish: {
        provider: "github",
        repo: "foo/bar",
      },
      nsisWeb: {
        //tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${productName}.${ext}",
      },
    },
  }))

test("web installer, appPackageUrl is complete URL (no arch paths appended)", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: null,
      nsisWeb: {
        appPackageUrl: "https://example.com/download/latest",
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      expect(defines.APP_PACKAGE_URL).toEqual("https://example.com/download/latest")
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeUndefined()
      return Promise.resolve(true)
    },
  }))

// When appPackageUrl is NOT explicitly set, APP_PACKAGE_URL_IS_INCOMPLETE must be defined so the
// NSIS template appends the arch-specific filename at runtime.
test("web installer, auto-computed URL from S3 sets APP_PACKAGE_URL_IS_INCOMPLETE", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: {
        provider: "s3",
        bucket: "my-bucket",
        path: "releases",
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      expect(defines.APP_PACKAGE_URL).toBeDefined()
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeNull()
      return Promise.resolve(true)
    },
  }))

test("web installer, auto-computed URL from GitHub sets APP_PACKAGE_URL_IS_INCOMPLETE", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: {
        provider: "github",
        owner: "foo",
        repo: "bar",
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      expect(defines.APP_PACKAGE_URL).toMatch(/github\.com\/foo\/bar\/releases\/download/)
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeNull()
      return Promise.resolve(true)
    },
  }))

test("web installer, auto-computed URL from generic provider sets APP_PACKAGE_URL_IS_INCOMPLETE", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: {
        provider: "generic",
        url: "https://cdn.example.com/releases",
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      expect(defines.APP_PACKAGE_URL).toEqual("https://cdn.example.com/releases")
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeNull()
      return Promise.resolve(true)
    },
  }))

// When publish is null and no appPackageUrl is given, the build must throw rather than produce a
// silent broken installer.
test("web installer, publish: null without appPackageUrl throws error", ({ expect }) =>
  expect(
    assertPack(expect, "test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
      config: {
        publish: null,
      },
    })
  ).rejects.toThrow("Cannot compute app package download URL"))

// nsisWeb.publish should take precedence over the top-level build.publish config.
test("web installer, nsisWeb.publish overrides global publish config", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: {
        provider: "s3",
        bucket: "global-bucket",
      },
      nsisWeb: {
        publish: {
          provider: "generic",
          url: "https://target-level.example.com",
        },
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      // target-level publish wins — URL must be from the generic provider
      expect(defines.APP_PACKAGE_URL).toEqual("https://target-level.example.com")
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeNull()
      return Promise.resolve(true)
    },
  }))

// When nsisWeb.publish is absent, win.publish should be used as the fallback.
test("web installer, win.publish used when nsisWeb.publish is absent", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      win: {
        publish: {
          provider: "generic",
          url: "https://win-level.example.com",
        },
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      expect(defines.APP_PACKAGE_URL).toEqual("https://win-level.example.com")
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeNull()
      return Promise.resolve(true)
    },
  }))

// Explicit appPackageUrl must be used verbatim — no trailing-slash stripping or other normalization.
test("web installer, appPackageUrl with trailing slash is used verbatim", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: null,
      nsisWeb: {
        appPackageUrl: "https://example.com/download/",
      },
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      expect(defines.APP_PACKAGE_URL).toEqual("https://example.com/download/")
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeUndefined()
      return Promise.resolve(true)
    },
  }))

// When multiple publish configs are given, the first one should be used.
test("web installer, multiple publish configs — first one is used", ({ expect }) =>
  assertPack(expect, "test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
    config: {
      publish: [
        { provider: "github", owner: "foo", repo: "bar" },
        { provider: "s3", bucket: "second-bucket" },
      ],
    },
    effectiveOptionComputed: it => {
      const defines = it[0]
      // First config (GitHub) should determine the URL.
      expect(defines.APP_PACKAGE_URL).toMatch(/github\.com\/foo\/bar\/releases\/download/)
      expect(defines.APP_PACKAGE_URL_IS_INCOMPLETE).toBeNull()
      return Promise.resolve(true)
    },
  }))
