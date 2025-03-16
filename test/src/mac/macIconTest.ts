import { Arch, DIR_TARGET, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { CheckingMacPackager } from "../helpers/CheckingPackager"
import { app } from "../helpers/packTester"
import { ExpectStatic } from "vitest"

async function assertIcon(expect: ExpectStatic, platformPackager: CheckingMacPackager) {
  const file = await platformPackager.getIconPath()
  expect(file).toBeDefined()

  const result = await platformPackager.resolveIcon([file!], [], "set")
  result.forEach(it => {
    it.file = path.basename(it.file)
  })
  expect(result).toMatchSnapshot()
}

const targets = Platform.MAC.createTarget(DIR_TARGET, Arch.x64)

test.ifMac("icon set", ({ expect }) => {
  let platformPackager: CheckingMacPackager | null = null
  return app(
    expect,
    {
      targets,
      platformPackagerFactory: packager => (platformPackager = new CheckingMacPackager(packager)),
    },
    {
      projectDirCreated: projectDir => Promise.all([fs.unlink(path.join(projectDir, "build", "icon.icns")), fs.unlink(path.join(projectDir, "build", "icon.ico"))]),
      packed: () => assertIcon(expect, platformPackager!),
    }
  )
})

test.ifMac("custom icon set", ({ expect }) => {
  let platformPackager: CheckingMacPackager | null = null
  return app(
    expect,
    {
      targets,
      config: {
        mac: {
          icon: "customIconSet",
        },
      },
      platformPackagerFactory: packager => (platformPackager = new CheckingMacPackager(packager)),
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          fs.unlink(path.join(projectDir, "build", "icon.icns")),
          fs.unlink(path.join(projectDir, "build", "icon.ico")),
          fs.rename(path.join(projectDir, "build", "icons"), path.join(projectDir, "customIconSet")),
        ]),
      packed: () => assertIcon(expect, platformPackager!),
    }
  )
})

test.ifMac("custom icon set with only 512 and 128", ({ expect }) => {
  let platformPackager: CheckingMacPackager | null = null
  return app(
    expect,
    {
      targets,
      config: {
        mac: {
          icon: "..",
        },
      },
      platformPackagerFactory: packager => (platformPackager = new CheckingMacPackager(packager)),
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          fs.unlink(path.join(projectDir, "build", "icon.icns")),
          fs.unlink(path.join(projectDir, "build", "icon.ico")),
          fs.copyFile(path.join(projectDir, "build", "icons", "512x512.png"), path.join(projectDir, "512x512.png")),
          fs.copyFile(path.join(projectDir, "build", "icons", "128x128.png"), path.join(projectDir, "128x128.png")),
        ]),
      packed: () => assertIcon(expect, platformPackager!),
    }
  )
})

test.ifMac("png icon", ({ expect }) => {
  let platformPackager: CheckingMacPackager | null = null
  return app(
    expect,
    {
      targets,
      config: {
        mac: {
          icon: "icons/512x512.png",
        },
      },
      platformPackagerFactory: packager => (platformPackager = new CheckingMacPackager(packager)),
    },
    {
      projectDirCreated: projectDir => Promise.all([fs.unlink(path.join(projectDir, "build", "icon.icns")), fs.unlink(path.join(projectDir, "build", "icon.ico"))]),
      packed: () => assertIcon(expect, platformPackager!),
    }
  )
})

test.ifMac("default png icon", ({ expect }) => {
  let platformPackager: CheckingMacPackager | null = null
  return app(
    expect,
    {
      targets,
      platformPackagerFactory: packager => (platformPackager = new CheckingMacPackager(packager)),
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          fs.unlink(path.join(projectDir, "build", "icon.icns")),
          fs.unlink(path.join(projectDir, "build", "icon.ico")),
          fs
            .copyFile(path.join(projectDir, "build", "icons", "512x512.png"), path.join(projectDir, "build", "icon.png"))
            .then(() => fs.rm(path.join(projectDir, "build", "icons"), { recursive: true, force: true })),
        ]),
      packed: () => assertIcon(expect, platformPackager!),
    }
  )
})

test.ifMac("png icon small", ({ expect }) => {
  let platformPackager: CheckingMacPackager | null = null
  return app(
    expect,
    {
      targets,
      config: {
        mac: {
          icon: "icons/128x128.png",
        },
      },
      platformPackagerFactory: packager => (platformPackager = new CheckingMacPackager(packager)),
    },
    {
      projectDirCreated: projectDir => Promise.all([fs.unlink(path.join(projectDir, "build", "icon.icns")), fs.unlink(path.join(projectDir, "build", "icon.ico"))]),
      packed: async () => {
        try {
          await platformPackager!.getIconPath()
        } catch (e: any) {
          if (!e.message.includes("must be at least 512x512")) {
            throw e
          }
          return
        }

        throw new Error("error expected")
      },
    }
  )
})
