import { createHash, createPublicKey, KeyObject, verify as cryptoVerify } from "crypto"
import { PackageFileInfo, UpdateFileInfo, UpdateInfo, UpdateManifestSignature, UpdateManifestSignatureFormat, WindowsUpdateInfo } from "./updateInfo.js"

/**
 * Version tag of the `EBUM1` canonical signing format (see {@link canonicalizeForSigning}). Prefixed onto the signed
 * payload so the scheme can evolve without ambiguity: an `EBUM1` signature can never verify as an `EBUM2` one, or the
 * other way round, because the two payloads start with different tags.
 *
 * EBUM = "electron-builder update manifest".
 */
export const UPDATE_MANIFEST_SIGNATURE_VERSION = "EBUM1"

/** Version tag of the `EBUM2` canonical signing format (see {@link canonicalizeForSigningV2}). */
export const UPDATE_MANIFEST_SIGNATURE_VERSION_2 = "EBUM2"

/**
 * Top-level manifest fields that `EBUM2` does not sign. `signature`/`signatures` hold the signatures themselves, so
 * signatures can be added or removed independently of each other. `releaseNotes` stays editable after publishing.
 * `releaseName` is excluded because the GitHub and GitLab providers fill it in from the release when the manifest has
 * none, so the updater could not tell a signed value from one it added itself. Everything else is signed, at every depth.
 */
export const UPDATE_MANIFEST_UNSIGNED_FIELDS: ReadonlyArray<string> = ["signature", "signatures", "releaseName", "releaseNotes"]

/**
 * Every top-level field an `EBUM1`-only electron-builder (27.0.0-alpha.9 to alpha.14) can write into `latest*.yml`, plus
 * `allowCatalogSignature`, which `EBUM1` itself signs when it is `true` (see {@link canonicalizeForSigning}).
 * {@link verifyManifestSignatures} accepts an `EBUM1` signature only for a manifest whose top-level fields are all in this
 * list. Stripping the `EBUM2` signatures from a dual-signed manifest therefore cannot smuggle a newer field past the
 * updater on the strength of its `EBUM1` signature, which does not cover it: a field added after `EBUM2` is protected
 * from the release that introduces it. Frozen — a new field must never be added here.
 */
export const EBUM1_MANIFEST_FIELDS: ReadonlyArray<string> = [
  "version",
  "files",
  "path",
  "sha512",
  "sha2",
  "packages",
  "isAdminRightsRequired",
  "releaseName",
  "releaseNotes",
  "releaseDate",
  "stagingPercentage",
  "minimumSystemVersion",
  "allowCatalogSignature",
  "vendor",
  "signature",
  "signatures",
]

/**
 * Encodes one field value for the canonical payload. Strings are JSON-quoted, which escapes `"`, `\`,
 * newlines, tabs and every other control character, so a value can never contain the record separator
 * (`\n`), the field separator (`\t`) or masquerade as a `label:` line. Numbers/booleans are emitted bare
 * (`25`), so they can never collide with a string (`"25"`). `null`/`undefined` become the empty string,
 * which no JSON encoding produces — an absent field is therefore distinct from every present one,
 * including the empty string (`""`). Together this makes {@link canonicalizeForSigning} injective over the
 * fields it covers: two manifests produce the same bytes only if every signed field is identical.
 */
function encodeField(value: unknown): string {
  if (value === undefined || value === null) {
    return ""
  }
  const encoded = JSON.stringify(value)
  // JSON.stringify yields undefined for functions/symbols; a parsed YAML manifest never contains those,
  // but keep the output a string in every case so the signer and verifier can never diverge on a crash
  return encoded === undefined ? "" : encoded
}

