import { Arch, Platform } from "electron-builder"
import { assertPack } from "../helpers/packTester"

// APP_PACKAGE_URL define resolution — every test exits via `effectiveOptionComputed` before the web installer is built.
// The tests that build the nsis-web installer and its *.nsis.7z packages live in webInstaller.e2e.ts.

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
