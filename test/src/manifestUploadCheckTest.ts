import { Packager, PublishManager } from "app-builder-lib"
import { checkUpdateManifestBeforeUpload } from "app-builder-lib/internal"
import { createUpdateManifestSignatures, generateUpdateSigningKeypair, InvalidConfigurationError, log, parsePrivateKey, serializeToYaml } from "builder-util"
import { createUploadTasks, publishPackageWithTasks } from "electron-builder/src/publish"
import { mkdir, readFile, writeFile } from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// `electron-builder publish -f` checks update manifests before it uploads anything

const keyA = generateUpdateSigningKeypair()
const keyB = generateUpdateSigningKeypair()

beforeEach(() => {
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function write(file: string, content: string): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

/** A manifest the way updateInfoBuilder writes it, signed by `signWith` (unsigned when empty). */
function manifest(signWith: Array<string> = [keyA.privateKeyPem]): string {
  const info: any = { version: "1.0.0", files: [{ url: "My-1.0.0.AppImage", sha512: "AAAA", size: 8 }], releaseDate: "2026-10-25T00:00:00.000Z" }
  if (signWith.length === 0) {
    return serializeToYaml(info, false, true)
  }
  const signatures = createUpdateManifestSignatures(info, signWith.map(parsePrivateKey))
  return serializeToYaml({ ...info, signature: signatures[0].signature, signatures }, false, true)
}

const check = (file: string, config: any = {}) => checkUpdateManifestBeforeUpload(file, config)
const errorOf = (promise: Promise<unknown>): Promise<any> =>
  promise.then(
    () => null,
    (e: unknown) => e
  )

describe("checkUpdateManifestBeforeUpload", () => {
  test("checks only update manifests", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "manifest-upload" })
    // none of these is an update manifest, so none is refused although none is signed
    for (const [name, content] of [
      ["My-1.0.0.AppImage", "binary"],
      ["app-update.yml", "provider: generic\nurl: https://example.com\n"],
      ["notes.yml", "title: release notes\n"],
      ["broken.yml", "files: [unclosed\n"],
    ]) {
      await expect(check(await write(path.join(dir, name), content))).resolves.toBeUndefined()
    }
  })

  test("refuses an unsigned manifest, unless updateManifest is false (also at the platform level)", async ({ expect, tmpDir }) => {
    const file = await write(path.join(await tmpDir.getTempDir({ prefix: "manifest-upload" }), "latest-linux.yml"), manifest([]))
    const error = await errorOf(check(file, { updateManifest: { publicKey: keyA.publicKeyPem } }))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("is an unsigned update manifest")
    expect(error.message).toContain("updateManifest: false")
    await expect(check(file, { updateManifest: false })).resolves.toBeUndefined()
    await expect(check(file, { linux: { updateManifest: false } })).resolves.toBeUndefined()
    // another platform's opt-out does not apply
    await expect(check(file, { mac: { updateManifest: false } })).rejects.toThrow("is an unsigned update manifest")
  })

  test("accepts the legacy single signature field, as electron-updater does, and treats a malformed list as no signatures", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "manifest-upload" })
    const signed: any = load(manifest())
    const legacyOnly = await write(path.join(dir, "latest.yml"), serializeToYaml({ ...signed, signatures: undefined }, false, true))
    await expect(check(legacyOnly, { updateManifest: { publicKey: keyA.publicKeyPem } })).resolves.toBeUndefined()
    const malformed = await write(path.join(dir, "beta.yml"), serializeToYaml({ ...signed, signature: undefined, signatures: 42 }, false, true))
    await expect(check(malformed, { updateManifest: { publicKey: keyA.publicKeyPem } })).rejects.toThrow("is an unsigned update manifest")
  })

  test("verifies the manifest against updateManifest.publicKey", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "manifest-upload" })
    const file = await write(path.join(dir, "latest.yml"), manifest())
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    await check(file, { updateManifest: { publicKey: [keyB.publicKeyPem, keyA.publicKeyPem] } })
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ keyId: expect.any(String) }), "update manifest verified before upload")

    // signed by a key the trust list does not have
    const error = await errorOf(check(file, { win: { updateManifest: { publicKey: keyB.publicKeyPem } } }))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("is not signed by a key of updateManifest.publicKey")
    expect(error.message).toContain("Nothing was uploaded")

    // changed after it was signed
    const tampered = await write(path.join(dir, "beta.yml"), (await readFile(file, "utf8")).replace("version: 1.0.0", "version: 9.9.9"))
    await expect(check(tampered, { updateManifest: { publicKey: keyA.publicKeyPem } })).rejects.toThrow("is not signed by a key of updateManifest.publicKey")
  })

  test("a cutover release signed outside the trust list is uploaded with a warning when allowSigningKeyOutsideTrustList is set", async ({ expect, tmpDir }) => {
    const file = await write(path.join(await tmpDir.getTempDir({ prefix: "manifest-upload" }), "latest-mac.yml"), manifest())
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await check(file, { mac: { updateManifest: { publicKey: keyB.publicKeyPem, allowSigningKeyOutsideTrustList: true } } })
    expect(warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("allowSigningKeyOutsideTrustList allows for a cutover release"))
  })

  test("without updateManifest.publicKey a signed manifest is uploaded with a warning, and refused under forceCodeSigning", async ({ expect, tmpDir }) => {
    const file = await write(path.join(await tmpDir.getTempDir({ prefix: "manifest-upload" }), "latest-linux.yml"), manifest())
    // the signing key where a build would find it: never used as a trust list
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(keyA.privateKeyPem).toString("base64"))
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await check(file, {})
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining("updateManifest.publicKey is not set") }),
      "update manifest not verified before upload"
    )

    for (const config of [{ forceCodeSigning: true }, { linux: { forceCodeSigning: true } }]) {
      const error = await errorOf(check(file, config))
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error.message).toContain("forceCodeSigning is enabled, but updateManifest.publicKey is not set")
    }
    // the platform value wins over the root one
    await expect(check(file, { forceCodeSigning: true, linux: { forceCodeSigning: false } })).resolves.toBeUndefined()
  })
})

describe("electron-builder publish", () => {
  test("refuses a manifest that fails the check before anything is uploaded", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "manifest-upload-project" })
    await write(path.join(projectDir, "package.json"), JSON.stringify({ name: "upload-test", version: "1.0.0", description: "test", author: "test" }))
    const artifact = await write(path.join(projectDir, "dist", "My-1.0.0.AppImage"), "AppImage")
    const unsigned = await write(path.join(projectDir, "dist", "latest-linux.yml"), manifest([]))
    const scheduleUpload = vi.spyOn(PublishManager.prototype, "scheduleUpload")
    const options = { projectDir, config: { publish: { provider: "generic", url: "https://example.com/updates" } } } as any
    const tasks = createUploadTasks([
      { file: artifact, arch: null },
      { file: unsigned, arch: null },
    ])
    await expect(publishPackageWithTasks(options, tasks, undefined, undefined, new Packager(options))).rejects.toThrow("is an unsigned update manifest")
    expect(scheduleUpload).not.toHaveBeenCalled()
  })
})
