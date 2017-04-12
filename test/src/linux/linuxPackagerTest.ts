import { build, Platform } from "electron-builder"
import { readFile, remove, rename } from "fs-extra-p"
import * as path from "path"
import { ELECTRON_VERSION } from "../helpers/config"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, modifyPackageJson } from "../helpers/packTester"

test.ifDevOrLinuxCi("AppImage", app({targets: Platform.LINUX.createTarget()}))

test.ifDevOrLinuxCi("AppImage - default icon, custom executable and custom desktop", app({
  targets: Platform.LINUX.createTarget("appimage"),
  config: {
    linux: {
      executableName: "Foo",
      desktop: {
        Foo: "bar",
        Terminal: "true",
      },
    }
  },
  effectiveOptionComputed: async (it) => {
    const content = await readFile(it[1], "utf-8")
    expect(content.split("\n").filter(it => !it.includes("X-AppImage-BuildId") && !it.includes("X-AppImage-Version")).join("\n")).toMatchSnapshot()
    return false
  },
}, {
  projectDirCreated: it => remove(path.join(it, "build")),
  packed: async context => {
    const projectDir = context.getContent(Platform.LINUX)
    await assertThat(path.join(projectDir, "foo")).isFile()
  },
}))

// test prepacked asar also https://github.com/electron-userland/electron-builder/issues/1102
test.ifNotWindows("icons from ICNS", app({
  targets: Platform.LINUX.createTarget()
}, {
  projectDirCreated: it => remove(path.join(it, "build", "icons")),
  packed: async context => {
    const projectDir = context.getResources(Platform.LINUX)

    await rename(path.join(projectDir, "electron.asar"), path.join(projectDir, "someAsarFile.asar"))

    await build({
      targets: Platform.LINUX.createTarget(),
      projectDir: projectDir,
      publish: "never",
      config: {
        electronVersion: ELECTRON_VERSION,
        compression: "store",
        npmRebuild: false,
      }
    })

    await assertThat(path.join(projectDir, "dist")).isDirectory()
    await assertThat(path.join(projectDir, "dist", "linux-unpacked", "resources", "someAsarFile.asar")).isFile()
  },
}))

test.ifNotWindows("no-author-email", appThrows({targets: Platform.LINUX.createTarget("deb")}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.author = "Foo"
  })
}))