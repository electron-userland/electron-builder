import * as fsp from "fs/promises"
import * as path from "path"
import { createUpdateManifestSignatures, generateUpdateSigningKeypair, InvalidConfigurationError, log, serializeToYaml } from "builder-util"
import { canonicalizeForSigning, computeUpdateManifestKeyId, UpdateInfo, verifyManifestSignatures, WindowsUpdateInfo } from "builder-util-runtime"
import { verifyBuildOutput } from "app-builder-lib/internal"
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
/** `-c` override that sets the trust list `--verify` checks against. */
const trust = (...publicKeys: Array<string>) => `-c.updateManifest.publicKey=${publicKeys.join("\n")}`
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
  expect(await run(dir, [file, "--verify", trust(current.publicKeyPem)])).toEqual([{ file, version: "1.2.3", status: "verified", keyId: currentId }])

  // ...but editing a signed one breaks the signature, and --verify reports it
  await editManifest(file, info => (info.stagingPercentage = 25))
  const verifyError = await rejection(run(dir, [file, "--verify", trust(current.publicKeyPem)]))
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
  expect(await run(dir, [file, "--verify", trust(current.publicKeyPem)])).toMatchObject([{ status: "verified", keyId: currentId }])
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

  // verifying needs the trust list in updateManifest.publicKey: like electron-builder verify, it never derives one from a signing key
  await writeKey(dir, "current.pem", current.privateKeyPem)
  const verifyError = await rejection(run(dir, [file, "--verify", "-c.updateManifest.signingKeyFile=keys/current.pem"]))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toContain(`Cannot verify ${file}: updateManifest.publicKey is not set`)
  // ...and never loads one either: a broken signing key configuration does not get in the way
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", "not even base64")
  const tampered = await rejection(run(dir, [file, "--verify", trust(current.publicKeyPem), "-c.updateManifest.signingKeyFile=keys/missing.pem"]))
  expect(tampered!.message).toBe(`1 of 1 update manifest(s) failed signature verification: ${file} (no trusted key validates any of its signatures)`)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)

  // the explicit opt-out is honored, even with a key in the environment (as in the build)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(current.privateKeyPem + "\n").toString("base64"))
  const optOutError = await rejection(run(dir, [file, "-c.updateManifest=false"]))
  expect(optOutError).toBeInstanceOf(InvalidConfigurationError)
  expect(optOutError!.message).toContain("updateManifest is false")
  expect(await fsp.readFile(file, "utf8")).toBe(before)
  // ...and --verify skips an opted-out manifest, as electron-builder verify does
  expect(await run(dir, [file, "--verify", "-c.updateManifest=false"])).toEqual([
    { file, version: "2.0.1", status: "skipped", reason: "updateManifest is false in the configuration, so the manifest is not signed" },
  ])
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
  expect(await run(dir, [win, mac, "--verify", "-c", "trusted.yml"])).toMatchObject([{ status: "verified", keyId: nextId }, { status: "verified" }])
  const untrusted = generateUpdateSigningKeypair().publicKeyPem
  const verifyError = await rejection(run(dir, [win, unsigned, "--verify", "-c", "trusted.yml", `-c.updateManifest.publicKey=${untrusted}`]))
  expect(verifyError).toBeInstanceOf(InvalidConfigurationError)
  expect(verifyError!.message).toBe(
    `2 of 2 update manifest(s) failed signature verification: ${win} (no trusted key validates any of its signatures), ${unsigned} (the manifest is not signed)`
  )
})

