import * as fsp from "fs/promises"
import * as path from "path"
import { createUpdateInfoTasks, writeUpdateInfoFiles, UpdateInfoFileTask } from "app-builder-lib/internal"
import { Platform } from "app-builder-lib"
import { Arch, TmpDir } from "builder-util"
import { load as yamlLoad } from "js-yaml"
import { vi } from "vitest"
import { generateKeyPairSync, KeyObject } from "crypto"
import { derivePublicKeyPem, generateUpdateSigningKeypair, InvalidConfigurationError, loadUpdateSigningKeys, log, parsePrivateKey } from "builder-util"
import { computeUpdateManifestKeyId, verifyManifestSignature, verifyManifestSignatures } from "builder-util-runtime"
import { getAppUpdatePublishConfiguration } from "app-builder-lib/src/publish/PublishManager"
import { PlatformPackager } from "app-builder-lib/src/platformPackager"

const basePublishConfig = { provider: "s3", bucket: "test-bucket" } as const

// writeUpdateInfoFiles only needs the `updateSigningKeys` seam off the packager; resolving the keys
// from config/env is PlatformPackager's job and is covered separately below.
function makeTaskPackager(...signingKeys: Array<KeyObject>): any {
  return { updateSigningKeys: { value: Promise.resolve(signingKeys) } }
}

function makeTask(dir: string, url: string, sha512: string, arch: Arch | null, filename = "latest.yml"): UpdateInfoFileTask {
  return {
    file: path.join(dir, filename),
    info: {
      version: "1.0.0",
      files: [{ url, sha512 }],
      path: url,
      sha512,
    } as any,
    publishConfiguration: basePublishConfig as any,
    packager: makeTaskPackager(),
    arch,
  }
}

function makePackager() {
  return { emitArtifactCreated: vi.fn().mockResolvedValue(undefined) }
}

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = new TmpDir("eb-updateinfo")
  try {
    return await fn(await tmpDir.createTempDir())
  } finally {
    await tmpDir.cleanup()
  }
}

async function readYml(filePath: string): Promise<any> {
  return yamlLoad(await fsp.readFile(filePath, "utf-8"))
}

// ── NSIS multi-arch ordering (issue #9745) ──────────────────────────────────

test("universal installer is first when tasks arrive as [arm64, x64, universal]", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0.exe")
    expect(yml.path).toBe("App-1.0.0.exe")
    expect(yml.sha512).toBe("sha-universal")
  })
})

test("universal installer is first when tasks arrive as [universal, x64, arm64]", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0.exe")
    expect(yml.path).toBe("App-1.0.0.exe")
    expect(yml.sha512).toBe("sha-universal")
  })
})

test("universal installer is first when tasks arrive as [x64, universal, arm64]", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0.exe")
    expect(yml.path).toBe("App-1.0.0.exe")
    expect(yml.sha512).toBe("sha-universal")
  })
})

test("all three NSIS multi-arch installer urls are present in files array", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    // universal first, then by Arch enum value: x64 (1) before arm64 (3)
    expect(yml.files.map((f: any) => f.url)).toEqual(["App-1.0.0.exe", "App-1.0.0-x64.exe", "App-1.0.0-arm64.exe"])
  })
})

// ── macOS zip-first behavior (backward compat) ──────────────────────────────

test("zip file appears before non-zip when zip arrives after exe", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0.dmg", "sha-dmg", Arch.x64), makeTask(dir, "App-1.0.0-mac.zip", "sha-zip", null)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0-mac.zip")
    expect(yml.path).toBe("App-1.0.0-mac.zip")
    expect(yml.sha512).toBe("sha-zip")
  })
})

test("zip file remains first when it already arrives before non-zip", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0-mac.zip", "sha-zip", null), makeTask(dir, "App-1.0.0.dmg", "sha-dmg", Arch.x64)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0-mac.zip")
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

test("single installer produces one-entry files array", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files).toHaveLength(1)
    expect(yml.files[0].url).toBe("App-1.0.0-x64.exe")
    expect(yml.path).toBe("App-1.0.0-x64.exe")
  })
})

