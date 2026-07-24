import { Arch, Platform } from "electron-builder"
import { execFile as execFileCb } from "child_process"
import * as fs from "fs-extra"
import * as path from "path"
import { promisify } from "util"
import { app, appThrows, linuxDirTarget, modifyPackageJson } from "../helpers/packTester"

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
          const content = await fs.readFile(desktopFilePath, "utf-8")
          // Pin the default-content contract explicitly so a dropped/renamed key is caught even if
          // the snapshot is later regenerated incorrectly.
          expect(content).toContain("[Desktop Entry]")
          expect(content).toContain("Type=Application")
          expect(content).toContain("Terminal=false")
          expect(content).toContain("Icon=testapp")
          expect(content).toMatch(/^Name=.+$/m)
          expect(content).toMatch(/^Exec=.*testapp.* %U$/m)
          expect(content).toMatch(/^StartupWMClass=.+$/m)
          expect(content).toMatch(/^Categories=.+;$/m)
          expect(content).toMatchSnapshot()
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

  test("package-target desktop config does not trigger standalone archive emission", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["appImage", "zip"], Arch.x64),
        config: {
          linux: {
            // Global archive emission is off; only the package target (AppImage) opts into a desktop file.
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
        },
      },
      {
        packed: async result => {
          // A per-target package desktop config (appImage.desktop) is bundled inside the AppImage and must
          // NOT cause a standalone <exe>.desktop next to the zip — that is gated solely by linux.desktop.
          const desktopArtifacts = (await fs.readdir(result.outDir)).filter(f => f.endsWith(".desktop"))
          expect(desktopArtifacts).toEqual([])
        },
      }
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
          // The combined appImage + zip build must emit exactly ONE standalone desktop file (the
          // archive's), and the AppImage bundles its own internally — its presence must neither
          // suppress nor duplicate the standalone emission.
          const desktopArtifacts = (await fs.readdir(result.outDir)).filter(f => f.endsWith(".desktop"))
          expect(desktopArtifacts).toEqual(["testapp.desktop"])

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

  test("dir target alone emits no standalone desktop file", ({ expect }) =>
    app(
      expect,
      {
        targets: linuxDirTarget,
        config: {
          linux: {
            desktop: true,
          },
        },
      },
      {
        packed: async result => {
          // `dir` is not an archive target, so even with desktop:true no standalone .desktop is emitted.
          const desktopArtifacts = (await fs.readdir(result.outDir)).filter(f => f.endsWith(".desktop"))
          expect(desktopArtifacts).toEqual([])
        },
      }
    ))

  test("desktopName sets StartupWMClass but not the standalone archive filename", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            desktop: true,
            executableName: "testapp",
          },
        },
      },
      {
        // desktopName is package.json metadata, not a Configuration field.
        projectDirCreated: projectDir =>
          modifyPackageJson(projectDir, data => {
            data.desktopName = "com.example.Signal.desktop"
          }),
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          // The standalone archive desktop filename is always <executableName>.desktop, NOT <desktopName>.
          expect(await fs.pathExists(path.resolve(result.outDir, "com.example.Signal.desktop"))).toBe(false)
          const content = await fs.readFile(path.resolve(result.outDir, "testapp.desktop"), "utf-8")
          // ...but desktopName (minus the .desktop suffix) drives StartupWMClass for window association.
          expect(content).toContain("StartupWMClass=com.example.Signal")
        },
      }
    ))

  test("fileAssociations and protocols contribute MimeType to the standalone archive desktop file", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            description: "Test Comment",
            desktop: true,
            mimeTypes: ["application/x-foo"],
          },
          fileAssociations: [
            {
              ext: "bar",
              name: "Bar File",
              mimeType: "application/x-bar",
            },
          ],
          protocols: [
            {
              name: "MyApp",
              schemes: ["myapp", "myapps"],
            },
          ],
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const content = await fs.readFile(path.resolve(result.outDir, "testapp.desktop"), "utf-8")
          const mimeLine = content.split("\n").find(l => l.startsWith("MimeType="))!
          expect(mimeLine).toContain("application/x-foo")
          expect(mimeLine).toContain("application/x-bar")
          expect(mimeLine).toContain("x-scheme-handler/myapp")
          expect(mimeLine).toContain("x-scheme-handler/myapps")
          expect(mimeLine.endsWith(";")).toBe(true)
        },
      }
    ))

  test("desktopActions render into the standalone archive desktop file", ({ expect }) =>
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
              desktopActions: {
                NewWindow: {
                  Name: "New Window",
                  Exec: "app --new-window",
                },
                Empty: {},
                Nullish: null,
              },
            },
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const content = await fs.readFile(path.resolve(result.outDir, "testapp.desktop"), "utf-8")
          expect(content).toContain("[Desktop Action NewWindow]")
          expect(content).toContain("Name=New Window")
          expect(content).toContain("Exec=app --new-window")
          // Empty/null action configs are skipped.
          expect(content).not.toContain("[Desktop Action Empty]")
          expect(content).not.toContain("[Desktop Action Nullish]")
          expect(content).toMatchSnapshot()
        },
      }
    ))

  test("standalone desktop file escapes newlines in desktop.entry overrides (no key injection)", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            desktop: {
              entry: {
                // A hostile override value must NOT inject a second Exec= line into the file.
                GenericName: "Editor\nExec=/bin/sh -c id",
              },
            },
          },
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const content = await fs.readFile(path.resolve(result.outDir, "testapp.desktop"), "utf-8")
          // Exactly one Exec= line — the injected one is neutralized.
          expect(content.split("\n").filter(l => l.startsWith("Exec=")).length).toBe(1)
          // The newline is escaped to a literal "\n" on a single GenericName line.
          expect(content).toContain("GenericName=Editor\\nExec=/bin/sh -c id")
          expect(content).not.toMatch(/^Exec=\/bin\/sh/m)
        },
      }
    ))

  test("standalone desktop file escapes newlines in protocol schemes (no key injection)", ({ expect }) =>
    app(
      expect,
      {
        targets: zipTarget,
        config: {
          linux: {
            description: "Test Comment",
            desktop: true,
          },
          protocols: [
            {
              name: "Evil",
              schemes: ["myapp\nExec=/bin/sh -c id"],
            },
          ],
        },
      },
      {
        expectedArtifacts: ["TestApp-1.1.0.zip", "testapp.desktop"],
        packed: async result => {
          const content = await fs.readFile(path.resolve(result.outDir, "testapp.desktop"), "utf-8")
          expect(content.split("\n").filter(l => l.startsWith("Exec=")).length).toBe(1)
          expect(content).toContain("x-scheme-handler/myapp\\nExec=/bin/sh -c id")
          expect(content).not.toMatch(/^Exec=\/bin\/sh/m)
        },
      }
    ))

  test("all archive formats emit exactly one shared standalone desktop file in a single build", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["7z", "tar.xz", "tar.lz", "tar.bz2"], Arch.x64),
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
        // One desktop file is shared across every archive format built in the same pack (instance-level dedup).
        expectedArtifacts: ["TestApp-1.1.0.7z", "TestApp-1.1.0.tar.xz", "TestApp-1.1.0.tar.lz", "TestApp-1.1.0.tar.bz2", "testapp.desktop"],
        packed: async result => {
          const content = await fs.readFile(path.resolve(result.outDir, "testapp.desktop"), "utf-8")
          expect(content).toContain("Name=Test App")
        },
      }
    ))

  test("multi-arch archive build with shared output dir emits exactly one desktop file", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget("zip", Arch.x64, Arch.arm64),
        config: {
          linux: {
            desktop: true,
          },
        },
      },
      {
        // emittedDesktopFiles dedups across the per-arch pack() calls when the output dir is shared,
        // so exactly one testapp.desktop is emitted for both archive artifacts.
        expectedArtifacts: ["TestApp-1.1.0.zip", "TestApp-1.1.0-arm64.zip", "testapp.desktop"],
      }
    ))
})
