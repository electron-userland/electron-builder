import { describe, expect, it, vi } from "vitest"
import { DebUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import { resolveFiles } from "electron-updater/src/providers/Provider"
import { computeUpdateManifestKeyId } from "builder-util-runtime"
import { createUpdateManifestSignatures, generateUpdateSigningKeypair, signUpdateManifest } from "builder-util"

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

/** Returns a copy of `info` carrying a valid signature for `privateKeyPem` (UpdateInfo.signature is readonly). */
function signed(info: UpdateInfo, privateKeyPem: string): UpdateInfo {
  return { ...info, signature: signUpdateManifest(info, privateKeyPem) }
}

/** Returns a copy of `info` signed by every key, the way updateInfoBuilder writes it (`signatures` + legacy `signature`). */
function multiSigned(info: UpdateInfo, privateKeyPems: Array<string>): UpdateInfo {
  const signatures = createUpdateManifestSignatures(info, privateKeyPems)
  return { ...info, signature: signatures[0].signature, signatures }
}

// verifyManifestSignature is a private method on AppUpdater; DebUpdater is a concrete subclass.
// The runtime property updateManifestPublicKey takes precedence over app-update.yml, so we set it directly.
// Each test builds its own updater instance — tests in this suite run concurrently, so a shared
// instance reassigned in beforeEach would race on the mutable `updateManifestPublicKey`.
describe("AppUpdater.verifyManifestSignature (A1)", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  const makeUpdater = (publicKey: string | Array<string> | null) => {
    const updater = new DebUpdater(null, stubApp)
    updater.updateManifestPublicKey = publicKey
    return updater
  }
  const verify = (updater: DebUpdater, info: UpdateInfo) => (updater as any).verifyManifestSignature(info)

  it("passes a correctly signed manifest", async () => {
    const updater = makeUpdater(publicKeyPem)
    const info = signed(makeInfo(), privateKeyPem)
    await expect(verify(updater, info)).resolves.toBeUndefined()
  })

  it("throws ERR_UPDATER_MANIFEST_SIGNATURE_INVALID when sha512 is tampered after signing", async () => {
    const updater = makeUpdater(publicKeyPem)
    const info = signed(makeInfo(), privateKeyPem)
    const tampered: UpdateInfo = { ...info, files: [{ ...info.files[0], sha512: "tampered" }] }
    await expect(verify(updater, tampered)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
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
    const info = signed(makeInfo(), privateKeyPem)
    await expect(verify(updater, info)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  // ── trust lists + multi-signature manifests (key rotation) ──

  it("accepts a dual-signed manifest when the install trusts only the OLD key", async () => {
    const newKey = generateUpdateSigningKeypair()
    const updater = makeUpdater(publicKeyPem)
    // own logger instance: the default is the global console, which must not be mutated by a concurrent test
    const debugSpy = vi.fn()
    updater.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: debugSpy }
    const info = multiSigned(makeInfo(), [privateKeyPem, newKey.privateKeyPem])
    await expect(verify(updater, info)).resolves.toBeUndefined()
    expect(debugSpy.mock.calls.some(c => String(c[0]).includes(computeUpdateManifestKeyId(publicKeyPem)))).toBe(true)
  })

  it("accepts a dual-signed manifest when the install trusts only the NEW key", async () => {
    const newKey = generateUpdateSigningKeypair()
    const updater = makeUpdater(newKey.publicKeyPem)
    const info = multiSigned(makeInfo(), [privateKeyPem, newKey.privateKeyPem])
    await expect(verify(updater, info)).resolves.toBeUndefined()
  })

  it("accepts a legacy single-signature manifest when the install trusts a LIST containing the signer", async () => {
    const nextKey = generateUpdateSigningKeypair()
    const updater = makeUpdater([nextKey.publicKeyPem, publicKeyPem])
    const info = signed(makeInfo(), privateKeyPem)
    expect(info.signatures).toBeUndefined()
    await expect(verify(updater, info)).resolves.toBeUndefined()
  })

  it("accepts a manifest signed only by the NEXT key once the install trusts [current, next]", async () => {
    const nextKey = generateUpdateSigningKeypair()
    const updater = makeUpdater([publicKeyPem, nextKey.publicKeyPem])
    const info = multiSigned(makeInfo(), [nextKey.privateKeyPem])
    await expect(verify(updater, info)).resolves.toBeUndefined()
  })

  it("rejects a dual-signed manifest when none of the trusted keys signed it (fail-closed)", async () => {
    const updater = makeUpdater([generateUpdateSigningKeypair().publicKeyPem, generateUpdateSigningKeypair().publicKeyPem])
    const info = multiSigned(makeInfo(), [privateKeyPem, generateUpdateSigningKeypair().privateKeyPem])
    await expect(verify(updater, info)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  it("rejects a manifest whose `signatures` entries are all tampered even when a trust list is configured", async () => {
    const newKey = generateUpdateSigningKeypair()
    const updater = makeUpdater([publicKeyPem, newKey.publicKeyPem])
    const info = multiSigned(makeInfo(), [privateKeyPem, newKey.privateKeyPem])
    const tampered: UpdateInfo = { ...info, version: "9.9.9" }
    await expect(verify(updater, tampered)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  it("throws ERR_UPDATER_MANIFEST_NOT_SIGNED for an unsigned manifest when a trust list is configured", async () => {
    const updater = makeUpdater([publicKeyPem, generateUpdateSigningKeypair().publicKeyPem])
    await expect(verify(updater, makeInfo())).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_NOT_SIGNED" })
    await expect(verify(updater, { ...makeInfo(), signatures: [] })).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_NOT_SIGNED" })
  })

  it("treats an empty runtime trust list like no runtime override (falls back to config, here: none)", async () => {
    const updater = makeUpdater([])
    await expect(verify(updater, makeInfo())).resolves.toBeUndefined()
  })
})

// ── minimumSystemVersion + NSIS web-installer packages, end to end through AppUpdater ──

/** A web-installer manifest as written by updateInfoBuilder: raw basenames in `files[].url` and `packages[arch].path`. */
function makeWebInfo(): WindowsUpdateInfo {
  return {
    ...makeInfo(),
    minimumSystemVersion: "10.0.19041",
    packages: {
      x64: { path: "App-2.0.0-x64.nsis.7z", sha512: "p64", size: 5000, blockMapSize: 120, isAdminRightsRequired: true },
      ia32: { path: "App-2.0.0-ia32.nsis.7z", sha512: "p32", size: 4000 },
    },
  }
}

describe("AppUpdater.verifyManifestSignature: minimumSystemVersion and packages", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  const makeUpdater = () => {
    const updater = new DebUpdater(null, stubApp)
    updater.updateManifestPublicKey = publicKeyPem
    return updater
  }
  const verify = (updater: DebUpdater, info: UpdateInfo) => (updater as any).verifyManifestSignature(info)

  it("passes a correctly signed web-installer manifest", async () => {
    await expect(verify(makeUpdater(), signed(makeWebInfo(), privateKeyPem))).resolves.toBeUndefined()
  })

  it("throws ERR_UPDATER_MANIFEST_SIGNATURE_INVALID when a package's sha512 or path is tampered", async () => {
    const info = signed(makeWebInfo(), privateKeyPem) as WindowsUpdateInfo
    const shaTampered: WindowsUpdateInfo = { ...info, packages: { ...info.packages, x64: { ...info.packages!.x64, sha512: "tampered" } } }
    await expect(verify(makeUpdater(), shaTampered)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
    const pathTampered: WindowsUpdateInfo = { ...info, packages: { ...info.packages, x64: { ...info.packages!.x64, path: "evil.nsis.7z" } } }
    await expect(verify(makeUpdater(), pathTampered)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  it("throws ERR_UPDATER_MANIFEST_SIGNATURE_INVALID when minimumSystemVersion is changed or removed", async () => {
    const info = signed(makeWebInfo(), privateKeyPem)
    await expect(verify(makeUpdater(), { ...info, minimumSystemVersion: "6.1.7601" })).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
    const { minimumSystemVersion: _dropped, ...removed } = info
    await expect(verify(makeUpdater(), removed)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  it("verifies against the raw manifest: Provider.resolveFiles does not mutate `files`/`packages`, so verification passes before and after it", async () => {
    const info = signed(makeWebInfo(), privateKeyPem) as WindowsUpdateInfo
    const updater = makeUpdater()
    // getUpdateInfoAndProvider verifies right after getLatestVersion(), before any provider resolves URLs
    await expect(verify(updater, info)).resolves.toBeUndefined()
    const resolved = resolveFiles(info, new URL("https://example.com/feed/"))
    // resolveFiles copies packageInfo into a new object with an absolute URL...
    expect((resolved[0] as any).packageInfo.path).toBe("https://example.com/feed/App-2.0.0-x64.nsis.7z")
    expect(resolved[0].url.href).toBe("https://example.com/feed/App-2.0.0.exe")
    // ...and leaves the parsed manifest untouched, so the signed payload is the same on both sides
    expect(info.packages!.x64.path).toBe("App-2.0.0-x64.nsis.7z")
    expect(info.files[0].url).toBe("App-2.0.0.exe")
    await expect(verify(updater, info)).resolves.toBeUndefined()
  })
})
