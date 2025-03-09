import { Arch, Platform } from "electron-builder"
import { copyFile, writeFile } from "fs-extra"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, assertPack, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
import { checkHelpers, doTest, expectUpdateMetadata } from "../helpers/winHelper"

const nsisTarget = Platform.WINDOWS.createTarget(["nsis"], Arch.x64)

function pickSnapshotDefines(defines: any) {
  return {
    APP_32_NAME: defines.APP_32_NAME,
    APP_64_NAME: defines.APP_64_NAME,
    APP_ARM64_NAME: defines.APP_ARM64_NAME,
    APP_FILENAME: defines.APP_FILENAME,
    APP_ID: defines.APP_ID,
    APP_PACKAGE_NAME: defines.APP_PACKAGE_NAME,
    APP_PRODUCT_FILENAME: defines.APP_PRODUCT_FILENAME,
    COMPANY_NAME: defines.COMPANY_NAME,
    ONE_CLICK: defines.ONE_CLICK,
    PRODUCT_FILENAME: defines.PRODUCT_FILENAME,
    PRODUCT_NAME: defines.PRODUCT_NAME,
    SHORTCUT_NAME: defines.SHORTCUT_NAME,
    UNINSTALL_DISPLAY_NAME: defines.UNINSTALL_DISPLAY_NAME,
  }
}

test("one-click", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
      config: {
        win: {
          signtoolOptions: {
            publisherName: "Foo, Inc",
          },
        },
        publish: {
          provider: "generic",
          // tslint:disable:no-invalid-template-strings
          url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
        },
        nsis: {
          deleteAppDataOnUninstall: true,
          packElevateHelper: false,
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
      packed: async context => {
        await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.x64), false)
        await doTest(expect, context.outDir, true, "TestApp Setup", "TestApp", null, false)
        await expectUpdateMetadata(expect, context, Arch.x64, true)
      },
    }
  ))

test("custom guid", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
    config: {
      appId: "boo",
      productName: "boo Hub",
      publish: null,
      nsis: {
        guid: "Foo Technologies\\Bar",
      },
    },
  }))

test("multi language license", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
      config: {
        publish: null,
        nsis: {
          uninstallDisplayName: "Hi!!!",
          createDesktopShortcut: false,
        },
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          writeFile(path.join(projectDir, "build", "license_en.txt"), "Hi"),
          writeFile(path.join(projectDir, "build", "license_ru.txt"), "Привет"),
          writeFile(path.join(projectDir, "build", "license_ko.txt"), "Привет"),
          writeFile(path.join(projectDir, "build", "license_fi.txt"), "Привет"),
        ])
      },
    }
  ))

test("html license", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
      config: {
        publish: null,
        nsis: {
          uninstallDisplayName: "Hi!!!",
          createDesktopShortcut: false,
        },
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          writeFile(path.join(projectDir, "build", "license.html"), '<html><body><p>Hi <a href="https://google.com" target="_blank">google</a></p></body></html>'),
        ])
      },
    }
  ))

test.ifDevOrWinCi("createDesktopShortcut always", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget("nsis"),
    config: {
      publish: null,
      nsis: {
        createDesktopShortcut: "always",
      },
    },
  })
)

test.ifDevOrLinuxCi("perMachine, no run after finish", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
      config: {
        // wine creates incorrect file names and registry entries for unicode, so, we use ASCII
        productName: "TestApp",
        fileAssociations: [
          {
            ext: "foo",
            name: "Test Foo",
          },
        ],
        nsis: {
          perMachine: true,
          runAfterFinish: false,
        },
        publish: {
          provider: "generic",
          // tslint:disable:no-invalid-template-strings
          url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
        },
        win: {
          electronUpdaterCompatibility: ">=2.16",
        },
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo test space.ico")),
          copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
        ])
      },
      packed: async context => {
        await expectUpdateMetadata(expect, context)
        await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.ia32), true)
        await doTest(expect, context.outDir, false)
      },
    }
  )
)