test("arch-specific only (no universal) – all entries present", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64), makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files).toHaveLength(2)
    const urls: string[] = yml.files.map((f: any) => f.url)
    expect(urls).toContain("App-1.0.0-arm64.exe")
    expect(urls).toContain("App-1.0.0-x64.exe")
  })
})

test("publishAutoUpdate: false skips writing the yml", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks: UpdateInfoFileTask[] = [
      {
        file: path.join(dir, "latest.yml"),
        info: { version: "1.0.0", files: [{ url: "App.exe", sha512: "sha" }], path: "App.exe", sha512: "sha" } as any,
        publishConfiguration: { provider: "s3", bucket: "test", publishAutoUpdate: false } as any,
        packager: {} as any,
        arch: null,
      },
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const exists = await fsp
      .access(path.join(dir, "latest.yml"))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })
})

test("releaseDate is populated when not provided", async ({ expect }) => {
  await withTmpDir(async dir => {
    const before = new Date()
    await writeUpdateInfoFiles([makeTask(dir, "App.exe", "sha", null)], makePackager() as any)
    const after = new Date()
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.releaseDate).toBeDefined()
    const written = new Date(yml.releaseDate)
    expect(written.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(written.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})

test("existing releaseDate is not overwritten", async ({ expect }) => {
  await withTmpDir(async dir => {
    const task = makeTask(dir, "App.exe", "sha", null)
    const existingDate = "2024-01-15T10:00:00.000Z"
    ;(task.info as any).releaseDate = existingDate
    await writeUpdateInfoFiles([task], makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.releaseDate).toBe(existingDate)
  })
})

test("tasks for different yml files are written independently", async ({ expect }) => {
  await withTmpDir(async dir => {
    const latestTask = makeTask(dir, "App-1.0.0.exe", "sha-latest", null, "latest.yml")
    const betaTask = {
      ...makeTask(dir, "App-1.0.0-beta.exe", "sha-beta", null, "beta.yml"),
      publishConfiguration: { provider: "s3", bucket: "other-bucket" } as any,
    }
    await writeUpdateInfoFiles([latestTask, betaTask], makePackager() as any)
    const latest = await readYml(path.join(dir, "latest.yml"))
    const beta = await readYml(path.join(dir, "beta.yml"))
    expect(latest.files[0].url).toBe("App-1.0.0.exe")
    expect(beta.files[0].url).toBe("App-1.0.0-beta.exe")
  })
})

test("emitArtifactCreated is called once per unique yml file", async ({ expect }) => {
  await withTmpDir(async dir => {
    const mockPackager = makePackager()
    const tasks = [
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null, "latest.yml"),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64, "latest.yml"),
      makeTask(dir, "App-1.0.0-beta.exe", "sha-beta", null, "beta.yml"),
    ]
    // Override beta to use a different publish config so it gets a separate key
    ;(tasks[2] as any).publishConfiguration = { provider: "s3", bucket: "beta-bucket" }
    await writeUpdateInfoFiles(tasks, mockPackager as any)
    // latest.yml (universal + x64 merged) + beta.yml = 2 writes
    expect(mockPackager.emitArtifactCreated).toHaveBeenCalledTimes(2)
  })
})

// ── A1: update manifest signing ──────────────────────────────────────────────

test("manifest is signed when the packager yields a signing key, and the signature verifies", async ({ expect }) => {
  await withTmpDir(async dir => {
    const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
    const task = { ...makeTask(dir, "App-1.0.0.exe", "sha-universal", null), packager: makeTaskPackager(parsePrivateKey(privateKeyPem)) }
    await writeUpdateInfoFiles([task], makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.signature).toBeDefined()
    expect(verifyManifestSignature(yml, publicKeyPem)).toBe(true)
  })
})

test("per-task signing: only the task whose packager yields a key is signed", async ({ expect }) => {
  await withTmpDir(async dir => {
    const { privateKeyPem } = generateUpdateSigningKeypair()
    // two distinct yml files: linux configures signing, mac does not
    const linuxTask = {
      ...makeTask(dir, "App-1.0.0.AppImage", "sha-linux", null),
      file: path.join(dir, "latest-linux.yml"),
      packager: makeTaskPackager(parsePrivateKey(privateKeyPem)),
    }
    const macTask = { ...makeTask(dir, "App-1.0.0.zip", "sha-mac", null), file: path.join(dir, "latest-mac.yml") }
    await writeUpdateInfoFiles([linuxTask, macTask], makePackager() as any)
    expect((await readYml(path.join(dir, "latest-linux.yml"))).signature).toBeDefined()
    expect((await readYml(path.join(dir, "latest-mac.yml"))).signature).toBeUndefined()
  })
})

test("single key: `signatures` carries one entry tagged with the key id and `signature` repeats it", async ({ expect }) => {
  await withTmpDir(async dir => {
    const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
    const task = { ...makeTask(dir, "App-1.0.0.exe", "sha", null), packager: makeTaskPackager(parsePrivateKey(privateKeyPem)) }
    await writeUpdateInfoFiles([task], makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.signatures).toEqual([{ keyId: computeUpdateManifestKeyId(publicKeyPem), signature: yml.signature }])
  })
})

test("dual-signing: every configured key signs, `signature` is the first key's, and each keyId matches its key", async ({ expect }) => {
  await withTmpDir(async dir => {
    const oldKey = generateUpdateSigningKeypair()
    const newKey = generateUpdateSigningKeypair()
    const task = { ...makeTask(dir, "App-1.0.0.exe", "sha", null), packager: makeTaskPackager(parsePrivateKey(oldKey.privateKeyPem), parsePrivateKey(newKey.privateKeyPem)) }
    await writeUpdateInfoFiles([task], makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.signatures.map((it: any) => it.keyId)).toEqual([computeUpdateManifestKeyId(oldKey.publicKeyPem), computeUpdateManifestKeyId(newKey.publicKeyPem)])
    expect(yml.signature).toBe(yml.signatures[0].signature)
    // an install trusting only the old key and one trusting only the new key both verify this manifest
    expect(verifyManifestSignatures(yml, [oldKey.publicKeyPem]).ok).toBe(true)
    expect(verifyManifestSignatures(yml, [newKey.publicKeyPem]).ok).toBe(true)
    // and the legacy single-key verifier (pre-trust-list updaters) still accepts it with the first key
    expect(verifyManifestSignature(yml, oldKey.publicKeyPem)).toBe(true)
  })
})

// ── A1: PlatformPackager.updateSigningKeys resolution ─────────────────────────

async function withSigningEnv<T>(env: { ELECTRON_BUILDER_UPDATE_SIGN_KEY?: string; ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE?: string }, fn: () => Promise<T>): Promise<T> {
  const names = ["ELECTRON_BUILDER_UPDATE_SIGN_KEY", "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE"] as const
  const saved = names.map(name => [name, process.env[name]] as const)
  for (const name of names) {
    const value = env[name]
    if (value == null) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
  try {
    return await fn()
  } finally {
    for (const [name, value] of saved) {
      if (value == null) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  }
}

// PlatformPackager is abstract with only two abstract members, so the real class (and therefore the
// real `updateSigningKeys` MemoLazy) can be exercised without standing up a full Packager.
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

const publicKeysOf = (keys: Array<KeyObject>) => keys.map(derivePublicKeyPem)

test("updateSigningKeys resolves the key from the root config", async ({ expect }) => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
  const keys = await new TestPackager({ updateManifest: { signingKey: privateKeyPem } }).updateSigningKeys.value
  expect(publicKeysOf(keys)).toEqual([publicKeyPem])
})

test("updateSigningKeys prefers platform-specific updateManifest over the root config", async ({ expect }) => {
  const root = generateUpdateSigningKeypair()
  const platform = generateUpdateSigningKeypair()
  const packager = new TestPackager({
    updateManifest: { signingKey: root.privateKeyPem },
    linux: { updateManifest: { signingKey: platform.privateKeyPem } },
  })
  expect(publicKeysOf(await packager.updateSigningKeys.value)).toEqual([platform.publicKeyPem])
})

test("updateSigningKeys falls back to ELECTRON_BUILDER_UPDATE_SIGN_KEY when no updateManifest config block exists", async ({ expect }) => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
  await withSigningEnv({ ELECTRON_BUILDER_UPDATE_SIGN_KEY: privateKeyPem }, async () => {
    expect(publicKeysOf(await new TestPackager({}).updateSigningKeys.value)).toEqual([publicKeyPem])
  })
})

test("updateSigningKeys reads a PEM file from signingKeyFile and from ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", async ({ expect }) => {
  await withTmpDir(async dir => {
    const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
    const keyFile = path.join(dir, "update-key.pem")
    await fsp.writeFile(keyFile, privateKeyPem)

    expect(publicKeysOf(await new TestPackager({ updateManifest: { signingKeyFile: keyFile } }).updateSigningKeys.value)).toEqual([publicKeyPem])

    await withSigningEnv({ ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE: keyFile }, async () => {
      expect(publicKeysOf(await new TestPackager({}).updateSigningKeys.value)).toEqual([publicKeyPem])
    })
  })
})

test("a relative signingKeyFile resolves against the project directory, a relative ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE against cwd", async ({ expect }) => {
  await withTmpDir(async dir => {
    const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
    const relativeKeyFile = path.join("build", "update-key.pem")
    await fsp.mkdir(path.join(dir, "build"))
    await fsp.writeFile(path.join(dir, relativeKeyFile), privateKeyPem)

    await withSigningEnv({}, async () => {
      // the config path is project-relative like every other path in the build configuration...
      expect(loadUpdateSigningKeys({ signingKeyFile: relativeKeyFile }, dir).map(derivePublicKeyPem)).toEqual([publicKeyPem])
      expect(publicKeysOf(await new TestPackager({ updateManifest: { signingKeyFile: relativeKeyFile } }, dir).updateSigningKeys.value)).toEqual([publicKeyPem])
      // ...so it is NOT looked up relative to the current working directory (where it does not exist)
      expect(() => loadUpdateSigningKeys({ signingKeyFile: relativeKeyFile })).toThrow(/ENOENT/)
    })
    // the env var keeps ordinary environment-variable semantics: baseDir does not apply to it
    await withSigningEnv({ ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE: relativeKeyFile }, async () => {
      expect(() => loadUpdateSigningKeys(null, dir)).toThrow(/ENOENT/)
    })
  })
})

test("updateSigningKeys is empty when neither config nor env vars provide a key", async ({ expect }) => {
  await withSigningEnv({}, async () => {
    expect(await new TestPackager({}).updateSigningKeys.value).toEqual([])
  })
})

test("updateSigningKeys parses the PEMs once and memoizes the result", async ({ expect }) => {
  const { privateKeyPem } = generateUpdateSigningKeypair()
  const packager = new TestPackager({ updateManifest: { signingKey: privateKeyPem } })
  // same array identity across reads => the creator ran only once
  expect(await packager.updateSigningKeys.value).toBe(await packager.updateSigningKeys.value)
})

// ── multi-key resolution (key rotation) ──────────────────────────────────────

test("loadUpdateSigningKeys: array config yields every key in order", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  const b = generateUpdateSigningKeypair()
  await withSigningEnv({}, async () => {
    expect(loadUpdateSigningKeys({ signingKey: [a.privateKeyPem, b.privateKeyPem] }).map(derivePublicKeyPem)).toEqual([a.publicKeyPem, b.publicKeyPem])
    const keys = await new TestPackager({ updateManifest: { signingKey: [a.privateKeyPem, b.privateKeyPem] } }).updateSigningKeys.value
    expect(publicKeysOf(keys)).toEqual([a.publicKeyPem, b.publicKeyPem])
  })
})

