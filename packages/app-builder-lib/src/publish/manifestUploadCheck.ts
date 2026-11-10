import { InvalidConfigurationError, log } from "builder-util"
import { collectManifestSignatures, normalizePublicKeyList, UpdateInfo } from "builder-util-runtime"
import { readFile } from "fs/promises"
import * as path from "path"
import type { Configuration } from "../configuration.js"
import type { UpdateManifestSigningOptions } from "../options/PlatformSpecificBuildOptions.js"
import { BUILD_CHANGES_URL, RUNTIME_CHANGES_URL } from "../util/config/legacyOptions.js"
import { compareListedFiles, mayBeUpdateInfo, readUpdateInfo, updateManifestPlatform, verifyUpdateManifestContent } from "./updateManifestVerifier.js"

const DOCS = `${BUILD_CHANGES_URL}#signed-update-manifests-are-required`

// The files electron-updater downloads that update info lists: installers and packages, macOS zips, nsis-web packages and block maps
const UPDATE_FILE_EXTENSIONS = new Set([".exe", ".zip", ".7z", ".AppImage", ".deb", ".rpm", ".pacman", ".blockmap"])

const SIZE_DOCS = `${RUNTIME_CHANGES_URL}#full-downloads-stop-at-the-declared-size`
const ALIAS_DOCS = `${RUNTIME_CHANGES_URL}#update-manifest-yaml-aliases-are-limited`

const UPDATE_FILES_RULES =
  "uploading update info (latest*.yml or a channel's .yml) or the files it lists. electron-updater installs an update only when its update info " +
  "is the one generated with these exact files:\n" +
  "  - each file's sha512 and size describe the uploaded bytes: a full download stops once it receives more bytes than the declared size, " +
  "and a file whose sha512 differs is rejected\n" +
  "  - update info is signed, and the signature covers each file's url, sha512 and size: when a release step changes a file after the build " +
  "(for example signs the installer again), regenerate the update info with that file and sign it again instead of editing it\n" +
  "  - update info is written without YAML aliases (&name / *name), which are rejected once they expand past electron-updater's limit\n" +
  "  - the update info, the files and their .blockmap files are served over https, and each .blockmap comes from the same build as its file " +
  "(otherwise the update is downloaded in full)\n" +
  "Run `electron-builder verify` on the output before publishing it to check the signatures, the sha512 and size of each listed file " +
  "(nsis-web packages included) and YAML aliases. " +
  `See ${SIZE_DOCS}, ${DOCS}, ${ALIAS_DOCS} and ${RUNTIME_CHANGES_URL}#update-requests-require-https`

type Upload = { readonly file: string; readonly safeArtifactName?: string | null }

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
  if (!mayBeUpdateInfo(file)) {
    return
  }
  const content = await readFile(file, "utf8")
  let info: UpdateInfo
  try {
    const updateInfo = readUpdateInfo(content)
    if (updateInfo == null) {
      return
    }
    info = updateInfo.info
  } catch {
    // not YAML: not an update manifest
    return
  }

  const platform = updateManifestPlatform(file)
  const updateManifest: UpdateManifestSigningOptions | false | null | undefined = platformValue(config, platform, "updateManifest")
  if (updateManifest === false) {
    return
  }
  const fields = { file: log.filePath(file) }
  // the `signatures` list and the legacy `signature` field, as electron-updater reads them; a `signatures` that is not a list holds none
  const signatures: unknown = info.signatures
  const manifestInfo = Array.isArray(signatures) ? info : { ...info, signatures: undefined }
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

/**
 * Warns before `electron-builder publish -f` uploads update info (`latest*.yml`, a channel's `.yml`) or a file it lists, which a
 * release process may have changed after the build: the rules electron-updater applies to them once per process, then for each update
 * info in the upload, every listed file also in the upload whose size or sha512 differs from the declared one, and YAML aliases. Only
 * warns, since these are heuristics: a file it cannot read or parse, and a listed file that is not uploaded, are skipped.
 */
export async function warnAboutUpdateFilesBeforeUpload(uploads: ReadonlyArray<Upload>): Promise<void> {
  const manifests: Array<{ readonly file: string; readonly info: UpdateInfo }> = []
  let hasUpdateFiles = false
  for (const { file } of uploads) {
    if (UPDATE_FILE_EXTENSIONS.has(path.extname(file))) {
      hasUpdateFiles = true
      continue
    }
    if (!mayBeUpdateInfo(file)) {
      continue
    }
    let updateInfo: ReturnType<typeof readUpdateInfo>
    try {
      updateInfo = readUpdateInfo(await readFile(file, "utf8"))
    } catch (e: any) {
      log.warn({ file: log.filePath(file), reason: e?.message ?? String(e) }, "cannot read this .yml: if it is update info, electron-updater rejects it")
      continue
    }
    if (updateInfo == null) {
      continue
    }
    manifests.push({ file, info: updateInfo.info })
    if (updateInfo.hasAliases) {
      log.warn(
        { file: log.filePath(file) },
        "update info uses YAML aliases, which electron-builder never writes: electron-updater rejects update info whose aliases expand past its limit " +
          `(ERR_UPDATER_INVALID_UPDATE_INFO). Write it without aliases (js-yaml \`dump\` with \`noRefs: true\`). See ${ALIAS_DOCS}`
      )
    }
  }

  if (manifests.length === 0 && !hasUpdateFiles) {
    return
  }
  log.once("update-files-upload").warn(UPDATE_FILES_RULES)

  // matched by name only: a GitHub update info lists the safe artifact name, which can differ from the local file name
  const uploadsByName = new Map<string, string>()
  for (const { file, safeArtifactName } of uploads) {
    uploadsByName.set(path.basename(file), file)
    if (safeArtifactName != null) {
      uploadsByName.set(safeArtifactName, file)
    }
  }
  const hashes = new Map<string, Promise<string | null>>()
  for (const manifest of manifests) {
    // a listed file that is not uploaded, or cannot be read, is not found: its upload reports it
    for (const { comparison } of await compareListedFiles(manifest.info, uploadsByName, hashes)) {
      if (comparison.status === "mismatch") {
        log.warn(
          { updateInfo: log.filePath(manifest.file), file: log.filePath(comparison.file), mismatched: comparison.mismatched.join(", ") },
          "the uploaded file does not match its update info: electron-updater stops a full download once it receives more bytes than the declared size " +
            "and rejects a file whose sha512 differs. Publish the update info generated together with this file: when a release step changed the file " +
            `after the build (for example signed it again), regenerate its size and sha512 together and sign the update info again. See ${SIZE_DOCS}`
        )
      }
    }
  }
}
