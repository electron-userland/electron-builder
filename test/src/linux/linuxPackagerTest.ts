import { Arch, build, Platform } from "electron-builder"
import { copyFile, move, remove, rename } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, modifyPackageJson } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"

const appImageTarget = Platform.LINUX.createTarget("appimage")

test.ifNotWindows("AppImage", app({
  targets: appImageTarget,
  config: {
    publish: {
      provider: "generic",
      url: "https://example.com/downloads",
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

test.ifAll.ifNotWindows.ifNotCiMac("AppImage arm, max compression", app({
  targets: Platform.LINUX.createTarget("Appimage", Arch.armv7l),
  config: {
    // test update info file name
    publish: {
      provider: "generic",
      url: "https://example.com/downloads"
    },
    compression: "maximum",
  },
}))

test.ifNotWindows.ifNotCiMac.ifAll("AppImage - doNotAsk system integration", app({
  targets: appImageTarget,
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
  targets: appImageTarget,
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

test.ifNotWindows("icons from ICNS (mac)", app({
  targets: appImageTarget,
  config: {
    publish: null,
    mac: {
      icon: "resources/time.icns",
    },
  },
}, {
  projectDirCreated: async projectDir => {
    await move(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "resources", "time.icns"))
    await remove(path.join(projectDir, "build"))
  },
  packed: async context => {
    const projectDir = context.getResources(Platform.LINUX)
    await assertThat(projectDir).isDirectory()
  },
}))

test.ifNotWindows("icons from ICNS if nothing specified", app({
  targets: appImageTarget,
  config: {
    publish: null,
  },
}, {
  projectDirCreated: async projectDir => {
    await remove(path.join(projectDir, "build", "icons"))
  },
}))

test.ifNotWindows("icons from dir and one icon with suffix", app({
  targets: appImageTarget,
  config: {
    publish: null,
  },
}, {
  projectDirCreated: async projectDir => {
    await copyFile(path.join(projectDir, "build", "icons", "16x16.png"), path.join(projectDir, "build", "icons", "16x16-dev.png"))
  },
  packed: async context => {
    const projectDir = context.getResources(Platform.LINUX)
    await assertThat(projectDir).isDirectory()
  },
}))

test.ifNotWindows("icons dir with images without size in the filename", app({
  targets: appImageTarget,
  config: {
    publish: null,
    win: {
      // doesn't matter, but just to be sure that presense of this configuration doesn't lead to errors
      icon: "icons/icon.ico",
    },
  },
}, {
  projectDirCreated: async projectDir => {
    await rename(path.join(projectDir, "build", "icons", "256x256.png"), path.join(projectDir, "build", "icon.png"))
    await remove(path.join(projectDir, "build", "icons"))
    await rename(path.join(projectDir, "build"), path.join(projectDir, "icons"))
  },
  packed: async context => {
    const projectDir = context.getResources(Platform.LINUX)
    await assertThat(projectDir).isDirectory()
  },
}))

// test prepacked asar also https://github.com/electron-userland/electron-builder/issues/1102
test.ifNotWindows("icons from ICNS", app({
  targets: appImageTarget,
  config: {
    publish: null,
  },
}, {
  projectDirCreated: it => remove(path.join(it, "build", "icons")),
  packed: async context => {
    const projectDir = context.getResources(Platform.LINUX)

    await rename(path.join(projectDir, "electron.asar"), path.join(projectDir, "someAsarFile.asar"))

    await build({
      targets: appImageTarget,
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