test("loadUpdateSigningKeys: ELECTRON_BUILDER_UPDATE_SIGN_KEY may hold several concatenated PEM blocks", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  const b = generateUpdateSigningKeypair()
  await withSigningEnv({ ELECTRON_BUILDER_UPDATE_SIGN_KEY: `${a.privateKeyPem}\n${b.privateKeyPem}\n` }, async () => {
    expect(loadUpdateSigningKeys().map(derivePublicKeyPem)).toEqual([a.publicKeyPem, b.publicKeyPem])
  })
})

test("loadUpdateSigningKeys: ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE may hold several paths joined with path.delimiter", async ({ expect }) => {
  await withTmpDir(async dir => {
    const a = generateUpdateSigningKeypair()
    const b = generateUpdateSigningKeypair()
    const fileA = path.join(dir, "a.pem")
    const fileB = path.join(dir, "b.pem")
    await fsp.writeFile(fileA, a.privateKeyPem)
    await fsp.writeFile(fileB, b.privateKeyPem)
    await withSigningEnv({ ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE: [fileA, fileB].join(path.delimiter) }, async () => {
      expect(loadUpdateSigningKeys().map(derivePublicKeyPem)).toEqual([a.publicKeyPem, b.publicKeyPem])
    })
    // and signingKeyFile accepts an array of paths
    await withSigningEnv({}, async () => {
      expect(loadUpdateSigningKeys({ signingKeyFile: [fileB, fileA] }).map(derivePublicKeyPem)).toEqual([b.publicKeyPem, a.publicKeyPem])
    })
  })
})

