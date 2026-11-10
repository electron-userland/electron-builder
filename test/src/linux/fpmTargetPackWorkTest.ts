import { describe, expect, test, vi } from "vitest"

// the pack-level publish configuration needs a real project: stand in for it, so FpmTarget writes app-update.yml and package-type
vi.mock("app-builder-lib/src/publish/PublishManager", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/publish/PublishManager")>()
  return { ...actual, getPackAppUpdatePublishConfiguration: async () => ({ provider: "generic", url: "https://example.com/updates" }) }
})

import { Platform } from "app-builder-lib"
import { ArchiveTarget } from "app-builder-lib/src/targets/ArchiveTarget"
import FpmTarget from "app-builder-lib/src/targets/linux/FpmTarget"
import { Arch } from "builder-util"
import { existsSync } from "fs"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"

const WRITTEN_FILES = ["app-update.yml", "package-type", "apparmor-profile"]

describe("FpmTarget.build", () => {
  // the tar.*/zip/7z archive of a pack is still reading appOutDir when deb/rpm/pacman (sync targets) start building it
  async function createBuild(root: string, platformOptions: Record<string, unknown> = {}) {
    const appArmor = path.join(root, "apparmor-profile.tpl")
    await writeFile(appArmor, "profile")

    const events: Array<string> = []
    let finishZip: () => void = () => {}
    const zipDone = new Promise<void>(resolve => (finishZip = resolve))
    const packager: any = {
      config: {},
      platform: Platform.LINUX,
      platformOptions,
      packagerOptions: {},
      pendingPackWork: new Map(),
      expandArtifactNamePattern: () => "artifact",
      getResourcesDir: (appOutDir: string) => path.join(appOutDir, "resources"),
      getPackTargets: () => undefined,
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

    let debAppOutDir = ""
    const deb: any = Object.create(FpmTarget.prototype)
    deb.name = "deb"
    deb.options = {}
    deb.outDir = root
    deb.packager = packager
    deb.scriptFiles = Promise.resolve({ appArmor })
    // the files are written before fpm runs: stop there
    deb.helper = {
      getDescription: () => {
        events.push(`deb wrote ${WRITTEN_FILES.filter(it => existsSync(path.join(debAppOutDir, "resources", it))).join(", ")}`)
        throw new Error("fpm stub")
      },
    }
    const buildDeb = (appOutDir: string, arch: Arch) => {
      debAppOutDir = appOutDir
      return expect(deb.build(appOutDir, arch)).rejects.toThrow("fpm stub")
    }
    return { events, finishZip, zip, buildDeb }
  }

  async function createAppOutDir(root: string, name: string) {
    const appOutDir = path.join(root, name)
    await mkdir(path.join(appOutDir, "resources"), { recursive: true })
    return appOutDir
  }

  test("waits for the archive of the same pack before writing into appOutDir, even once finishBuild() drained it", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appOutDir = await createAppOutDir(root, "linux-unpacked")
    const { events, finishZip, zip, buildDeb } = await createBuild(root)
    await zip.build(appOutDir, Arch.x64)
    // packager.ts calls finishBuild() of the async targets right after pack(), before deb reaches its wait
    const zipFinished = expect(zip.finishBuild()).rejects.toThrow("archive stub")

    const build = buildDeb(appOutDir, Arch.x64)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(WRITTEN_FILES.filter(it => existsSync(path.join(appOutDir, "resources", it)))).toEqual([])

    finishZip()
    await build
    expect(events).toEqual(["zip done", `deb wrote ${WRITTEN_FILES.join(", ")}`])
    await zipFinished
  })

  test("does not wait for the archive of another arch", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appOutDir = await createAppOutDir(root, "linux-ia32-unpacked")
    const { events, zip, buildDeb } = await createBuild(root)
    // the x64 archive never finishes
    await zip.build(await createAppOutDir(root, "linux-unpacked"), Arch.x64)
    await buildDeb(appOutDir, Arch.ia32)
    expect(events).toEqual([`deb wrote ${WRITTEN_FILES.join(", ")}`])
  }, 5000)

  test("writes into the app dir it packages when linux.defaultArch is set", async ({ tmpDir }) => {
    const root = await tmpDir.createTempDir()
    // with defaultArch arm64 the x64 app dir is linux-x64-unpacked (computeAppOutDir), and linux-unpacked is arm64's
    const appOutDir = await createAppOutDir(root, "linux-x64-unpacked")
    const otherArchAppOutDir = await createAppOutDir(root, "linux-unpacked")
    const { events, buildDeb } = await createBuild(root, { defaultArch: "arm64" })
    await buildDeb(appOutDir, Arch.x64)
    expect(events).toEqual([`deb wrote ${WRITTEN_FILES.join(", ")}`])
    expect(WRITTEN_FILES.filter(it => existsSync(path.join(otherArchAppOutDir, "resources", it)))).toEqual([])
  })
})
