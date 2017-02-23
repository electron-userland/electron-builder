import { Arch, Platform } from "electron-builder"
import { readFile } from "fs-extra-p"
import { app } from "../helpers/packTester"

test.ifNotWindows("deb", app({targets: Platform.LINUX.createTarget("deb")}))

test.ifNotWindows("arm deb", app({targets: Platform.LINUX.createTarget("deb", Arch.armv7l)}))

test.ifNotWindows("custom depends", app({
  targets: Platform.LINUX.createTarget("deb"),
  config: {
    linux: {
      executableName: "Boo",
    },
    deb: {
      depends: ["foo"],
    },
  },
  effectiveOptionComputed: async (it) => {
    const content = await readFile(it[1], "utf-8")
    expect(content).toMatchSnapshot()
    return false
  }
}, {
  expectedDepends: "foo",
}))