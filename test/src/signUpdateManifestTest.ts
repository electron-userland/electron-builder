import * as fsp from "fs/promises"
import * as path from "path"
import { createUpdateManifestSignatures, generateUpdateSigningKeypair, InvalidConfigurationError, log, serializeToYaml } from "builder-util"
import { canonicalizeForSigning, computeUpdateManifestKeyId, UpdateInfo, verifyManifestSignatures, WindowsUpdateInfo } from "builder-util-runtime"
import { createYargs } from "electron-builder/src/builder"
import {
  configureSignUpdateManifestCommand,
  SIGN_UPDATE_MANIFEST_COMMAND,
  signUpdateManifest,
  SignUpdateManifestOptions,
  signUpdateManifestOptionsFromArgs,
} from "electron-builder/src/cli/sign-update-manifest"
import { load } from "js-yaml"
import { afterEach, beforeEach, vi } from "vitest"

const sha512 = "Qd2bZ0X8W1yB6kq1e9YgD8mJvW9c+3sR2fT4nL5pA7hU0oI6eK3jM8rS1tV4wX7yZ0aB3cD6eF9gH2iJ5kL8mN=="

function manifest(version: string, url: string): UpdateInfo {
  return {
    version,
    files: [{ url, sha512, size: 81234567 }],
    path: url,
    sha512,
    releaseDate: "2026-10-01T12:00:00.000Z",
    releaseNotes: "Initial notes",
  }
}

/** Writes `info` the way a publishing build does: signed by every key, `signature` + `signatures` last. */
async function writeSigned(file: string, info: UpdateInfo, privateKeys: Array<string>): Promise<void> {
  const signatures = createUpdateManifestSignatures(info, privateKeys)
  await fsp.writeFile(file, serializeToYaml({ ...info, signature: signatures[0].signature, signatures }, false, true))
}

/** Parses a manifest the way electron-updater does (`parseUpdateInfo` is a plain js-yaml `load`). */
async function readManifest(file: string): Promise<UpdateInfo> {
  return load(await fsp.readFile(file, "utf8")) as UpdateInfo
}

async function editManifest(file: string, edit: (info: Record<string, any>) => void): Promise<void> {
  const info = (await readManifest(file)) as Record<string, any>
  edit(info)
  await fsp.writeFile(file, serializeToYaml(info, false, true))
}

/** A project directory with a package.json and, when given, an electron-builder.yml holding `config`. */
async function createProject(dir: string, config?: Record<string, unknown>): Promise<string> {
  await fsp.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "signed-app", version: "1.0.0" }))
  if (config != null) {
    await fsp.writeFile(path.join(dir, "electron-builder.yml"), serializeToYaml(config))
  }
  await fsp.mkdir(path.join(dir, "keys"), { recursive: true })
  return dir
}

async function writeKey(dir: string, name: string, pem: string): Promise<string> {
  const file = path.join(dir, "keys", name)
  await fsp.writeFile(file, pem + "\n", { mode: 0o600 })
  return file
}

/** Parses `sign-update-manifest` arguments through the real yargs parser, set up exactly as cli.ts sets it up. */
function parseCli(args: Array<string>): SignUpdateManifestOptions {
  let options: SignUpdateManifestOptions | null = null
  let failure: string | null = null
  void createYargs()
    .command(SIGN_UPDATE_MANIFEST_COMMAND, "", configureSignUpdateManifestCommand, argv => {
      options = signUpdateManifestOptionsFromArgs(argv)
    })
    .strict()
    .exitProcess(false)
    .fail(message => {
      failure = message
    })
    .parse(["sign-update-manifest", ...args])
  if (failure != null) {
    throw new Error(failure)
  }
  return options!
}

/** Runs the command as the CLI would, from `projectDir` (the CLI uses the current directory, like `publish`). */
function run(projectDir: string, args: Array<string>) {
  return signUpdateManifest({ ...parseCli(args), projectDir })
}

function captureOutput(): () => string {
  const lines: Array<string> = []
  const record = (...args: Array<unknown>) => {
    lines.push(args.map(it => (typeof it === "string" ? it : JSON.stringify(it))).join(" "))
  }
  vi.spyOn(log, "info").mockImplementation(record)
  vi.spyOn(log, "warn").mockImplementation(record)
  vi.spyOn(log, "error").mockImplementation(record)
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
    lines.push(String(chunk))
    return true
  })
  return () => lines.join("\n")
}

