import { Arch, Platform } from "electron-builder"
import { promises as fs } from "fs"
import { app, execShell, getTarExecutable } from "../helpers/packTester"

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

test.ifNotWindows.ifAll("deb file associations", app({
  targets: Platform.LINUX.createTarget("deb"),
  config: {
    fileAssociations: [
      {
        ext: "my-app",
        name: "Test Foo",
        mimeType: "application/x-example",
      }
    ],
  },
}, {
  packed: async context => {
    const mime = (await execShell(`ar p '${context.outDir}/TestApp_1.1.0_amd64.deb' data.tar.xz | ${await getTarExecutable()} Jx --to-stdout ./usr/share/mime/packages/testapp.xml`, {
      maxBuffer: 10 * 1024 * 1024,
    })).stdout
    expect(mime.trim()).toMatchSnapshot()
  }
}))