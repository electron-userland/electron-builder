import { Arch, Platform } from "electron-builder"
import { copy, writeFile } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, assertPack, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
import { checkHelpers, doTest, expectUpdateMetadata } from "../helpers/winHelper"

const nsisTarget = Platform.WINDOWS.createTarget(["nsis"])

test("one-click", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    publish: {
      provider: "bintray",
      owner: "actperepo",
      package: "TestApp",
    },
    nsis: {
      deleteAppDataOnUninstall: true,
      packElevateHelper: false
    },
  }
}, {
  signedWin: true,
  packed: async context => {
    await checkHelpers(context.getResources(Platform.WINDOWS, Arch.ia32), false)
    await doTest(context.outDir, true, "TestApp Setup", "TestApp", null, false)
    await expectUpdateMetadata(context, Arch.ia32, true)
  }
}))

test.ifAll.ifNotCiMac("multi language license", app({
  targets: Platform.WINDOWS.createTarget("nsis"),
  config: {
    publish: null,
    nsis: {
      uninstallDisplayName: "Hi!!!",
      createDesktopShortcut: false,
    },
  },
}, {
  projectDirCreated: projectDir => {
    return Promise.all([
      writeFile(path.join(projectDir, "build", "license_en.txt"), "Hi"),
      writeFile(path.join(projectDir, "build", "license_ru.txt"), "Привет"),
      writeFile(path.join(projectDir, "build", "license_ko.txt"), "Привет"),
      writeFile(path.join(projectDir, "build", "license_fi.txt"), "Привет"),
    ])
  },
}))

test.ifAll.ifNotCiMac("html license", app({
  targets: Platform.WINDOWS.createTarget("nsis"),
  config: {
    publish: null,
    nsis: {
      uninstallDisplayName: "Hi!!!",
      createDesktopShortcut: false,
    }
  },
}, {
  projectDirCreated: projectDir => {
    return Promise.all([
      writeFile(path.join(projectDir, "build", "license.html"), '<html><body><p>Hi <a href="https://google.com" target="_blank">google</a></p></body></html>'),
    ])
  },
}))

test.ifAll.ifDevOrWinCi("createDesktopShortcut always", app({
  targets: Platform.WINDOWS.createTarget("nsis"),
  config: {
    publish: null,
    nsis: {
      createDesktopShortcut: "always",
    }
  },
}))

test.ifDevOrLinuxCi("perMachine, no run after finish", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    // wine creates incorrect file names and registry entries for unicode, so, we use ASCII
    productName: "TestApp",
    fileAssociations: [
      {
        ext: "foo",
        name: "Test Foo",
      }
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
}, {
  projectDirCreated: projectDir => {
    return Promise.all([
      copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo test space.ico")),
      copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
    ])
  },
  packed: async context => {
    await expectUpdateMetadata(context)
    await checkHelpers(context.getResources(Platform.WINDOWS, Arch.ia32), true)
    await doTest(context.outDir, false)
  },
}))

test.ifNotCiMac("installerHeaderIcon", () => {
  let headerIconPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      effectiveOptionComputed: async it => {
        const defines = it[0]
        expect(defines.HEADER_ICO).toEqual(headerIconPath)
        return false
      }
    }, {
      projectDirCreated: projectDir => {
        headerIconPath = path.join(projectDir, "build", "installerHeaderIcon.ico")
        return Promise.all([copyTestAsset("headerIcon.ico", headerIconPath), copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "uninstallerIcon.ico"))])
      }
    }
  )
})

test.ifDevOrLinuxCi("custom include", app({targets: nsisTarget}, {
  projectDirCreated: projectDir => copyTestAsset("installer.nsh", path.join(projectDir, "build", "installer.nsh")),
  packed: context => Promise.all([
    assertThat(path.join(context.projectDir, "build", "customHeader")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInit")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInstall")).isFile(),
  ]),
}))

test.skip("big file pack", app(
  {
    targets: nsisTarget,
    config: {
      extraResources: ["**/*.mov"],
      nsis: {
        differentialPackage: false,
      },
    },
  }, {
  projectDirCreated: async projectDir => {
    await copy("/Volumes/Pegasus/15.02.18.m4v", path.join(projectDir, "foo/bar/video.mov"))
  },
}))

test.ifDevOrLinuxCi("custom script", app({targets: nsisTarget}, {
  projectDirCreated: projectDir => copyTestAsset("installer.nsi", path.join(projectDir, "build", "installer.nsi")),
  packed: context => assertThat(path.join(context.projectDir, "build", "customInstallerScript")).isFile(),
}))

test.ifAll.ifNotCiMac("menuCategory", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    extraMetadata: {
      name: "test-menu-category",
      productName: "Test Menu Category"
    },
    publish: null,
    nsis: {
      oneClick: false,
      menuCategory: true,
      artifactName: "${productName} CustomName ${version}.${ext}"
    },
  }
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.name = "test-menu-category"
  }),
  packed: context => {
    return doTest(context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar")
  }
}))

test.ifNotCiMac("string menuCategory", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    extraMetadata: {
      name: "test-menu-category",
      productName: "Test Menu Category '"
    },
    publish: null,
    nsis: {
      oneClick: false,
      runAfterFinish: false,
      menuCategory: "Foo/Bar",
      // tslint:disable-next-line:no-invalid-template-strings
      artifactName: "${productName} CustomName ${version}.${ext}"
    },
  }
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.name = "test-menu-category"
  }),
  packed: async context => {
    await doTest(context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar")
  }
}))


test.ifDevOrLinuxCi("file associations per user", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    publish: null,
    fileAssociations: [
      {
        ext: "foo",
        name: "Test Foo",
      }
    ]
  },
}, {
  packed: async context => {
    return doTest(context.outDir, true)
  },
}))