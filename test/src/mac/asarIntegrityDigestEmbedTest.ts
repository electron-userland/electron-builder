import { afterEach, beforeEach, vi } from "vitest"

// codesign is intercepted, so these run on any platform and the fake Electron Framework is never really signed
vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return { ...actual, exec: vi.fn().mockResolvedValue("") }
})

import { MacPackager } from "app-builder-lib"
import { ASAR_INTEGRITY_DIGEST_SENTINEL, embedAsarIntegrityDigest } from "app-builder-lib/src/electron/mac/asarIntegrityDigest"
import { AsarOptions } from "app-builder-lib/src/options/PlatformSpecificBuildOptions"
import { PlistObject, savePlistFile } from "app-builder-lib/src/util/mac/plist"
import { exec, InvalidConfigurationError, log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"

const SENTINEL = Buffer.from(ASAR_INTEGRITY_DIGEST_SENTINEL)
const INTEGRITY = { "Resources/app.asar": { algorithm: "SHA256", hash: "697f2a6b9d6432470fe072c343c1714768b5fc304bd6f5fa7a4810821785f854" } }
// the digest of INTEGRITY, checked against Electron 41.3.0 (see asarIntegrityDigestTest.ts)
const DIGEST = "3d190382a0a7e6bcbe9928aab2dbc9b7d9ccceff8961e16115b48a8357edda8d"

interface FakeApp {
  appOutDir: string
  frameworkPath: string
  binaryPath: string
}

interface FakeAppOptions {
  frameworkName?: string
  infoPlist?: PlistObject
  withSlot?: boolean
}

// `<appOutDir>/Test.app` with an Info.plist and a stand-in framework binary holding one unwritten digest slot
async function createApp(
  tmpDir: any,
  { frameworkName = "Electron Framework", infoPlist = { ElectronAsarIntegrity: INTEGRITY }, withSlot = true }: FakeAppOptions = {}
): Promise<FakeApp> {
  const appOutDir = await tmpDir.createTempDir()
  const contents = path.join(appOutDir, "Test.app", "Contents")
  const frameworkPath = path.join(contents, "Frameworks", `${frameworkName}.framework`)
  await fs.mkdir(frameworkPath, { recursive: true })
  await savePlistFile(path.join(contents, "Info.plist"), infoPlist)

  const binary = Buffer.alloc(1024, 0xab)
  if (withSlot) {
    SENTINEL.copy(binary, 100)
    binary.fill(0, 100 + SENTINEL.length, 100 + SENTINEL.length + 34)
  }
  const binaryPath = path.join(frameworkPath, frameworkName)
  await fs.writeFile(binaryPath, binary)
  return { appOutDir, frameworkPath, binaryPath }
}

async function readSlot(binaryPath: string) {
  const binary = await fs.readFile(binaryPath)
  const slot = binary.indexOf(SENTINEL) + SENTINEL.length
  return { used: binary[slot], version: binary[slot + 1], digest: binary.subarray(slot + 2, slot + 34).toString("hex") }
}

interface DigestOptions {
  version?: string
  distMacOsAppName?: string
  platformSpecificBuildOptions?: object
  asarOptions?: AsarOptions | null
  hasUserAfterPack?: boolean
}

// `doAddAsarIntegrityDigest` is protected and only reads the Electron version and the app and framework names, so a hand-rolled `this` is enough
function addDigest(
  appOutDir: string,
  { version = "42.4.0", distMacOsAppName = "Electron.app", platformSpecificBuildOptions = {}, asarOptions = {}, hasUserAfterPack = false }: DigestOptions = {}
): Promise<void> {
  const self = {
    info: { framework: { version, distMacOsAppName }, filterPackagerEventListeners: () => (hasUserAfterPack ? [() => undefined] : []) },
    appInfo: { productFilename: "Test" },
  }
  return (MacPackager.prototype as any).doAddAsarIntegrityDigest.call(self, { appOutDir }, platformSpecificBuildOptions, asarOptions)
}

const AFTER_PACK_WARNING_KEY = "asar-integrity-digest-after-afterpack"

const resign = (frameworkPath: string) => ["/usr/bin/codesign", ["--sign", "-", "--force", "--deep", "--preserve-metadata=entitlements,requirements,flags,runtime", frameworkPath]]

const originalPlatform = process.platform
function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

describe("MacPackager.doAddAsarIntegrityDigest", () => {
  beforeEach(() => {
    vi.mocked(exec).mockClear()
    log.resetLimits(AFTER_PACK_WARNING_KEY)
    setPlatform("darwin")
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    vi.restoreAllMocks()
  })

  test("writes the digest of the Info.plist entries and signs the framework again", async ({ expect, tmpDir }) => {
    const app = await createApp(tmpDir)
    await addDigest(app.appOutDir)

    expect(await readSlot(app.binaryPath)).toEqual({ used: 1, version: 1, digest: DIGEST })
    expect(vi.mocked(exec).mock.calls).toEqual([resign(app.frameworkPath)])
  })

  test("applies to Electron 41 prereleases", async ({ expect, tmpDir }) => {
    const app = await createApp(tmpDir)
    await addDigest(app.appOutDir, { version: "41.0.0-alpha.1" })
    expect((await readSlot(app.binaryPath)).used).toBe(1)
  })

  test("finds the framework of a branded Electron build", async ({ expect, tmpDir }) => {
    const app = await createApp(tmpDir, { frameworkName: "MyFork Framework" })
    await addDigest(app.appOutDir, { distMacOsAppName: "MyFork.app" })

    expect(await readSlot(app.binaryPath)).toEqual({ used: 1, version: 1, digest: DIGEST })
    expect(vi.mocked(exec).mock.calls).toEqual([resign(app.frameworkPath)])
  })

  test.for<[string, DigestOptions]>([
    ["asar is disabled", { asarOptions: null }],
    // a stock Electron Info.plist still lists default_app.asar, which must not be digested
    ["asar.disableIntegrity is set", { asarOptions: { disableIntegrity: true } }],
    ["asarIntegrityDigest is false", { platformSpecificBuildOptions: { asarIntegrityDigest: false } }],
    ["Electron is older than 41", { version: "40.10.6" }],
  ])("leaves the framework untouched when %s", async ([, options], { expect, tmpDir }) => {
    const app = await createApp(tmpDir)
    await addDigest(app.appOutDir, options)

    expect((await readSlot(app.binaryPath)).used).toBe(0)
    expect(exec).not.toHaveBeenCalled()
  })

  test("skips with a warning on a non-macOS host, where codesign is unavailable", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn")
    const app = await createApp(tmpDir)
    setPlatform("linux")
    await addDigest(app.appOutDir)

    expect((await readSlot(app.binaryPath)).used).toBe(0)
    expect(exec).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining("supported only on macOS") }), "skipped ASAR integrity digest")
  })

  // `defaults write` in an afterPack hook leaves Info.plist in the binary format, which is not read
  test("fails with an actionable error when Info.plist is not XML", async ({ expect, tmpDir }) => {
    const app = await createApp(tmpDir)
    const infoPlist = path.join(app.appOutDir, "Test.app", "Contents", "Info.plist")
    await fs.writeFile(infoPlist, Buffer.concat([Buffer.from("bplist00"), Buffer.from([0xd1, 0x01, 0x02])]))

    const error = await addDigest(app.appOutDir).then(
      () => null,
      (e: Error) => e
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error?.message).toContain(infoPlist)
    expect(error?.message).toContain("set mac.asarIntegrityDigest to false")
    expect((await readSlot(app.binaryPath)).used).toBe(0)
    expect(exec).not.toHaveBeenCalled()
  })

  test("skips with a warning when Info.plist has no ElectronAsarIntegrity entries", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn")
    const app = await createApp(tmpDir, { infoPlist: { CFBundleName: "Test" } })
    await addDigest(app.appOutDir)

    expect((await readSlot(app.binaryPath)).used).toBe(0)
    expect(exec).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: "Info.plist has no ElectronAsarIntegrity entries" }), "skipped ASAR integrity digest")
  })

  test("skips with a warning when the framework has no digest slot", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn")
    const app = await createApp(tmpDir, { withSlot: false })
    await addDigest(app.appOutDir)

    expect(exec).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: "the binary has no ASAR integrity digest slot" }), "skipped ASAR integrity digest")
  })

  test("rejects a framework name that leaves the Frameworks directory", async ({ expect, tmpDir }) => {
    const app = await createApp(tmpDir)
    await expect(embedAsarIntegrityDigest(path.join(app.appOutDir, "Test.app"), "../../Evil")).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect((await readSlot(app.binaryPath)).used).toBe(0)
    expect(exec).not.toHaveBeenCalled()
  })

  test("warns once, with the migration link, when a user afterPack hook is configured", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn")
    await addDigest((await createApp(tmpDir)).appOutDir, { hasUserAfterPack: true })
    await addDigest((await createApp(tmpDir)).appOutDir, { hasUserAfterPack: true })

    const announcements = warn.mock.calls.filter(([, message]) => message?.includes("#macos-asar-integrity-digest"))
    expect(announcements).toHaveLength(1)
    expect(announcements[0][1]).toContain("electron-builder v27 embeds the ASAR integrity digest into the Electron Framework after the afterPack hook")
    expect(announcements[0][1]).toContain("https://www.electron.build/docs/migration/v27-breaking-changes#macos-asar-integrity-digest")
    expect(announcements[0][0]).toEqual({ solution: expect.stringContaining("mac.asarIntegrityDigest to false") })
  })

  test("does not warn about afterPack without a user afterPack hook, or when nothing was embedded", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn")
    await addDigest((await createApp(tmpDir)).appOutDir)
    await addDigest((await createApp(tmpDir, { withSlot: false })).appOutDir, { hasUserAfterPack: true })

    expect(warn.mock.calls.filter(([, message]) => message?.includes("#macos-asar-integrity-digest"))).toEqual([])
  })
})
