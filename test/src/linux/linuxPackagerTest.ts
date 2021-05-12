import { Arch, build, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import { GenericServerOptions } from "builder-util-runtime"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import * as fs from "fs/promises"

const appImageTarget = Platform.LINUX.createTarget("appimage")

// test update info file name
const testPublishConfig: GenericServerOptions = {
  provider: "generic",
  url: "https://example.com/download",
}

test.ifNotWindows(
  "AppImage",
  app({
    targets: appImageTarget,
    config: {
      publish: testPublishConfig,
    },
  })
)

// also test os macro in output dir
test.ifAll.ifNotWindows.ifNotCiMac(
  "AppImage ia32",
  app({
    targets: Platform.LINUX.createTarget("Appimage", Arch.ia32),
    config: {
      directories: {
        // tslint:disable:no-invalid-template-strings
        output: "dist/${os}",
      },
      publish: testPublishConfig,
    },
  })
)

test.ifAll.ifNotWindows.ifNotCiMac(
  "AppImage arm, max compression",
  app({
    targets: Platform.LINUX.createTarget("Appimage", Arch.armv7l),
    config: {
      publish: testPublishConfig,
      compression: "maximum",
    },
  })
)

test.ifNotWindows.ifNotCiMac.ifAll(
  "AppImage - deprecated systemIntegration",
  appThrows({
    targets: appImageTarget,
    config: {
      appImage: {
        systemIntegration: "doNotAsk",
      } as any,
    },
  })
)

test.ifNotWindows.ifNotCiMac.ifAll(
  "text license and file associations",
  app(
    {
      targets: appImageTarget,
      config: {
        extraResources: {
          from: "build/icons",
        },
        fileAssociations: [
          {
            ext: "my-app",
            name: "Test Foo",
            mimeType: "application/x-example",
          },
        ],
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          // copy full text to test presentation
          copyTestAsset("license_en.txt", path.join(projectDir, "build", "license.txt")),
        ])
      },
    }
  )
)

test.ifNotWindows.ifNotCiMac.ifAll(
  "html license",
  app(
    {
      targets: appImageTarget,
    },
    {
      projectDirCreated: projectDir => {
        return outputFile(
          path.join(projectDir, "build", "license.html"),
          `
        <html lang="en">
        <body>
          <a href="https://example.com">Test link</a>
        </body>      
        </html>`
        )
      },
    }
  )
)

test.ifNotWindows.ifNotCiMac(
  "AppImage - default icon, custom executable and custom desktop",
  app(
    {
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
        },
      },
      effectiveOptionComputed: async it => {
        const content: string = it.desktop
        expect(
          content
            .split("\n")
            .filter(it => !it.includes("X-AppImage-BuildId") && !it.includes("X-AppImage-Version"))
            .join("\n")
        ).toMatchSnapshot()
        return false
      },
    },
    {
      projectDirCreated: it => fs.rm(path.join(it, "build"), { recursive: true, force: true }),
      packed: async context => {
        const projectDir = context.getContent(Platform.LINUX)
        await assertThat(path.join(projectDir, "Foo")).isFile()
      },
    }
  )
)

test.ifNotWindows(
  "icons from ICNS (mac)",
  app(
    {
      targets: appImageTarget,
      config: {
        publish: null,
        mac: {
          icon: "resources/time.icns",
        },
        // test https://github.com/electron-userland/electron-builder/issues/3510
        linux: {
          artifactName: "app-${version}-${arch}.${ext}",
        },
      },
    },
    {
      projectDirCreated: async projectDir => {
        await fs
          .mkdir(path.join(projectDir, "resources"), { recursive: true })
          .then(() => fs.rename(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "resources", "time.icns")))
        await fs.rm(path.join(projectDir, "build"), { recursive: true, force: true })
      },
      packed: async context => {
        const projectDir = context.getResources(Platform.LINUX)
        await assertThat(projectDir).isDirectory()
      },
    }
  )
)

test.ifNotWindows(
  "icons from ICNS if nothing specified",
  app(
    {
      targets: appImageTarget,
      config: {
        publish: null,
      },
    },
    {
      projectDirCreated: async projectDir => {
        await fs.rm(path.join(projectDir, "build", "icons"), { recursive: true, force: true })
      },
    }
  )
)

test.ifNotWindows(
  "icons from dir and one icon with suffix",
  app(
    {
      targets: appImageTarget,
      config: {
        publish: null,
      },
    },
    {
      projectDirCreated: async projectDir => {
        await fs.copyFile(path.join(projectDir, "build", "icons", "16x16.png"), path.join(projectDir, "build", "icons", "16x16-dev.png"))
      },
      packed: async context => {
        const projectDir = context.getResources(Platform.LINUX)
        await assertThat(projectDir).isDirectory()
      },
    }
  )
)

test.ifNotWindows(
  "icons dir with images without size in the filename",
  app(
    {
      targets: appImageTarget,
      config: {
        publish: null,
        win: {
          // doesn't matter, but just to be sure that presence of this configuration doesn't lead to errors
          icon: "icons/icon.ico",
        },
      },
    },
    {
      projectDirCreated: async projectDir => {
        await fs.rename(path.join(projectDir, "build", "icons", "256x256.png"), path.join(projectDir, "build", "icon.png"))
        await fs.rm(path.join(projectDir, "build", "icons"), { recursive: true, force: true })
        await fs.rename(path.join(projectDir, "build"), path.join(projectDir, "icons"))
      },
      packed: async context => {
        const projectDir = context.getResources(Platform.LINUX)
        await assertThat(projectDir).isDirectory()
      },
    }
  )
)

// test prepacked asar also https://github.com/electron-userland/electron-builder/issues/1102
test.ifNotWindows(
  "icons from ICNS",
  app(
    {
      targets: appImageTarget,
      config: {
        publish: null,
      },
    },
    {
      projectDirCreated: it => fs.rm(path.join(it, "build", "icons"), { recursive: true, force: true }),
      packed: async context => {
        const projectDir = context.getResources(Platform.LINUX)

        await fs.rm(path.join(projectDir, "inspector"), { recursive: true, force: true })

        await build({
          targets: appImageTarget,
          projectDir,
          publish: "never",
          config: {
            electronVersion: ELECTRON_VERSION,
            compression: "store",
            npmRebuild: false,
          },
        })

        await assertThat(path.join(projectDir, "dist")).isDirectory()
      },
    }
  )
)

test.ifNotWindows(
  "no-author-email",
  appThrows(
    { targets: Platform.LINUX.createTarget("deb") },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.author = "Foo"
        }),
    }
  )
)

test.ifNotWindows(
  "forbid desktop.Exec",
  appThrows({
    targets: Platform.LINUX.createTarget("AppImage"),
    config: {
      linux: {
        desktop: {
          Exec: "foo",
        },
      },
    },
  })
)