test("loadUpdateSigningKeys: the first configured SOURCE wins even when a later source has more keys", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  const b = generateUpdateSigningKeypair()
  const c = generateUpdateSigningKeypair()
  await withSigningEnv({ ELECTRON_BUILDER_UPDATE_SIGN_KEY: `${b.privateKeyPem}\n${c.privateKeyPem}` }, async () => {
    expect(loadUpdateSigningKeys({ signingKey: a.privateKeyPem }).map(derivePublicKeyPem)).toEqual([a.publicKeyPem])
  })
})

test("loadUpdateSigningKeys rejects duplicate keys and non-Ed25519 keys with a clear error", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  await withSigningEnv({}, async () => {
    expect(() => loadUpdateSigningKeys({ signingKey: [a.privateKeyPem, a.privateKeyPem] })).toThrow(/duplicates key #1/)
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    expect(() => loadUpdateSigningKeys({ signingKey: [a.privateKeyPem, rsa] })).toThrow(/key #2 from updateManifest\.signingKey is not a valid Ed25519/)
    expect(() => loadUpdateSigningKeys({ signingKey: "garbage" })).toThrow(/not a valid Ed25519/)
  })
})

// ── A1: app-update.yml public key embedding ──────────────────────────────────

// minimal PlatformPackager stub for getAppUpdatePublishConfiguration (generic provider avoids any network/token resolution)
function makeAppUpdateConfigPackager(signingKeys: Array<KeyObject> = [], updateManifest?: any): any {
  return {
    platform: Platform.LINUX,
    platformOptions: updateManifest == null ? {} : { updateManifest },
    config: { publish: { provider: "generic", url: "https://example.com/updates" } },
    appInfo: { updaterCacheDirName: "test-app", channel: null, version: "1.0.0" },
    expandMacro: (value: string) => value,
    updateSigningKeys: { value: Promise.resolve(signingKeys) },
  }
}

test("app-update.yml embeds the public key derived from the packager's signing key", async ({ expect }) => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
  // signing (updateInfoBuilder) and embedding (PublishManager) read the same packager.updateSigningKeys,
  // so they cannot disagree about whether manifests are signed
  const publishConfig = await getAppUpdatePublishConfiguration(makeAppUpdateConfigPackager([parsePrivateKey(privateKeyPem)]), null, Arch.x64, false)
  // exactly one key => plain string, byte-identical to the single-key format
  expect(publishConfig?.updateManifestPublicKey).toBe(publicKeyPem)
})

