import { readFileSync } from "fs"
import * as fsp from "fs/promises"
import * as path from "path"
import { KeyObject } from "crypto"
import { load as yamlLoad } from "js-yaml"
import { afterEach, vi } from "vitest"
import { Platform } from "app-builder-lib"
import { writeUpdateInfoFiles } from "app-builder-lib/internal"
import { getAppUpdatePublishConfiguration } from "app-builder-lib/src/publish/PublishManager"
import { PlatformPackager } from "app-builder-lib/src/platformPackager"
import { Arch, InvalidConfigurationError, serializeToYaml, TmpDir } from "builder-util"
import { collectManifestSignatures, computeUpdateManifestKeyId, normalizePublicKeyList, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"

// Backward compatibility of signed update manifests: the keys users already ship with must keep producing the
// same key ids, the same embedded trust lists and the same signatures, whatever form the key is handed to the builder in.
//
// The contract is test/fixtures/signed-manifest-compat/frozen-27.0.0-alpha.9.json: key pairs exactly as
// `create-update-key` writes them, plus latest*.yml (single and dual key) and app-update.yml trust lists, all produced
// by the released 27.0.0-alpha.9 signer. Every frozen manifest was verified by the released electron-updater
// 7.0.0-alpha.8..alpha.10 verifiers when the fixture was generated, so byte-identical output from the current builder
// proves installs of those updaters still verify it. Ed25519 is deterministic, so identical keys and an identical
// signed payload give identical signatures. See the fixture README for provenance and how to re-verify.

const compatDir = path.join(__dirname, "..", "..", "fixtures", "signed-manifest-compat")

interface Frozen {
  keys: Record<"old" | "new", { privateKeyFile: string; publicKeyPem: string; keyId: string }>
  unsignedManifests: Record<string, UpdateInfo>
  signedSingleKey: Record<string, string>
  signedDualKey: Record<string, string>
  appUpdateYml: Record<"single" | "dual", string>
}
const frozen: Frozen = JSON.parse(readFileSync(path.join(compatDir, "frozen-27.0.0-alpha.9.json"), "utf8"))
const { old: oldKey, new: newKey } = frozen.keys
const manifestNames = Object.keys(frozen.unsignedManifests)

// AppUpdater.verifyManifestSignature: trust list from app-update.yml's updateManifestPublicKey, refuse an unsigned
// manifest, accept when any trusted key verifies any signature
function updaterVerify(appUpdateYml: string, latestYml: string): { ok: boolean; keyId?: string; reason?: string } {
  const config = yamlLoad(appUpdateYml) as { updateManifestPublicKey?: unknown }
  const value = config.updateManifestPublicKey
  const info = yamlLoad(latestYml) as UpdateInfo
  const trusted = typeof value === "string" || Array.isArray(value) ? normalizePublicKeyList(value) : []
  if (trusted.length === 0) {
    return { ok: false, reason: "no trusted key" }
  }
  if (collectManifestSignatures(info).length === 0) {
    return { ok: false, reason: "unsigned" }
  }
  return verifyManifestSignatures(info, trusted)
}

// the real PlatformPackager key resolution (config, then env), without a full Packager
class TestPackager extends PlatformPackager<any> {
  constructor(config: any, projectDir?: string) {
    super({ config, projectDir } as any, Platform.LINUX)
  }
  protected override prepareAppInfo(): any {
    return null
  }
  get defaultTarget(): Array<string> {
    return []
  }
  createTargets(): void {
    // not used
  }
}

function stubSigningEnv(key: string | undefined, file: string | undefined) {
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", key)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", file)
}
afterEach(() => {
  vi.unstubAllEnvs()
})

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64")
const crlf = (text: string) => text.replace(/\r?\n/g, "\r\n")
const wrap76 = (value: string, eol: string) => `${(value.match(/.{1,76}/g) ?? []).join(eol)}${eol}`

interface InputFormat {
  name: string
  keys: "single" | "dual"
  setup(dir: string): Promise<{ config: any }>
}

