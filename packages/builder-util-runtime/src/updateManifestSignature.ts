import { createHash, createPublicKey, KeyObject, verify as cryptoVerify } from "crypto"
import { PackageFileInfo, UpdateInfo, UpdateManifestSignature, WindowsUpdateInfo } from "./updateInfo.js"

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
 *   - `version`               — prevents version downgrade/substitution
 *   - `stagingPercentage`     — prevents tampering with staged-rollout gating
 *   - `minimumSystemVersion`  — prevents bypassing or forging the OS-version gate (its absence is signed too,
 *                               so one cannot be added after the fact)
 *   - each file's `url`, `sha512`, `size` — the artifact identity + integrity hash the updater enforces
 *   - each NSIS web-installer package's `path`, `sha512`, `size`, `blockMapSize`, `isAdminRightsRequired`
 *     (`WindowsUpdateInfo.packages`, keyed by arch) — the payload the web installer downloads and verifies
 *
 * Cosmetic/operational fields (`releaseDate`, `releaseNotes`, `releaseName`) are intentionally excluded so
 * they can be edited post-signing without invalidating the signature. The `signature`/`signatures` fields are
 * not part of the payload either, so signatures can be added or removed independently of one another.
 *
 * The format is deterministic regardless of object key order or YAML formatting: files are sorted by url,
 * packages by arch, fields are tab-separated, records are newline-separated, and a version prefix anchors the
 * scheme. Both the signer (build) and verifier (runtime) MUST call this identical function — it is a wire
 * contract — and both operate on the manifest exactly as written to `latest*.yml`: the signer runs on the
 * final `UpdateInfo` right before serialization, the verifier on the parsed manifest before the provider
 * resolves `files[].url` / `packages[arch].path` against the feed base URL.
 */
export function canonicalizeForSigning(info: UpdateInfo): string {
  const lines: string[] = [
    UPDATE_MANIFEST_SIGNATURE_VERSION,
    `version:${info.version}`,
    `staging:${info.stagingPercentage == null ? "-" : info.stagingPercentage}`,
    // always emitted (empty when unset) so that adding a minimumSystemVersion to a signed manifest is detected
    `minos:${info.minimumSystemVersion ?? ""}`,
  ]

  const files = (info.files ?? []).map(f => `file:${f.url}\t${f.sha512}\t${f.size == null ? "-" : f.size}`)
  // Sort so file ordering in the manifest cannot change the signed payload.
  files.sort()
  lines.push(...files)

  // NSIS web installer only: the app payload is a separate per-arch package that the installer downloads.
  // Nothing is emitted when there are no packages, so every other manifest is unaffected by this section.
  const packages = (info as WindowsUpdateInfo).packages
  if (packages != null) {
    const packageLines = Object.keys(packages).map(arch => {
      // a null/garbage entry still yields a (distinct) line rather than a crash, so verification fails cleanly
      const p: Partial<PackageFileInfo> = packages[arch] ?? {}
      return `package:${arch}\t${p.path ?? ""}\t${p.sha512 ?? ""}\t${p.size ?? ""}\t${p.blockMapSize ?? ""}\t${p.isAdminRightsRequired === true ? "1" : ""}`
    })
    // Sort so package (arch key) ordering in the manifest cannot change the signed payload.
    packageLines.sort()
    lines.push(...packageLines)
  }

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

const PEM_BEGIN_MARKER = "-----BEGIN "
const PEM_END_MARKER = "-----END "
const PEM_MARKER_DASHES = "-----"

/**
 * Given the index of a `-----BEGIN ` / `-----END ` marker prefix in `text`, returns the index just past the
 * marker's closing `-----`, or -1 when the label is empty or contains a dash (i.e. this is not a well-formed
 * marker). Each call does at most one `indexOf` forward from the label start, so callers stay linear.
 */
function findPemMarkerEnd(text: string, markerStart: number, markerPrefix: string): number {
  const labelStart = markerStart + markerPrefix.length
  const dash = text.indexOf("-", labelStart)
  if (dash <= labelStart || !text.startsWith(PEM_MARKER_DASHES, dash)) {
    return -1
  }
  return dash + PEM_MARKER_DASHES.length
}

/**
 * Splits a text that may contain several concatenated PEM blocks into one string per block.
 * Text without any `-----BEGIN` marker (e.g. a raw base64 SPKI key) is returned as a single entry.
 * Whitespace-only input yields an empty array.
 *
 * Each block runs from a well-formed `-----BEGIN <label>-----` marker through the next well-formed
 * `-----END <label>-----` marker (inclusive); text outside blocks is ignored and order is preserved.
 * Implemented as a single forward scan with `indexOf` rather than a regular expression, because the
 * input is untrusted (key material from config/env/files) and a backtracking regex over many repeated
 * `-----BEGIN` prefixes without a matching `-----END` runs in polynomial time (CodeQL js/polynomial-redos).
 */
export function splitPemBlocks(text: string): Array<string> {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return []
  }
  if (!trimmed.includes("-----BEGIN")) {
    return [trimmed]
  }

  const blocks: Array<string> = []
  let position = 0
  while (position < trimmed.length) {
    const beginAt = trimmed.indexOf(PEM_BEGIN_MARKER, position)
    if (beginAt < 0) {
      break
    }
    const beginEnd = findPemMarkerEnd(trimmed, beginAt, PEM_BEGIN_MARKER)
    if (beginEnd < 0) {
      // not a well-formed BEGIN marker (e.g. `-----BEGIN -----`) — keep scanning after it
      position = beginAt + 1
      continue
    }

    let endAt = -1
    let endEnd = -1
    let searchFrom = beginEnd
    while (endAt < 0 || endEnd < 0) {
      endAt = trimmed.indexOf(PEM_END_MARKER, searchFrom)
      if (endAt < 0) {
        break
      }
      endEnd = findPemMarkerEnd(trimmed, endAt, PEM_END_MARKER)
      searchFrom = endAt + 1
    }
    if (endAt < 0) {
      // no well-formed END marker anywhere after this BEGIN — nor after any later BEGIN
      break
    }

    blocks.push(trimmed.substring(beginAt, endEnd))
    position = endEnd
  }

  if (blocks.length === 0) {
    // has a BEGIN marker but no complete block — hand it to the key parser so the error names the real problem
    return [trimmed]
  }
  return blocks
}