test("app-update.yml embeds a trust LIST when several signing keys are configured", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  const b = generateUpdateSigningKeypair()
  const packager = makeAppUpdateConfigPackager([parsePrivateKey(a.privateKeyPem), parsePrivateKey(b.privateKeyPem)])
  const publishConfig = await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false)
  expect(publishConfig?.updateManifestPublicKey).toEqual([a.publicKeyPem, b.publicKeyPem])
})

test("app-update.yml: an explicit publicKey LIST wins as-is over derivation, and does not warn when it contains the signing key", async ({ expect }) => {
  const current = generateUpdateSigningKeypair()
  const next = generateUpdateSigningKeypair()
  const warn = vi.spyOn(log, "warn")
  try {
    const packager = makeAppUpdateConfigPackager([parsePrivateKey(current.privateKeyPem)], { publicKey: [current.publicKeyPem, next.publicKeyPem] })
    const publishConfig = await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false)
    expect(publishConfig?.updateManifestPublicKey).toEqual([current.publicKeyPem, next.publicKeyPem])
    expect(warn.mock.calls.some(c => String(c[1] ?? c[0]).includes("updateManifest.publicKey"))).toBe(false)
  } finally {
    warn.mockRestore()
  }
})

test("app-update.yml: a single explicit publicKey string holding two PEM blocks is embedded as a list", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  const b = generateUpdateSigningKeypair()
  const packager = makeAppUpdateConfigPackager([], { publicKey: `${a.publicKeyPem}\n${b.publicKeyPem}` })
  const publishConfig = await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false)
  expect(publishConfig?.updateManifestPublicKey).toEqual([a.publicKeyPem, b.publicKeyPem])
})

