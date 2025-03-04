import { Arch, DIR_TARGET, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows, assertPack, platform } from "../helpers/packTester"

test(
  "beta version",
  ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64, Arch.arm64),
        config: {
          extraMetadata: {
            version: "3.0.0-beta.2",
          },
          nsis: {
            buildUniversalInstaller: false,
          },
        },
      },
      {
        signedWin: true,
      }
    ),
  { retry: 3 }
)

test("win zip", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["zip"], Arch.x64, Arch.arm64),
      config: {
        extraResources: [
          { from: "build", to: "./", filter: "*.asar" },
          { from: "build/subdir", to: "./subdir", filter: "*.asar" },
        ],
        electronLanguages: "en",
        downloadAlternateFFmpeg: true,
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
    },
    {
      signed: false,
      projectDirCreated: async projectDir => {
        await fs.mkdir(path.join(projectDir, "build", "subdir"))
        await fs.copyFile(path.join(projectDir, "build", "extraAsar.asar"), path.join(projectDir, "build", "subdir", "extraAsar2.asar"))
      },
    }
  ))

test("zip artifactName", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(["zip"], Arch.x64),
      config: {
        //tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
      },
    },
    {
      signedWin: true,
    }
  ))

test("icon < 256", ({ expect }) =>
  appThrows(expect, platform(Platform.WINDOWS), {
    projectDirCreated: projectDir => fs.rename(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico")),
  }))

test("icon not an image", ({ expect }) =>
  appThrows(expect, platform(Platform.WINDOWS), {
    projectDirCreated: async projectDir => {
      const file = path.join(projectDir, "build", "icon.ico")
      // because we use hardlinks
      await fs.unlink(file)
      await fs.writeFile(file, "foo")
    },
  }))

test.ifMac("custom icon", ({ expect }) => {
  let platformPackager: CheckingWinPackager | null = null
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: Platform.WINDOWS.createTarget("squirrel", Arch.x64),
      platformPackagerFactory: packager => (platformPackager = new CheckingWinPackager(packager)),
      config: {
        win: {
          icon: "customIcon",
        },
      },
    },
    {
      projectDirCreated: projectDir => fs.rename(path.join(projectDir, "build", "icon.ico"), path.join(projectDir, "customIcon.ico")),
      packed: async context => {
        expect(await platformPackager!.getIconPath()).toEqual(path.join(context.projectDir, "customIcon.ico"))
      },
    }
  )
})

test("win icon from icns", ({ expect }) => {
  let platformPackager: CheckingWinPackager | null = null
  return app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
      config: {
        mac: {
          icon: "icons/icon.icns",
        },
      },
      platformPackagerFactory: packager => (platformPackager = new CheckingWinPackager(packager)),
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([fs.unlink(path.join(projectDir, "build", "icon.ico")), fs.rm(path.join(projectDir, "build", "icons"), { recursive: true, force: true })]),
      packed: async () => {
        const file = await platformPackager!.getIconPath()
        expect(file).toBeDefined()
      },
    }
  )
})