test.skip("installerHeaderIcon", ({ expect }) => {
  let headerIconPath: string | null = null
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: nsisTarget,
      effectiveOptionComputed: async it => {
        const defines = it[0]
        expect(defines.HEADER_ICO).toEqual(headerIconPath)
        return false
      },
    },
    {
      projectDirCreated: projectDir => {
        headerIconPath = path.join(projectDir, "build", "installerHeaderIcon.ico")
        return Promise.all([copyTestAsset("headerIcon.ico", headerIconPath), copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "uninstallerIcon.ico"))])
      },
    }
  )
})

test.ifDevOrLinuxCi("custom include", ({ expect }) =>
  app(
    expect,
    { targets: nsisTarget },
    {
      projectDirCreated: projectDir => copyTestAsset("installer.nsh", path.join(projectDir, "build", "installer.nsh")),
      packed: context =>
        Promise.all([
          assertThat(expect, path.join(context.projectDir, "build", "customHeader")).isFile(),
          assertThat(expect, path.join(context.projectDir, "build", "customInit")).isFile(),
          assertThat(expect, path.join(context.projectDir, "build", "customInstall")).isFile(),
        ]),
    }
  )
)

test.skip("big file pack", ({ expect }) =>
  app(
    expect,
    {
      targets: nsisTarget,
      config: {
        extraResources: ["**/*.mov"],
        nsis: {
          differentialPackage: false,
        },
      },
    },
    {
      projectDirCreated: async projectDir => {
        await copyFile("/Volumes/Pegasus/15.02.18.m4v", path.join(projectDir, "foo/bar/video.mov"))
      },
    }
  ))

test.ifDevOrLinuxCi("custom script", ({ expect }) =>
  app(
    expect,
    { targets: nsisTarget },
    {
      projectDirCreated: projectDir => copyTestAsset("installer.nsi", path.join(projectDir, "build", "installer.nsi")),
      packed: context => assertThat(expect, path.join(context.projectDir, "build", "customInstallerScript")).isFile(),
    }
  )
)

test("menuCategory", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
      config: {
        extraMetadata: {
          name: "test-menu-category",
          productName: "Test Menu Category",
        },
        publish: null,
        nsis: {
          oneClick: false,
          menuCategory: true,
          artifactName: "${productName} CustomName ${version}.${ext}",
        },
      },
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.name = "test-menu-category"
        }),
      packed: context => {
        return doTest(expect, context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar")
      },
    }
  ))

test("string menuCategory", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
      config: {
        extraMetadata: {
          name: "test-menu-category",
          productName: "Test Menu Category '",
        },
        publish: null,
        nsis: {
          oneClick: false,
          runAfterFinish: false,
          menuCategory: "Foo/Bar",
          // tslint:disable-next-line:no-invalid-template-strings
          artifactName: "${productName} CustomName ${version}.${ext}",
        },
      },
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.name = "test-menu-category"
        }),
      packed: async context => {
        await doTest(expect, context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar")
      },
    }
  ))

test.ifDevOrLinuxCi("file associations per user", ({ expect }) =>
  app(expect, {
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
    config: {
      publish: null,
      fileAssociations: [
        {
          ext: "foo",
          name: "Test Foo",
        },
      ],
    },
  })
)

test.ifWindows.skip("custom exec name", ({ expect }) =>
  app(expect, {
    targets: nsisTarget,
    config: {
      productName: "foo",
      win: {
        executableName: "Boo",
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
    effectiveOptionComputed: async it => {
      expect(pickSnapshotDefines(it[0])).toMatchSnapshot()
      return false
    },
  })
)

test.ifWindows.skip("top-level custom exec name", ({ expect }) =>
  app(expect, {
    targets: nsisTarget,
    config: {
      publish: null,
      productName: "foo",
      executableName: "Boo",
    },
    effectiveOptionComputed: async it => {
      expect(pickSnapshotDefines(it[0])).toMatchSnapshot()
      return false
    },
  })
)
