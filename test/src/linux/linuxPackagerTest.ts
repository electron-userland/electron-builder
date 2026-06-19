import { Arch, Platform } from "electron-builder"
import { execFile as execFileCb } from "child_process"
import * as fs from "fs-extra"
import * as path from "path"
import { promisify } from "util"
import { app, appThrows } from "../helpers/packTester"

const execFile = promisify(execFileCb)

const appImageTarget = Platform.LINUX.createTarget("appimage", Arch.x64)
const zipTarget = Platform.LINUX.createTarget("zip", Arch.x64)

// Tests covering the standalone `.desktop` artifact emitted alongside archive targets
// (zip, tar.*) and the `linux.desktop` boolean/object normalization. The toolset-parameterized
// AppImage/icon/license coverage lives in linuxPackagerTestSuite.ts.
describe.ifNotWindows("LinuxPackager desktop file", () => {
  test("forbid desktop.Exec", ({ expect }) =>
    appThrows(expect, {
      targets: appImageTarget,
      config: {
        linux: {
          desktop: {
            entry: {
              Exec: "foo",
            },
          },
        },
      },
    }))

  test("forbid desktop.Comment", ({ expect }) =>
    appThrows(expect, {
      targets: appImageTarget,
      config: {
        linux: {
          desktop: {
            entry: {
              Comment: "foo",
            },
          },
        },
      },
    }))

  test("disable desktop file output (desktop: null)", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            desktop: null,
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip"],
        packed: async result => {
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          expect(await fs.pathExists(desktopFilePath)).toBe(false)
        },
      }
    ))

  test("disable desktop file output (desktop: false)", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            desktop: false,
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip"],
        packed: async result => {
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          expect(await fs.pathExists(desktopFilePath)).toBe(false)
        },
      }
    ))

  test("desktop: true produces default desktop file", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            desktop: true,
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          expect(await fs.readFile(desktopFilePath, "utf-8")).toMatchSnapshot()
        },
      }
    ))

  test("zip", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            description: "Test Comment",
            desktop: {
              entry: {
                Name: "Test App",
              },
            },
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          expect(await fs.readFile(desktopFilePath, "utf-8")).toMatchSnapshot()
        },
      }
    ))

  test("zip with mimeTypes (protocol registration)", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            description: "Test Comment",
            mimeTypes: ["x-scheme-handler/myapp"],
            desktop: {
              entry: {
                Name: "Test App",
              },
            },
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          const content = await fs.readFile(desktopFilePath, "utf-8")
          expect(content).toContain("MimeType=x-scheme-handler/myapp")
          expect(content).toMatchSnapshot()
        },
      }
    ))

  test("tar.gz with desktop", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget("tar.gz", Arch.x64),
        config: {
          linux: {
            description: "Test Comment",
            desktop: {
              entry: {
                Name: "Test App",
              },
            },
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.tar.gz", "testapp.desktop"],
        packed: async result => {
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          expect(await fs.readFile(desktopFilePath, "utf-8")).toMatchSnapshot()
        },
      }
    ))

  test("nested desktop config overrides global linux config", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["appImage", "rpm"], Arch.x64),
        config: {
          linux: {
            desktop: null,
            executableName: "Foo",
          },
          appImage: {
            description: "Test Comment",
            desktop: {
              entry: {
                Name: "Test App",
              },
            },
          },
          rpm: {
            description: "Test Comment",
            desktop: {
              entry: {
                Name: "Test App",
              },
            },
          },
        },
      },
      {}
    ))

  test("appimage nested desktop config", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["appImage", "zip"], Arch.x64),
        config: {
          linux: {
            desktop: {
              entry: {
                Name: "Test App",
              },
            },
          },
          appImage: {
            artifactName: "${productName}-${version}-x64.AppImage",
            description: "Test Comment",
          },
        },
      },
      {
        packed: async result => {
          // zip desktop file
          const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
          expect(await fs.readFile(desktopFilePath, "utf-8")).toMatchSnapshot()

          // AppImage embedded desktop file content is not tested in CI because `unsquashfs`
          // is not provisioned in the CI environment. Run locally to validate AppImage-specific
          // desktop embedding behavior.
          if (
            !(await execFile("unsquashfs", ["-version"])
              .then(() => true)
              .catch(() => false))
          ) {
            return
          }

          // Extract the internal .desktop file from the AppImage's SquashFS using unsquashfs.
          // AppImages can't execute in Docker containers, so we locate the embedded SquashFS
          // by scanning for its little-endian magic bytes ("hsqs") and pass the offset to unsquashfs.
          const files = await fs.readdir(result.outDir)
          const appImageFileName = files.find(f => f.endsWith(".AppImage"))!
          const appImagePath = path.join(result.outDir, appImageFileName)
          const appImageData = await fs.readFile(appImagePath)
          const squashfsOffset = appImageData.indexOf(Buffer.from("hsqs"))
          const { stdout: desktopContent } = await execFile("unsquashfs", ["-offset", squashfsOffset.toString(), "-cat", appImagePath, "testapp.desktop"])
          // Filter build-specific metadata that changes per run before snapshotting
          const stableContent = desktopContent
            .split("\n")
            .filter(line => !line.includes("X-AppImage-BuildId") && !line.includes("X-AppImage-Version"))
            .join("\n")

          expect(stableContent).toMatchSnapshot()
        },
      }
    ))
})