/**
 * Produces the exact byte string that is Ed25519-signed at publish time and verified at update time.
 *
 * Only integrity- and rollout-critical fields are covered:
 *   - `version`               — prevents version downgrade/substitution
 *   - `stagingPercentage`     — prevents tampering with staged-rollout gating
 *   - `minimumSystemVersion`  — prevents bypassing or forging the OS-version gate (its absence is signed too,
 *                               so one cannot be added after the fact)
 *   - `allowCatalogSignature` — (`WindowsUpdateInfo`) only when it is exactly `true`, as an extra line; a manifest without it, or
 *                               with `false`, canonicalizes exactly as before, and adding `true` after signing breaks the signature
 *   - each file's `url`, `sha512`, `size` — the artifact identity + integrity hash the updater enforces — and its
 *     `blockMapUrl` when present (an extra field on the file record only then, so other manifests are unaffected)
 *   - each NSIS web-installer package's arch key and `path`, `sha512`, `size`, `blockMapSize`, `isAdminRightsRequired`
 *     (`WindowsUpdateInfo.packages`, keyed by arch) — the payload the web installer downloads and verifies
 *
 * Cosmetic/operational fields (`releaseDate`, `releaseNotes`, `releaseName`) are intentionally excluded so
 * they can be edited post-signing without invalidating the signature. The `signature`/`signatures` fields are
 * not part of the payload either, so signatures can be added or removed independently of one another. The
 * deprecated top-level `path`/`sha512` mirror of `files[0]` is not signed; instead the verifier refuses a
 * signed manifest without a non-empty `files` list (see {@link validateSignedManifestShape}), so the updater
 * never falls back to those legacy fields for a verified manifest.
 *
 * `files[].isAdminRightsRequired` is intentionally NOT signed. It is only a launch hint (spawn the installer
 * directly vs. through `elevate.exe`); the installer itself is pinned by the signed `url`/`sha512`/`size`, so
 * tampering with the flag cannot change what gets installed — the worst case is an unexpected UAC prompt or an
 * unnecessary `elevate.exe` launch. Leaving it unsigned lets a publisher correct a misconfigured value in
 * `latest.yml` without re-signing. The `isAdminRightsRequired` column of the `package:` records below is part of
 * the `EBUM1` wire format for historic reasons; electron-updater does not read it from `packages`.
 *
 * Wire format (`EBUM1`): one record per line, `label:` followed by tab-separated fields, e.g.
 *
 *     EBUM1
 *     version:"1.2.3"
 *     staging:25
 *     minimumSystemVersion:"10.0.19041"
 *     allowCatalogSignature:true                                                (only with allowCatalogSignature: true)
 *     file:"App-1.2.3.exe"<TAB>"<sha512>"<TAB>8123456
 *     file:"App-1.2.4.exe"<TAB>"<sha512>"<TAB>8123456<TAB>"https://cdn.example.com/App-1.2.4.exe.blockmap?sig=…"   (with a blockMapUrl)
 *     package:"x64"<TAB>"App-1.2.3-x64.nsis.7z"<TAB>"<sha512>"<TAB>5000<TAB>120<TAB>1
 *
 * Every value goes through {@link encodeField} (JSON-quoted strings, bare numbers, empty for absent), which is
 * what makes the encoding injective: a value can never contain an unescaped newline or tab, so no choice of
 * field values in one manifest can reproduce the record structure of another (e.g. an empty `files` list plus
 * a `minimumSystemVersion` that spells out the original `file:` lines). The format is deterministic regardless
 * of object key order or YAML formatting: file records are sorted, package records are sorted, and a version
 * prefix anchors the scheme. Both the signer (build) and verifier (runtime) MUST call this identical function —
 * it is a wire contract — and both operate on the manifest exactly as written to `latest*.yml`: the signer runs
 * on the final `UpdateInfo` right before serialization, the verifier on the parsed manifest before the provider
 * resolves `files[].url` / `packages[arch].path` against the feed base URL. This function never throws; shape
 * problems are reported by {@link validateSignedManifestShape} instead.
 */
