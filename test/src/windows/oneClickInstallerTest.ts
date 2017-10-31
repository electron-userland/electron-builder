import BluebirdPromise from "bluebird-lst"
import { Arch, Platform } from "electron-builder"
import { writeFile } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
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

// test.ifAll("one-click - differential package", app({
//   targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
//   config: {
//     publish: null,
//     nsis: {
//       differentialPackage: true,
//     },
//   }
// }, {
//   // test that 7za is signed
//   signedWin: true,
// }))

test.ifAll.ifNotCiMac("multi language license", app({
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
    return BluebirdPromise.all([
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
    return BluebirdPromise.all([
      writeFile(path.join(projectDir, "build", "license.html"), '<html><body><p>Hi <a href="https://google.com" target="_blank">google</a></p></body></html>'),
    ])
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
  },
}, {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
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
        return BluebirdPromise.all([copyTestAsset("headerIcon.ico", headerIconPath), copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "uninstallerIcon.ico"))])
      }
    }
  )
})

test.ifDevOrLinuxCi("custom include", () => assertPack("test-app-one", {targets: nsisTarget}, {
  projectDirCreated: projectDir => copyTestAsset("installer.nsh", path.join(projectDir, "build", "installer.nsh")),
  packed: context => BluebirdPromise.all([
    assertThat(path.join(context.projectDir, "build", "customHeader")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInit")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInstall")).isFile(),
  ]),
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

test.ifAll.ifNotCiMac("string menuCategory", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    extraMetadata: {
      name: "test-menu-category",
      productName: "Test Menu Category"
    },
    publish: null,
    nsis: {
      oneClick: false,
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

test.ifDevOrLinuxCi("file associations only perMachine", appThrows({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    fileAssociations: [
      {
        ext: "foo",
        name: "Test Foo",
      }
    ],
  },
}))