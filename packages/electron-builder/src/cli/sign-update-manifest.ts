import { derivePublicKeyPem, InvalidConfigurationError, loadUpdateSigningKeys, log, parseUpdateManifestYaml, resignUpdateManifestYaml } from "builder-util"
import { collectManifestSignatures, parsePublicKey, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import { KeyObject } from "crypto"
import { readFile, stat, writeFile } from "fs/promises"
import * as path from "path"

export interface SignUpdateManifestOptions {
  /** The `latest*.yml` files to re-sign (or, with `verify`, to check). */
  readonly files: Array<string>
  /** Private key PEM file(s), like `updateManifest.signingKeyFile`; relative paths resolve against the current directory. */
  readonly keyFile?: Array<string> | null
  /** Check the existing signatures instead of re-signing; nothing is written. */
  readonly verify?: boolean
  /** Trusted public key(s) for `verify`: a PEM / base64 SPKI value, or the path of a file holding one. Implies `verify`. */
  readonly publicKey?: Array<string> | null
}

export interface SignedUpdateManifest {
  readonly file: string
  readonly version: string
  readonly keyIds: Array<string>
}

export interface VerifiedUpdateManifest {
  readonly file: string
  readonly version: string
  readonly ok: boolean
  /** Id of the trusted key that verified the manifest, when `ok`. */
  readonly keyId?: string
  /** Why the manifest did not verify, when not `ok`. */
  readonly reason?: string
}

const KEY_SOURCES_HINT =
  "Pass --key-file <path to the PEM file>, or set ELECTRON_BUILDER_UPDATE_SIGN_KEY (the PEM file, base64-encoded on one line) or " +
  "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path to the PEM file) — the same key(s) the build signs with. " +
  "See https://www.electron.build/features/signed-update-manifests#re-signing-a-published-manifest"

/**
 * Backs `electron-builder sign-update-manifest`: re-signs existing `latest*.yml` files in place with the update signing
 * key(s), so a published manifest can be edited (a release note, `stagingPercentage`, a URL...) without rebuilding.
 * With `verify` (or `publicKey`) it only checks the signatures already in the files and throws if any fails.
 * The keys are resolved like the build's `updateManifest.signingKeyFile` and its environment variables; key material
 * is never logged.
 * @internal
 */
export async function signUpdateManifest(options: SignUpdateManifestOptions): Promise<Array<SignedUpdateManifest> | Array<VerifiedUpdateManifest>> {
  const files = (options.files ?? []).filter(it => typeof it === "string" && it.trim().length > 0).map(it => path.resolve(it))
  if (files.length === 0) {
    throw new InvalidConfigurationError("No update manifest given: pass one or more latest*.yml paths")
  }
  const publicKeyValues = (options.publicKey ?? []).filter(it => typeof it === "string" && it.trim().length > 0)
  if (options.verify === true || publicKeyValues.length > 0) {
    return verifyUpdateManifests(files, publicKeyValues, options.keyFile)
  }
  return resignUpdateManifests(files, options.keyFile)
}

function loadSigningKeys(keyFile: Array<string> | null | undefined): Array<string> {
  // explicit --key-file wins; otherwise the same environment variables the build reads
  return loadUpdateSigningKeys({ signingKeyFile: keyFile ?? null })
}

async function resignUpdateManifests(files: Array<string>, keyFile: Array<string> | null | undefined): Promise<Array<SignedUpdateManifest>> {
  const keys = loadSigningKeys(keyFile)
  if (keys.length === 0) {
    throw new InvalidConfigurationError(`Cannot sign update manifests: no Ed25519 signing key was found. ${KEY_SOURCES_HINT}`)
  }

  // sign every file before writing any, so a manifest that cannot be signed leaves all of them untouched
  const signed = await Promise.all(
    files.map(async file => {
      const result = resignUpdateManifestYaml(await readFile(file, "utf8"), keys, file)
      return { file, result }
    })
  )
  for (const { file, result } of signed) {
    await writeFile(file, result.content)
  }

  return signed.map(({ file, result }) => {
    const keyIds = result.signatures.map(it => it.keyId)
    log.info({ file, version: result.info.version, keyIds }, "update manifest signed")
    return { file, version: result.info.version, keyIds }
  })
}

async function resolvePublicKeys(values: Array<string>, keyFile: Array<string> | null | undefined): Promise<Array<KeyObject>> {
  if (values.length === 0) {
    // no explicit trust list: check against the public half of the configured signing key(s)
    const keys = loadSigningKeys(keyFile)
    if (keys.length === 0) {
      throw new InvalidConfigurationError(`Cannot verify update manifests: pass --public-key, or provide the signing key(s) to derive it from. ${KEY_SOURCES_HINT}`)
    }
    return keys.map(it => parsePublicKey(derivePublicKeyPem(it)))
  }
  return Promise.all(
    values.map(async value => {
      const text = value.includes("-----BEGIN") ? value : await readPublicKeyFile(value)
      try {
        return parsePublicKey(text)
      } catch (e: any) {
        throw new InvalidConfigurationError(`--public-key ${value.includes("-----BEGIN") ? "value" : JSON.stringify(value)} is not a valid Ed25519 public key: ${e.message || e}`)
      }
    })
  )
}

/** A `--public-key` value that names an existing file is read from it; anything else is taken as a base64 SPKI key. */
async function readPublicKeyFile(value: string): Promise<string> {
  const isFile = await stat(value).then(
    it => it.isFile(),
    () => false
  )
  return isFile ? readFile(value, "utf8") : value
}

async function verifyUpdateManifests(files: Array<string>, publicKeyValues: Array<string>, keyFile: Array<string> | null | undefined): Promise<Array<VerifiedUpdateManifest>> {
  const publicKeys = await resolvePublicKeys(publicKeyValues, keyFile)
  const results = await Promise.all(
    files.map(async file => {
      const info: UpdateInfo = parseUpdateManifestYaml(await readFile(file, "utf8"), file)
      if (collectManifestSignatures(info).length === 0) {
        return { file, version: info.version, ok: false, reason: "not signed" }
      }
      const { ok, keyId, reason } = verifyManifestSignatures(info, publicKeys)
      return { file, version: info.version, ok, keyId, reason: ok ? undefined : (reason ?? "no signature matches a trusted key") }
    })
  )

  for (const result of results) {
    if (result.ok) {
      log.info({ file: result.file, version: result.version, keyId: result.keyId }, "update manifest signature verified")
    } else {
      log.error({ file: result.file, version: result.version, reason: result.reason }, "update manifest signature not verified")
    }
  }
  const failed = results.filter(it => !it.ok)
  if (failed.length > 0) {
    throw new InvalidConfigurationError(
      `${failed.length} of ${results.length} update manifest(s) failed signature verification: ${failed.map(it => `${it.file} (${it.reason})`).join(", ")}`
    )
  }
  return results
}