test("app-update.yml warns when none of the signing keys is in the explicit trust list (old-style bridge release)", async ({ expect }) => {
  const oldKey = generateUpdateSigningKeypair()
  const newKey = generateUpdateSigningKeypair()
  const warn = vi.spyOn(log, "warn")
  try {
    const packager = makeAppUpdateConfigPackager([parsePrivateKey(oldKey.privateKeyPem)], { publicKey: newKey.publicKeyPem })
    const publishConfig = await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false)
    // still a warning, not an error: the release is built, but cannot verify its own manifests
    expect(publishConfig?.updateManifestPublicKey).toBe(newKey.publicKeyPem)
    expect(warn.mock.calls.some(c => String(c[1] ?? c[0]).includes("none of the update-manifest signing keys"))).toBe(true)
  } finally {
    warn.mockRestore()
  }
})

test("app-update.yml rejects duplicate or non-Ed25519 entries in an explicit publicKey list", async ({ expect }) => {
  const a = generateUpdateSigningKeypair()
  await expect(getAppUpdatePublishConfiguration(makeAppUpdateConfigPackager([], { publicKey: [a.publicKeyPem, a.publicKeyPem] }), null, Arch.x64, false)).rejects.toThrow(
    /publicKey #2 duplicates entry #1/
  )
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString()
  await expect(getAppUpdatePublishConfiguration(makeAppUpdateConfigPackager([], { publicKey: rsa }), null, Arch.x64, false)).rejects.toThrow(/publicKey #1 is not a valid Ed25519/)
})

test("app-update.yml prefers an explicitly configured publicKey over the derived one", async ({ expect }) => {
  const { privateKeyPem } = generateUpdateSigningKeypair()
  const explicit = generateUpdateSigningKeypair().publicKeyPem
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  try {
    const packager = makeAppUpdateConfigPackager([parsePrivateKey(privateKeyPem)], { publicKey: explicit })
    const publishConfig = await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false)
    expect(publishConfig?.updateManifestPublicKey).toBe(explicit)
  } finally {
    warn.mockRestore()
  }
})

test("app-update.yml carries no public key when the packager has no signing key", async ({ expect }) => {
  const publishConfig = await getAppUpdatePublishConfiguration(makeAppUpdateConfigPackager(), null, Arch.x64, false)
  expect(publishConfig?.updateManifestPublicKey).toBeUndefined()
})

test("app-update.yml rejects a manually configured publish.updateManifestPublicKey", async ({ expect }) => {
  // the trust list is owned by electron-builder (derived from the signing keys or taken from
  // updateManifest.publicKey); a hand-set value would bypass validation and could silently shadow the derived one
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
  const packager = makeAppUpdateConfigPackager([parsePrivateKey(privateKeyPem)])
  packager.config.publish.updateManifestPublicKey = publicKeyPem
  const error = await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false).then(
    () => null,
    (e: Error) => e
  )
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toBe("publish.updateManifestPublicKey is managed by electron-builder and must not be set; configure updateManifest.publicKey instead")
})

test("no signature field is written when no signing key is configured", async ({ expect }) => {
  await withTmpDir(async dir => {
    await writeUpdateInfoFiles([makeTask(dir, "App-1.0.0.exe", "sha", null)], makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.signature).toBeUndefined()
  })
})

