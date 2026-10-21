import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, sign as cryptoSign } from "crypto"
import { readFileSync } from "fs"
import * as path from "path"
import {
  canonicalizeForSigning,
  computeUpdateManifestKeyId,
  createManifestSignatureEntry,
  splitPemBlocks,
  UpdateInfo,
  UpdateManifestSignature,
  validateSignedManifestShape,
} from "builder-util-runtime"
import { decodeStrictBase64 } from "./cscLink.js"
import { InvalidConfigurationError } from "./util.js"

/**
 * Build-time counterpart to `verifyManifestSignature`. Lives in builder-util (never bundled into a
 * shipped app) because it handles the private key. Produces the base64 Ed25519 signature embedded as
 * `UpdateInfo.signature`, computed over the same canonical payload the runtime verifier reconstructs.
 * Throws when the manifest does not have the shape the verifier requires of a signed manifest
 * (`validateSignedManifestShape`), so a build never publishes a signed manifest the updater would refuse.
 */
export function signUpdateManifest(info: UpdateInfo, privateKey: string | KeyObject): string {
  const key = typeof privateKey === "string" ? parsePrivateKey(privateKey) : privateKey
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Update manifest signing key must be Ed25519, got: ${key.asymmetricKeyType}`)
  }
  const shapeProblem = validateSignedManifestShape(info)
  if (shapeProblem != null) {
    throw new Error(`Cannot sign update manifest for version ${info.version}: ${shapeProblem} (the updater would reject it)`)
  }
  const data = Buffer.from(canonicalizeForSigning(info), "utf8")
  return cryptoSign(null, data, key).toString("base64")
}

/**
 * Signs the manifest with every given key and returns one `signatures` entry per key, in order, each
 * tagged with the id of the key that produced it. `UpdateInfo.signature` is the first entry's signature.
 * Throws when `privateKeys` is empty — callers decide whether an unsigned manifest is acceptable.
 */
export function createUpdateManifestSignatures(info: UpdateInfo, privateKeys: Array<string | KeyObject>): Array<UpdateManifestSignature> {
  if (privateKeys.length === 0) {
    throw new Error("Cannot sign update manifest: no signing key provided")
  }
  return privateKeys.map(privateKey => {
    const key = typeof privateKey === "string" ? parsePrivateKey(privateKey) : privateKey
    return createManifestSignatureEntry(key, signUpdateManifest(info, key))
  })
}

/** Accepts an Ed25519 private key as a PEM string (PKCS#8) and returns a normalized KeyObject. */
export function parsePrivateKey(value: string): KeyObject {
  const key = createPrivateKey({ key: value.trim(), format: "pem" })
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Update manifest signing key must be Ed25519, got: ${key.asymmetricKeyType}`)
  }
  return key
}

/** Derives the matching public key (PEM) from an Ed25519 private key, so a user only configures one secret. */
export function derivePublicKeyPem(privateKey: string | KeyObject): string {
  const key = typeof privateKey === "string" ? parsePrivateKey(privateKey) : privateKey
  return createPublicKey(key).export({ type: "spki", format: "pem" }).toString().trim()
}

export interface UpdateSigningKeySources {
  signingKey?: string | Array<string> | null
  signingKeyFile?: string | Array<string> | null
}

function toList(value: string | Array<string> | null | undefined): Array<string> {
  if (value == null) {
    return []
  }
  return (Array.isArray(value) ? value : [value]).filter(it => typeof it === "string" && it.trim().length > 0)
}

/** How to produce `ELECTRON_BUILDER_UPDATE_SIGN_KEY`; ends each of its format errors, which never include the value. */
const SIGN_KEY_ENV_HINT =
  "Encode the PEM file on one line: `base64 < update-private-key.pem | tr -d '\\n'` (macOS, Linux), `openssl base64 -A -in update-private-key.pem`, " +
  "or `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path update-private-key.pem)))` (PowerShell). For several keys, concatenate the PEM " +
  "files and encode them once: `cat old.pem new.pem | base64 | tr -d '\\n'`. To pass the path of a PEM file instead, use ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE. " +
  "See https://www.electron.build/docs/features/signed-update-manifests#ci-secrets"

/**
 * Decodes `ELECTRON_BUILDER_UPDATE_SIGN_KEY`: the private key PEM file — one or more concatenated `-----BEGIN PRIVATE KEY-----`
 * blocks — base64-encoded, so the CI secret is a single line that CI systems can mask. Returns the PEM blocks in order.
 */
