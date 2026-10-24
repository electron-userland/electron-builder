import * as fsp from "fs/promises"
import * as path from "path"
import { createUpdateManifestSignatures, derivePublicKeyPem, generateUpdateSigningKeypair, InvalidConfigurationError, log, serializeToYaml } from "builder-util"
import { canonicalizeForSigning, computeUpdateManifestKeyId, UpdateInfo, verifyManifestSignatures, WindowsUpdateInfo } from "builder-util-runtime"
import { createYargs } from "electron-builder/src/builder"
import {
  configureSignUpdateManifestCommand,
  joinPemOptionValues,
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

beforeEach(() => {
  // a signing key on the developer's machine must not leak into these tests
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test("re-signs an edited manifest so the runtime verifier accepts it again, keeping every other field", async ({ expect, tmpDir }) => {
  const output = captureOutput()
  const dir = await tmpDir.createTempDir()
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("1.2.3", "App-Setup-1.2.3.exe"), [current.privateKeyPem])
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(true)

  // an unsigned field can be edited without re-signing...
  await editManifest(file, info => (info.releaseNotes = "Fixed release notes"))
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(true)

  // ...but editing a signed one breaks the signature, and --verify reports it
  await editManifest(file, info => (info.stagingPercentage = 25))
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(false)
  const verifyError = await rejection(signUpdateManifest({ files: [file], publicKey: [current.publicKeyPem] }))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toContain("1 of 1 update manifest(s) failed signature verification")

  // the same key the build uses, from the CI environment variable
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(current.privateKeyPem + "\n").toString("base64"))
  const signed = await signUpdateManifest({ files: [file] })
  const keyId = computeUpdateManifestKeyId(current.publicKeyPem)
  expect(signed).toEqual([{ file, version: "1.2.3", keyIds: [keyId] }])

  const resigned = await readManifest(file)
  expect(verifyManifestSignatures(resigned, [current.publicKeyPem])).toEqual({ ok: true, keyId })
  expect(resigned.stagingPercentage).toBe(25)
  expect(resigned.releaseNotes).toBe("Fixed release notes")
  expect(resigned.releaseDate).toBe("2026-10-01T12:00:00.000Z")
  expect(resigned.files).toEqual([{ url: "App-Setup-1.2.3.exe", sha512, size: 81234567 }])
  // same shape as a build writes: one tagged entry per key, the legacy field repeating the first
  expect(resigned.signatures).toEqual([{ keyId, signature: resigned.signature }])
  expect(Object.keys(resigned).slice(-2)).toEqual(["signature", "signatures"])

  // --verify (keys derived from the signing key) now passes and writes nothing
  const before = await fsp.readFile(file, "utf8")
  expect(await signUpdateManifest({ files: [file], verify: true })).toEqual([{ file, version: "1.2.3", ok: true, keyId, reason: undefined }])
  expect(await fsp.readFile(file, "utf8")).toBe(before)

  // the private key is never printed, in any encoding
  const printed = output()
  expect(printed).not.toContain("PRIVATE KEY")
  expect(printed).not.toContain(current.privateKeyPem.split("\n")[1])
  expect(printed).not.toContain(Buffer.from(current.privateKeyPem + "\n").toString("base64"))
})

test("throws InvalidConfigurationError and leaves the file untouched when no signing key is configured", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await tmpDir.createTempDir()
  const file = path.join(dir, "latest-linux.yml")
  await writeSigned(file, manifest("2.0.0", "App-2.0.0.AppImage"), [current.privateKeyPem])
  await editManifest(file, info => (info.version = "2.0.1"))
  const before = await fsp.readFile(file, "utf8")

  const error = await rejection(signUpdateManifest({ files: [file] }))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toContain("no Ed25519 signing key was found")
  expect(error!.message).toContain("--key-file")
  expect(await fsp.readFile(file, "utf8")).toBe(before)

  // verifying without --public-key needs a signing key to derive it from
  const verifyError = await rejection(signUpdateManifest({ files: [file], verify: true }))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toContain("pass --public-key")
})

