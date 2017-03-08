import BluebirdPromise from "bluebird-lst"
import { createTargets, DIR_TARGET, Platform } from "electron-builder"
import { copyFile } from "electron-builder-util/out/fs"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, convertUpdateInfo, platform } from "../helpers/packTester"

test.ifMac("two-package", () => assertPack("test-app", {
  targets: createTargets([Platform.MAC], null, "all"),
  appMetadata: {
    repository: "foo/bar"
  },
}, {
  signed: true,
}))

test.ifMac("one-package", app({
  targets: Platform.MAC.createTarget(),
  config: {
    publish: {
      provider: "generic",
      url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
    },
    mac: {
      extendInfo: {
        LSUIElement: true,
      },
      fileAssociations: [
        {
          ext: "foo",
          name: "Foo",
          role: "Viewer",
        },
        {
          ext: "boo",
          name: "Boo",
          role: "Shell",
          isPackage: true,
        },
        {
          ext: "bar",
          name: "Bar",
          role: "Shell",
          // If I specify `fileAssociations.icon` as `build/lhtmldoc.icns` will it know to use `build/lhtmldoc.ico` for Windows?
          icon: "someFoo.ico"
        },
      ]
    }
  }
}, {
  signed: true,
  projectDirCreated: projectDir => BluebirdPromise.all([
    copyFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "foo.icns")),
    copyFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "someFoo.icns")),
  ]),
  checkMacApp: async (appDir, info) => {
    expect(info).toMatchSnapshot()
    await assertThat(path.join(appDir, "Contents", "Resources", "foo.icns")).isFile()
    await assertThat(path.join(appDir, "Contents", "Resources", "someFoo.icns")).isFile()
  },
  packed: async context => {
    expect(convertUpdateInfo(await readJson(path.join(context.outDir, "mac", "latest-mac.json")))).toMatchSnapshot()
  },
}))

test.ifMac("electronDist", appThrows({
  targets: Platform.MAC.createTarget(DIR_TARGET),
  config: {
    electronDist: "foo",
  }
}))

test.ifWinCi("Build macOS on Windows is not supported", appThrows(platform(Platform.MAC)))