function decodeSigningKeyEnv(value: string): Array<string> {
  if (value.includes("-----BEGIN")) {
    throw new InvalidConfigurationError(
      `ELECTRON_BUILDER_UPDATE_SIGN_KEY holds PEM text, but it must be the PEM file base64-encoded (the value is not shown). ${SIGN_KEY_ENV_HINT}`
    )
  }
  const decoded = decodeStrictBase64(value)
  if (decoded == null) {
    throw new InvalidConfigurationError(
      "ELECTRON_BUILDER_UPDATE_SIGN_KEY is not valid standard base64 (the value is not shown): only A-Z, a-z, 0-9, `+` and `/` with `=` padding are allowed, " +
        "and line breaks are ignored. Check for surrounding quotes, URL-safe `-` or `_` characters, a truncated value, or separately encoded keys joined " +
        `together. ${SIGN_KEY_ENV_HINT}`
    )
  }
  const text = decoded.toString("utf8")
  const pems = splitPemBlocks(text)
  // a value cut short on a 4-character boundary still decodes, and splitPemBlocks drops an incomplete trailing block, so the
  // text must end with a complete block, or a truncated rotation bundle would silently sign without its last key
  if (!text.includes("-----BEGIN") || !text.trimEnd().endsWith(pems[pems.length - 1])) {
    throw new InvalidConfigurationError(
      "ELECTRON_BUILDER_UPDATE_SIGN_KEY does not decode to complete PEM private keys (the value is not shown): base64-encode the whole PEM file exactly once, " +
        "including its -----BEGIN and -----END lines (not only the key body between them, not an already encoded value, and not a file path), and check that " +
        `the value was not cut off. ${SIGN_KEY_ENV_HINT}`
    )
  }
  return pems
}

/**
 * Resolves the Ed25519 signing private key(s) (PEM) from, in precedence order:
 *   1. explicit `signingKey` config value (PEM literal, or an array of them)
 *   2. `signingKeyFile` config value (path to a PEM file, or an array of paths; relative paths are resolved
 *      against `baseDir` — the project directory — when given, like every other path in the build configuration)
 *   3. `ELECTRON_BUILDER_UPDATE_SIGN_KEY` env (the PEM file base64-encoded, one line that CI systems can mask —
 *      preferred for CI secrets; any value that is not the base64 of complete PEM keys is an InvalidConfigurationError)
 *   4. `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` env (path to a PEM file; several paths may be joined with
 *      `path.delimiter`, i.e. `:` on POSIX and `;` on Windows)
 * The first source that is set wins, but that source may yield several keys: a PEM value (config, file contents,
 * or the decoded env value) may contain several concatenated `-----BEGIN PRIVATE KEY-----` blocks, and the array/list
 * forms hold one key each. Every key is validated (Ed25519, no duplicates) and returned in configured order —
 * the first key is the one written to the legacy single `signature` field.
 * Returns an empty array when nothing is set, meaning manifest signing is disabled.
 * `baseDir` only affects config `signingKeyFile` entries; an `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` path
 * keeps the usual environment-variable semantics and is resolved against the current working directory.
 */
export function loadUpdateSigningKeys(config?: UpdateSigningKeySources | null, baseDir?: string | null): Array<string> {
  let pems: Array<string>
  let source: string
  const configKeys = toList(config?.signingKey)
  const configFiles = toList(config?.signingKeyFile)
  const envKey = process.env.ELECTRON_BUILDER_UPDATE_SIGN_KEY
  const envFile = process.env.ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE
  if (configKeys.length > 0) {
    source = "updateManifest.signingKey"
    pems = configKeys.flatMap(splitPemBlocks)
  } else if (configFiles.length > 0) {
    source = "updateManifest.signingKeyFile"
    pems = configFiles.flatMap(file => splitPemBlocks(readFileSync(baseDir == null ? file : path.resolve(baseDir, file), "utf8")))
  } else if (envKey != null && envKey.trim().length > 0) {
    source = "ELECTRON_BUILDER_UPDATE_SIGN_KEY"
    // decoded only here, after both config sources were passed over, so a stale value never breaks a build keyed from the config
    pems = decodeSigningKeyEnv(envKey)
  } else if (envFile != null && envFile.trim().length > 0) {
    source = "ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE"
    pems = envFile
      .split(path.delimiter)
      .map(it => it.trim())
      .filter(it => it.length > 0)
      .flatMap(file => splitPemBlocks(readFileSync(file, "utf8")))
  } else {
    return []
  }
  return validateSigningKeys(pems, source)
}

function validateSigningKeys(pems: Array<string>, source: string): Array<string> {
  const seen = new Map<string, number>()
  pems.forEach((pem, index) => {
    let key: KeyObject
    try {
      key = parsePrivateKey(pem)
    } catch (e: any) {
      throw new InvalidConfigurationError(`Update manifest signing key #${index + 1} from ${source} is not a valid Ed25519 private key (PEM, PKCS#8): ${e.message || e}`)
    }
    const keyId = computeUpdateManifestKeyId(key)
    const previous = seen.get(keyId)
    if (previous != null) {
      throw new InvalidConfigurationError(
        `Update manifest signing key #${index + 1} from ${source} duplicates key #${previous + 1} (key id ${keyId}). Each signing key must be listed once.`
      )
    }
    seen.set(keyId, index)
  })
  return pems
}

/**
 * Single-key convenience over {@link loadUpdateSigningKeys}: the first configured signing key (PEM), or
 * null when manifest signing is disabled.
 */
export function loadUpdateSigningKey(config?: UpdateSigningKeySources | null, baseDir?: string | null): string | null {
  return loadUpdateSigningKeys(config, baseDir)[0] ?? null
}

/** Generates a fresh Ed25519 keypair as PEM strings, backing the `create-update-key` CLI helper. */
export function generateUpdateSigningKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString().trim(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim(),
  }
}
