import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, sign as cryptoSign } from "crypto"
import { readFileSync } from "fs"
import { canonicalizeForSigning, UpdateInfo } from "builder-util-runtime"

/**
 * Build-time counterpart to `verifyManifestSignature`. Lives in builder-util (never bundled into a
 * shipped app) because it handles the private key. Produces the base64 Ed25519 signature embedded as
 * `UpdateInfo.signature`, computed over the same canonical payload the runtime verifier reconstructs.
 */
export function signUpdateManifest(info: UpdateInfo, privateKey: string | KeyObject): string {
  const key = typeof privateKey === "string" ? parsePrivateKey(privateKey) : privateKey
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Update manifest signing key must be Ed25519, got: ${key.asymmetricKeyType}`)
  }
  const data = Buffer.from(canonicalizeForSigning(info), "utf8")
  return cryptoSign(null, data, key).toString("base64")
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

/**
 * Resolves the Ed25519 signing private key (PEM) from, in precedence order:
 *   1. explicit `signingKey` config value (PEM literal)
 *   2. `signingKeyFile` config value (path to a PEM file)
 *   3. `EP_UPDATE_SIGN_KEY` env (PEM literal — preferred for CI secrets)
 *   4. `EP_UPDATE_SIGN_KEY_FILE` env (path to a PEM file)
 * Returns null when none are set, meaning manifest signing is disabled.
 */
export function loadUpdateSigningKey(config?: { signingKey?: string | null; signingKeyFile?: string | null }): string | null {
  if (config?.signingKey) {
    return config.signingKey
  }
  if (config?.signingKeyFile) {
    return readFileSync(config.signingKeyFile, "utf8")
  }
  if (process.env.EP_UPDATE_SIGN_KEY) {
    return process.env.EP_UPDATE_SIGN_KEY
  }
  const file = process.env.EP_UPDATE_SIGN_KEY_FILE
  if (file) {
    return readFileSync(file, "utf8")
  }
  return null
}

/** Generates a fresh Ed25519 keypair as PEM strings, backing the `create-update-key` CLI helper. */
export function generateUpdateSigningKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString().trim(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim(),
  }
}
