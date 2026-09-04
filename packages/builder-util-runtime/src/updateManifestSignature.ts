import { createPublicKey, KeyObject, verify as cryptoVerify } from "crypto"
import { UpdateInfo } from "./updateInfo.js"

/**
 * Version tag of the canonical signing format. Prefixed onto the signed payload so the
 * scheme can evolve without ambiguity: an updater that only understands `EBUM1` will refuse
 * a future `EBUM2` payload rather than silently mis-verify it.
 *
 * EBUM = "electron-builder update manifest".
 */
export const UPDATE_MANIFEST_SIGNATURE_VERSION = "EBUM1"

/**
 * Produces the exact byte string that is Ed25519-signed at publish time and verified at update time.
 *
 * Only integrity- and rollout-critical fields are covered:
 *   - `version`            — prevents version downgrade/substitution
 *   - `stagingPercentage`  — prevents tampering with staged-rollout gating
 *   - each file's `url`, `sha512`, `size` — the artifact identity + integrity hash the updater enforces
 *
 * Cosmetic/operational fields (`releaseDate`, `releaseNotes`, `releaseName`, `minimumSystemVersion`)
 * are intentionally excluded so they can be edited post-signing without invalidating the signature.
 *
 * The format is deterministic regardless of object key order or YAML formatting: files are sorted by
 * url, fields are tab-separated, records are newline-separated, and a version prefix anchors the scheme.
 * Both the signer (build) and verifier (runtime) MUST call this identical function — it is a wire contract.
 */
export function canonicalizeForSigning(info: UpdateInfo): string {
  const lines: string[] = [UPDATE_MANIFEST_SIGNATURE_VERSION, `version:${info.version}`, `staging:${info.stagingPercentage == null ? "-" : info.stagingPercentage}`]

  const files = (info.files ?? []).map(f => `file:${f.url}\t${f.sha512}\t${f.size == null ? "-" : f.size}`)
  // Sort so file ordering in the manifest cannot change the signed payload.
  files.sort()
  lines.push(...files)

  return lines.join("\n")
}

/**
 * Accepts an Ed25519 public key as PEM (`-----BEGIN PUBLIC KEY-----`) or as raw base64-encoded SPKI,
 * and returns a normalized {@link KeyObject}. Throws if the value is not a usable Ed25519 public key.
 */
export function parsePublicKey(value: string): KeyObject {
  const trimmed = value.trim()
  const pem = trimmed.includes("-----BEGIN") ? trimmed : `-----BEGIN PUBLIC KEY-----\n${trimmed.replace(/\s+/g, "")}\n-----END PUBLIC KEY-----`
  const key = createPublicKey({ key: pem, format: "pem" })
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Update manifest public key must be Ed25519, got: ${key.asymmetricKeyType}`)
  }
  return key
}

/**
 * Verifies that `info.signature` is a valid Ed25519 signature over {@link canonicalizeForSigning}(info)
 * for the given public key. Returns a boolean and never throws on a bad signature — the caller decides
 * whether an unverified manifest is fatal. (Malformed keys still throw, since that is a configuration error.)
 */
export function verifyManifestSignature(info: UpdateInfo, publicKey: string | KeyObject): boolean {
  if (info.signature == null || info.signature.length === 0) {
    return false
  }
  const key = typeof publicKey === "string" ? parsePublicKey(publicKey) : publicKey
  const data = Buffer.from(canonicalizeForSigning(info), "utf8")
  let signatureBuffer: Buffer
  try {
    signatureBuffer = Buffer.from(info.signature, "base64")
  } catch {
    return false
  }
  try {
    return cryptoVerify(null, data, key, signatureBuffer)
  } catch {
    // A structurally invalid signature (wrong length, etc.) surfaces as a thrown error in some
    // Node versions — treat it as a verification failure, not a crash.
    return false
  }
}