async function writeKeyFiles(dir: string, files: Record<string, string>) {
  await fsp.mkdir(path.join(dir, "keys"), { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await fsp.writeFile(path.join(dir, "keys", name), content)
  }
}

// every accepted way to hand the same key(s) to the builder
const inputFormats: Array<InputFormat> = [
  {
    name: "updateManifest.signingKey PEM string",
    keys: "single",
    setup: () =>
      Promise.resolve({
        config: { updateManifest: { signingKey: oldKey.privateKeyFile } },
      }),
  },
  {
    name: "updateManifest.signingKey PEM string, CRLF",
    keys: "single",
    setup: () =>
      Promise.resolve({
        config: { updateManifest: { signingKey: crlf(oldKey.privateKeyFile) } },
      }),
  },
  {
    name: "updateManifest.signingKey concatenated PEM bundle",
    keys: "dual",
    setup: () =>
      Promise.resolve({
        config: {
          updateManifest: {
            signingKey: oldKey.privateKeyFile + newKey.privateKeyFile,
          },
        },
      }),
  },
  {
    name: "updateManifest.signingKey array",
    keys: "dual",
    setup: () =>
      Promise.resolve({
        config: {
          updateManifest: {
            signingKey: [oldKey.privateKeyFile, newKey.privateKeyFile],
          },
        },
      }),
  },
  {
    name: "updateManifest.signingKeyFile relative path",
    keys: "single",
    setup: async dir => {
      await writeKeyFiles(dir, { "old.pem": oldKey.privateKeyFile })
      return { config: { updateManifest: { signingKeyFile: "keys/old.pem" } } }
    },
  },
  {
    name: "updateManifest.signingKeyFile array",
    keys: "dual",
    setup: async dir => {
      await writeKeyFiles(dir, {
        "old.pem": oldKey.privateKeyFile,
        "new.pem": newKey.privateKeyFile,
      })
      return {
        config: {
          updateManifest: {
            signingKeyFile: ["keys/old.pem", path.join(dir, "keys", "new.pem")],
          },
        },
      }
    },
  },
  {
    name: "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE single path",
    keys: "single",
    setup: async dir => {
      await writeKeyFiles(dir, { "old.pem": oldKey.privateKeyFile })
      stubSigningEnv(undefined, path.join(dir, "keys", "old.pem"))
      return { config: {} }
    },
  },
  {
    name: "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE delimiter-joined paths",
    keys: "dual",
    setup: async dir => {
      await writeKeyFiles(dir, {
        "old.pem": oldKey.privateKeyFile,
        "new.pem": newKey.privateKeyFile,
      })
      stubSigningEnv(undefined, [path.join(dir, "keys", "old.pem"), path.join(dir, "keys", "new.pem")].join(path.delimiter))
      return { config: {} }
    },
  },
  {
    name: "ELECTRON_BUILDER_UPDATE_SIGN_KEY base64 of the key file",
    keys: "single",
    setup: () => {
      stubSigningEnv(b64(oldKey.privateKeyFile), undefined)
      return Promise.resolve({ config: {} })
    },
  },
  {
    name: "ELECTRON_BUILDER_UPDATE_SIGN_KEY base64, line-wrapped (`base64` without tr)",
    keys: "single",
    setup: () => {
      stubSigningEnv(wrap76(b64(oldKey.privateKeyFile), "\n"), undefined)
      return Promise.resolve({ config: {} })
    },
  },
  {
    name: "ELECTRON_BUILDER_UPDATE_SIGN_KEY base64 of a CRLF key file (PowerShell on a Windows checkout)",
    keys: "single",
    setup: () => {
      stubSigningEnv(b64(crlf(oldKey.privateKeyFile)), undefined)
      return Promise.resolve({ config: {} })
    },
  },
  {
    name: "ELECTRON_BUILDER_UPDATE_SIGN_KEY base64 of `cat old.pem new.pem`",
    keys: "dual",
    setup: () => {
      stubSigningEnv(b64(oldKey.privateKeyFile + newKey.privateKeyFile), undefined)
      return Promise.resolve({ config: {} })
    },
  },
]

async function signWithCurrentBuilder(tmpDir: TmpDir, keys: Array<KeyObject>, name: string): Promise<string> {
  const dir = await tmpDir.getTempDir({ prefix: "signed-manifest-compat-out" })
  const file = path.join(dir, name)
  const signingPackager = {
    updateSigningKeys: { value: Promise.resolve(keys) },
    requireUpdateSigningKeys: () => Promise.resolve(keys),
  }
  const task = {
    file,
    info: structuredClone(frozen.unsignedManifests[name]),
    publishConfiguration: {
      provider: "generic",
      url: "https://example.com/updates",
    },
    packager: signingPackager,
    arch: null,
  }
  await writeUpdateInfoFiles([task as any], {
    emitArtifactCreated: () => Promise.resolve(),
  } as any)
  return fsp.readFile(file, "utf8")
}

async function appUpdateYmlFromCurrentBuilder(keys: Array<KeyObject>): Promise<string> {
  const packager = {
    platform: Platform.LINUX,
    platformOptions: {},
    updateManifestOptions: null,
    config: {
      publish: { provider: "generic", url: "https://example.com/updates" },
    },
    appInfo: {
      updaterCacheDirName: "app-updater",
      channel: null,
      version: "1.2.3",
    },
    expandMacro: (value: string) => value,
    updateSigningKeys: { value: Promise.resolve(keys) },
    requireUpdateSigningKeys: () => Promise.resolve(keys),
  }
  return serializeToYaml(await getAppUpdatePublishConfiguration(packager as any, null, Arch.x64, false))
}

const signaturesOf = (yml: string) => {
  const info = yamlLoad(yml) as UpdateInfo
  return { signature: info.signature, signatures: info.signatures }
}

// MemoLazy runs its creator synchronously on first access, so resolve inside an async function to observe a rejection
const resolveKeys = async (config: any, projectDir: string) => await new TestPackager(config, projectDir).updateSigningKeys.value

const feedYml = (updateManifestPublicKey: string | Array<string>) =>
  serializeToYaml({
    provider: "generic",
    url: "https://example.com/updates",
    updateManifestPublicKey,
  })

describe.each(inputFormats)("$name", format => {
  test("produces the frozen key ids, trust list and signatures byte for byte", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({
      prefix: "signed-manifest-compat-project",
    })
    const { config } = await format.setup(projectDir)
    const keys = await resolveKeys(config, projectDir)

    const expectedIds = format.keys === "single" ? [oldKey.keyId] : [oldKey.keyId, newKey.keyId]
    expect(keys.map(key => computeUpdateManifestKeyId(key))).toEqual(expectedIds)

    // app-update.yml: the same updateManifestPublicKey value the released builder embedded (plain string for one key, list for several)
    const appUpdateYml = await appUpdateYmlFromCurrentBuilder(keys)
    const frozenAppUpdate = yamlLoad(frozen.appUpdateYml[format.keys]) as {
      updateManifestPublicKey: unknown
    }
    expect((yamlLoad(appUpdateYml) as { updateManifestPublicKey: unknown }).updateManifestPublicKey).toEqual(frozenAppUpdate.updateManifestPublicKey)

    for (const name of manifestNames) {
      const yml = await signWithCurrentBuilder(tmpDir, keys, name)
      const frozenYml = (format.keys === "single" ? frozen.signedSingleKey : frozen.signedDualKey)[name]
      expect(signaturesOf(yml), name).toEqual(signaturesOf(frozenYml))
      // and the current updater accepts it with the trust list this build embeds
      expect(updaterVerify(appUpdateYml, yml), name).toMatchObject({
        ok: true,
        keyId: oldKey.keyId,
      })
    }
  })
})

