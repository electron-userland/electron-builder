import { assertPack, platform, modifyPackageJson, app, appThrows } from "../helpers/packTester"
import { Platform, createTargets } from "out"
import { DIR_TARGET } from "out/targets/targetFactory"
import { copyFile } from "out/util/fs"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"

test.ifMac("two-package", () => assertPack("test-app", {targets: createTargets([Platform.MAC], null, "all")}, {signed: true, useTempDir: true}))

test.ifMac("one-package", app({
  targets: Platform.MAC.createTarget(),
  config: {
    mac: {
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
}))

test.ifMac("electronDist", appThrows(/ENOENT: no such file or directory/, {
  targets: Platform.MAC.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.build.electronDist = "foo"
  })
}))

test.ifWinCi("Build macOS on Windows is not supported", appThrows(/Build for macOS is supported only on macOS.+/, platform(Platform.MAC)))