/**
 * Normalizes a configured public-key value (`updateManifestPublicKey` in `app-update.yml`, or the
 * runtime override) into a flat list of key strings. A single string may itself contain several
 * concatenated PEM blocks. `null`/`undefined` and blank entries yield an empty list.
 */
export function normalizePublicKeyList(value: string | Array<string> | null | undefined): Array<string> {
  if (value == null) {
    return []
  }
  const entries = Array.isArray(value) ? value : [value]
  const result: Array<string> = []
  for (const entry of entries) {
    if (typeof entry === "string") {
      result.push(...splitPemBlocks(entry))
    }
  }
  return result
}

/**
 * Stable identifier of an Ed25519 key: lowercase hex SHA-256 of the SPKI DER encoding of its public half.
 * Recorded next to each signature in `UpdateInfo.signatures` so an updater holding several trusted keys can
 * pick the matching signature without trial verification, and so humans can tell which key signed a release.
 * Accepts a public key (PEM or base64 SPKI) or a public/private {@link KeyObject}.
 */
export function computeUpdateManifestKeyId(publicKey: string | KeyObject): string {
  let key = typeof publicKey === "string" ? parsePublicKey(publicKey) : publicKey
  if (key.type === "private") {
    key = createPublicKey(key)
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Update manifest key must be Ed25519, got: ${key.asymmetricKeyType}`)
  }
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex")
}

/**
 * Every signature carried by a manifest, as candidates for verification: the entries of
 * `info.signatures` (each tagged with the id of the key that produced it) plus the legacy
 * top-level `info.signature` (untagged) when it is set and not already present in the list.
 * Blank entries are dropped. An empty result means the manifest is unsigned.
 */
export function collectManifestSignatures(info: UpdateInfo): Array<{ readonly keyId?: string; readonly signature: string }> {
  const result: Array<{ readonly keyId?: string; readonly signature: string }> = []
  for (const entry of info.signatures ?? []) {
    if (entry != null && typeof entry.signature === "string" && entry.signature.length > 0) {
      result.push({ keyId: typeof entry.keyId === "string" && entry.keyId.length > 0 ? entry.keyId : undefined, signature: entry.signature })
    }
  }
  if (typeof info.signature === "string" && info.signature.length > 0 && !result.some(it => it.signature === info.signature)) {
    result.push({ signature: info.signature })
  }
  return result
}

function verifySignatureBytes(data: Buffer, key: KeyObject, signature: string): boolean {
  let signatureBuffer: Buffer
  try {
    signatureBuffer = Buffer.from(signature, "base64")
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

/**
 * Verifies a manifest against a trust list of Ed25519 public keys. The manifest is accepted when ANY
 * trusted key validates ANY of the signatures it carries (see {@link collectManifestSignatures}); this is
 * what lets a release be dual-signed during key rotation and an install trust `[old, new]`.
 *
 * For each trusted key, signatures tagged with that key's {@link computeUpdateManifestKeyId} are tried
 * first, then untagged (legacy `signature`) entries — so a stale or foreign `keyId` never prevents a
 * legitimately signed manifest from verifying. Never throws on a bad signature; malformed *keys* still
 * throw, since that is a configuration error. Returns the id of the trusted key that verified, if any.
 */
export function verifyManifestSignatures(info: UpdateInfo, publicKeys: Array<string | KeyObject>): { ok: boolean; keyId?: string } {
  const candidates = collectManifestSignatures(info)
  if (candidates.length === 0 || publicKeys.length === 0) {
    return { ok: false }
  }
  const data = Buffer.from(canonicalizeForSigning(info), "utf8")
  const seen = new Set<string>()
  for (const publicKey of publicKeys) {
    const key = typeof publicKey === "string" ? parsePublicKey(publicKey) : publicKey
    const keyId = computeUpdateManifestKeyId(key)
    if (seen.has(keyId)) {
      continue
    }
    seen.add(keyId)
    const tagged = candidates.filter(it => it.keyId === keyId)
    const untagged = candidates.filter(it => it.keyId == null)
    for (const candidate of [...tagged, ...untagged]) {
      if (verifySignatureBytes(data, key, candidate.signature)) {
        return { ok: true, keyId }
      }
    }
  }
  return { ok: false }
}

/**
 * Single-key convenience over {@link verifyManifestSignatures}: true when `publicKey` validates the
 * legacy `info.signature` or any entry of `info.signatures`. Returns a boolean and never throws on a bad
 * signature — the caller decides whether an unverified manifest is fatal. (Malformed keys still throw.)
 */
export function verifyManifestSignature(info: UpdateInfo, publicKey: string | KeyObject): boolean {
  return verifyManifestSignatures(info, [publicKey]).ok
}

/** Builds the `signatures` entry for one key: the key's id next to its base64 signature. */
export function createManifestSignatureEntry(publicKey: string | KeyObject, signature: string): UpdateManifestSignature {
  return { keyId: computeUpdateManifestKeyId(publicKey), signature }
}
