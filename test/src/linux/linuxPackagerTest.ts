import { modifyPackageJson, app, appThrows } from "../helpers/packTester"
import { remove, readFile } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

test.ifDevOrLinuxCi("AppImage", app({targets: Platform.LINUX.createTarget()}))

// test.ifNotCi("snap", app({targets: Platform.LINUX.createTarget("snap")}))

test.ifDevOrLinuxCi("AppImage - default icon, custom executable and custom desktop", app({
  targets: Platform.LINUX.createTarget("appimage"),
  effectiveOptionComputed: async (it) => {
    const content = await readFile(it[1], "utf-8")
    expect (content.includes("Foo=bar")).toBeTruthy()
    expect (content.includes("Terminal=true")).toBeTruthy()
    return false
  },
  config: {
    linux: {
      executableName: "foo",
      desktop: {
        Foo: "bar",
        Terminal: "true",
      },
    }
  }
}, {
  projectDirCreated: it => remove(path.join(it, "build")),
}))

test.ifNotWindows("icons from ICNS", app({targets: Platform.LINUX.createTarget()}, {
  projectDirCreated: it => remove(path.join(it, "build", "icons"))
}))

test.ifNotWindows("no-author-email", appThrows(/Please specify author 'email' in .+/, {targets: Platform.LINUX.createTarget("deb")}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.author = "Foo"
  })
}))