// ── createUpdateInfoTasks unit tests ─────────────────────────────────────────

function makePlatformPackager(electronUpdaterCompatibility = ">=2.16"): any {
  return {
    appInfo: { version: "1.0.0" },
    platform: Platform.WINDOWS,
    platformOptions: { releaseInfo: undefined, electronUpdaterCompatibility, generateUpdatesFilesForAllChannels: undefined },
    config: { releaseInfo: undefined, generateUpdatesFilesForAllChannels: undefined },
    info: {},
    getResource: () => Promise.resolve(null),
  }
}

test("createUpdateInfoTasks passes event.arch to the created task", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-arm64.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: Arch.arm64, packager: makePlatformPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].arch).toBe(Arch.arm64)
  })
})

test("createUpdateInfoTasks sets arch null for universal installer", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: null, packager: makePlatformPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].arch).toBeNull()
  })
})

test("createUpdateInfoTasks GitHub provider overrides files[0].url with safeArtifactName and omits legacy path under modern compatibility", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = {
      file: artifactFile,
      arch: null,
      safeArtifactName: "app-1.0.0.exe",
      packager: makePlatformPackager(),
      target: { outDir: dir },
    }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "github", repo: "owner/repo" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].info.files[0].url).toBe("app-1.0.0.exe")
    // default electronUpdaterCompatibility (>=2.16) targets modern clients, so no legacy top-level path is emitted
    expect((tasks[0].info as any).path).toBeUndefined()
  })
})

test("createUpdateInfoTasks emits legacy top-level path/sha512 when electronUpdaterCompatibility includes 1.x clients", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = {
      file: artifactFile,
      arch: null,
      safeArtifactName: "app-1.0.0.exe",
      packager: makePlatformPackager(">=1.0.0"),
      target: { outDir: dir },
    }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "github", repo: "owner/repo" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].info.files[0].url).toBe("app-1.0.0.exe")
    // legacy compatibility range -> top-level path/sha512 mirror the file descriptor
    expect((tasks[0].info as any).path).toBe("app-1.0.0.exe")
    expect((tasks[0].info as any).sha512).toBeDefined()
  })
})

test("createUpdateInfoTasks emits legacy top-level path/sha512 when the compatibility range intersects pre-2.16 versions", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    // ^2.0.0 intersects <2.16.0 (e.g. 2.15.0) even though it excludes 1.x
    const event: any = { file: artifactFile, arch: null, packager: makePlatformPackager("^2.0.0"), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test" }] as any)
    expect(tasks).toHaveLength(1)
    expect((tasks[0].info as any).path).toBe("App-1.0.0.exe")
    expect((tasks[0].info as any).sha512).toBe(tasks[0].info.files[0].sha512)
    // Windows platform + legacy range -> deprecated sha2 checksum is also emitted
    expect((tasks[0].info as any).sha2).toBeDefined()
  })
})

function makeMacPackager(electronUpdaterCompatibility: string): any {
  return {
    appInfo: { version: "1.0.0" },
    platform: Platform.MAC,
    platformOptions: { releaseInfo: undefined, electronUpdaterCompatibility, generateUpdatesFilesForAllChannels: undefined },
    config: { releaseInfo: undefined, generateUpdatesFilesForAllChannels: undefined },
    info: {},
    getResource: () => Promise.resolve(null),
    generateName2: () => "TestApp-1.0.0-mac.zip",
    emitArtifactCreated: vi.fn().mockResolvedValue(undefined),
  }
}

test("createUpdateInfoTasks with >=2.15 emits legacy path/sha512 but no legacy latest-mac.json", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-mac.zip")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: null, packager: makeMacPackager(">=2.15"), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "generic", url: "https://example.com/updates" }] as any)
    expect(tasks).toHaveLength(1)
    // >=2.15 intersects <2.16.0 -> legacy top-level path/sha512
    expect((tasks[0].info as any).path).toBe("App-1.0.0-mac.zip")
    expect((tasks[0].info as any).sha512).toBeDefined()
    // but it does not intersect <2.0.0 -> no legacy latest-mac.json
    const macJsonExists = await fsp
      .access(path.join(dir, "latest-mac.json"))
      .then(() => true)
      .catch(() => false)
    expect(macJsonExists).toBe(false)
  })
})