test("each manifest uses its platform's updateManifest settings, like the build", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await createProject(await tmpDir.createTempDir(), {
    updateManifest: { signingKeyFile: "keys/current.pem", publicKey: current.publicKeyPem },
    mac: { updateManifest: { signingKeyFile: "keys/next.pem", publicKey: next.publicKeyPem } },
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
  expect(missingError!.message).toBe(
    "Update manifest signing key file from updateManifest.signingKeyFile cannot be read (ENOENT); check that it points to a readable PEM file (the value is not shown)"
  )

  // with several entries, the failing one is identified by its position, still without its value
  await writeKey(dir, "current.pem", current.privateKeyPem)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", [path.join(dir, "keys", "current.pem"), path.join(dir, "keys", "gone.pem")].join(path.delimiter))
  const envError = await rejection(run(dir, [file]))
  expect(envError).toBeInstanceOf(InvalidConfigurationError)
  expect(envError!.message).toBe(
    "Update manifest signing key file #2 from ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE cannot be read (ENOENT); check that it points to a readable PEM file (the value is not shown)"
  )
  expect(envError!.message).not.toContain("gone.pem")
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

test("a signing key file value is never echoed, whatever key material was put where its path belongs", async ({ expect, tmpDir }) => {
  const output = captureOutput()
  const dir = await createProject(await tmpDir.createTempDir())
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("8.0.0", "App-Setup-8.0.0.exe"), [current.privateKeyPem])
  const before = await fsp.readFile(file, "utf8")

  const pem = current.privateKeyPem
  const body = pem.split("\n")[1]
  const canonical = Buffer.from(pem + "\n").toString("base64")
  const variants = {
    canonical,
    quoted: `"${canonical}"`,
    urlSafe: canonical.replace(/\+/g, "-").replace(/\//g, "_"),
    unpadded: canonical.replace(/=+$/, ""),
    truncated: canonical.slice(0, 101),
    pem,
    bareBody: pem.split("\n").slice(1, -1).join(""),
  }
  const expectRedacted = (error: Error | null, source: string, secret: string) => {
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toMatch(
      new RegExp(`^Update manifest signing key file from ${source} cannot be read \\([A-Z]+\\); check that it points to a readable PEM file \\(the value is not shown\\)$`)
    )
    expect(error!.message).not.toContain(secret.trim())
    expect(error!.message).not.toContain(canonical.slice(0, 40))
    expect(error!.message).not.toContain(body)
  }

  for (const secret of Object.values(variants)) {
    // the CI secret meant for ELECTRON_BUILDER_UPDATE_SIGN_KEY set on the _FILE variable instead
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", secret)
    expectRedacted(await rejection(run(dir, [file])), "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", secret)
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)

    // ...or pasted into signingKeyFile, in the config file or as a -c override
    await fsp.writeFile(path.join(dir, "electron-builder.yml"), serializeToYaml({ updateManifest: { signingKeyFile: secret } }))
    expectRedacted(await rejection(run(dir, [file])), "updateManifest.signingKeyFile", secret)
    await fsp.rm(path.join(dir, "electron-builder.yml"))
    expectRedacted(await rejection(run(dir, [file, `-c.updateManifest.signingKeyFile=${secret}`])), "updateManifest.signingKeyFile", secret)
  }
  expect(await fsp.readFile(file, "utf8")).toBe(before)
  const printed = output()
  expect(printed).not.toContain(body)
  expect(printed).not.toContain(canonical.slice(0, 40))

  // an ordinary missing path gets the same source-only message
  const missing = await rejection(run(dir, [file, "-c.updateManifest.signingKeyFile=keys/update-key.pem"]))
  expectRedacted(missing, "updateManifest.signingKeyFile", "keys/update-key.pem")
})

test("--verify allows a cutover release signed outside the trust list only with updateManifest.allowSigningKeyOutsideTrustList", async ({ expect, tmpDir }) => {
  captureOutput()
  // the cutover release of a rotation: signed with the OLD key while its trust list holds only the NEW one
  const dir = await createProject(await tmpDir.createTempDir(), { updateManifest: { signingKeyFile: "keys/current.pem", publicKey: next.publicKeyPem } })
  await writeKey(dir, "current.pem", current.privateKeyPem)
  const file = path.join(dir, "latest.yml")
  await fsp.writeFile(file, serializeToYaml({ ...manifest("9.0.0", "App-Setup-9.0.0.exe"), stagingPercentage: 10 }))
  // re-signing it with the old key needs the same cutover allowance its build needed
  expect(await run(dir, [file, "-c.updateManifest.allowSigningKeyOutsideTrustList=true"])).toEqual([{ file, version: "9.0.0", keyIds: [currentId] }])

  const error = await rejection(run(dir, [file, "--verify"]))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toBe(`1 of 1 update manifest(s) failed signature verification: ${file} (no trusted key validates any of its signatures)`)

  expect(await run(dir, [file, "--verify", "-c.updateManifest.allowSigningKeyOutsideTrustList=true"])).toEqual([
    {
      file,
      version: "9.0.0",
      status: "skipped",
      reason:
        "not signed by a key of updateManifest.publicKey (no trusted key validates any of its signatures), which updateManifest.allowSigningKeyOutsideTrustList allows for a cutover release signed with a key outside the trust list",
    },
  ])
  // a manifest that does verify is still reported as verified
  expect(await run(dir, [file, "--verify", "-c.updateManifest.allowSigningKeyOutsideTrustList=true", trust(current.publicKeyPem)])).toMatchObject([
    { status: "verified", keyId: currentId },
  ])
})

test("--verify agrees with electron-builder verify (verifyBuildOutput) on the same manifests and configuration", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await tmpDir.createTempDir()
  // no packaged app in the output, so electron-builder verify also checks against updateManifest.publicKey
  const config = {
    updateManifest: { publicKey: [current.publicKeyPem] },
    mac: { updateManifest: { publicKey: next.publicKeyPem, allowSigningKeyOutsideTrustList: true } },
    linux: { updateManifest: false as const },
  }
  await createProject(dir, config)
  const cases: Record<string, () => Promise<void>> = {
    "latest.yml": () => writeSigned(path.join(dir, "latest.yml"), manifest("1.0.0", "a.exe"), [current.privateKeyPem]),
    "beta.yml": async () => {
      await writeSigned(path.join(dir, "beta.yml"), manifest("1.0.0", "b.exe"), [current.privateKeyPem])
      await editManifest(path.join(dir, "beta.yml"), it => (it.stagingPercentage = 50))
    },
    "alpha.yml": () => fsp.writeFile(path.join(dir, "alpha.yml"), serializeToYaml(manifest("1.0.0", "c.exe"))),
    "dual.yml": () => writeSigned(path.join(dir, "dual.yml"), manifest("1.0.0", "d.exe"), [next.privateKeyPem, current.privateKeyPem]),
    "latest-mac.yml": () => writeSigned(path.join(dir, "latest-mac.yml"), manifest("1.0.0", "e-mac.zip"), [next.privateKeyPem]),
    "beta-mac.yml": () => writeSigned(path.join(dir, "beta-mac.yml"), manifest("1.0.0", "f-mac.zip"), [current.privateKeyPem]),
    "latest-linux.yml": () => fsp.writeFile(path.join(dir, "latest-linux.yml"), serializeToYaml(manifest("1.0.0", "g.AppImage"))),
  }
  for (const write of Object.values(cases)) {
    await write()
  }

  const reference = new Map(
    (await verifyBuildOutput({ outDir: dir, config }))
      .filter(it => it.check === "update manifest signature")
      .map(it => [path.basename(it.file), { status: it.status, message: it.message }])
  )
  expect([...reference.keys()].sort()).toEqual(Object.keys(cases).sort())

  for (const name of Object.keys(cases)) {
    const file = path.join(dir, name)
    let cli: { status: string; keyId?: string; reason?: string }
    try {
      cli = ((await run(dir, [file, "--verify"])) as Array<any>)[0]
    } catch (e: any) {
      expect(e).toBeInstanceOf(InvalidConfigurationError)
      const prefix = `1 of 1 update manifest(s) failed signature verification: ${file} (`
      expect(e.message.startsWith(prefix)).toBe(true)
      cli = { status: "failed", reason: e.message.slice(prefix.length, -1) }
    }
    const expected = reference.get(name)!
    expect({ name, status: cli.status }).toEqual({ name, status: expected.status })
    if (cli.status === "verified") {
      expect(expected.message).toContain(`signed by ${cli.keyId},`)
    } else {
      expect(cli.reason).toBe(expected.message)
    }
  }
  // every outcome is covered
  expect(new Set([...reference.values()].map(it => it.status))).toEqual(new Set(["verified", "failed", "skipped"]))
})

test("re-signing refuses a signing key outside updateManifest.publicKey exactly as a publishing build does", async ({ expect, tmpDir }) => {
  captureOutput()
  const dir = await createProject(await tmpDir.createTempDir(), { updateManifest: { signingKeyFile: "keys/current.pem", publicKey: next.publicKeyPem } })
  await writeKey(dir, "current.pem", current.privateKeyPem)
  const file = path.join(dir, "latest.yml")
  const mac = path.join(dir, "latest-mac.yml")
  await writeSigned(file, manifest("10.0.0", "App-Setup-10.0.0.exe"), [current.privateKeyPem])
  await writeSigned(mac, manifest("10.0.0", "App-10.0.0-mac.zip"), [current.privateKeyPem])
  await editManifest(file, it => (it.stagingPercentage = 20))
  const before = await fsp.readFile(file, "utf8")
  const macBefore = await fsp.readFile(mac, "utf8")

  // the error the build's checkSigningKeysTrusted raises for a publishing build, for the build's platform name
  const error = await rejection(run(dir, [mac, file]))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toMatch(
    new RegExp(`^none of the update-manifest signing keys \\(key id\\(s\\) ${currentId}\\) is in updateManifest\\.publicKey \\(key id\\(s\\) ${nextId}\\) for mac\\. `)
  )
  expect(error!.message).toContain("set updateManifest.allowSigningKeyOutsideTrustList: true")
  // checked before anything is written, for every file of the batch
  expect(await fsp.readFile(file, "utf8")).toBe(before)
  expect(await fsp.readFile(mac, "utf8")).toBe(macBefore)
  const winError = await rejection(run(dir, [file]))
  expect(winError!.message).toContain(`for windows. `)

  // a deliberate cutover release: allowed (the build only warns, once per process)
  expect(await run(dir, [file, "-c.updateManifest.allowSigningKeyOutsideTrustList=true"])).toEqual([{ file, version: "10.0.0", keyIds: [currentId] }])

  // a trusted signing key (one of the listed keys is enough, as in the build)
  expect(await run(dir, [file, trust(next.publicKeyPem, current.publicKeyPem)])).toEqual([{ file, version: "10.0.0", keyIds: [currentId] }])

  // no updateManifest.publicKey: the build derives the trust list from the signing keys, so there is nothing to refuse
  await fsp.writeFile(path.join(dir, "electron-builder.yml"), serializeToYaml({ updateManifest: { signingKeyFile: "keys/current.pem" } }))
  expect(await run(dir, [file, mac])).toMatchObject([{ keyIds: [currentId] }, { keyIds: [currentId] }])

  // an invalid publicKey entry is the build's configuration error too
  const invalid = await rejection(run(dir, [file, trust(current.publicKeyPem, current.publicKeyPem)]))
  expect(invalid!.message).toBe("updateManifest.publicKey #2 duplicates entry #1 (key id " + currentId + "). List each trusted key once.")
})

test("--verify with a trust list given on the command line fails a wrong signature even in a cutover configuration", async ({ expect, tmpDir }) => {
  captureOutput()
  const old = current
  const wrong = generateUpdateSigningKeypair()
  // the cutover release configuration: trusts only the NEW key and allows signing outside that trust list
  const dir = await createProject(await tmpDir.createTempDir(), {
    updateManifest: { signingKeyFile: "keys/wrong.pem", publicKey: next.publicKeyPem, allowSigningKeyOutsideTrustList: true },
  })
  await writeKey(dir, "wrong.pem", wrong.privateKeyPem)
  const file = path.join(dir, "latest.yml")
  await writeSigned(file, manifest("11.0.0", "App-Setup-11.0.0.exe"), [old.privateKeyPem])
  await editManifest(file, it => (it.stagingPercentage = 30))
  // re-signed with the wrong key: the cutover allowance lets that through, as it would in the build
  expect(await run(dir, [file])).toMatchObject([{ keyIds: [computeUpdateManifestKeyId(wrong.publicKeyPem)] }])

  // the plain configured check keeps electron-builder verify's outcome: skipped
  expect(await run(dir, [file, "--verify"])).toMatchObject([{ status: "skipped" }])

  // the documented check against the old key must fail, not skip
  const error = await rejection(run(dir, [file, "--verify", trust(old.publicKeyPem)]))
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toBe(`1 of 1 update manifest(s) failed signature verification: ${file} (no trusted key validates any of its signatures)`)
  // ...also when the override is set for the platform
  const platformError = await rejection(run(dir, [file, "--verify", `-c.win.updateManifest.publicKey=${old.publicKeyPem}`]))
  expect(platformError).toBeInstanceOf(InvalidConfigurationError)

  // re-signed with the right key, the same check passes
  await writeKey(dir, "old.pem", old.privateKeyPem)
  await run(dir, [file, "-c.updateManifest.signingKeyFile=keys/old.pem"])
  expect(await run(dir, [file, "--verify", trust(old.publicKeyPem)])).toMatchObject([{ status: "verified", keyId: currentId }])

  // an allowance given on the command line together with the trust list still applies
  await run(dir, [file])
  expect(await run(dir, [file, "--verify", trust(old.publicKeyPem), "-c.updateManifest.allowSigningKeyOutsideTrustList=true"])).toMatchObject([{ status: "skipped" }])
})

test("--verify uses a command-line trust list exactly as passed, never merged with the configured keys", async ({ expect, tmpDir }) => {
  captureOutput()
  const old = current
  const other = generateUpdateSigningKeypair()
  const otherId = computeUpdateManifestKeyId(other.publicKeyPem)
  const noTrustedKey = "no trusted key validates any of its signatures"
  const expectFailure = async (file: string, args: Array<string>) => {
    const error = await rejection(run(dir, [file, "--verify", ...args]))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toBe(`1 of 1 update manifest(s) failed signature verification: ${file} (${noTrustedKey})`)
  }
  // configured: a YAML list at the root, and a mac block of its own; both trust `next` and `other`, with the cutover allowance
  const dir = await createProject(await tmpDir.createTempDir(), {
    updateManifest: { publicKey: [next.publicKeyPem, other.publicKeyPem], allowSigningKeyOutsideTrustList: true },
    mac: { updateManifest: { publicKey: [next.publicKeyPem, other.publicKeyPem], allowSigningKeyOutsideTrustList: true } },
  })
  // each manifest is signed only by a configured key the overrides below do not pass
  const win = path.join(dir, "latest.yml")
  const mac = path.join(dir, "latest-mac.yml")
  await writeSigned(win, manifest("12.0.0", "App-Setup-12.0.0.exe"), [next.privateKeyPem])
  await writeSigned(mac, manifest("12.0.0", "App-12.0.0-mac.zip"), [other.privateKeyPem])
  // the configured trust lists accept them
  expect(await run(dir, [win, mac, "--verify"])).toMatchObject([
    { status: "verified", keyId: nextId },
    { status: "verified", keyId: otherId },
  ])

  // a root override reaches a manifest whose platform has a configured block of its own
  await expectFailure(mac, [trust(old.publicKeyPem)])
  // repeated root overrides are the whole trust list, not appended to the configured YAML list
  await expectFailure(win, [trust(old.publicKeyPem), trust(generateUpdateSigningKeypair().publicKeyPem)])
  // ...also when they come with a config file path
  await expectFailure(win, ["-c", "electron-builder.yml", trust(old.publicKeyPem), trust(generateUpdateSigningKeypair().publicKeyPem)])
  // a platform override beats a root override, even one that would accept the manifest
  await expectFailure(mac, [trust(other.publicKeyPem), `-c.mac.updateManifest.publicKey=${old.publicKeyPem}`])
  await expectFailure(win, [trust(next.publicKeyPem), `-c.win.updateManifest.publicKey=${old.publicKeyPem}`])

  // the overrides are honored when they do hold the signing key
  expect(await run(dir, [mac, "--verify", trust(old.publicKeyPem), trust(other.publicKeyPem)])).toMatchObject([{ status: "verified", keyId: otherId }])
  expect(await run(dir, [win, "--verify", trust(old.publicKeyPem), `-c.win.updateManifest.publicKey=${next.publicKeyPem}`])).toMatchObject([{ status: "verified", keyId: nextId }])
})

test("--verify with a config file and repeated -c.updateManifest.publicKey flags trusts every one of them, and only them", async ({ expect, tmpDir }) => {
  captureOutput()
  const keyA = generateUpdateSigningKeypair()
  const keyB = generateUpdateSigningKeypair()
  const dir = await createProject(await tmpDir.createTempDir(), { updateManifest: { publicKey: [next.publicKeyPem] } })
  await fsp.writeFile(path.join(dir, "release.yml"), serializeToYaml({ updateManifest: { publicKey: [next.publicKeyPem] } }))
  const signedByA = path.join(dir, "latest.yml")
  const signedByConfiguredKey = path.join(dir, "beta.yml")
  await writeSigned(signedByA, manifest("13.0.0", "App-Setup-13.0.0.exe"), [keyA.privateKeyPem])
  await writeSigned(signedByConfiguredKey, manifest("13.0.0", "App-Setup-beta.exe"), [next.privateKeyPem])

  // the whole command path, from the real yargs parse: the first of the repeated overrides must survive the config merge
  for (const configFile of [[], ["-c", "release.yml"]]) {
    const overrides = [...configFile, trust(keyA.publicKeyPem), trust(keyB.publicKeyPem)]
    expect(await run(dir, [signedByA, "--verify", ...overrides])).toMatchObject([{ status: "verified", keyId: computeUpdateManifestKeyId(keyA.publicKeyPem) }])
    const error = await rejection(run(dir, [signedByConfiguredKey, "--verify", ...overrides]))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toBe(`1 of 1 update manifest(s) failed signature verification: ${signedByConfiguredKey} (no trusted key validates any of its signatures)`)
  }
})
