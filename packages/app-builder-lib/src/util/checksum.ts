import { InvalidConfigurationError } from "builder-util"
import { hashFile } from "./hash.js"

/**
 * A toolset archive checksum in one of the two accepted formats:
 * - SHA-256 as 64 hex characters (what `@electron/get` verifies itself), normalized to lowercase;
 * - SHA-512 as 88-character padded standard base64 (the format v26 used for all toolset checksums), case preserved.
 */
export interface ExpectedChecksum {
  readonly algorithm: "sha256" | "sha512"
  readonly encoding: "hex" | "base64"
  readonly value: string
}

const SHA256_HEX = /^[0-9a-f]{64}$/i
// 64 raw bytes → 86 significant base64 characters + "==" padding
const SHA512_BASE64 = /^[A-Za-z0-9+/]{86}==$/

/** Human-readable description of the accepted formats, with the commands that produce them. */
export const ACCEPTED_CHECKSUM_FORMATS =
  "the SHA-256 of the archive as 64 hex characters (e.g. `shasum -a 256 <archive>`) or its SHA-512 as 88 base64 characters " +
  "(e.g. `openssl dgst -sha512 -binary <archive> | openssl base64 -A`)"

/**
 * Classifies a checksum. Throws an {@link InvalidConfigurationError} for any other format (including prefixed forms such as
 * `sha256:…` / `sha512-…` and hex-encoded SHA-512) without echoing the value.
 *
 * @param label names the setting in the error, e.g. `ToolsetCustom.checksum for url toolset https://…`
 * @param docsUrl appended to the error as a `See …` link when given
 */
export function parseChecksum(value: string, label: string, docsUrl?: string): ExpectedChecksum {
  // a JS config (or a toolset table lookup that misses) can hand over a non-string; treat it as an unrecognized format
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (SHA256_HEX.test(trimmed)) {
    return { algorithm: "sha256", encoding: "hex", value: trimmed.toLowerCase() }
  }
  if (SHA512_BASE64.test(trimmed)) {
    return { algorithm: "sha512", encoding: "base64", value: trimmed }
  }
  throw new InvalidConfigurationError(
    `${label} must be ${ACCEPTED_CHECKSUM_FORMATS}. A prefixed value such as "sha256:…" or "sha512-…", or a hex-encoded SHA-512, is not accepted.` +
      (docsUrl == null ? "" : ` See ${docsUrl}`)
  )
}

/**
 * Hashes `file` with the algorithm and encoding of `expected` and compares the result. Never modifies or removes the file:
 * a caller verifying a download removes it itself, a caller verifying a user-supplied archive must leave it in place.
 */
export async function verifyFileChecksum(file: string, expected: ExpectedChecksum): Promise<{ matches: boolean; actual: string }> {
  const digest = await hashFile(file, expected.algorithm, expected.encoding)
  const actual = expected.encoding === "hex" ? digest.toLowerCase() : digest
  return { matches: actual === expected.value, actual }
}

export function checksumMismatchMessage(label: string, expected: ExpectedChecksum, actual: string): string {
  return `${expected.algorithm} checksum mismatch for ${label}: expected "${expected.value}" but the file is "${actual}".`
}

/**
 * Filesystem-safe identifier of a checksum: its digest as lowercase hex. A base64 value may contain `/` and `+`, which must
 * not end up in a cache directory name. For a SHA-256 this is the (already lowercase) value itself, so existing cache keys
 * derived from SHA-256 checksums are unchanged.
 */
export function checksumCacheKey(checksum: ExpectedChecksum): string {
  return checksum.encoding === "hex" ? checksum.value : Buffer.from(checksum.value, "base64").toString("hex")
}