test("re-signs several manifests with several keys, and writes none when one cannot be signed", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await tmpDir.createTempDir()
  const currentKeyFile = path.join(dir, "current.pem")
  const nextKeyFile = path.join(dir, "next.pem")
  await fsp.writeFile(currentKeyFile, current.privateKeyPem + "\n", { mode: 0o600 })
  await fsp.writeFile(nextKeyFile, next.privateKeyPem + "\n", { mode: 0o600 })
  // --key-file takes precedence over the environment, like updateManifest.signingKeyFile in a build
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
  const error = await rejection(signUpdateManifest({ files: [win, mac, broken], keyFile: [currentKeyFile, nextKeyFile] }))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toBe(`Cannot sign ${broken}: files must be a non-empty array (the updater would reject it)`)
  expect(await fsp.readFile(win, "utf8")).toBe(winBefore)

  const currentId = computeUpdateManifestKeyId(current.publicKeyPem)
  const nextId = computeUpdateManifestKeyId(next.publicKeyPem)
  const signed = await signUpdateManifest({ files: [win, mac], keyFile: [currentKeyFile, nextKeyFile] })
  expect(signed).toEqual([
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

  // --public-key accepts the path of a PEM file; a file signed by an untrusted key or not at all fails
  const nextPublicKeyFile = path.join(dir, "next.pub.pem")
  await fsp.writeFile(nextPublicKeyFile, derivePublicKeyPem(next.privateKeyPem) + "\n")
  const results = await signUpdateManifest({ files: [win, mac], publicKey: [nextPublicKeyFile] })
  expect(results.map(it => ("ok" in it ? it.keyId : null))).toEqual([nextId, nextId])

  const unsigned = path.join(dir, "beta.yml")
  await fsp.writeFile(unsigned, serializeToYaml(manifest("3.2.0-beta.1", "App-Setup-3.2.0-beta.1.exe")))
  const untrusted = generateUpdateSigningKeypair().publicKeyPem
  const verifyError = await rejection(signUpdateManifest({ files: [win, unsigned], publicKey: [untrusted] }))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toBe(`2 of 2 update manifest(s) failed signature verification: ${win} (no signature matches a trusted key), ${unsigned} (not signed)`)
})

test("re-signs a manifest with allowCatalogSignature: true over the shared EBUM1 payload, which signs that flag", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await tmpDir.createTempDir()
  const file = path.join(dir, "latest.yml")
  const keyFile = path.join(dir, "current.pem")
  await fsp.writeFile(keyFile, current.privateKeyPem + "\n", { mode: 0o600 })
  const info: WindowsUpdateInfo = { ...manifest("4.0.0", "App-Setup-4.0.0.exe"), allowCatalogSignature: true }
  await writeSigned(file, info, [current.privateKeyPem])
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(true)

  // the flag is signed: dropping it breaks the signature, re-signing restores it without the flag's line in the payload
  await editManifest(file, it => (it.allowCatalogSignature = false))
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(false)
  await signUpdateManifest({ files: [file], keyFile: [keyFile] })
  const withoutFlag = (await readManifest(file)) as WindowsUpdateInfo
  expect(withoutFlag.allowCatalogSignature).toBe(false)
  expect(canonicalizeForSigning(withoutFlag)).not.toContain("allowCatalogSignature")
  expect(verifyManifestSignatures(withoutFlag, [current.publicKeyPem]).ok).toBe(true)

  // turning it back on also needs a re-sign, after which the payload carries the line and the runtime verifier accepts it
  await editManifest(file, it => (it.allowCatalogSignature = true))
  expect(verifyManifestSignatures(await readManifest(file), [current.publicKeyPem]).ok).toBe(false)
  await signUpdateManifest({ files: [file], keyFile: [keyFile] })
  const withFlag = (await readManifest(file)) as WindowsUpdateInfo
  expect(withFlag.allowCatalogSignature).toBe(true)
  expect(canonicalizeForSigning(withFlag).split("\n")).toContain("allowCatalogSignature:true")
  expect(verifyManifestSignatures(withFlag, [current.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(current.publicKeyPem) })
  // the signatures are exactly what a build would write for the same manifest
  expect(withFlag.signatures).toEqual(createUpdateManifestSignatures(info, [current.privateKeyPem]))
})

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
    .parse(joinPemOptionValues(["sign-update-manifest", ...args]))
  if (failure != null) {
    throw new Error(failure)
  }
  return options!
}

