import { InvalidConfigurationError, log } from "builder-util"
import { collectManifestSignatures, normalizePublicKeyList, UpdateInfo } from "builder-util-runtime"
import { readFile } from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import type { Configuration } from "../configuration.js"
import type { UpdateManifestSigningOptions } from "../options/PlatformSpecificBuildOptions.js"
import { BUILD_CHANGES_URL } from "../util/config/legacyOptions.js"
import { updateManifestPlatform, verifyUpdateManifestContent } from "./updateManifestVerifier.js"

const DOCS = `${BUILD_CHANGES_URL}#signed-update-manifests-are-required`

// Files with a manifest-like name that are not update manifests
const NOT_MANIFESTS = new Set(["app-update.yml", "dev-app-update.yml", "builder-debug.yml", "builder-effective-config.yaml"])

type ManifestPlatform = ReturnType<typeof updateManifestPlatform>

/** A platform-level value wins over the root one, as in the build (`PlatformPackager.updateManifestOptions`). */
function platformValue<K extends "updateManifest" | "forceCodeSigning">(config: Configuration, platform: ManifestPlatform, key: K): Configuration[K] | undefined {
  const platformConfig: { readonly [P in K]?: Configuration[P] } | null | undefined = config[platform]
  const value = platformConfig?.[key]
  return value ?? config[key]
}

/**
 * Checks an update manifest (`latest*.yml`) before `electron-builder publish` uploads it, the check a build makes before it writes
 * one: it must be signed, and when `updateManifest.publicKey` is set, signed by one of those keys (or, with
 * `allowSigningKeyOutsideTrustList`, by another key, with a warning). Without `publicKey` the signature cannot be checked against a
 * trust list, which warns, and fails under `forceCodeSigning`. `updateManifest: false` skips the check. Only public keys are used:
 * no signing key is loaded. Any other file, including a `.yml` that is not an update manifest, is not checked.
 */
export async function checkUpdateManifestBeforeUpload(file: string, config: Configuration): Promise<void> {
  if (!/\.ya?ml$/.test(file) || NOT_MANIFESTS.has(path.basename(file))) {
    return
  }
  const content = await readFile(file, "utf8")
  let info: unknown
  try {
    info = load(content)
  } catch {
    // not YAML: not an update manifest
    return
  }
  if (info == null || typeof info !== "object" || !("version" in info) || !("files" in info) || !Array.isArray(info.files)) {
    return
  }

  const platform = updateManifestPlatform(file)
  const updateManifest: UpdateManifestSigningOptions | false | null | undefined = platformValue(config, platform, "updateManifest")
  if (updateManifest === false) {
    return
  }
  const fields = { file: log.filePath(file) }
  // the `signatures` list and the legacy `signature` field, as electron-updater reads them; a `signatures` that is not a list holds none
  const { signatures } = info as { signatures?: unknown }
  const manifestInfo = (Array.isArray(signatures) ? info : { ...info, signatures: undefined }) as UpdateInfo
  if (collectManifestSignatures(manifestInfo).length === 0) {
    throw new InvalidConfigurationError(
      `${log.filePath(file)} is an unsigned update manifest, and electron-builder publishes only signed ones: installs that embed a public key reject it ` +
        "(ERR_UPDATER_MANIFEST_NOT_SIGNED). Build it with an update-manifest signing key, or opt out explicitly with `updateManifest: false`. " +
        `See ${DOCS}`
    )
  }

  const trustedKeys = normalizePublicKeyList(updateManifest?.publicKey)
  if (trustedKeys.length === 0) {
    const reason = "updateManifest.publicKey is not set, so the manifest's signature cannot be checked against a trust list before it is uploaded"
    if (platformValue(config, platform, "forceCodeSigning") === true) {
      throw new InvalidConfigurationError(`forceCodeSigning is enabled, but ${reason}: set updateManifest.publicKey to the public keys your installs trust. See ${DOCS}`)
    }
    log.warn({ ...fields, reason }, "update manifest not verified before upload")
    return
  }

  const verification = verifyUpdateManifestContent(content, trustedKeys)
  if (verification.ok) {
    log.info({ ...fields, keyId: verification.keyId }, "update manifest verified before upload")
    return
  }
  if (updateManifest?.allowSigningKeyOutsideTrustList === true) {
    log.warn(
      { ...fields, reason: verification.reason },
      "update manifest is not signed by a key of updateManifest.publicKey, which updateManifest.allowSigningKeyOutsideTrustList allows for a cutover release"
    )
    return
  }
  throw new InvalidConfigurationError(
    `${log.filePath(file)} is not signed by a key of updateManifest.publicKey (${verification.reason}), so installs that trust those keys would reject it. ` +
      `Nothing was uploaded. See ${DOCS}`
  )
}