export function canonicalizeForSigning(info: UpdateInfo): string {
  const lines: string[] = [
    UPDATE_MANIFEST_SIGNATURE_VERSION,
    `version:${encodeField(info.version)}`,
    `staging:${encodeField(info.stagingPercentage)}`,
    // always emitted (empty when unset) so that adding a minimumSystemVersion to a signed manifest is detected
    `minimumSystemVersion:${encodeField(info.minimumSystemVersion)}`,
  ]
  // only emitted for exactly `true`, so manifests without it (or with `false`) canonicalize exactly as before; a manifest that has it
  // cannot be verified by an electron-updater without this line (7.0.0-alpha.8 to alpha.11)
  if (readAllowCatalogSignature(info) === true) {
    lines.push("allowCatalogSignature:true")
  }

  const files = (info.files ?? []).map(f => {
    const record = `file:${encodeField(f?.url)}\t${encodeField(f?.sha512)}\t${encodeField(f?.size)}`
    // only emitted when present, so manifests without a blockMapUrl canonicalize exactly as before
    return f?.blockMapUrl == null ? record : `${record}\t${encodeField(f.blockMapUrl)}`
  })
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
      return `package:${encodeField(arch)}\t${encodeField(p.path)}\t${encodeField(p.sha512)}\t${encodeField(p.size)}\t${encodeField(p.blockMapSize)}\t${p.isAdminRightsRequired === true ? "1" : ""}`
    })
    // Sort so package (arch key) ordering in the manifest cannot change the signed payload.
    packageLines.sort()
    lines.push(...packageLines)
  }

  return lines.join("\n")
}

/** Returned by {@link canonicalizeForSigningV2}: the payload, or why the manifest cannot be canonicalized. */
export type CanonicalizationResult = { readonly ok: true; readonly payload: string } | { readonly ok: false; readonly reason: string }

/** Deeper than any manifest electron-builder writes; bounds the recursion on hostile input. */
const MAX_CANONICAL_DEPTH = 32

const UNSIGNED_FIELDS_V2 = new Set(UPDATE_MANIFEST_UNSIGNED_FIELDS)

class CanonicalizationError extends Error {}

/** A mapping as js-yaml parses it: a plain object (prototype `Object.prototype` or `null`), not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null"
  }
  if (typeof value !== "object") {
    return typeof value
  }
  const tag = Object.prototype.toString.call(value)
  return tag.substring(8, tag.length - 1)
}

/** Appends a key to a diagnostic path, e.g. `files[0].url` or `vendor["a b"]`. */
function childPath(parent: string, key: string): string {
  const segment = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`
  if (parent.length === 0) {
    return segment
  }
  return segment.startsWith("[") ? `${parent}${segment}` : `${parent}.${segment}`
}

function encodeCanonical(value: unknown, path: string, depth: number, seen: Set<object>): string {
  if (value === null) {
    return "null"
  }
  switch (typeof value) {
    case "string":
      // JSON.stringify escapes `"`, `\`, control characters and lone surrogates identically in every ES2019+ engine
      return JSON.stringify(value)
    case "boolean":
      return value ? "true" : "false"
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(`${path} is not a finite number`)
      }
      if (Object.is(value, -0)) {
        throw new CanonicalizationError(`${path} is negative zero`)
      }
      // the ECMAScript Number-to-String algorithm: shortest round-tripping form, as RFC 8785 specifies
      return JSON.stringify(value)
    case "object":
      break
    default:
      throw new CanonicalizationError(`${path} is ${describeValue(value)}, which has no canonical form`)
  }

  if (depth > MAX_CANONICAL_DEPTH) {
    throw new CanonicalizationError(`${path} is nested deeper than ${MAX_CANONICAL_DEPTH} levels`)
  }
  // electron-builder writes manifests without YAML anchors/aliases (noRefs), so a value reached twice is an alias,
  // and an alias can expand exponentially or form a cycle — refuse it rather than walk it
  if (seen.has(value)) {
    throw new CanonicalizationError(`${path} repeats an earlier value (a YAML alias), which a signed manifest cannot contain`)
  }
  seen.add(value)

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new CanonicalizationError(`${path} is ${describeValue(value)}, which has no canonical form`)
    }
    const items: Array<string> = []
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        throw new CanonicalizationError(`${path}[${i}] is missing`)
      }
      items.push(encodeCanonical(value[i], `${path}[${i}]`, depth + 1, seen))
    }
    return `[${items.join(",")}]`
  }

  if (!isPlainObject(value)) {
    // e.g. a Date from an unquoted YAML timestamp, or a Buffer from !!binary: the signer's and verifier's views of such
    // a value are not guaranteed to agree, so it is refused instead of being converted
    throw new CanonicalizationError(`${path} is ${describeValue(value)}, which has no canonical form (quote it in the YAML to make it a string)`)
  }
  return encodeCanonicalObject(value, path, depth, seen, false)
}

