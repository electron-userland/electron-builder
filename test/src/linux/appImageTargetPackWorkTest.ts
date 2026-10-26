import { describe, expect, test, vi } from "vitest"

// the pack-level publish configuration needs a real project: stand in for it, so AppImageTarget writes app-update.yml
vi.mock("app-builder-lib/src/publish/PublishManager", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/publish/PublishManager")>()
  return { ...actual, getPackAppUpdatePublishConfiguration: async () => ({ provider: "generic", url: "https://example.com/updates" }) }
})
vi.mock("app-builder-lib/src/util/license", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/license")>()
  return { ...actual, getNotLocalizedLicenseFile: async () => null }
})

import { Platform } from "app-builder-lib"
import { ArchiveTarget } from "app-builder-lib/src/targets/ArchiveTarget"
import AppImageTarget from "app-builder-lib/src/targets/linux/appimage/AppImageTarget"
import { Arch } from "builder-util"
import { existsSync } from "fs"
import { mkdir } from "fs/promises"
import * as path from "path"

describe("AppImageTarget.build", () => {
  // for a prepackaged app the AppImage writes the only app-update.yml, into the app dir that the tar.*/zip/7z of the pack is still archiving
  function createBuild(root: string, prepackaged: string | null) {
    const events: Array<string> = []
    let finishZip: () => void = () => {}
    const zipDone = new Promise<void>(resolve => (finishZip = resolve))
    const packager: any = {
      config: {},
      platform: Platform.LINUX,
      platformOptions: {},
      packagerOptions: { prepackaged },
      pendingPackWork: new Map(),
      expandArtifactNamePattern: () => "artifact",
      getResourcesDir: (appOutDir: string) => path.join(appOutDir, "resources"),
      getPackTargets: () => undefined,
      stageDirPathCustomizer: (_target: unknown, _packager: unknown, arch: Arch) => path.join(root, `stage-${Arch[arch]}`),
      // stands in for the archiving: the queued zip task stops here (by throwing) once released
      emitArtifactBuildStarted: async ({ targetPresentableName, arch }: { targetPresentableName: string; arch: Arch }) => {
        if (targetPresentableName === "zip" && arch === Arch.x64) {
          await zipDone
          events.push("zip done")
          throw new Error("archive stub")
        }
      },
    }
    const zip = new ArchiveTarget("zip", root, packager)

    let appImageAppOutDir = ""
    const appImage: any = Object.create(AppImageTarget.prototype)
    appImage.options = {}
    appImage.outDir = root
    appImage.packager = packager
    appImage.desktopEntry = { value: Promise.resolve("") }
    // app-update.yml is written before the AppImage is built: stop there
    appImage.helper = {
      icons: Promise.resolve([]),
      getDesktopFileName: () => {
        events.push(`appImage wrote app-update.yml: ${existsSync(path.join(appImageAppOutDir, "resources", "app-update.yml"))}`)
        throw new Error("appimage stub")
      },
    }
    const buildAppImage = (appOutDir: string, arch: Arch) => {
      appImageAppOutDir = appOutDir
      return expect(appImage.build(appOutDir, arch)).rejects.toThrow("appimage stub")
    }
    return { events, finishZip, zip, buildAppImage }
  }

  async function createAppOutDir(root: string, name: string) {
    const appOutDir = path.join(root, name)
    await mkdir(path.join(appOutDir, "resources"), { recursive: true })
    return appOutDir
  }

  test("waits for the archive of the same pack before writing app-update.yml, even once finishBuild() drained it", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appOutDir = await createAppOutDir(root, "prepackaged")
    const { events, finishZip, zip, buildAppImage } = createBuild(root, appOutDir)
    await zip.build(appOutDir, Arch.x64)
    // packager.ts calls finishBuild() of the async targets right after pack(), before the AppImage reaches its wait
    const zipFinished = expect(zip.finishBuild()).rejects.toThrow("archive stub")

    const build = buildAppImage(appOutDir, Arch.x64)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(existsSync(path.join(appOutDir, "resources", "app-update.yml"))).toBe(false)

    finishZip()
    await build
    expect(events).toEqual(["zip done", "appImage wrote app-update.yml: true"])
    await zipFinished
  })

  test("neither waits nor rewrites app-update.yml when not prepackaged (afterPack wrote it)", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appOutDir = await createAppOutDir(root, "linux-unpacked")
    const { events, zip, buildAppImage } = createBuild(root, null)
    // the archive of the same pack never finishes
    await zip.build(appOutDir, Arch.x64)
    await buildAppImage(appOutDir, Arch.x64)
    expect(events).toEqual(["appImage wrote app-update.yml: false"])
  }, 5000)
})
