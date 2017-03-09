import BluebirdPromise from "bluebird-lst"
import { Arch, Platform } from "electron-builder"
import { readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
import { doTest, expectUpdateMetadata } from "../helpers/winHelper"

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
    },
  }
}, {
  signed: true,
  packed: async (context) => {
    await doTest(context.outDir, true)
    await expectUpdateMetadata(context, Arch.ia32, true)
  }
}))

test.ifDevOrLinuxCi("perMachine, no run after finish", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    // wine creates incorrect filenames and registry entries for unicode, so, we use ASCII
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
      url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
    },
  },
}, {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo.ico")),
      copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt"),
      )])
  },
  packed: async(context) => {
    await expectUpdateMetadata(context)
    const updateInfo = safeLoad(await readFile(path.join(context.outDir, "latest.yml"), "utf-8"))
    expect(updateInfo.sha2).not.toEqual("")
    expect(updateInfo.releaseDate).not.toEqual("")
    delete updateInfo.sha2
    delete updateInfo.releaseDate
    expect(updateInfo).toMatchSnapshot()
    await doTest(context.outDir, false)
  },
}))

test.ifNotCiMac("installerHeaderIcon", () => {
  let headerIconPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      effectiveOptionComputed: async (it) => {
        const defines = it[0]
        expect(defines.HEADER_ICO).toEqual(headerIconPath)
        return false
      }
    }, {
      projectDirCreated: projectDir => {
        headerIconPath = path.join(projectDir, "build", "installerHeaderIcon.ico")
        return copyTestAsset("headerIcon.ico", headerIconPath)
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

test.ifAll("menuCategory", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  appMetadata: {
    name: "test-menu-category",
    productName: "Test Menu Category"
  },
  config: {
    nsis: {
      perMachine: true,
      menuCategory: true,
      artifactName: "${productName} CustomName ${version}.${ext}"
    },
  }
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.name = "test-menu-category"
  }),
  packed: async(context) => {
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

test.ifNotCiMac("web installer", app({
  targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
  config: {
    compression: process.env.COMPRESSION || "store",
    publish: {
      provider: "s3",
      bucket: "develar",
      path: "test",
    }
  }
}))

test.ifAll.ifNotCiMac("web installer (default github)", app({
  targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.ia32, Arch.x64),
  config: {
    publish: {
      provider: "github",
      // test form without owner
      repo: "foo/bar"
    }
  },
}, {
  packed: async context => {
    const data = safeLoad(await readFile(path.join(context.outDir, "nsis-web", "latest.yml"), "utf-8"))
    expect(data.releaseDate).toBeDefined()
    expect(data.sha2).toBeDefined()
    delete data.releaseDate
    delete data.sha2
    expect(data).toMatchSnapshot()
  },
}))