import { WinPackager } from "app-builder-lib"
import { configureWebInstallerAppPackageUrl } from "app-builder-lib/internal"
import type { Defines } from "app-builder-lib/internal"
import { Configuration, NsisWebOptions } from "electron-builder"
import * as path from "path"
import { TmpDir } from "temp-file"

// APP_PACKAGE_URL define resolution for the nsis-web installer, offline and on every OS. A real `WinPackager` is built over a
// minimal fake `Packager` (metadata + config, the pattern of squirrelWindowsOptionsTest.ts), so publish-config resolution
// (nsisWeb.publish → win.publish → publish), macro expansion and the GitHub/S3/generic URL computation are the production
// ones. The tests that build the web installer and its *.nsis.7z packages live in webInstaller.e2e.ts.

type AppPackageUrlDefines = Pick<Defines, "APP_PACKAGE_URL" | "APP_PACKAGE_URL_IS_INCOMPLETE">

async function computeDefines(tmpDir: TmpDir, config: Configuration): Promise<AppPackageUrlDefines> {
  const projectDir = await tmpDir.getTempDir({ prefix: "web-installer-url" })
  // mirrors test/fixtures/test-app-one/package.json (author already normalized to an object, as Packager does)
  const metadata = {
    name: "TestApp",
    productName: "Test App ßW",
    version: "1.1.0",
    description: "Test Application",
    author: { name: "Foo Bar", email: "foo@example.com" },
  }
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", ...config },
    metadata,
    devMetadata: null,
    options: {},
    projectDir,
    buildResourcesDir: path.join(projectDir, "build"),
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    framework: { defaultAppIdPrefix: "com.electron." },
  }
  const packager = new WinPackager(fakePackagerInfo as any)
  // NsisTarget layers the `nsisWeb` options over `nsis`, so this is what WebInstallerTarget.configureDefines sees as `this.options`
  const defines: AppPackageUrlDefines = {}
  await configureWebInstallerAppPackageUrl(packager, { ...config.nsis, ...config.nsisWeb } as NsisWebOptions, defines)
  return defines
}

test("web installer, appPackageUrl is complete URL (no arch paths appended)", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    publish: null,
    nsisWeb: {
      appPackageUrl: "https://example.com/download/latest",
    },
  })
  // APP_PACKAGE_URL_IS_INCOMPLETE must stay undefined (`!ifdef`), so the script uses the URL as-is
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://example.com/download/latest" })
})

// When appPackageUrl is NOT explicitly set, APP_PACKAGE_URL_IS_INCOMPLETE must be defined so the
// NSIS template appends the arch-specific filename at runtime.
test("web installer, auto-computed URL from S3 sets APP_PACKAGE_URL_IS_INCOMPLETE", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    publish: {
      provider: "s3",
      bucket: "my-bucket",
      path: "releases",
    },
  })
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://my-bucket.s3.amazonaws.com/releases", APP_PACKAGE_URL_IS_INCOMPLETE: null })
})

test("web installer, auto-computed URL from GitHub sets APP_PACKAGE_URL_IS_INCOMPLETE", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    publish: {
      provider: "github",
      owner: "foo",
      repo: "bar",
    },
  })
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://github.com/foo/bar/releases/download/v1.1.0", APP_PACKAGE_URL_IS_INCOMPLETE: null })
})

test("web installer, auto-computed URL from generic provider sets APP_PACKAGE_URL_IS_INCOMPLETE", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    publish: {
      provider: "generic",
      url: "https://cdn.example.com/releases",
    },
  })
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://cdn.example.com/releases", APP_PACKAGE_URL_IS_INCOMPLETE: null })
})

// nsisWeb.publish should take precedence over the top-level build.publish config.
test("web installer, nsisWeb.publish overrides global publish config", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
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
  })
  // target-level publish wins — URL must be from the generic provider
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://target-level.example.com", APP_PACKAGE_URL_IS_INCOMPLETE: null })
})

// When nsisWeb.publish is absent, win.publish should be used as the fallback.
test("web installer, win.publish used when nsisWeb.publish is absent", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    win: {
      publish: {
        provider: "generic",
        url: "https://win-level.example.com",
      },
    },
  })
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://win-level.example.com", APP_PACKAGE_URL_IS_INCOMPLETE: null })
})

// Explicit appPackageUrl must be used verbatim — no trailing-slash stripping or other normalization.
test("web installer, appPackageUrl with trailing slash is used verbatim", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    publish: null,
    nsisWeb: {
      appPackageUrl: "https://example.com/download/",
    },
  })
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://example.com/download/" })
})

// When multiple publish configs are given, the first one should be used.
test("web installer, multiple publish configs — first one is used", async ({ expect, tmpDir }) => {
  const defines = await computeDefines(tmpDir, {
    publish: [
      { provider: "github", owner: "foo", repo: "bar" },
      { provider: "s3", bucket: "second-bucket" },
    ],
  })
  // First config (GitHub) should determine the URL.
  expect(defines).toStrictEqual({ APP_PACKAGE_URL: "https://github.com/foo/bar/releases/download/v1.1.0", APP_PACKAGE_URL_IS_INCOMPLETE: null })
})

// When publish is null and no appPackageUrl is given, the build must throw rather than produce a
// silent broken installer.
test("web installer, publish: null without appPackageUrl throws error", ({ expect, tmpDir }) =>
  expect(computeDefines(tmpDir, { publish: null })).rejects.toThrow("Cannot compute app package download URL"))
