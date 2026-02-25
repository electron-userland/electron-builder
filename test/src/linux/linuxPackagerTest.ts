import { GenericServerOptions } from "builder-util-runtime"
import { Arch, build, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as fs from "fs/promises"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { ToolsetConfig } from "app-builder-lib/src"

const appImageTarget = Platform.LINUX.createTarget("appimage", Arch.x64)

// test update info file name
const testPublishConfig: GenericServerOptions = {
  provider: "generic",
  url: "https://example.com/download",
}

const appImageToolset: ToolsetConfig["appimage"][] = ["0.0.0", "1.0.2"]
describe.ifNotWindows("LinuxPackager", () => {
  for (const appimage of appImageToolset) {
    const toolsets: ToolsetConfig = {
      appimage,
    }
    describe(`AppImage toolset ${appimage}`, () => {
      test("AppImage", ({ expect }) =>
        app(expect, {
          targets: appImageTarget,
          config: {
            toolsets,
            directories: {
              output: "dist/${os}",
            },
            downloadAlternateFFmpeg: true,
            publish: testPublishConfig,
            electronFuses: {
              runAsNode: true,
              enableCookieEncryption: true,
              enableNodeOptionsEnvironmentVariable: true,
              enableNodeCliInspectArguments: true,
              enableEmbeddedAsarIntegrityValidation: true,
              onlyLoadAppFromAsar: true,
              loadBrowserProcessSpecificV8Snapshot: true,
              grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
            },
          },
        }))

      test("AppImage arm, max compression", ({ expect }) =>
        app(expect, {
          targets: Platform.LINUX.createTarget("Appimage", Arch.armv7l),
          config: {
            toolsets,
            publish: testPublishConfig,
            compression: "maximum",
          },
        }))

      test("AppImage - deprecated systemIntegration", ({ expect }) =>
        appThrows(expect, {
          targets: appImageTarget,
          config: {
            toolsets,
            appImage: {
              systemIntegration: "doNotAsk",
            } as any,
          },
        }))

      test("text license and file associations", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
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
        ))

      test("html license", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
            },
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
        ))

      test("AppImage - default icon, custom executable and custom desktop", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
              linux: {
                executableName: "Foo",
                // Example Spec: https://specifications.freedesktop.org/desktop-entry-spec/latest/example.html
                desktop: {
                  entry: {
                    "X-Foo": "bar",
                    Terminal: "true",
                  },
                  desktopActions: {
                    Gallery: {
                      Exec: "fooview --gallery",
                      Name: "Browse Gallery",
                    },
                    Create: {
                      Exec: "fooview --create-new",
                      Name: "Create a new Foo!",
                      Icon: "fooview-new",
                    },
                    EmptyEntry: {},
                    NullEntry: null,
                  },
                },
              },
              appImage: {
                // tslint:disable-next-line:no-invalid-template-strings
                artifactName: "boo-${productName}",
              },
              electronFuses: {
                runAsNode: true,
                enableCookieEncryption: true,
                enableNodeOptionsEnvironmentVariable: true,
                enableNodeCliInspectArguments: true,
                enableEmbeddedAsarIntegrityValidation: true,
                onlyLoadAppFromAsar: true,
                loadBrowserProcessSpecificV8Snapshot: true,
                grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
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
              return Promise.resolve(false)
            },
          },
          {
            projectDirCreated: it => fs.rm(path.join(it, "build"), { recursive: true, force: true }),
            packed: async context => {
              const projectDir = context.getContent(Platform.LINUX)
              await assertThat(expect, path.join(projectDir, "Foo")).isFile()
            },
          }
        ))

      test("icons from ICNS (mac)", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
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
              await assertThat(expect, projectDir).isDirectory()
            },
          }
        ))

      test("icons from ICNS if nothing specified", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
              publish: null,
            },
          },
          {
            projectDirCreated: async projectDir => {
              await fs.rm(path.join(projectDir, "build", "icons"), { recursive: true, force: true })
            },
          }
        ))

      test("icons from dir and one icon with suffix", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
              publish: null,
            },
          },
          {
            projectDirCreated: async projectDir => {
              await fs.copyFile(path.join(projectDir, "build", "icons", "16x16.png"), path.join(projectDir, "build", "icons", "16x16-dev.png"))
            },
            packed: async context => {
              const projectDir = context.getResources(Platform.LINUX)
              await assertThat(expect, projectDir).isDirectory()
            },
          }
        ))

      test("icons dir with images without size in the filename", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
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
              await assertThat(expect, projectDir).isDirectory()
            },
          }
        ))

      // test prepacked asar also https://github.com/electron-userland/electron-builder/issues/1102
      test("icons from ICNS", ({ expect }) =>
        app(
          expect,
          {
            targets: appImageTarget,
            config: {
              toolsets,
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

              await assertThat(expect, path.join(projectDir, "dist")).isDirectory()
            },
          }
        ))

      test("no-author-email", ({ expect }) =>
        appThrows(
          expect,
          {
            targets: Platform.LINUX.createTarget("deb", Arch.x64),
            config: {
              toolsets,
            },
          },
          {
            projectDirCreated: projectDir =>
              modifyPackageJson(projectDir, data => {
                data.author = "Foo"
              }),
          }
        ))

      test("forbid desktop.Exec", ({ expect }) =>
        appThrows(expect, {
          targets: appImageTarget,
          config: {
            toolsets,
            linux: {
              desktop: {
                entry: {
                  Exec: "foo",
                },
              },
            },
          },
        }))
    })
  }
})