test("the CLI parser takes an inline PEM for --public-key, and one value per --key-file / --public-key in any order", ({ expect }) => {
  const pem = current.publicKeyPem
  expect(parseCli(["latest.yml", "--public-key", pem, "latest-mac.yml"])).toMatchObject({ files: ["latest.yml", "latest-mac.yml"], publicKey: [pem] })
  expect(parseCli(["--public-key", pem, "--public-key", next.publicKeyPem, "latest.yml"])).toMatchObject({ files: ["latest.yml"], publicKey: [pem, next.publicKeyPem] })
  expect(parseCli([`--public-key=${pem}`, "latest.yml"])).toMatchObject({ files: ["latest.yml"], publicKey: [pem] })

  // files first or flags first: a path after a flag's value stays a manifest
  const expected = { files: ["latest.yml", "latest-mac.yml"], keyFile: ["old.pem", "new.pem"] }
  expect(parseCli(["latest.yml", "latest-mac.yml", "--key-file", "old.pem", "--key-file", "new.pem"])).toMatchObject(expected)
  expect(parseCli(["--key-file", "old.pem", "latest.yml", "--key-file", "new.pem", "latest-mac.yml"])).toMatchObject(expected)
  expect(parseCli(["--public-key", "pub.pem", "latest.yml", "--verify"])).toMatchObject({ files: ["latest.yml"], publicKey: ["pub.pem"], verify: true })

  expect(() => parseCli(["latest.yml", "--key-file"])).toThrow("Not enough arguments following: key-file")
  expect(() => parseCli(["--key-file", "k.pem"])).toThrow()
})

test("--public-key trusts every key of a concatenated PEM file, and never echoes a value that is not a public key", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await tmpDir.createTempDir()
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("5.0.0", "App-Setup-5.0.0.exe"), [next.privateKeyPem])

  // a trust list in one file, the way updateManifest.publicKey accepts it: the manifest is signed by its second key only
  const trustFile = path.join(dir, "trust.pem")
  await fsp.writeFile(trustFile, `${current.publicKeyPem}\n${next.publicKeyPem}\n`)
  expect(await signUpdateManifest({ files: [file], publicKey: [trustFile] })).toEqual([
    { file, version: "5.0.0", ok: true, keyId: computeUpdateManifestKeyId(next.publicKeyPem), reason: undefined },
  ])
  expect((await signUpdateManifest({ files: [file], publicKey: [`${current.publicKeyPem}\n${next.publicKeyPem}`] }))[0]).toMatchObject({ ok: true })

  // the CI secret (a base64 private key) passed as --public-key by mistake: rejected without printing it
  const secret = Buffer.from(current.privateKeyPem + "\n").toString("base64")
  const body = current.privateKeyPem.split("\n")[1]
  for (const value of [secret, body]) {
    const error = await rejection(signUpdateManifest({ files: [file], publicKey: [value] }))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain("--public-key value is not a valid Ed25519 public key")
    expect(error!.message).not.toContain(value)
    expect(error!.message).not.toContain(body)
  }

  // a file that was read is named by its path, never by its contents
  const badFile = path.join(dir, "not-a-key.pem")
  await fsp.writeFile(badFile, secret)
  const fileError = await rejection(signUpdateManifest({ files: [file], publicKey: [badFile] }))
  expect(fileError!.message).toContain(`--public-key file ${badFile} is not a valid Ed25519 public key`)
  expect(fileError!.message).not.toContain(secret)
})

test("a bad --key-file fails with an InvalidConfigurationError naming the flag", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await tmpDir.createTempDir()
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("6.0.0", "App-Setup-6.0.0.exe"), [current.privateKeyPem])
  // a valid key in the environment must not be used instead of the --key-file the user named
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(current.privateKeyPem + "\n").toString("base64"))

  const missing = path.join(dir, "missing.pem")
  const missingError = await rejection(signUpdateManifest({ files: [file], keyFile: [missing] }))
  expect(missingError).toBeInstanceOf(InvalidConfigurationError)
  expect(missingError!.message).toBe(`--key-file ${missing} cannot be read (ENOENT)`)

  const empty = path.join(dir, "empty.pem")
  await fsp.writeFile(empty, "\n")
  const emptyError = await rejection(signUpdateManifest({ files: [file], keyFile: [empty] }))
  expect(emptyError).toBeInstanceOf(InvalidConfigurationError)
  expect(emptyError!.message).toContain(`--key-file ${empty} is empty`)

  // a public key where the private key belongs
  const wrong = path.join(dir, "public.pem")
  await fsp.writeFile(wrong, current.publicKeyPem + "\n")
  const wrongError = await rejection(signUpdateManifest({ files: [file], verify: true, keyFile: [wrong] }))
  expect(wrongError).toBeInstanceOf(InvalidConfigurationError)
  expect(wrongError!.message).toMatch(/^Update manifest signing key #1 from --key-file is not a valid Ed25519 private key/)
  expect(wrongError!.message).not.toContain("updateManifest.signingKeyFile")
})
