import { Arch, Platform } from "electron-builder"
import { promises as fs } from "fs"
import { app } from "../helpers/packTester"

test.ifNotWindows("deb", app({
  targets: Platform.LINUX.createTarget("deb"),
}))

test.ifNotWindows("arm", app({targets: Platform.LINUX.createTarget("deb", Arch.armv7l, Arch.arm64)}))

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
}))

test.ifNotWindows("no quotes for safe exec name", app({
  targets: Platform.LINUX.createTarget("deb"),
  config: {
    productName: "foo",
    linux: {
      executableName: "Boo",
    },
  },
  effectiveOptionComputed: async it => {
    const content = await fs.readFile(it[1], "utf8")
    expect(content).toMatchSnapshot()
    return false
  }
}))