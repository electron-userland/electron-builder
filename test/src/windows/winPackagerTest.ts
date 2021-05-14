import { Platform, DIR_TARGET } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows, assertPack, platform } from "../helpers/packTester"
import * as fs from "fs/promises"

test.ifWinCi(
  "beta version",
  app({
    targets: Platform.WINDOWS.createTarget(["squirrel", "nsis"]),
    config: {
      extraMetadata: {
        version: "3.0.0-beta.2",
      },
    },
  })
)

test.ifNotCiMac(
  "win zip",
  app({
    targets: Platform.WINDOWS.createTarget(["zip"]),
  })
)

test.ifNotCiMac.ifAll(
  "zip artifactName",
  app({
    linux: ["appimage"],
    win: ["zip"],
    config: {
      //tslint:disable-next-line:no-invalid-template-strings
      artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
    },
  })
)

test.ifNotCiMac(
  "icon < 256",
  appThrows(platform(Platform.WINDOWS), {
    projectDirCreated: projectDir => fs.rename(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico")),
  })
)

test.ifNotCiMac(
  "icon not an image",
  appThrows(platform(Platform.WINDOWS), {
    projectDirCreated: async projectDir => {
      const file = path.join(projectDir, "build", "icon.ico")
      // because we use hardlinks
      await fs.unlink(file)
      await fs.writeFile(file, "foo")
    },
  })
)

test.ifMac("custom icon", () => {
  let platformPackager: CheckingWinPackager | null = null
  return assertPack(
    "test-app-one",
    {
      targets: Platform.WINDOWS.createTarget("squirrel"),
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
        expect(await platformPackager!!.getIconPath()).toEqual(path.join(context.projectDir, "customIcon.ico"))
      },
    }
  )
})

test.ifAll("win icon from icns", () => {
  let platformPackager: CheckingWinPackager | null = null
  return app(
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
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
        const file = await platformPackager!!.getIconPath()
        expect(file).toBeDefined()
      },
    }
  )()
})