function encodeCanonicalObject(value: Record<string, unknown>, path: string, depth: number, seen: Set<object>, topLevel: boolean): string {
  const members: Array<string> = []
  // Array.prototype.sort without a comparator orders by UTF-16 code units, as RFC 8785 specifies
  for (const key of Object.keys(value).sort()) {
    if (topLevel && UNSIGNED_FIELDS_V2.has(key)) {
      continue
    }
    const memberPath = childPath(path, key)
    const member = value[key]
    if (member === undefined) {
      // YAML has no undefined; the signer serializes and re-parses before signing, so this is never produced
      throw new CanonicalizationError(`${memberPath} is undefined`)
    }
    members.push(`${JSON.stringify(key)}:${encodeCanonical(member, memberPath, depth + 1, seen)}`)
  }
  return `{${members.join(",")}}`
}

/**
 * Produces the exact byte string an `EBUM2` signature covers: the tag `EBUM2`, a newline, and the manifest as canonical
 * JSON. Every top-level field is included except {@link UPDATE_MANIFEST_UNSIGNED_FIELDS} (`signature`, `signatures`,
 * `releaseName`, `releaseNotes`), and everything below the top level is included in full. A field added to the manifest
 * format later is therefore signed without any change to the verifier, and adding, removing or changing any covered
 * field — including one this version of electron-updater does not know — invalidates the signature.
 *
 * Canonical JSON (the RFC 8785 / JCS serialization, restricted to the values listed here):
 *   - object members sorted by key (UTF-16 code units), at every depth; no whitespace
 *   - arrays in their original order
 *   - strings and finite numbers as `JSON.stringify` writes them; `true`, `false`, `null`
 *
 * The signer and the verifier must canonicalize the same value. electron-builder serializes the manifest to YAML, parses
 * it back with js-yaml and signs that, and electron-updater canonicalizes the manifest exactly as js-yaml parsed it, before
 * any provider adds fields of its own. Values whose parsed form is not guaranteed to be the same on both sides are refused
 * rather than guessed at: anything other than a plain mapping, array, string, finite number, boolean or null (an unquoted
 * YAML timestamp becomes a `Date`, `!!binary` a `Buffer`), negative zero, `undefined`, a value reached twice (a YAML alias)
 * and nesting deeper than 32 levels. electron-builder writes `releaseDate` as a quoted string, so it stays a string.
 *
 * Never throws: a manifest that cannot be canonicalized yields `{ ok: false, reason }`.
 */
