import * as get from "@electron/get"
import { Platform } from "app-builder-lib"
import { createElectronFrameworkSupport } from "app-builder-lib/src/electron/ElectronFramework"
import type { TmpDir } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { afterEach, describe, test, vi } from "vitest"
import { app, AssertPackOptions, linuxDirTarget } from "./helpers/packTester"
import { ELECTRON_UNPACK_CACHE_DIR } from "./helpers/testConfig"
import { buildZip, UNIX_SYMLINK_MODE, ZipEntrySpec } from "./helpers/zipBuilder"

// The unit tests make the Electron "download" return a small zip built here, so the unpack cache is exercised without the real
// 100+ MB archive; the harness test at the end downloads for real (mockReset restores the real implementation).
vi.mock("@electron/get", async importOriginal => {
  const actual = await importOriginal<typeof import("@electron/get")>()
  return { ...actual, downloadArtifact: vi.fn(actual.downloadArtifact) }
})

const VERSION = "42.0.0-unpack-cache-test"
const canSymlink = process.platform !== "win32"

afterEach(() => {
  vi.mocked(get.downloadArtifact).mockReset()
})

// The parts of an Electron zip the build treats specially: the executable, the files cleanupAfterUnpack removes or renames,
// a library symlink (the macOS framework is full of them) and a file whose restrictive mode must survive the copy.
function electronZipEntries(arch: string): ZipEntrySpec[] {
  const file = (name: string, content: string, mode = 0o100644): ZipEntrySpec => ({ name, content: Buffer.from(content), mode })
  return [
    file("electron", `binary for ${arch}`, 0o100755),
    file("resources/default_app.asar", "default app"),
    file("version", VERSION),
    file("LICENSE", "license"),
    file("locales/en-US.pak", "en-US"),
    file("lib/libffmpeg.so.1", "library", 0o100755),
    file("private.bin", "owner only", 0o100600),
    ...(canSymlink ? [{ name: "lib/libffmpeg.so", content: Buffer.from("libffmpeg.so.1"), mode: UNIX_SYMLINK_MODE }] : []),
  ]
}

async function mockElectronDownload(zipDir: string) {
  await fs.mkdir(zipDir, { recursive: true })
  const zips = new Map<string, string>()
  for (const arch of ["x64", "arm64"]) {
    const zip = path.join(zipDir, `electron-${arch}.zip`)
    await fs.writeFile(zip, buildZip(electronZipEntries(arch)))
    zips.set(arch, zip)
  }
  vi.mocked(get.downloadArtifact).mockImplementation(details => Promise.resolve(zips.get((details as get.ElectronPlatformArtifactDetails).arch)!))
}

/** A temp dir with the mocked Electron download, and a function that prepares an app output dir in it like a build does. */
async function setup(tmpDir: TmpDir) {
  const root = await tmpDir.getTempDir({ prefix: "unpack-cache" })
  await mockElectronDownload(root)
  const framework = await createElectronFrameworkSupport({ electronVersion: VERSION }, {} as any)
  const cacheDir = path.join(root, "cache")
  const prepare = async (name: string, { useCache = true, arch = "x64" } = {}) => {
    const packager: any = {
      platform: Platform.LINUX,
      config: {},
      appInfo: { type: undefined },
      getWorkspaceRoot: () => Promise.resolve(root),
      packagerOptions: { electronUnpackCacheDir: useCache ? cacheDir : null },
    }
    const appOutDir = path.join(root, name)
    await framework.prepareApplicationStageDirectory({ packager, appOutDir, platformName: "linux", arch, version: VERSION })
    return appOutDir
  }
  return { prepare }
}

/** Relative path, type, permission bits, symlink target and content of every entry, to compare trees exactly. */
async function describeTree(root: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of (await fs.readdir(root, { recursive: true })).sort()) {
    const file = path.join(root, entry)
    const stat = await fs.lstat(file)
    const mode = process.platform === "win32" ? "" : (stat.mode & 0o7777).toString(8)
    if (stat.isSymbolicLink()) {
      result.push(`${entry} -> ${await fs.readlink(file)}`)
    } else if (stat.isDirectory()) {
      result.push(`${entry}/ ${mode}`)
    } else {
      result.push(`${entry} ${mode} ${await fs.readFile(file, "utf-8")}`)
    }
  }
  return result
}

describe("electron unpack cache", () => {
  test("a cached unpack produces the same app directory as unzipping, and unzips only once", async ({ expect, tmpDir }) => {
    const { prepare } = await setup(tmpDir)
    const unzipped = await prepare("unzipped", { useCache: false })
    const cold = await prepare("cold")
    const warm = await prepare("warm")

    const expected = await describeTree(unzipped)
    // the cleanup after unpacking ran on the copy too: default_app.asar and version are gone, LICENSE is renamed
    expect(expected.some(it => it.startsWith("LICENSE.electron.txt "))).toBe(true)
    expect(expected.some(it => it.includes("default_app.asar") || it.startsWith("version "))).toBe(false)
    if (canSymlink) {
      expect(expected).toContain(path.join("lib", "libffmpeg.so") + " -> libffmpeg.so.1")
      expect(expected).toContain("private.bin 600 owner only")
    }
    expect(await describeTree(cold)).toEqual(expected)
    expect(await describeTree(warm)).toEqual(expected)
    // once for the uncached build and once to fill the cache; the warm build copies without downloading or unzipping
    expect(get.downloadArtifact).toHaveBeenCalledTimes(2)
  })

  test("the app directory is a copy that the build can change without touching the cache", async ({ expect, tmpDir }) => {
    const { prepare } = await setup(tmpDir)
    const executable = path.join(await prepare("first"), "electron")
    expect((await fs.stat(executable)).nlink).toBe(1)
    await fs.writeFile(executable, "edited in place, like rcedit or signing")

    expect(await fs.readFile(path.join(await prepare("second"), "electron"), "utf-8")).toBe("binary for x64")
  })

  test("concurrent first use unzips once", async ({ expect, tmpDir }) => {
    const { prepare } = await setup(tmpDir)
    const outDirs = await Promise.all(["a", "b", "c"].map(it => prepare(it)))

    expect(get.downloadArtifact).toHaveBeenCalledTimes(1)
    const trees = await Promise.all(outDirs.map(describeTree))
    expect(trees[1]).toEqual(trees[0])
    expect(trees[2]).toEqual(trees[0])
  })

  test("each arch has its own cache entry", async ({ expect, tmpDir }) => {
    const { prepare } = await setup(tmpDir)
    const x64 = await prepare("x64", { arch: "x64" })
    const arm64 = await prepare("arm64", { arch: "arm64" })

    expect(await fs.readFile(path.join(x64, "electron"), "utf-8")).toBe("binary for x64")
    expect(await fs.readFile(path.join(arm64, "electron"), "utf-8")).toBe("binary for arm64")
  })
})

test("the test harness turns the unpack cache on unless a test opts out", async ({ expect }) => {
  const seen: Array<string | null | undefined> = []
  const recordAndStop: AssertPackOptions = {
    afterPackTestHook: ({ packager }) => {
      seen.push(packager.options.electronUnpackCacheDir)
      return Promise.resolve(true)
    },
  }
  await app(expect, { targets: linuxDirTarget }, recordAndStop)
  await app(expect, { targets: linuxDirTarget }, { ...recordAndStop, electronUnpackCache: false })
  expect(seen).toEqual([ELECTRON_UNPACK_CACHE_DIR, undefined])
})
