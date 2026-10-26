import { collectManifestSignatures, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import { KeyObject } from "crypto"
import { load } from "js-yaml"
import * as path from "path"

const LINUX_MARKER = "-linux"

/**
 * The platform of an update manifest, by its file name: `latest-mac.yml`, `beta-linux-arm64.yml`, or `latest.yml` (Windows). What
 * `/-mac\.ya?ml$/` and then `/-linux(-[^.]+)?\.ya?ml$/` match, parsed in linear time: the second pattern backtracks polynomially on
 * a name with many `-linux` (the name comes from the output folder or the command line).
 */
export function updateManifestPlatform(file: string): "mac" | "win" | "linux" {
  const name = path.basename(file)
  const extension = name.endsWith(".yml") ? ".yml" : name.endsWith(".yaml") ? ".yaml" : null
  if (extension == null) {
    return "win"
  }
  const stem = name.substring(0, name.length - extension.length)
  if (stem.endsWith("-mac")) {
    return "mac"
  }
  // "-linux", then nothing, or "-" and at least one more character, with no "." up to the extension
  const tail = stem.substring(stem.lastIndexOf(".") + 1)
  for (let index = tail.indexOf(LINUX_MARKER); index !== -1; index = tail.indexOf(LINUX_MARKER, index + 1)) {
    const end = index + LINUX_MARKER.length
    if (end === tail.length || (tail[end] === "-" && tail.length - end >= 2)) {
      return "linux"
    }
  }
  return "win"
}

export type UpdateManifestVerification = { readonly ok: true; readonly keyId: string } | { readonly ok: false; readonly reason: string }

/**
 * Verifies the bytes of an update manifest (`latest*.yml`) the way electron-updater does: parsed with js-yaml's
 * `load` (as `Provider.parseUpdateInfo`), refused when it carries no signature (`ERR_UPDATER_MANIFEST_NOT_SIGNED`), and
 * accepted when any of `trustedKeys` validates one of its signatures. Invalid YAML, a manifest of the wrong shape and a
 * malformed key are reported as a failure, never thrown.
 */
export function verifyUpdateManifestContent(content: string, trustedKeys: Array<string | KeyObject>): UpdateManifestVerification {
  let info: UpdateInfo
  try {
    const parsed: unknown = load(content)
    if (parsed == null || typeof parsed !== "object") {
      return { ok: false, reason: "the manifest is not a YAML mapping" }
    }
    info = parsed as UpdateInfo
  } catch (e: any) {
    return { ok: false, reason: `the manifest is not valid YAML: ${e.message || e}` }
  }
  if (collectManifestSignatures(info).length === 0) {
    return { ok: false, reason: "the manifest is not signed" }
  }
  if (trustedKeys.length === 0) {
    return { ok: false, reason: "no trusted public key to verify the manifest with" }
  }
  try {
    const result = verifyManifestSignatures(info, trustedKeys)
    if (result.ok && result.keyId != null) {
      return { ok: true, keyId: result.keyId }
    }
    return { ok: false, reason: result.reason ?? "no trusted key validates any of its signatures" }
  } catch (e: any) {
    return { ok: false, reason: `cannot verify the manifest: ${e.message || e}` }
  }
}