test("raw PEM in ELECTRON_BUILDER_UPDATE_SIGN_KEY is rejected without echoing the key", async ({ expect, tmpDir }) => {
  const projectDir = await tmpDir.getTempDir({
    prefix: "signed-manifest-compat-raw",
  })
  for (const value of [oldKey.privateKeyFile, oldKey.privateKeyFile + newKey.privateKeyFile]) {
    stubSigningEnv(value, undefined)
    const error = await resolveKeys({}, projectDir).then(
      () => null,
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(String(error)).toContain("holds PEM text")
    for (const key of [oldKey, newKey]) {
      expect(String(error)).not.toContain(key.privateKeyFile.split("\n")[1])
    }
  }
})

test("the current updater verifies the frozen manifests with every frozen trust list form", async ({ expect }) => {
  const spkiBase64 = (pem: string) => pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")
  const trustLists: Array<[string, string]> = [
    ["frozen single-key app-update.yml", frozen.appUpdateYml.single],
    ["frozen dual-key app-update.yml", frozen.appUpdateYml.dual],
    // an explicit updateManifest.publicKey is embedded as-is, so a raw base64 SPKI value may be what an install holds
    ["explicit base64 SPKI publicKey", feedYml(spkiBase64(oldKey.publicKeyPem))],
    ["explicit [old, new] PEM list", feedYml([oldKey.publicKeyPem, newKey.publicKeyPem])],
  ]
  for (const name of manifestNames) {
    for (const [trust, trustYml] of trustLists) {
      for (const yml of [frozen.signedSingleKey[name], frozen.signedDualKey[name]]) {
        expect(updaterVerify(trustYml, yml), `${trust} / ${name}`).toMatchObject({ ok: true, keyId: oldKey.keyId })
      }
    }
    // installs that already moved to the new key only (after a bridge release) verify the dual-signed manifest via the second signature
    expect(updaterVerify(feedYml(newKey.publicKeyPem), frozen.signedDualKey[name]), name).toMatchObject({ ok: true, keyId: newKey.keyId })
  }
})

test("control: tampered and foreign-key manifests are rejected, so the checks above are not vacuous", async ({ expect, tmpDir }) => {
  const original = frozen.signedSingleKey["latest.yml"]
  const tampered = original.replace("size: 81234567", "size: 81234568")
  expect(tampered).not.toBe(original)
  expect(updaterVerify(frozen.appUpdateYml.single, tampered).ok).toBe(false)
  expect(updaterVerify(frozen.appUpdateYml.dual, tampered).ok).toBe(false)

  // trusting only the new key: the old-key-only manifests, frozen or freshly signed, must not verify
  const newKeyOnly = feedYml(newKey.publicKeyPem)
  const projectDir = await tmpDir.getTempDir({
    prefix: "signed-manifest-compat-control",
  })
  const currentSigned = await signWithCurrentBuilder(tmpDir, await resolveKeys({ updateManifest: { signingKey: oldKey.privateKeyFile } }, projectDir), "latest.yml")
  expect(updaterVerify(newKeyOnly, original).ok).toBe(false)
  expect(updaterVerify(newKeyOnly, currentSigned).ok).toBe(false)
})