async function rejection(promise: Promise<unknown>): Promise<Error | null> {
  return promise.then(
    () => null,
    (e: Error) => e
  )
}

const current = generateUpdateSigningKeypair()
const next = generateUpdateSigningKeypair()
const currentId = computeUpdateManifestKeyId(current.publicKeyPem)
const nextId = computeUpdateManifestKeyId(next.publicKeyPem)

beforeEach(() => {
  // a signing key on the developer's machine must not leak into these tests
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test("the CLI takes manifest paths, -c / --config (a path, inline overrides or both) and --verify", ({ expect }) => {
  expect(parseCli(["latest.yml", "latest-mac.yml"])).toEqual({ files: ["latest.yml", "latest-mac.yml"], config: undefined, verify: undefined })
  expect(parseCli(["-c", "custom.yml", "latest.yml", "--verify"])).toEqual({ files: ["latest.yml"], config: "custom.yml", verify: true })
  expect(parseCli(["latest.yml", "--config", "custom.yml"])).toMatchObject({ files: ["latest.yml"], config: "custom.yml" })
  expect(parseCli(["latest.yml", "-c.updateManifest.signingKeyFile=k.pem"])).toMatchObject({ config: { updateManifest: { signingKeyFile: "k.pem" } } })
  expect(parseCli(["-c", "custom.yml", "-c.updateManifest.signingKeyFile=k.pem", "latest.yml"])).toMatchObject({
    files: ["latest.yml"],
    config: ["custom.yml", { updateManifest: { signingKeyFile: "k.pem" } }],
  })
  // key-material flags do not exist: keys only come from the configuration and the environment
  expect(() => parseCli(["latest.yml", "--key-file", "k.pem"])).toThrow(/Unknown argument/)
  expect(() => parseCli(["latest.yml", "--public-key", "pub.pem"])).toThrow(/Unknown argument/)
  expect(() => parseCli(["-c", "custom.yml"])).toThrow()
})

test("re-signs an edited manifest with the env key so the runtime verifier accepts it again, keeping every other field", async ({ expect, tmpDir }) => {
  const output = captureOutput()
  const dir = await createProject(await tmpDir.createTempDir())
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("1.2.3", "App-Setup-1.2.3.exe"), [current.privateKeyPem])
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(true)

  // the same key the build uses, from the CI environment variable
  const secret = Buffer.from(current.privateKeyPem + "\n").toString("base64")
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", secret)

  // an unsigned field can be edited without re-signing...
  await editManifest(file, info => (info.releaseNotes = "Fixed release notes"))
  expect(await run(dir, [file, "--verify"])).toEqual([{ file, version: "1.2.3", ok: true, keyId: currentId, reason: undefined }])

  // ...but editing a signed one breaks the signature, and --verify reports it
  await editManifest(file, info => (info.stagingPercentage = 25))
  const verifyError = await rejection(run(dir, [file, "--verify"]))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toContain("1 of 1 update manifest(s) failed signature verification")

  expect(await run(dir, [file])).toEqual([{ file, version: "1.2.3", keyIds: [currentId] }])
  const resigned = await readManifest(file)
  expect(verifyManifestSignatures(resigned, [current.publicKeyPem])).toEqual({ ok: true, keyId: currentId })
  expect(resigned.stagingPercentage).toBe(25)
  expect(resigned.releaseNotes).toBe("Fixed release notes")
  expect(resigned.releaseDate).toBe("2026-10-01T12:00:00.000Z")
  expect(resigned.files).toEqual([{ url: "App-Setup-1.2.3.exe", sha512, size: 81234567 }])
  // same shape as a build writes: one tagged entry per key, the legacy field repeating the first
  expect(resigned.signatures).toEqual([{ keyId: currentId, signature: resigned.signature }])
  expect(Object.keys(resigned).slice(-2)).toEqual(["signature", "signatures"])

  // --verify now passes and writes nothing
  const before = await fsp.readFile(file, "utf8")
  expect(await run(dir, [file, "--verify"])).toMatchObject([{ ok: true, keyId: currentId }])
  expect(await fsp.readFile(file, "utf8")).toBe(before)

  // the private key is never printed, in any encoding
  const printed = output()
  expect(printed).not.toContain("PRIVATE KEY")
  expect(printed).not.toContain(current.privateKeyPem.split("\n")[1])
  expect(printed).not.toContain(secret)
})

test("throws InvalidConfigurationError and leaves the file untouched when no signing key is configured", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await createProject(await tmpDir.createTempDir(), { appId: "com.example.signed" })
  const file = path.join(dir, "latest-linux.yml")
  await writeSigned(file, manifest("2.0.0", "App-2.0.0.AppImage"), [current.privateKeyPem])
  await editManifest(file, info => (info.version = "2.0.1"))
  const before = await fsp.readFile(file, "utf8")

  const error = await rejection(run(dir, [file]))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toContain(`Cannot sign ${file}: no Ed25519 signing key was found for linux`)
  expect(error!.message).toContain("updateManifest.signingKeyFile")
  expect(error!.message).toContain("ELECTRON_BUILDER_UPDATE_SIGN_KEY")
  expect(await fsp.readFile(file, "utf8")).toBe(before)

  // verifying needs a trust list: updateManifest.publicKey, or the signing key(s) it is derived from
  const verifyError = await rejection(run(dir, [file, "--verify"]))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toContain("no trust list for linux. Set updateManifest.publicKey")

  // the explicit opt-out is honored, even with a key in the environment (as in the build)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(current.privateKeyPem + "\n").toString("base64"))
  const optOutError = await rejection(run(dir, [file, "-c.updateManifest=false"]))
  expect(optOutError).toBeInstanceOf(InvalidConfigurationError)
  expect(optOutError!.message).toContain("updateManifest is false")
  expect(await fsp.readFile(file, "utf8")).toBe(before)
})

