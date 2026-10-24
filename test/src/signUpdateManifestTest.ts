import * as fsp from "fs/promises"
import * as path from "path"
import { createUpdateManifestSignatures, derivePublicKeyPem, generateUpdateSigningKeypair, InvalidConfigurationError, log, serializeToYaml } from "builder-util"
import { computeUpdateManifestKeyId, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import { signUpdateManifest } from "electron-builder/src/cli/sign-update-manifest"
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