test("createUpdateInfoTasks with 1.1 emits legacy path/sha512 and legacy latest-mac.json", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-mac.zip")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: null, packager: makeMacPackager("1.1"), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "generic", url: "https://example.com/updates" }] as any)
    expect(tasks).toHaveLength(1)
    expect((tasks[0].info as any).path).toBe("App-1.0.0-mac.zip")
    expect((tasks[0].info as any).sha512).toBeDefined()
    // 1.1 intersects <2.0.0 -> legacy latest-mac.json is written for the first channel
    const macJson = JSON.parse(await fsp.readFile(path.join(dir, "latest-mac.json"), "utf-8"))
    expect(macJson.version).toBe("1.0.0")
    expect(macJson.url).toBe("https://example.com/updates/TestApp-1.0.0-mac.zip")
  })
})

test("createUpdateInfoTasks GitHub safeArtifactName does not leak into other providers' update info", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App 1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = {
      file: artifactFile,
      arch: null,
      safeArtifactName: "App-1.0.0.exe",
      // legacy compatibility range so the top-level path is emitted too — the leak historically affected it as well
      packager: makePlatformPackager(">=1.0.0"),
      target: { outDir: dir },
    }
    const tasks = await createUpdateInfoTasks(event, [
      { provider: "github", repo: "owner/repo" },
      { provider: "s3", bucket: "test" },
    ] as any)

    const githubTask = tasks.find(task => task.publishConfiguration.provider === "github")!
    const s3Task = tasks.find(task => task.publishConfiguration.provider === "s3")!
    // GitHub gets the safe name, but the shared info used by other providers must keep the real file name
    expect(githubTask.info.files[0].url).toBe("App-1.0.0.exe")
    expect((githubTask.info as any).path).toBe("App-1.0.0.exe")
    expect(s3Task.info.files[0].url).toBe("App 1.0.0.exe")
    expect((s3Task.info as any).path).toBe("App 1.0.0.exe")
  })
})

test("empty tasks array is a no-op", async ({ expect }) => {
  const mockPackager = makePackager()
  await expect(writeUpdateInfoFiles([], mockPackager as any)).resolves.toBeUndefined()
  expect(mockPackager.emitArtifactCreated).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────────────────────────

test("sha512 values are preserved correctly for each file entry", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-arm64.exe", "sha512-arm64-value", Arch.arm64),
      makeTask(dir, "App-1.0.0-x64.exe", "sha512-x64-value", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha512-universal-value", null),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    const byUrl = Object.fromEntries(yml.files.map((f: any) => [f.url, f.sha512]))
    expect(byUrl["App-1.0.0.exe"]).toBe("sha512-universal-value")
    expect(byUrl["App-1.0.0-x64.exe"]).toBe("sha512-x64-value")
    expect(byUrl["App-1.0.0-arm64.exe"]).toBe("sha512-arm64-value")
  })
})

function makeAllChannelsPackager(): any {
  return { ...makePlatformPackager(), config: { releaseInfo: undefined, generateUpdatesFilesForAllChannels: true } }
}

test("beta channel with arch suffix expands to alpha carrying the same suffix", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-arm64.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: Arch.arm64, packager: makeAllChannelsPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test", channel: "beta-arm64" }] as any)
    const names = tasks.map(t => path.basename(t.file)).sort()
    expect(names).toEqual(["alpha-arm64.yml", "beta-arm64.yml"])
  })
})

test("latest channel with arch suffix expands to alpha and beta carrying the same suffix", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-arm64.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: Arch.arm64, packager: makeAllChannelsPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test", channel: "latest-arm64" }] as any)
    const names = tasks.map(t => path.basename(t.file)).sort()
    expect(names).toEqual(["alpha-arm64.yml", "beta-arm64.yml", "latest-arm64.yml"])
  })
})

test("alpha channel with arch suffix does not expand", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-arm64.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: Arch.arm64, packager: makeAllChannelsPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test", channel: "alpha-arm64" }] as any)
    expect(tasks.map(t => path.basename(t.file))).toEqual(["alpha-arm64.yml"])
  })
})