test("signs several manifests with the configured key files, and writes none when one cannot be signed", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await createProject(await tmpDir.createTempDir(), {
    // project-relative key files, like every path in the configuration; both sign (dual-signing for a rotation)
    updateManifest: { signingKeyFile: ["keys/current.pem", "keys/next.pem"] },
  })
  await writeKey(dir, "current.pem", current.privateKeyPem)
  await writeKey(dir, "next.pem", next.privateKeyPem)
  // the configuration takes precedence over the environment, as in the build
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", "not even base64")

  const win = path.join(dir, "latest.yml")
  const mac = path.join(dir, "latest-mac.yml")
  await writeSigned(win, manifest("3.1.0", "App-Setup-3.1.0.exe"), [current.privateKeyPem])
  await writeSigned(mac, manifest("3.1.0", "App-3.1.0-mac.zip"), [current.privateKeyPem])
  await editManifest(win, info => (info.minimumSystemVersion = "10.0.19041"))
  await editManifest(mac, info => (info.files[0].url = "App-3.1.0-universal-mac.zip"))

  // a manifest the updater would reject as signed aborts the whole batch before anything is written
  const broken = path.join(dir, "latest-linux.yml")
  await fsp.writeFile(broken, serializeToYaml({ version: "3.1.0", files: [] }))
  const winBefore = await fsp.readFile(win, "utf8")
  const error = await rejection(run(dir, [win, mac, broken]))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toBe(`Cannot sign ${broken}: files must be a non-empty array (the updater would reject it)`)
  expect(await fsp.readFile(win, "utf8")).toBe(winBefore)

  expect(await run(dir, [win, mac])).toEqual([
    { file: win, version: "3.1.0", keyIds: [currentId, nextId] },
    { file: mac, version: "3.1.0", keyIds: [currentId, nextId] },
  ])
  for (const file of [win, mac]) {
    const info = await readManifest(file)
    expect(verifyManifestSignatures(info, [current.publicKeyPem]).ok).toBe(true)
    expect(verifyManifestSignatures(info, [next.publicKeyPem])).toEqual({ ok: true, keyId: nextId })
  }
  expect((await readManifest(win)).minimumSystemVersion).toBe("10.0.19041")
  expect((await readManifest(mac)).files[0].url).toBe("App-3.1.0-universal-mac.zip")

  // a -c override replaces the file's key list: sign with the next key only
  await run(dir, [win, "-c.updateManifest.signingKeyFile=keys/next.pem"])
  expect((await readManifest(win)).signatures).toEqual([{ keyId: nextId, signature: (await readManifest(win)).signature }])

  // the trust list is updateManifest.publicKey when set (a multi-PEM string, split like the build and the updater do)
  const unsigned = path.join(dir, "beta.yml")
  await fsp.writeFile(unsigned, serializeToYaml(manifest("3.2.0-beta.1", "App-Setup-3.2.0-beta.1.exe")))
  const trusted = path.join(dir, "trusted.yml")
  await fsp.writeFile(trusted, serializeToYaml({ updateManifest: { signingKeyFile: "keys/current.pem", publicKey: `${current.publicKeyPem}\n${next.publicKeyPem}` } }))
  expect(await run(dir, [win, mac, "--verify", "-c", "trusted.yml"])).toMatchObject([{ ok: true, keyId: nextId }, { ok: true }])
  const untrusted = generateUpdateSigningKeypair().publicKeyPem
  const verifyError = await rejection(run(dir, [win, unsigned, "--verify", "-c", "trusted.yml", `-c.updateManifest.publicKey=${untrusted}`]))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toBe(`2 of 2 update manifest(s) failed signature verification: ${win} (no signature matches a trusted key), ${unsigned} (not signed)`)
})

