import { describe, expect, it, vi } from "vitest"
import { DebUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { UpdateInfo } from "builder-util-runtime"
import { generateUpdateSigningKeypair, signUpdateManifest } from "builder-util"

const stubApp: AppAdapter = {
  name: "TestApp",
  version: "1.0.0",
  isPackaged: false,
  appUpdateConfigPath: "/tmp/does-not-exist-app-update.yml",
  userDataPath: "/tmp",
  baseCachePath: "/tmp",
  whenReady: () => Promise.resolve(),
  relaunch: () => {},
  quit: () => {},
  onQuit: () => {},
}

function makeInfo(): UpdateInfo {
  return {
    version: "2.0.0",
    files: [{ url: "App-2.0.0.exe", sha512: "hash", size: 100 }],
    path: "App-2.0.0.exe",
    sha512: "hash",
    releaseDate: "2026-01-01T00:00:00.000Z",
  }
}

// verifyManifestSignature is a private method on AppUpdater; DebUpdater is a concrete subclass.
// The runtime property updateManifestPublicKey takes precedence over app-update.yml, so we set it directly.
// Each test builds its own updater instance — tests in this suite run concurrently, so a shared
// instance reassigned in beforeEach would race on the mutable `updateManifestPublicKey`.
describe("AppUpdater.verifyManifestSignature (A1)", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  const makeUpdater = (publicKey: string | null) => {
    const updater = new DebUpdater(null, stubApp)
    updater.updateManifestPublicKey = publicKey
    return updater
  }
  const verify = (updater: DebUpdater, info: UpdateInfo) => (updater as any).verifyManifestSignature(info)

  it("passes a correctly signed manifest", async () => {
    const updater = makeUpdater(publicKeyPem)
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    await expect(verify(updater, info)).resolves.toBeUndefined()
  })

  it("throws ERR_UPDATER_MANIFEST_SIGNATURE_INVALID when sha512 is tampered after signing", async () => {
    const updater = makeUpdater(publicKeyPem)
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    info.files[0].sha512 = "tampered"
    await expect(verify(updater, info)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  it("throws ERR_UPDATER_MANIFEST_NOT_SIGNED when a key is configured but the manifest is unsigned", async () => {
    const updater = makeUpdater(publicKeyPem)
    await expect(verify(updater, makeInfo())).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_NOT_SIGNED" })
  })

  it("skips verification and warns once when no key is configured", async () => {
    const updater = makeUpdater(null)
    const warnSpy = vi.spyOn((updater as any)._logger, "warn")
    try {
      await expect(verify(updater, makeInfo())).resolves.toBeUndefined()
      await expect(verify(updater, makeInfo())).resolves.toBeUndefined()
      const verificationWarnings = warnSpy.mock.calls.filter(c => String(c[0]).includes("signature verification is disabled"))
      expect(verificationWarnings.length).toBe(1)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("rejects a manifest signed by a different key", async () => {
    const updater = makeUpdater(generateUpdateSigningKeypair().publicKeyPem)
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    await expect(verify(updater, info)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })
})
