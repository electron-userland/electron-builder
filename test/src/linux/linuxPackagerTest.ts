import { Arch, build, Platform } from "electron-builder"
import { remove, rename } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, modifyPackageJson } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"

test.ifNotWindows("AppImage", app({
  targets: Platform.LINUX.createTarget(),
  config: {
    publish: {
      provider: "generic",
      url: "https://example.com/downloads"
    },
  },
}))

test.ifAll.ifNotWindows.ifNotCiMac("AppImage ia32", app({
  targets: Platform.LINUX.createTarget("Appimage", Arch.ia32),
  config: {
    publish: {
      provider: "generic",
      url: "https://example.com/downloads"
    },
  },
}))

test.ifNotWindows.ifNotCiMac.ifAll("AppImage - doNotAsk system integration", app({
  targets: Platform.LINUX.createTarget(),
  config: {
    appImage: {
      systemIntegration: "doNotAsk",
    },
    extraResources: {
      from: "build/icons"
    },
  }
}))

test.ifNotWindows.ifNotCiMac("AppImage - default icon, custom executable and custom desktop", app({
  targets: Platform.LINUX.createTarget("appimage"),
  config: {
    linux: {
      executableName: "Foo",
      desktop: {
        "X-Foo": "bar",
        Terminal: "true",
      },
    },
    appImage: {
      // tslint:disable-next-line:no-invalid-template-strings
      artifactName: "boo-${productName}",
    }
  },
  effectiveOptionComputed: async it => {
    const content: string = it.desktop
    expect(content.split("\n").filter(it => !it.includes("X-AppImage-BuildId") && !it.includes("X-AppImage-Version")).join("\n")).toMatchSnapshot()
    return false
  },
}, {
  projectDirCreated: it => remove(path.join(it, "build")),
  packed: async context => {
    const projectDir = context.getContent(Platform.LINUX)
    await assertThat(path.join(projectDir, "Foo")).isFile()
  },
}))

// test prepacked asar also https://github.com/electron-userland/electron-builder/issues/1102
test.ifNotWindows("icons from ICNS", app({
  targets: Platform.LINUX.createTarget(),
  config: {
    publish: null,
  },
}, {
  projectDirCreated: it => remove(path.join(it, "build", "icons")),
  packed: async context => {
    const projectDir = context.getResources(Platform.LINUX)

    await rename(path.join(projectDir, "electron.asar"), path.join(projectDir, "someAsarFile.asar"))

    await build({
      targets: Platform.LINUX.createTarget(),
      projectDir,
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