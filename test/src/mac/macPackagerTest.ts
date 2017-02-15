import { createTargets, Platform } from "electron-builder"
import { copyFile } from "electron-builder-util/out/fs"
import { DIR_TARGET } from "electron-builder/out/targets/targetFactory"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, convertUpdateInfo, platform } from "../helpers/packTester"

test.ifMac("two-package", () => assertPack("test-app", {targets: createTargets([Platform.MAC], null, "all")}, {signed: true, useTempDir: true}))

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
      ]
    }
  }
}, {
  signed: true,
  projectDirCreated: projectDir => copyFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "foo.icns")),
  checkMacApp: async (appDir, info) => {
    expect(info).toMatchSnapshot()
    await assertThat(path.join(appDir, "Contents", "Resources", "foo.icns")).isFile()
  },
  packed: async context => {
    expect(convertUpdateInfo(await readJson(path.join(context.outDir, "latest-mac.json")))).toMatchSnapshot()
  },
}))

test.ifMac("electronDist", appThrows(/ENOENT: no such file or directory/, {
  targets: Platform.MAC.createTarget(DIR_TARGET),
  config: {
    electronDist: "foo",
  }
}))

test.ifWinCi("Build macOS on Windows is not supported", appThrows(/Build for macOS is supported only on macOS.+/, platform(Platform.MAC)))