test("each manifest uses its platform's updateManifest settings, like the build", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await createProject(await tmpDir.createTempDir(), {
    updateManifest: { signingKeyFile: "keys/current.pem" },
    mac: { updateManifest: { signingKeyFile: "keys/next.pem" } },
  })
  await writeKey(dir, "current.pem", current.privateKeyPem)
  await writeKey(dir, "next.pem", next.privateKeyPem)
  const win = path.join(dir, "beta.yml")
  const mac = path.join(dir, "beta-mac.yml")
  const linux = path.join(dir, "beta-linux-arm64.yml")
  for (const [file, url] of [
    [win, "App-Setup.exe"],
    [mac, "App-mac.zip"],
    [linux, "App-arm64.AppImage"],
  ]) {
    await fsp.writeFile(file, serializeToYaml(manifest("7.0.0", url)))
  }

  expect(await run(dir, [win, mac, linux])).toEqual([
    { file: win, version: "7.0.0", keyIds: [currentId] },
    { file: mac, version: "7.0.0", keyIds: [nextId] },
    { file: linux, version: "7.0.0", keyIds: [currentId] },
  ])
  expect(await run(dir, [win, mac, linux, "--verify"])).toMatchObject([{ keyId: currentId }, { keyId: nextId }, { keyId: currentId }])
})

test("re-signs a manifest with allowCatalogSignature: true over the shared EBUM1 payload, which signs that flag", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await createProject(await tmpDir.createTempDir(), { updateManifest: { signingKeyFile: "keys/current.pem" } })
  await writeKey(dir, "current.pem", current.privateKeyPem)
  const file = path.join(dir, "latest.yml")
  const info: WindowsUpdateInfo = { ...manifest("4.0.0", "App-Setup-4.0.0.exe"), allowCatalogSignature: true }
  await writeSigned(file, info, [current.privateKeyPem])
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(true)

  // the flag is signed: dropping it breaks the signature, re-signing restores it without the flag's line in the payload
  await editManifest(file, it => (it.allowCatalogSignature = false))
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(false)
  await run(dir, [file])
  const withoutFlag = (await readManifest(file)) as WindowsUpdateInfo
  expect(withoutFlag.allowCatalogSignature).toBe(false)
  expect(canonicalizeForSigning(withoutFlag)).not.toContain("allowCatalogSignature")
  expect(verifyManifestSignatures(withoutFlag, [current.publicKeyPem]).ok).toBe(true)

  // turning it back on also needs a re-sign, after which the payload carries the line and the runtime verifier accepts it
  await editManifest(file, it => (it.allowCatalogSignature = true))
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(false)
  await run(dir, [file])
  const withFlag = (await readManifest(file)) as WindowsUpdateInfo
  expect(withFlag.allowCatalogSignature).toBe(true)
  expect(canonicalizeForSigning(withFlag).split("\n")).toContain("allowCatalogSignature:true")
  expect(verifyManifestSignatures(withFlag, [current.publicKeyPem])).toEqual({ ok: true, keyId: currentId })
  // the signatures are exactly what a build would write for the same manifest
  expect(withFlag.signatures).toEqual(createUpdateManifestSignatures(info, [current.privateKeyPem]))
})

