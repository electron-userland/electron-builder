import { createHash } from "crypto"
import { Arch, Platform } from "electron-builder"
import * as fs from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import { app, PackedContext } from "../helpers/packTester"
import { checkHelpers } from "../helpers/winHelper"

// electron-updater runs the installer of an update with `isAdminRightsRequired` using resources/elevate.exe, so the update
// info of every per-machine build that packs elevate.exe has the flag, and the update info of no other build has it.
// The installers are only built (no wine), so this runs on every OS.

const nsisTarget = Platform.WINDOWS.createTarget("nsis", Arch.x64)
const publish = { provider: "generic" as const, url: "https://example.com/updates" }

async function readUpdateFileInfo(context: PackedContext): Promise<any> {
  const updateInfo = load(await fs.readFile(path.join(context.outDir, "latest.yml"), "utf-8")) as any
  return updateInfo.files[0]
}

test("assisted per-machine: update info has isAdminRightsRequired", ({ expect }) =>
  app(
    expect,
    {
      targets: nsisTarget,
      config: {
        publish,
        nsis: {
          oneClick: false,
          perMachine: true,
        },
      },
    },
    {
      packed: async context => {
        await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.x64), true)
        expect((await readUpdateFileInfo(context)).isAdminRightsRequired).toBe(true)
      },
    }
  ))

test("per-machine without blockmap: update info has isAdminRightsRequired", ({ expect }) =>
  app(
    expect,
    {
      targets: nsisTarget,
      config: {
        publish,
        nsis: {
          perMachine: true,
          differentialPackage: false,
        },
      },
    },
    {
      packed: async context => {
        const fileInfo = await readUpdateFileInfo(context)
        expect(fileInfo.isAdminRightsRequired).toBe(true)
        const installer = await fs.readFile(path.join(context.outDir, fileInfo.url))
        expect(fileInfo.sha512).toBe(createHash("sha512").update(installer).digest("base64"))
      },
    }
  ))

// The update info of a web installer (its packages) is merged into the update info file; isAdminRightsRequired belongs to the file
// entry of the web installer, which is where electron-updater reads it.
test("nsis-web per-machine: update info has isAdminRightsRequired in the installer's file entry", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget("nsis-web", Arch.x64),
      config: {
        publish,
        nsis: {
          perMachine: true,
        },
      },
    },
    {
      packed: async context => {
        const updateInfo = load(await fs.readFile(path.join(context.outDir, "nsis-web", "latest.yml"), "utf-8")) as any
        expect(updateInfo.files[0].isAdminRightsRequired).toBe(true)
        expect(updateInfo).not.toHaveProperty("isAdminRightsRequired")
        expect(updateInfo.packages.x64.sha512).toEqual(expect.any(String))
      },
    }
  ))

test("per-machine without elevate.exe: update info has no isAdminRightsRequired", ({ expect }) =>
  app(
    expect,
    {
      targets: nsisTarget,
      config: {
        publish,
        nsis: {
          oneClick: false,
          perMachine: true,
        },
      },
    },
    {
      afterPackTestHook: ({ packContext }) => {
        // the only per-machine build that packs no elevate.exe (`packElevateHelper: false` is ignored for `perMachine`)
        ;(packContext.packager.framework as { isCopyElevateHelper: boolean }).isCopyElevateHelper = false
        return Promise.resolve(false)
      },
      packed: async context => {
        await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.x64), false)
        expect(await readUpdateFileInfo(context)).not.toHaveProperty("isAdminRightsRequired")
      },
    }
  ))

test("per-user without elevate.exe: update info has no isAdminRightsRequired", ({ expect }) =>
  app(
    expect,
    {
      targets: nsisTarget,
      config: {
        publish,
        nsis: {
          oneClick: false,
          packElevateHelper: false,
        },
      },
    },
    {
      packed: async context => {
        await checkHelpers(expect, context.getResources(Platform.WINDOWS, Arch.x64), false)
        expect(await readUpdateFileInfo(context)).not.toHaveProperty("isAdminRightsRequired")
      },
    }
  ))
