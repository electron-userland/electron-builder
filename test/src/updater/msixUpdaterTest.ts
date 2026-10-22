import { generateUpdateSigningKeypair, serializeToYaml, TmpDir } from "builder-util"
import { GenericServerOptions, UpdateFileInfo } from "builder-util-runtime"
import { createHash } from "crypto"
import { MsixUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { checkMsixUpdateFile, getMsixInactiveReason, isMsixInstall, MsixPackageInfo } from "electron-updater/src/MsixUpdater"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import { readPackageType } from "electron-updater/src/util"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import * as path from "path"
import { fileURLToPath } from "url"
import { afterEach, vi } from "vitest"
import { mockForNodeRequire } from "vitest-mock-commonjs"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createTestAppAdapter, testAppCacheDirName, trackEvents, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"
import { resignManifest, rewriteServedManifests } from "./signedManifestTestUtil.js"

const FAMILY_NAME = "TestApp_8wekyb3d8bbwe"
const INSTALLED: MsixPackageInfo = { familyName: FAMILY_NAME, version: "1.0.0.0", signatureKind: "developer", developmentMode: false }

const BUNDLE_NAME = "App.msixbundle"
const BUNDLE = Buffer.from("electron-builder MsixUpdater test bundle, not a real package")
const BUNDLE_SHA512 = createHash("sha512").update(BUNDLE).digest("base64")

// how Electron reports a failed deployment (0x80073D06: a higher version of the package is installed)
const NATIVE_ERROR = "Deployment failed (-2147009274)"

// the update manifest signing keys of the build: an MSIX install downloads an update only from a manifest that a trusted key verified
const SIGNING_KEYS = generateUpdateSigningKeypair()

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("isMsixInstall", () => {
  test.for<[string | null, boolean]>([
    ["msix", true],
    ["nsis", false],
    ["nsis-web", false],
    [null, false],
    ["deb", false],
  ])("package-type %j: %s", ([packageType, expected], { expect }) => {
    expect(isMsixInstall(packageType)).toBe(expected)
  })
})

describe("the Windows autoUpdater", () => {
  // the updater classes that index.ts requires, so that the selection runs without Electron
  class FakeMsixUpdater {
    readonly kind = "MsixUpdater"
  }
  class FakeNsisUpdater {
    readonly kind = "NsisUpdater"
  }

  function setProcessProperty(name: "platform" | "windowsStore" | "resourcesPath", value: unknown): () => void {
    const original = Object.getOwnPropertyDescriptor(process, name)
    Object.defineProperty(process, name, { value, configurable: true, writable: true })
    return () => {
      if (original == null) {
        delete (process as any)[name]
      } else {
        Object.defineProperty(process, name, original)
      }
    }
  }

  // process.windowsStore is true for every app with package identity, a sparse package too: only the marker selects MsixUpdater
  test.for<[string | null, boolean, string]>([
    ["msix", true, "MsixUpdater"],
    ["msix", false, "MsixUpdater"],
    ["nsis", true, "NsisUpdater"],
    ["nsis", false, "NsisUpdater"],
    ["nsis-web", true, "NsisUpdater"],
    [null, true, "NsisUpdater"],
    [null, false, "NsisUpdater"],
  ])("package-type %j, windowsStore %s: %s", async ([packageType, isWindowsStore, expected], { expect, tmpDir }) => {
    const resourcesPath = await tmpDir.getTempDir({ prefix: "resources" })
    if (packageType != null) {
      await fsExtra.outputFile(path.join(resourcesPath, "package-type"), `${packageType}\n`)
    }
    mockForNodeRequire("./MsixUpdater.js", { MsixUpdater: FakeMsixUpdater })
    mockForNodeRequire("./NsisUpdater.js", { NsisUpdater: FakeNsisUpdater })
    const restores = [setProcessProperty("platform", "win32"), setProcessProperty("windowsStore", isWindowsStore), setProcessProperty("resourcesPath", resourcesPath)]
    try {
      // a fresh module: the autoUpdater of index.ts is created once, on first use
      vi.resetModules()
      const { autoUpdater } = await import("electron-updater")
      expect((autoUpdater as unknown as { kind: string }).kind).toBe(expected)
    } finally {
      restores.reverse().forEach(restore => restore())
      mockForNodeRequire("./MsixUpdater.js", undefined)
      mockForNodeRequire("./NsisUpdater.js", undefined)
    }
  })
})

describe("getMsixInactiveReason", () => {
  type Env = Parameters<typeof getMsixInactiveReason>[0]
  const ACTIVE: Env = { packageType: "msix", isWindowsStore: true, packageInfo: INSTALLED, electronVersion: "39.8.10", osRelease: "10.0.26100" }
  const APP_INSTALLER_URI = "https://example.com/TestApp.appinstaller"

  test.for<[string, Partial<Env>]>([
    ["a developer-signed install", {}],
    ["an enterprise signature", { packageInfo: { ...INSTALLED, signatureKind: "enterprise" } }],
    ["Electron 39.5.2", { electronVersion: "39.5.2" }],
    ["Electron 40.2.1", { electronVersion: "40.2.1" }],
    ["Electron 41.0.0-alpha.6", { electronVersion: "41.0.0-alpha.6" }],
    ["Electron 42.1.0", { electronVersion: "42.1.0" }],
    ["Windows 10.0.19041", { osRelease: "10.0.19041" }],
  ])("active with %s", ([, env], { expect }) => {
    expect(getMsixInactiveReason({ ...ACTIVE, ...env })).toBeNull()
  })

  // in the order of the checks
  test.for<[string, Partial<Env>, string]>([
    ["no package-type marker", { packageType: null }, 'resources/package-type is null, not "msix"'],
    ["an nsis marker", { packageType: "nsis" }, 'resources/package-type is "nsis", not "msix"'],
    ["no package identity", { isWindowsStore: false }, "process.windowsStore is not true"],
    ["no package info", { packageInfo: null }, "provides no MSIX package info"],
    ["an empty package family name", { packageInfo: { ...INSTALLED, familyName: "" } }, "provides no MSIX package info"],
    ["Electron 39.5.1", { electronVersion: "39.5.1" }, "Electron 39.5.1 cannot install"],
    ["Electron 40.1.0", { electronVersion: "40.1.0" }, "Electron 40.1.0 cannot install"],
    ["Electron 40.2.0", { electronVersion: "40.2.0" }, "Electron 40.2.0 cannot install"],
    ["Electron 41.0.0-alpha.5", { electronVersion: "41.0.0-alpha.5" }, "Electron 41.0.0-alpha.5 cannot install"],
    ["an unknown Electron version", { electronVersion: undefined }, "Electron (unknown version) cannot install"],
    ["Windows 10.0.19040", { osRelease: "10.0.19040" }, "Windows 10.0.19040 is older than Windows 10 version 2004"],
    ["a Store signature", { packageInfo: { ...INSTALLED, signatureKind: "store" } }, 'signature kind is "store"'],
    ["a system signature", { packageInfo: { ...INSTALLED, signatureKind: "system" } }, 'signature kind is "system"'],
    ["no signature", { packageInfo: { ...INSTALLED, signatureKind: "none" } }, 'signature kind is "none"'],
    ["an unknown signature kind", { packageInfo: { ...INSTALLED, signatureKind: undefined } }, 'signature kind is "unknown"'],
    ["development mode", { packageInfo: { ...INSTALLED, developmentMode: true } }, "registered in development mode"],
    ["App Installer", { packageInfo: { ...INSTALLED, appInstallerUri: APP_INSTALLER_URI } }, `App Installer manages the updates of the package (${APP_INSTALLER_URI})`],
  ])("inactive with %s", ([, env, reason], { expect }) => {
    expect(getMsixInactiveReason({ ...ACTIVE, ...env })).toContain(reason)
  })

  test("reports the first failing check", ({ expect }) => {
    // every check fails: fixing them one at a time, in order, reports the next one
    const failingInfo: MsixPackageInfo = { familyName: FAMILY_NAME, version: "1.0.0.0", signatureKind: "none", developmentMode: true, appInstallerUri: APP_INSTALLER_URI }
    const fixes: Array<[string, Partial<Env>]> = [
      ["resources/package-type", { packageType: "msix" }],
      ["process.windowsStore", { isWindowsStore: true }],
      ["no MSIX package info", { packageInfo: failingInfo }],
      ["Electron 38.0.0", { electronVersion: "39.8.10" }],
      ["Windows 10.0.17763", { osRelease: "10.0.26100" }],
      ['signature kind is "none"', { packageInfo: { ...failingInfo, signatureKind: "developer" } }],
      ["development mode", { packageInfo: { ...failingInfo, signatureKind: "developer", developmentMode: false } }],
      ["App Installer", { packageInfo: INSTALLED }],
    ]
    let env: Env = { packageType: null, isWindowsStore: false, packageInfo: null, electronVersion: "38.0.0", osRelease: "10.0.17763" }
    for (const [reason, fix] of fixes) {
      expect(getMsixInactiveReason(env)).toContain(reason)
      env = { ...env, ...fix }
    }
    expect(getMsixInactiveReason(env)).toBeNull()
  })
})

function bundleFileInfo(hints: Partial<UpdateFileInfo> = {}): UpdateFileInfo {
  return { url: BUNDLE_NAME, sha512: BUNDLE_SHA512, size: BUNDLE.length, packageFamilyName: FAMILY_NAME, packageVersion: "1.0.1.0", ...hints }
}

describe("checkMsixUpdateFile", () => {
  test("accepts a higher version of the installed package family, whose name is case-insensitive", ({ expect }) => {
    expect(() => checkMsixUpdateFile(bundleFileInfo({ packageFamilyName: FAMILY_NAME.toLowerCase() }), INSTALLED, false)).not.toThrow()
  })

  test.for<[string, string | undefined]>([
    ["another package family", "OtherApp_8wekyb3d8bbwe"],
    ["no recorded package family", undefined],
  ])("refuses %s", ([, packageFamilyName], { expect }) => {
    expect(() => checkMsixUpdateFile(bundleFileInfo({ packageFamilyName }), INSTALLED, true)).toThrow(expect.objectContaining({ code: "ERR_UPDATER_MSIX_PACKAGE_FAMILY_MISMATCH" }))
  })

  test.for<[string, string, boolean]>([
    ["1.0.0.1", "1.0.0.0", false],
    // part by part, as numbers
    ["1.0.10.0", "1.0.9.0", false],
    ["1.0.0.9", "1.0.1.0", true],
  ])("accepts the package version %s over the installed %s (allowDowngrade %s)", ([packageVersion, version, allowDowngrade], { expect }) => {
    expect(() => checkMsixUpdateFile(bundleFileInfo({ packageVersion }), { ...INSTALLED, version }, allowDowngrade)).not.toThrow()
  })

  test.for<[string | undefined, string, boolean]>([
    // Windows never installs the installed version again, and the channel setter turns allowDowngrade on
    ["1.0.0.0", "1.0.0.0", true],
    ["1.0.0.9", "1.0.1.0", false],
    ["1.0.1", "1.0.0.0", true],
    ["1.0.1.0-beta", "1.0.0.0", true],
    [undefined, "1.0.0.0", true],
  ])("refuses the package version %s over the installed %s (allowDowngrade %s)", ([packageVersion, version, allowDowngrade], { expect }) => {
    expect(() => checkMsixUpdateFile(bundleFileInfo({ packageVersion }), { ...INSTALLED, version }, allowDowngrade)).toThrow(
      expect.objectContaining({ code: "ERR_UPDATER_MSIX_VERSION_NOT_HIGHER" })
    )
  })
})

describe("readPackageType", () => {
  // process.resourcesPath is only set in Electron
  function readWithResourcesPath(resourcesPath: string | undefined): string | null {
    const original = Object.getOwnPropertyDescriptor(process, "resourcesPath")
    Object.defineProperty(process, "resourcesPath", { value: resourcesPath, configurable: true, writable: true })
    try {
      return readPackageType()
    } finally {
      if (original == null) {
        delete (process as any).resourcesPath
      } else {
        Object.defineProperty(process, "resourcesPath", original)
      }
    }
  }

  test("reads the marker without its line break", async ({ expect, tmpDir }) => {
    const resourcesPath = await tmpDir.getTempDir({ prefix: "resources" })
    await fsExtra.outputFile(path.join(resourcesPath, "package-type"), "msix\n")
    expect(readWithResourcesPath(resourcesPath)).toBe("msix")
  })

  test("is null without a marker or outside Electron", async ({ expect, tmpDir }) => {
    expect(readWithResourcesPath(await tmpDir.getTempDir({ prefix: "resources" }))).toBeNull()
    expect(readWithResourcesPath(undefined)).toBeNull()
  })
})

type NativeOutcome = Array<"update-downloaded" | "update-not-available" | Error>

/**
 * Electron's MSIX autoUpdater: checkForUpdates() has Windows stage the bundle at the feed URL and then, asynchronously like the native one,
 * emits the next queued outcome. Without one, the update is staged ("update-downloaded"). quitAndInstall() is async too, and Windows shuts the
 * app down before the install ends: by default, its promise never settles.
 */
class TestMsixNativeUpdater extends EventEmitter {
  // one per checkForUpdates() call; [] never answers
  readonly outcomes: Array<NativeOutcome> = []

  readonly setFeedURL = vi.fn<(options: { url: string; allowAnyVersion?: boolean }) => void>()

  readonly checkForUpdates = vi.fn(() => {
    const outcome = this.outcomes.shift() ?? ["update-downloaded"]
    setImmediate(() => {
      for (const event of outcome) {
        if (event instanceof Error) {
          this.emit("error", event)
        } else {
          this.emit(event)
        }
      }
    })
  })

  readonly quitAndInstall = vi.fn((): Promise<void> => new Promise(() => {}))

  getPackageInfo(): MsixPackageInfo {
    return INSTALLED
  }
}

// a generic provider feed with latest-msix.yml, signed with SIGNING_KEYS, and the bundle; `requests` records the path of every request
async function serveMsixUpdate(tmpDir: TmpDir, files = [bundleFileInfo()], version = "1.0.1") {
  const root = await tmpDir.getTempDir({ prefix: "msix-feed" })
  const info = resignManifest({ version, files, releaseDate: "2024-01-01T00:00:00.000Z" }, [SIGNING_KEYS.privateKeyPem])
  await fsExtra.outputFile(path.join(root, "latest-msix.yml"), serializeToYaml(info))
  await fsExtra.outputFile(path.join(root, BUNDLE_NAME), BUNDLE)
  const requests: Array<string> = []
  const { server, port } = await createLocalServer(root, "127.0.0.1", url => requests.push(new URL(url, "http://x").pathname))
  return { url: `http://127.0.0.1:${port}`, root, requests, close: () => server.close() }
}

// trustedKey is the updateManifestPublicKey of app-update.yml, which a build that signs update manifests embeds; null for none
async function createMsixUpdater(native: TestMsixNativeUpdater, feedUrl = "http://127.0.0.1:1", trustedKey: string | null = SIGNING_KEYS.publicKeyPem) {
  // the updater takes require("electron").autoUpdater when it is created
  mockForNodeRequire("electron", { autoUpdater: native })
  const adapter: AppAdapter = await createTestAppAdapter("1.0.0")
  const updater = new MsixUpdater(undefined, adapter)
  const config: GenericServerOptions = { provider: "generic", url: feedUrl, updaterCacheDirName: testAppCacheDirName }
  updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>(trustedKey == null ? config : { ...config, updateManifestPublicKey: trustedKey })
  tuneTestUpdater(updater)
  return { updater, adapter }
}

// bypasses the check of the environment (package identity, Electron and Windows versions), which fails outside an MSIX package
async function createActiveMsixUpdater(native: TestMsixNativeUpdater, feedUrl?: string, trustedKey?: string | null) {
  const result = await createMsixUpdater(native, feedUrl, trustedKey)
  vi.spyOn(result.updater, "isUpdaterActive").mockReturnValue(true)
  return result
}

// the download that checkForUpdates() starts (autoDownload)
async function checkAndDownload(updater: MsixUpdater) {
  const result = await updater.checkForUpdates()
  return await result!.downloadPromise!
}

// the package's LocalCache, which is not virtualized: the AppX deployment service reads the bundle there
function pendingBundlePath(adapter: AppAdapter): string {
  return path.join(adapter.baseCachePath, "Packages", FAMILY_NAME, "LocalCache", testAppCacheDirName, "pending", BUNDLE_NAME)
}

describe("MsixUpdater", () => {
  test("downloads the bundle of latest-msix.yml into the package's LocalCache and announces it once Windows staged it", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)
      const events = trackEvents(updater)
      const nativeChecksAtDownloaded: Array<number> = []
      updater.on("update-downloaded", () => nativeChecksAtDownloaded.push(native.checkForUpdates.mock.calls.length))

      const { updateFile } = await checkAndDownload(updater)

      // the provider got isMsix: never the latest.yml of NSIS installs
      expect(feed.requests).toEqual(["/latest-msix.yml", `/${BUNDLE_NAME}`])
      const bundle = pendingBundlePath(adapter)
      expect(updateFile).toBe(bundle)
      expect(await fsExtra.readFile(bundle)).toEqual(BUNDLE)
      expect(native.setFeedURL).toHaveBeenCalledTimes(1)
      const { url, allowAnyVersion } = native.setFeedURL.mock.calls[0][0]
      expect(fileURLToPath(url)).toBe(bundle)
      expect(allowAnyVersion).toBe(false)
      // "update-downloaded" means staged
      expect(nativeChecksAtDownloaded).toEqual([1])
      expect(events).toEqual(["checking-for-update", "update-available", "update-downloaded"])
    } finally {
      feed.close()
    }
  })

  test.for<[string, UpdateFileInfo, boolean, string]>([
    ["of another package family", bundleFileInfo({ packageFamilyName: "OtherApp_8wekyb3d8bbwe" }), false, "ERR_UPDATER_MSIX_PACKAGE_FAMILY_MISMATCH"],
    ["of the installed package version, even with allowDowngrade", bundleFileInfo({ packageVersion: "1.0.0.0" }), true, "ERR_UPDATER_MSIX_VERSION_NOT_HIGHER"],
    ["without a .msixbundle", { url: "TestApp Setup 1.0.1.exe", sha512: BUNDLE_SHA512, size: BUNDLE.length }, false, "ERR_UPDATER_MSIX_FILE_NOT_FOUND"],
  ])("refuses an update %s before downloading it", async ([, file, allowDowngrade, code], { expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir, [file])
    try {
      const native = new TestMsixNativeUpdater()
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      updater.allowDowngrade = allowDowngrade
      const events = trackEvents(updater)

      await expect(checkAndDownload(updater)).rejects.toMatchObject({ code })
      expect(feed.requests).toEqual(["/latest-msix.yml"])
      expect(native.setFeedURL).not.toHaveBeenCalled()
      expect(events).toEqual(["checking-for-update", "update-available", "error"])
    } finally {
      feed.close()
    }
  })

  // Windows installs any package signed with a certificate that the machine trusts, even another app's, and the packageFamilyName and
  // packageVersion hints are unsigned: only a manifest that a trusted key verified pins the bundle by its sha512
  test.for<[string, Array<string>]>([
    ["an unsigned manifest", []],
    ["a signed manifest", [SIGNING_KEYS.privateKeyPem]],
  ])("without a trusted key, refuses an update with %s before downloading it", async ([, signingKeys], { expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      await rewriteServedManifests(feed.root, info => resignManifest(info, signingKeys))
      const native = new TestMsixNativeUpdater()
      const { updater } = await createActiveMsixUpdater(native, feed.url, null)
      const events = trackEvents(updater)

      await expect(checkAndDownload(updater)).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED" })
      expect(feed.requests).toEqual(["/latest-msix.yml"])
      expect(native.setFeedURL).not.toHaveBeenCalled()
      // the check still announces the update
      expect(events).toEqual(["checking-for-update", "update-available", "error"])
    } finally {
      feed.close()
    }
  })

  test("refuses an update whose manifest the check did not verify, although a key is trusted by the time it downloads", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      const { updater } = await createActiveMsixUpdater(native, feed.url, null)
      updater.autoDownload = false
      await updater.checkForUpdates()
      // e.g. a trust list that the app only sets after the check
      updater.updateManifestPublicKey = SIGNING_KEYS.publicKeyPem

      await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED" })
      expect(feed.requests).toEqual(["/latest-msix.yml"])
      expect(native.setFeedURL).not.toHaveBeenCalled()
    } finally {
      feed.close()
    }
  })

  // the bundle is pinned by the signed url, sha512 and size: editing an unsigned hint can only have electron-updater refuse the update
  test.for<[string, Partial<UpdateFileInfo>, string]>([
    ["packageFamilyName", { packageFamilyName: "OtherApp_8wekyb3d8bbwe" }, "ERR_UPDATER_MSIX_PACKAGE_FAMILY_MISMATCH"],
    ["packageVersion", { packageVersion: "1.0.0.0" }, "ERR_UPDATER_MSIX_VERSION_NOT_HIGHER"],
  ])("a %s edited after signing does not fail the signature verification, and refuses the update", async ([, hints, code], { expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      await rewriteServedManifests(feed.root, info => ({ ...info, files: info.files.map(file => ({ ...file, ...hints })) }))
      const native = new TestMsixNativeUpdater()
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      const infos: Array<string> = []
      updater.logger = { info: (message: string) => infos.push(message), warn() {}, error() {} }
      const events = trackEvents(updater)

      await expect(checkAndDownload(updater)).rejects.toMatchObject({ code })
      expect(infos).toContain("Update manifest signature verified for version 1.0.1")
      expect(feed.requests).toEqual(["/latest-msix.yml"])
      expect(native.setFeedURL).not.toHaveBeenCalled()
      expect(events).toEqual(["checking-for-update", "update-available", "error"])
    } finally {
      feed.close()
    }
  })

  test("stages a lower package version with allowDowngrade", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir, [bundleFileInfo({ packageVersion: "0.9.0.0" })], "0.9.0")
    try {
      const native = new TestMsixNativeUpdater()
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      updater.allowDowngrade = true

      await checkAndDownload(updater)
      expect(native.setFeedURL).toHaveBeenCalledTimes(1)
      expect(native.setFeedURL.mock.calls[0][0].allowAnyVersion).toBe(true)
      expect(native.checkForUpdates).toHaveBeenCalledTimes(1)
    } finally {
      feed.close()
    }
  })

  test("selects the bundle by its URL in latest-msix.yml when the provider downloads it from an extensionless URL", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      // like the private GitHub provider, which downloads release assets from API URLs
      await fsExtra.outputFile(path.join(feed.root, "api", "assets", "42"), BUNDLE)
      vi.spyOn(GenericProvider.prototype, "resolveFiles").mockImplementation(info => info.files.map(file => ({ url: new URL("/api/assets/42", feed.url), info: file })))
      const native = new TestMsixNativeUpdater()
      const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)

      await expect(checkAndDownload(updater)).resolves.toMatchObject({ updateFile: pendingBundlePath(adapter) })
      expect(feed.requests).toEqual(["/latest-msix.yml", "/api/assets/42"])
      // the native updater needs a path ending in .msixbundle
      expect(fileURLToPath(native.setFeedURL.mock.calls[0][0].url)).toBe(pendingBundlePath(adapter))
    } finally {
      feed.close()
    }
  })

  test("a failed staging rejects the download once, and the next check stages the verified bundle again without downloading it", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      // Electron's MSIX autoUpdater emits some errors twice
      native.outcomes.push([new Error(NATIVE_ERROR), new Error(NATIVE_ERROR)])
      const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)
      const events = trackEvents(updater)

      await expect(checkAndDownload(updater)).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED", message: expect.stringContaining(NATIVE_ERROR) })
      // the duplicate went to the one native listener: not an unhandled "error" (which would fail the run), nor a second updater error
      expect(native.listenerCount("error")).toBe(1)
      expect(events).toEqual(["checking-for-update", "update-available", "error"])
      expect(await fsExtra.pathExists(pendingBundlePath(adapter))).toBe(true)

      await expect(checkAndDownload(updater)).resolves.toMatchObject({ updateFile: pendingBundlePath(adapter) })
      expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
      expect(feed.requests).toEqual(["/latest-msix.yml", `/${BUNDLE_NAME}`, "/latest-msix.yml"])
    } finally {
      feed.close()
    }
  })

  test("Electron reporting no update fails the staging", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      native.outcomes.push(["update-not-available"])
      const { updater } = await createActiveMsixUpdater(native, feed.url)

      await expect(checkAndDownload(updater)).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED", message: expect.stringContaining("reported no update") })
    } finally {
      feed.close()
    }
  })

  test('"manual" stages the update in quitAndInstall, which quits the app when Windows ends its session to install it', async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)
      updater.autoInstallEvent = "manual"
      const onSessionEnd = vi.spyOn(adapter, "onSessionEnd")
      const quit = vi.spyOn(adapter, "quit")
      const nativeChecksAtDownloaded: Array<number> = []
      updater.on("update-downloaded", () => nativeChecksAtDownloaded.push(native.checkForUpdates.mock.calls.length))

      await checkAndDownload(updater)
      expect(nativeChecksAtDownloaded).toEqual([0])

      updater.quitAndInstall()
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(1))
      expect(native.checkForUpdates).toHaveBeenCalledTimes(1)
      // in place before Windows shuts the app down
      expect(onSessionEnd).toHaveBeenCalledTimes(1)
      expect(onSessionEnd.mock.invocationCallOrder[0]).toBeLessThan(native.quitAndInstall.mock.invocationCallOrder[0])
      expect(quit).not.toHaveBeenCalled()
      onSessionEnd.mock.calls[0][0]()
      expect(quit).toHaveBeenCalledTimes(1)
    } finally {
      feed.close()
    }
  })

  test.for<[string, boolean, Parameters<MsixUpdater["quitAndInstall"]>, boolean]>([
    ["quitAndInstall() with autoRunAppAfterInstall = false", false, [], true],
    // as for every Windows updater (BaseUpdater): the app runs after a silent install only with isForceRunAfter, whatever autoRunAppAfterInstall
    ["quitAndInstall({ isSilent: true })", true, [{ isSilent: true }], true],
    ["the legacy quitAndInstall(true, false)", true, [true, false], true],
    // an ordinary quit, as with BaseUpdater: the update is deferred
    ["quitAndInstall({ waitUntilNextLaunch: true })", true, [{ waitUntilNextLaunch: true }], false],
  ])(
    "%s only quits the app, and again once the app cancelled the quit: Windows installs the staged update when it is launched next",
    async ([, autoRunAppAfterInstall, args, isQuitForUpdate], { expect, tmpDir }) => {
      const feed = await serveMsixUpdate(tmpDir)
      try {
        const native = new TestMsixNativeUpdater()
        const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)
        updater.autoRunAppAfterInstall = autoRunAppAfterInstall
        const quits: Array<string> = []
        native.on("before-quit-for-update", () => quits.push("before-quit-for-update"))
        // the app cancels the quit, e.g. in before-quit
        vi.spyOn(adapter, "quit").mockImplementation(() => {
          quits.push("quit")
        })
        await checkAndDownload(updater)
        // emitted before the quit as by every other updater
        const quit = isQuitForUpdate ? ["before-quit-for-update", "quit"] : ["quit"]

        updater.quitAndInstall(...args)
        await vi.waitFor(() => expect(quits).toEqual(quit))
        // nothing native is pending: the app can call it again
        updater.quitAndInstall(...args)
        await vi.waitFor(() => expect(quits).toEqual([...quit, ...quit]))
        expect(native.quitAndInstall).not.toHaveBeenCalled()
        expect(native.checkForUpdates).toHaveBeenCalledTimes(1)
      } finally {
        feed.close()
      }
    }
  )

  test("a quitAndInstall() from the before-quit of its own quit is ignored instead of looping", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)
      updater.autoRunAppAfterInstall = false
      await checkAndDownload(updater)
      // Electron emits before-quit synchronously in app.quit(): the app cancels the quit there and asks for the install again (bounded, so
      // that a regression fails instead of hanging)
      const quit = vi.spyOn(adapter, "quit").mockImplementation(() => {
        if (quit.mock.calls.length < 5) {
          updater.quitAndInstall()
        }
      })

      updater.quitAndInstall()
      await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))
      await new Promise(resolve => setImmediate(resolve))
      expect(quit).toHaveBeenCalledTimes(1)
      // the quit was cancelled: a later call quits again
      updater.quitAndInstall()
      await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(2))
      await new Promise(resolve => setImmediate(resolve))
      expect(quit).toHaveBeenCalledTimes(2)
    } finally {
      feed.close()
    }
  })

  test.for<[string, Parameters<MsixUpdater["quitAndInstall"]>]>([
    ["quitAndInstall({ isSilent: true, isForceRunAfter: true })", [{ isSilent: true, isForceRunAfter: true }]],
    ["the legacy quitAndInstall(true, true)", [true, true]],
  ])("%s installs the staged update now, whatever autoRunAppAfterInstall", async ([, args], { expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      const { updater, adapter } = await createActiveMsixUpdater(native, feed.url)
      updater.autoRunAppAfterInstall = false
      const quit = vi.spyOn(adapter, "quit")
      const beforeQuitForUpdate = vi.fn()
      native.on("before-quit-for-update", beforeQuitForUpdate)
      await checkAndDownload(updater)

      updater.quitAndInstall(...args)
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(1))
      expect(quit).not.toHaveBeenCalled()
      // the native quitAndInstall emits it
      expect(beforeQuitForUpdate).not.toHaveBeenCalled()
    } finally {
      feed.close()
    }
  })

  test("quitAndInstall installs the update that the download staged, once", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      await checkAndDownload(updater)

      updater.quitAndInstall()
      updater.quitAndInstall()
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalled())
      await new Promise(resolve => setImmediate(resolve))
      expect(native.quitAndInstall).toHaveBeenCalledTimes(1)
      // not staged again
      expect(native.setFeedURL).toHaveBeenCalledTimes(1)
      expect(native.checkForUpdates).toHaveBeenCalledTimes(1)
    } finally {
      feed.close()
    }
  })

  test("a native error during the install is one updater error, also once the native install ends, after which quitAndInstall can be called again", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      let endNativeInstall!: () => void
      native.quitAndInstall.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            endNativeInstall = resolve
          })
      )
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      await checkAndDownload(updater)
      const errors: Array<Error> = []
      updater.on("error", error => errors.push(error))

      updater.quitAndInstall()
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(1))
      native.emit("error", new Error(NATIVE_ERROR))
      expect(errors).toEqual([expect.objectContaining({ code: "ERR_UPDATER_MSIX_INSTALL_FAILED", message: expect.stringContaining(NATIVE_ERROR) })])
      endNativeInstall()
      await new Promise(resolve => setImmediate(resolve))
      expect(errors).toHaveLength(1)

      updater.quitAndInstall()
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(2))
    } finally {
      feed.close()
    }
  })

  test("a native install that ends while the app runs is an updater error, after which quitAndInstall can be called again", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      // Windows shuts the app down to register the update: an install that ends without an error did not register it, e.g. it failed or was deferred
      native.quitAndInstall.mockResolvedValueOnce(undefined)
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      await checkAndDownload(updater)
      const errors: Array<Error> = []
      updater.on("error", error => errors.push(error))

      updater.quitAndInstall()
      await vi.waitFor(() => expect(errors).toHaveLength(1))
      await new Promise(resolve => setImmediate(resolve))
      expect(errors).toEqual([expect.objectContaining({ code: "ERR_UPDATER_MSIX_INSTALL_FAILED", message: expect.stringContaining("installs it when the app is launched next") })])

      updater.quitAndInstall()
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(2))
    } finally {
      feed.close()
    }
  })

  test("the end of an earlier native install does not end the install that a retry started", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      let endFirstNativeInstall!: () => void
      native.quitAndInstall.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            endFirstNativeInstall = resolve
          })
      )
      const { updater } = await createActiveMsixUpdater(native, feed.url)
      await checkAndDownload(updater)
      const errors: Array<Error> = []
      // an app that retries the install once from its error handler
      updater.on("error", error => {
        errors.push(error)
        if (errors.length === 1) {
          updater.quitAndInstall()
        }
      })

      updater.quitAndInstall()
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(1))
      native.emit("error", new Error(NATIVE_ERROR))
      await vi.waitFor(() => expect(native.quitAndInstall).toHaveBeenCalledTimes(2))
      endFirstNativeInstall()
      await new Promise(resolve => setImmediate(resolve))
      // only the failure of the first install is reported: the retry is still in progress
      expect(errors).toEqual([expect.objectContaining({ code: "ERR_UPDATER_MSIX_INSTALL_FAILED" })])
      updater.quitAndInstall()
      await new Promise(resolve => setImmediate(resolve))
      expect(native.quitAndInstall).toHaveBeenCalledTimes(2)
    } finally {
      feed.close()
    }
  })

  test("quitAndInstall without a downloaded update is an error", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    const { updater, adapter } = await createActiveMsixUpdater(native)
    const quit = vi.spyOn(adapter, "quit")
    const events = trackEvents(updater)

    updater.quitAndInstall()
    expect(events).toEqual(["error"])
    expect(native.setFeedURL).not.toHaveBeenCalled()
    expect(native.quitAndInstall).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })

  test("stages one bundle at a time: the same bundle shares the staging in progress, another one waits for it", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    const { updater, adapter } = await createActiveMsixUpdater(native)
    const stage = (name: string, sha512: string): Promise<void> => (updater as any).stage(path.join(adapter.baseCachePath, name), sha512)

    const first = stage("A.msixbundle", "a")
    expect(stage("A.msixbundle", "a")).toBe(first)
    const other = stage("B.msixbundle", "b")
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1)
    await Promise.all([first, other])
    expect(native.setFeedURL.mock.calls.map(([{ url }]) => path.basename(fileURLToPath(url)))).toEqual(["A.msixbundle", "B.msixbundle"])
    // staged already
    await stage("B.msixbundle", "b")
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  test("staging fails when Electron gives no result within 10 minutes", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    native.outcomes.push([])
    const { updater, adapter } = await createActiveMsixUpdater(native)
    vi.useFakeTimers()

    const staging: Promise<void> = (updater as any).stage(path.join(adapter.baseCachePath, BUNDLE_NAME), BUNDLE_SHA512)
    let isSettled = false
    const settle = () => {
      isSettled = true
    }
    staging.then(settle, settle)
    expect(native.listenerCount("update-downloaded")).toBe(1)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 - 1)
    expect(isSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(staging).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED", message: expect.stringContaining("no result within 10 minutes") })
    // the native operation may still be running: its outcome is awaited, and ends it
    expect(native.listenerCount("update-downloaded")).toBe(1)
    native.emit("update-not-available")
    expect(native.listenerCount("update-downloaded")).toBe(0)
    expect(native.listenerCount("update-not-available")).toBe(0)
  })

  test("a staging that timed out keeps the native updater until it reports: another bundle is refused meanwhile, and a late result counts", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    native.outcomes.push([])
    const { updater, adapter } = await createActiveMsixUpdater(native)
    const stage = (name: string, sha512: string): Promise<void> => (updater as any).stage(path.join(adapter.baseCachePath, name), sha512)
    vi.useFakeTimers()

    const first = stage("A.msixbundle", "a")
    // chained behind A, so it runs once A timed out
    const queued = stage("B.msixbundle", "b")
    const firstResult = expect(first).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED", message: expect.stringContaining("no result within 10 minutes") })
    const queuedResult = expect(queued).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED", message: expect.stringContaining("still staging") })
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    await firstResult
    await queuedResult
    await expect(stage("B.msixbundle", "b")).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED", message: expect.stringContaining("A.msixbundle") })
    // the feed URL of the running operation was not replaced
    expect(native.setFeedURL).toHaveBeenCalledTimes(1)

    // Windows staged A after all
    native.emit("update-downloaded")
    expect(native.listenerCount("update-downloaded")).toBe(0)
    await stage("A.msixbundle", "a")
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
    await stage("B.msixbundle", "b")
    expect(native.setFeedURL.mock.calls.map(([{ url }]) => path.basename(fileURLToPath(url)))).toEqual(["A.msixbundle", "B.msixbundle"])
  })

  test("a native error after the staging timed out ends the native operation without an updater error", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    native.outcomes.push([])
    const { updater, adapter } = await createActiveMsixUpdater(native)
    const errors: Array<Error> = []
    updater.on("error", error => errors.push(error))
    const stage = (name: string, sha512: string): Promise<void> => (updater as any).stage(path.join(adapter.baseCachePath, name), sha512)
    vi.useFakeTimers()

    const staging = expect(stage("A.msixbundle", "a")).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_STAGING_FAILED" })
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    await staging
    native.emit("error", new Error(NATIVE_ERROR))
    expect(errors).toEqual([])
    vi.useRealTimers()
    // staged again, not taken as staged
    await stage("A.msixbundle", "a")
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  test("a rejection of the native checkForUpdates that is not an Error fails the staging with its text", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    native.checkForUpdates.mockImplementationOnce(() => Promise.reject("AddPackageByUriAsync failed") as any)
    const { updater, adapter } = await createActiveMsixUpdater(native)

    await expect((updater as any).stage(path.join(adapter.baseCachePath, BUNDLE_NAME), BUNDLE_SHA512)).rejects.toMatchObject({
      code: "ERR_UPDATER_MSIX_STAGING_FAILED",
      message: expect.stringContaining("AddPackageByUriAsync failed"),
    })
    expect(native.listenerCount("update-downloaded")).toBe(0)
  })

  test("a download without MSIX package info fails with ERR_UPDATER_MSIX_INACTIVE", async ({ expect, tmpDir }) => {
    const feed = await serveMsixUpdate(tmpDir)
    try {
      const native = new TestMsixNativeUpdater()
      vi.spyOn(native, "getPackageInfo").mockReturnValue(undefined as any)
      const { updater } = await createActiveMsixUpdater(native, feed.url)

      await expect(checkAndDownload(updater)).rejects.toMatchObject({ code: "ERR_UPDATER_MSIX_INACTIVE" })
      expect(feed.requests).toEqual(["/latest-msix.yml"])
      expect(native.setFeedURL).not.toHaveBeenCalled()
    } finally {
      feed.close()
    }
  })

  test("is inactive outside an MSIX package: checkForUpdates resolves null without a native listener, and logs why once", async ({ expect }) => {
    const native = new TestMsixNativeUpdater()
    // TestAppAdapter is packaged: only the check of MsixUpdater applies, which finds no resources/package-type outside Electron
    const { updater } = await createMsixUpdater(native)
    const infos: Array<string> = []
    updater.logger = { info: (message: string) => infos.push(message), warn() {}, error() {} }

    await expect(updater.checkForUpdates()).resolves.toBeNull()
    await expect(updater.checkForUpdates()).resolves.toBeNull()
    expect(infos.filter(it => it.startsWith("MSIX auto-update is inactive"))).toEqual([expect.stringContaining('resources/package-type is null, not "msix"')])
    expect(native.listenerCount("error")).toBe(0)
    expect(native.listenerCount("update-downloaded")).toBe(0)
    expect(native.checkForUpdates).not.toHaveBeenCalled()
  })
})
