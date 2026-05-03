import { Arch, Platform } from "electron-builder"
import { app, EXTENDED_TIMEOUT } from "../helpers/packTester"
import * as path from "path"
import * as fs from "fs-extra"

test.ifNotWindows("tar", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"], Arch.x64),
    config: {
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
  })
)

test.ifNotWindows("zip", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.LINUX.createTarget(["zip"], Arch.x64),
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
      expectedArtifacts: ["Test App-1.0.0-x64.zip", "testapp.desktop"],
    }
  )
)

test.ifNotWindows("disable desktop file output", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.LINUX.createTarget(["zip"], Arch.x64),
      config: {
        linux: {
          desktop: null,
        },
      },
    },
    {
      expectedArtifacts: ["Test App-1.0.0-x64.zip"],
    }
  )
)

test.ifNotWindows("AppImage", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.LINUX.createTarget(["appImage"], Arch.x64),
      config: {
        appImage: {
          artifactName: "${productName}-${version}-x64.AppImage",
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
      packed: async (result) => {
        const desktopFilePath = path.resolve(result.outDir, "testapp.desktop")
        const desktopFileContent = await fs.readFile(desktopFilePath, "utf-8")
        expect(desktopFileContent).toMatch(/Name=Test App/)
        expect(desktopFileContent).toMatch(/Comment=Test Comment/)
      },
      expectedArtifacts: ["Test App-1.0.0-x64.AppImage", "testapp.desktop"],
    }
  )
)