test("bad key configuration fails with an InvalidConfigurationError naming its source, never the key material", async ({ expect, tmpDir }) => {
  const output = captureOutput()
  const dir = await createProject(await tmpDir.createTempDir())
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("6.0.0", "App-Setup-6.0.0.exe"), [current.privateKeyPem])

  const missingError = await rejection(run(dir, [file, "-c.updateManifest.signingKeyFile=keys/missing.pem"]))
  expect(missingError).toBeInstanceOf(InvalidConfigurationError)
  expect(missingError!.message).toBe(`Update manifest signing key file ${path.join(dir, "keys", "missing.pem")} from updateManifest.signingKeyFile cannot be read (ENOENT)`)

  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", path.join(dir, "keys", "gone.pem"))
  const envError = await rejection(run(dir, [file]))
  expect(envError).toBeInstanceOf(InvalidConfigurationError)
  expect(envError!.message).toContain("from ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE cannot be read (ENOENT)")
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)

  // a public key where the private key belongs
  await writeKey(dir, "public.pem", current.publicKeyPem)
  const wrongError = await rejection(run(dir, [file, "-c.updateManifest.signingKeyFile=keys/public.pem"]))
  expect(wrongError).toBeInstanceOf(InvalidConfigurationError)
  expect(wrongError!.message).toMatch(/^Update manifest signing key #1 from updateManifest.signingKeyFile is not a valid Ed25519 private key/)

  // the CI secret (a base64 private key) or a bare key body configured as the trust list: rejected without printing it
  const secret = Buffer.from(current.privateKeyPem + "\n").toString("base64")
  const body = current.privateKeyPem.split("\n")[1]
  for (const value of [secret, body]) {
    await fsp.writeFile(path.join(dir, "electron-builder.yml"), serializeToYaml({ mac: { updateManifest: { publicKey: [next.publicKeyPem, value] } } }))
    const error = await rejection(run(dir, [path.join(dir, "latest-mac.yml"), "--verify"]))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toMatch(/^mac\.updateManifest\.publicKey #2 is not a valid Ed25519 public key \(the value is not shown\)/)
    expect(error!.message).not.toContain(value)
    expect(error!.message).not.toContain(body)
  }
  expect(output()).not.toContain(body)
})

test("key material put where a key file path belongs is never echoed in the error", async ({ expect, tmpDir }) => {
  const output = captureOutput()
  const dir = await createProject(await tmpDir.createTempDir())
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("8.0.0", "App-Setup-8.0.0.exe"), [current.privateKeyPem])
  const before = await fsp.readFile(file, "utf8")

  const pem = current.privateKeyPem
  const body = pem.split("\n")[1]
  const secrets = {
    "base64 secret": Buffer.from(pem + "\n").toString("base64"),
    "PEM text": pem,
    "key body without PEM lines": pem.split("\n").slice(1, -1).join(""),
  }
  const assertRedacted = (error: Error | null, source: string, secret: string) => {
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain(`Update manifest signing key file from ${source} cannot be read (`)
    expect(error!.message).toContain("it is not shown")
    expect(error!.message).not.toContain(secret)
    expect(error!.message).not.toContain(body)
  }

  for (const secret of Object.values(secrets)) {
    // the CI secret meant for ELECTRON_BUILDER_UPDATE_SIGN_KEY set on the _FILE variable instead
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", secret)
    assertRedacted(await rejection(run(dir, [file])), "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", secret)
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)

    // ...or pasted into signingKeyFile, in the config file or as a -c override
    await fsp.writeFile(path.join(dir, "electron-builder.yml"), serializeToYaml({ updateManifest: { signingKeyFile: secret } }))
    assertRedacted(await rejection(run(dir, [file])), "updateManifest.signingKeyFile", secret)
    await fsp.rm(path.join(dir, "electron-builder.yml"))
    assertRedacted(await rejection(run(dir, [file, `-c.updateManifest.signingKeyFile=${secret}`])), "updateManifest.signingKeyFile", secret)
  }
  expect(await fsp.readFile(file, "utf8")).toBe(before)
  expect(output()).not.toContain(body)

  // an ordinary missing path is still named, so the error stays actionable
  const missing = await rejection(run(dir, [file, "-c.updateManifest.signingKeyFile=keys/update-key.pem"]))
  expect(missing!.message).toBe(`Update manifest signing key file ${path.join(dir, "keys", "update-key.pem")} from updateManifest.signingKeyFile cannot be read (ENOENT)`)
})