export function canonicalizeForSigningV2(manifest: unknown): CanonicalizationResult {
  if (!isPlainObject(manifest)) {
    return { ok: false, reason: `the manifest is ${describeValue(manifest)}, not a mapping` }
  }
  try {
    const seen = new Set<object>([manifest])
    return { ok: true, payload: `${UPDATE_MANIFEST_SIGNATURE_VERSION_2}\n${encodeCanonicalObject(manifest, "", 0, seen, true)}` }
  } catch (e: unknown) {
    if (e instanceof CanonicalizationError) {
      return { ok: false, reason: e.message }
    }
    // e.g. a stack overflow or a throwing getter on a hand-built object; never on a parsed manifest
    return { ok: false, reason: `the manifest cannot be canonicalized: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Top-level fields of `info` that are not in {@link EBUM1_MANIFEST_FIELDS}, i.e. that an `EBUM1` signature does not vouch
 * for and that no `EBUM1`-only electron-builder writes. Empty when an `EBUM1` signature may be accepted for the manifest.
 */
export function findFieldsOutsideEbum1(info: UpdateInfo): Array<string> {
  const known = new Set(EBUM1_MANIFEST_FIELDS)
  return Object.keys(info).filter(key => !known.has(key))
}

/**
 * `WindowsUpdateInfo.allowCatalogSignature` as written in the manifest, read without assuming the manifest's type (a parsed
 * `latest*.yml` may carry any value, or none). Never throws for an object.
 */
function readAllowCatalogSignature(info: UpdateInfo): unknown {
  return "allowCatalogSignature" in info ? info.allowCatalogSignature : undefined
}

/** True when `value` contains an ASCII control character (U+0000-U+001F or U+007F). */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Checks that a manifest has the shape a *signed* manifest must have for its signature to mean anything,
 * independent of the key material. Returns a human-readable reason when it does not, or `null` when it does.
 *
 * Enforced by {@link verifyManifestSignatures} before any signature is checked, and by the build-time signer
 * so that a manifest the updater would reject is never signed in the first place:
 *   - `version` is a non-empty string
 *   - `files` is a non-empty array whose entries have a non-empty string `url` and `sha512` (and a numeric
 *     `size` and a non-empty string `blockMapUrl` when present) — a signed manifest must describe its own files, so the updater never consults the
 *     unsigned legacy top-level `path`/`sha512` for it
 *   - `stagingPercentage` is a number when present, `minimumSystemVersion` a string when present, `allowCatalogSignature`
 *     a boolean when present
 *   - every `packages` entry (NSIS web installer) has a non-empty string `path` and `sha512`, numeric
 *     `size`/`blockMapSize` when present, and a boolean `isAdminRightsRequired` when present
 *   - no signed string field (including package arch keys) contains a control character (U+0000–U+001F, U+007F)
 *
 * The canonical encoding is injective on its own (see {@link canonicalizeForSigning}), so these checks are a
 * second, independent line of defense: they reject a manifest whose signed fields could only have been crafted
 * to confuse a parser or a version comparison, rather than relying on every downstream consumer to cope.
 */
export function validateSignedManifestShape(info: UpdateInfo): string | null {
  if (!isNonEmptyString(info.version)) {
    return "version must be a non-empty string"
  }
  const strings: Array<[string, string]> = [["version", info.version]]
  if (info.stagingPercentage != null && typeof info.stagingPercentage !== "number") {
    return "stagingPercentage must be a number"
  }
  if (info.minimumSystemVersion != null) {
    if (typeof info.minimumSystemVersion !== "string") {
      return "minimumSystemVersion must be a string"
    }
    strings.push(["minimumSystemVersion", info.minimumSystemVersion])
  }
  const allowCatalogSignature = readAllowCatalogSignature(info)
  if (allowCatalogSignature != null && typeof allowCatalogSignature !== "boolean") {
    return "allowCatalogSignature must be a boolean"
  }

  const files = info.files
  if (!Array.isArray(files) || files.length === 0) {
    return "files must be a non-empty array"
  }
  for (let i = 0; i < files.length; i++) {
    const file: Partial<UpdateFileInfo> | null = files[i]
    if (file == null || !isNonEmptyString(file.url) || !isNonEmptyString(file.sha512)) {
      return `files[${i}] must have a non-empty string url and sha512`
    }
    if (file.size != null && typeof file.size !== "number") {
      return `files[${i}].size must be a number`
    }
    strings.push([`files[${i}].url`, file.url], [`files[${i}].sha512`, file.sha512])
    if (file.blockMapUrl != null) {
      if (!isNonEmptyString(file.blockMapUrl)) {
        return `files[${i}].blockMapUrl must be a non-empty string`
      }
      strings.push([`files[${i}].blockMapUrl`, file.blockMapUrl])
    }
  }

  const packages = (info as WindowsUpdateInfo).packages
  if (packages != null) {
    if (typeof packages !== "object" || Array.isArray(packages)) {
      return "packages must be an object keyed by arch"
    }
    for (const arch of Object.keys(packages)) {
      const p: Partial<PackageFileInfo> | null = packages[arch]
      if (p == null || !isNonEmptyString(p.path) || !isNonEmptyString(p.sha512)) {
        return `packages.${arch} must have a non-empty string path and sha512`
      }
      if ((p.size != null && typeof p.size !== "number") || (p.blockMapSize != null && typeof p.blockMapSize !== "number")) {
        return `packages.${arch} size and blockMapSize must be numbers`
      }
      if (p.isAdminRightsRequired != null && typeof p.isAdminRightsRequired !== "boolean") {
        return `packages.${arch}.isAdminRightsRequired must be a boolean`
      }
      strings.push([`packages arch key ${JSON.stringify(arch)}`, arch], [`packages.${arch}.path`, p.path], [`packages.${arch}.sha512`, p.sha512])
    }
  }

  for (const [name, value] of strings) {
    if (hasControlCharacter(value)) {
      return `${name} contains a control character`
    }
  }
  return null
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

/** One signature carried by a manifest, as a candidate for verification (see {@link collectManifestSignatures}). */
export interface ManifestSignatureCandidate {
  /** The id of the key that produced it, when the entry names one. */
  readonly keyId?: string
  readonly signature: string
  /** The payload format the entry claims to sign: its `format` value, or `EBUM1` when it has none. May be a format this version does not know. */
  readonly format: string
}

/**
 * Every signature carried by a manifest, as candidates for verification: the entries of
 * `info.signatures` (each tagged with the id of the key that produced it and the payload format it signs)
 * plus the legacy top-level `info.signature` (untagged, `EBUM1`) when it is set and not already present in
 * the list. Blank entries are dropped. An empty result means the manifest is unsigned.
 */
export function collectManifestSignatures(info: UpdateInfo): Array<ManifestSignatureCandidate> {
  const result: Array<ManifestSignatureCandidate> = []
  const entries: unknown = info.signatures
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry != null && typeof entry.signature === "string" && entry.signature.length > 0) {
      result.push({
        keyId: typeof entry.keyId === "string" && entry.keyId.length > 0 ? entry.keyId : undefined,
        signature: entry.signature,
        format: typeof entry.format === "string" && entry.format.length > 0 ? entry.format : UPDATE_MANIFEST_SIGNATURE_VERSION,
      })
    }
  }
  if (typeof info.signature === "string" && info.signature.length > 0 && !result.some(it => it.signature === info.signature)) {
    result.push({ signature: info.signature, format: UPDATE_MANIFEST_SIGNATURE_VERSION })
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

interface TrustedKey {
  readonly key: KeyObject
  readonly keyId: string
}

/**
 * For each trusted key in order, tries the candidates tagged with that key's id first, then the untagged ones, so a
 * stale or foreign `keyId` never prevents a legitimately signed manifest from verifying. Returns the id of the key that
 * verified, or null.
 */
function findVerifyingKey(data: Buffer, trustedKeys: Array<TrustedKey>, candidates: Array<ManifestSignatureCandidate>): string | null {
  for (const { key, keyId } of trustedKeys) {
    const tagged = candidates.filter(it => it.keyId === keyId)
    const untagged = candidates.filter(it => it.keyId == null)
    for (const candidate of [...tagged, ...untagged]) {
      if (verifySignatureBytes(data, key, candidate.signature)) {
        return keyId
      }
    }
  }
  return null
}

/** Result of {@link verifyManifestSignatures}. */
export interface ManifestVerificationResult {
  readonly ok: boolean
  /** The id of the trusted key that verified the manifest. */
  readonly keyId?: string
  /** The payload format of the signature that verified the manifest. */
  readonly format?: UpdateManifestSignatureFormat
  /** Why the manifest was refused before or apart from a plain signature mismatch, when it was. */
  readonly reason?: string
}

/**
 * Verifies a manifest against a trust list of Ed25519 public keys. The manifest is accepted when ANY
 * trusted key validates ANY of the signatures it carries (see {@link collectManifestSignatures}); this is
 * what lets a release be dual-signed during key rotation and an install trust `[old, new]`.
 *
 * Formats are tried in order of preference:
 *   1. `EBUM2` entries, over {@link canonicalizeForSigningV2} — every field but the unsigned ones.
 *   2. `EBUM1` entries (and the legacy `signature`), over {@link canonicalizeForSigning} — only when every top-level field
 *      of the manifest is one an `EBUM1`-only electron-builder writes ({@link EBUM1_MANIFEST_FIELDS}). This keeps manifests
 *      from 27.0.0-alpha.9 to alpha.14 verifying, while a field newer than `EBUM1` is only ever accepted under an `EBUM2`
 *      signature, which covers it.
 * Entries in a format this version does not know are skipped. Within a format, signatures tagged with a trusted key's
 * {@link computeUpdateManifestKeyId} are tried first, then untagged entries. Never throws on a bad signature; malformed
 * *keys* still throw, since that is a configuration error. Returns the id of the trusted key and the format that verified.
 *
 * `info` must be the manifest exactly as js-yaml parsed it: `EBUM2` covers every field, so a field a provider adds after
 * parsing (a GitHub `tag`, say) would fail verification. Before any signature is tried the manifest must pass
 * {@link validateSignedManifestShape}; a manifest that does not is rejected with `reason` set, regardless of what it is
 * signed with.
 */
export function verifyManifestSignatures(info: UpdateInfo, publicKeys: Array<string | KeyObject>): ManifestVerificationResult {
  const candidates = collectManifestSignatures(info)
  if (candidates.length === 0 || publicKeys.length === 0) {
    return { ok: false }
  }
  // A signed manifest must have the shape the signature is meant to protect (non-empty files, plain string
  // fields, ...) — checked before any cryptography so that a structurally hostile manifest is rejected even
  // if its bytes happened to be signed.
  const shapeProblem = validateSignedManifestShape(info)
  if (shapeProblem != null) {
    return { ok: false, reason: shapeProblem }
  }
  const trustedKeys: Array<TrustedKey> = []
  for (const publicKey of publicKeys) {
    const key = typeof publicKey === "string" ? parsePublicKey(publicKey) : publicKey
    const keyId = computeUpdateManifestKeyId(key)
    if (!trustedKeys.some(it => it.keyId === keyId)) {
      trustedKeys.push({ key, keyId })
    }
  }

  const reasons: Array<string> = []
  const ebum2 = candidates.filter(it => it.format === UPDATE_MANIFEST_SIGNATURE_VERSION_2)
  if (ebum2.length > 0) {
    const canonical = canonicalizeForSigningV2(info)
    if (canonical.ok) {
      const keyId = findVerifyingKey(Buffer.from(canonical.payload, "utf8"), trustedKeys, ebum2)
      if (keyId != null) {
        return { ok: true, keyId, format: UPDATE_MANIFEST_SIGNATURE_VERSION_2 }
      }
    } else {
      reasons.push(`its EBUM2 payload cannot be computed: ${canonical.reason}`)
    }
  }

  const ebum1 = candidates.filter(it => it.format === UPDATE_MANIFEST_SIGNATURE_VERSION)
  if (ebum1.length > 0) {
    const outside = findFieldsOutsideEbum1(info)
    if (outside.length > 0) {
      // only reported when no EBUM2 signature verified: an EBUM1 signature does not cover these fields
      reasons.push(`${outside.map(it => JSON.stringify(it)).join(", ")} ${outside.length === 1 ? "is" : "are"} not covered by an EBUM1 signature, and no EBUM2 signature validates`)
    } else {
      const keyId = findVerifyingKey(Buffer.from(canonicalizeForSigning(info), "utf8"), trustedKeys, ebum1)
      if (keyId != null) {
        return { ok: true, keyId, format: UPDATE_MANIFEST_SIGNATURE_VERSION }
      }
    }
  }

  if (ebum1.length === 0 && ebum2.length === 0) {
    reasons.push(`it carries no signature in a supported format (${UPDATE_MANIFEST_SIGNATURE_VERSION_2}, ${UPDATE_MANIFEST_SIGNATURE_VERSION})`)
  }
  return reasons.length === 0 ? { ok: false } : { ok: false, reason: reasons.join("; ") }
}

/**
 * Single-key convenience over {@link verifyManifestSignatures}: true when `publicKey` validates the
 * legacy `info.signature` or any entry of `info.signatures`. Returns a boolean and never throws on a bad
 * signature — the caller decides whether an unverified manifest is fatal. (Malformed keys still throw.)
 */
export function verifyManifestSignature(info: UpdateInfo, publicKey: string | KeyObject): boolean {
  return verifyManifestSignatures(info, [publicKey]).ok
}

/** Builds the `signatures` entry for one key: the key's id and the payload format next to its base64 signature. */
export function createManifestSignatureEntry(
  publicKey: string | KeyObject,
  signature: string,
  format: UpdateManifestSignatureFormat = UPDATE_MANIFEST_SIGNATURE_VERSION
): UpdateManifestSignature {
  return { keyId: computeUpdateManifestKeyId(publicKey), signature, format }
}
