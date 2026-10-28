import { Arch, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"
import { checkHelpers, doTest, expectUpdateMetadata } from "../helpers/winHelper"
import { ToolsetConfig } from "app-builder-lib/internal"
import { isNsisLoggingSupported } from "app-builder-lib/src/toolsets/nsis"
import { latestToolsetVersion, WIN_CODE_SIGN_VERSIONS } from "../../vitest-scripts/runtime-tests/generate-toolset-versions"

const nsisTarget = Platform.WINDOWS.createTarget("nsis", Arch.x64)

export function registerAssistedInstallerTests(toolsets: ToolsetConfig): void {
  test("assisted", ({ expect }) =>
    app(
      expect,
      {
        targets: nsisTarget,
        config: {
          toolsets,
          nsis: {
            oneClick: false,
            language: "1031",
          },
          win: {
            legalTrademarks: "My Trademark",
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
        signedWin: true,
        projectDirCreated: projectDir => copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
      }
    ))

  test("allowElevation false, app requestedExecutionLevel admin", ({ expect }) =>
    app(expect, {
      targets: nsisTarget,
      config: {
        toolsets,
        publish: null,
        extraMetadata: {
          // mt.exe doesn't like unicode names from wine
          name: "test",
          productName: "test",
        },
        win: {
          requestedExecutionLevel: "requireAdministrator",
        },
        nsis: {
          oneClick: false,
          allowElevation: false,
          perMachine: true,
          displayLanguageSelector: true,
          installerLanguages: ["en_US", "ru_RU"],
          differentialPackage: false,
        },
      },
    }))

  test("assisted, MUI_HEADER", ({ expect }) => {
    let installerHeaderPath: string | null = null
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: nsisTarget,
        config: {
          toolsets,
          publish: null,
          nsis: {
            oneClick: false,
            differentialPackage: false,
          },
        },
        effectiveOptionComputed: async it => {
          const defines = it[0]
          expect(defines.MUI_HEADERIMAGE).toBeNull()
          expect(defines.MUI_HEADERIMAGE_BITMAP).toEqual(installerHeaderPath)
          expect(defines.MUI_HEADERIMAGE_RIGHT).toBeNull()
          // speedup, do not build - another MUI_HEADER test will test build
          return Promise.resolve(true)
        },
      },
      {
        projectDirCreated: projectDir => {
          installerHeaderPath = path.join(projectDir, "build", "installerHeader.bmp")
          return copyTestAsset("installerHeader.bmp", installerHeaderPath)
        },
      }
    )
  })

  test.ifWindows("assisted, MUI_HEADER as option", ({ expect }) => {
    let installerHeaderPath: string | null = null
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32, Arch.x64),
        config: {
          toolsets,
          publish: null,
          nsis: {
            oneClick: false,
            installerHeader: "foo.bmp",
            differentialPackage: false,
          },
        },
        effectiveOptionComputed: async it => {
          const defines = it[0]
          expect(defines.MUI_HEADERIMAGE).toBeNull()
          expect(defines.MUI_HEADERIMAGE_BITMAP).toEqual(installerHeaderPath)
          expect(defines.MUI_HEADERIMAGE_RIGHT).toBeNull()
          // test that we can build such installer
          return Promise.resolve(false)
        },
      },
      {
        projectDirCreated: projectDir => {
          installerHeaderPath = path.join(projectDir, "foo.bmp")
          return copyTestAsset("installerHeader.bmp", installerHeaderPath)
        },
      }
    )
  })

  // Needs a log-enabled NSIS (makensis and stubs compiled with NSIS_CONFIG_LOG=yes), which nsis@2.0.2 (the default) is and the older pinned
  // bundles (0.0.0, 1.2.1) are not — for those, assertInstallerDebugLoggingSupported fails the build (covered in legacyConfigGuardTest).
  // Built once, with the newest winCodeSign: the signing toolset takes no part in the LogSet compile.
  test.ifEnv(isNsisLoggingSupported(toolsets.nsis) && toolsets.winCodeSign === latestToolsetVersion(WIN_CODE_SIGN_VERSIONS))("debug logging enabled", ({ expect }) =>
    app(expect, {
      targets: nsisTarget,
      config: {
        toolsets,
        nsis: {
          installerDebugLogging: true,
        },
      },
      effectiveOptionComputed: async it => {
        const defines = it[0]
        // the installer and uninstaller scripts call `LogSet on` when this is defined, which makensis rejects unless log-enabled
        expect(defines).toHaveProperty("ENABLE_LOGGING_ELECTRON_BUILDER", null)
        return Promise.resolve(false)
      },
    })
  )

  test("assisted, only perMachine", ({ expect }) =>
    app(expect, {
      targets: nsisTarget,
      config: {
        toolsets,
        nsis: {
          oneClick: false,
          perMachine: true,
        },
      },
    }))

  test("assisted, only perMachine and elevated", ({ expect }) =>
    app(expect, {
      targets: nsisTarget,
      config: {
        toolsets,
        nsis: {
          oneClick: false,
          perMachine: true,
          packElevateHelper: true,
        },
      },
    }))

  // test release notes also
  // wine.exec runs the installer 3× (install, reinstall, uninstall) which can
  // exceed the default 600 s global timeout on slower CI runners.
  test("allowToChangeInstallationDirectory", { timeout: 20 * 60 * 1000 }, ({ expect }) =>
    app(
      expect,
      {
        targets: nsisTarget,
        config: {
          toolsets,
          extraMetadata: {
            name: "test-custom-inst-dir",
            productName: "Test Custom Installation Dir",
            repository: "foo/bar",
          },
          nsis: {
            allowToChangeInstallationDirectory: true,
            oneClick: false,
            multiLanguageInstaller: false,
          },
        },
      },
      {
        projectDirCreated: async projectDir => {
          await fs.writeFile(path.join(projectDir, "build", "release-notes.md"), "New release with new bugs and\n\nwithout features")
          await copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt"))
        },
        packed: async context => {
          await expectUpdateMetadata(expect, context, Arch.x64)
          await checkHelpers(expect, context.getResources(Platform.WINDOWS), true)
          await doTest(expect, context.outDir, false, "Test Custom Installation Dir", "test-custom-inst-dir", null, true, toolsets)
        },
      }
    )
  )
}
