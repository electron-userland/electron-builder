import { InvalidConfigurationError, log } from "builder-util"
import { collectManifestSignatures, hashFile, normalizePublicKeyList, UpdateInfo } from "builder-util-runtime"
import { readFile, stat } from "fs/promises"
import { EventType, load, State } from "js-yaml"
import * as path from "path"
import type { Configuration } from "../configuration.js"
import type { UpdateManifestSigningOptions } from "../options/PlatformSpecificBuildOptions.js"
import { BUILD_CHANGES_URL, RUNTIME_CHANGES_URL } from "../util/config/legacyOptions.js"
import { updateManifestPlatform, verifyUpdateManifestContent } from "./updateManifestVerifier.js"

const DOCS = `${BUILD_CHANGES_URL}#signed-update-manifests-are-required`

// Files with a manifest-like name that are not update manifests
const NOT_MANIFESTS = new Set(["app-update.yml", "dev-app-update.yml", "builder-debug.yml", "builder-effective-config.yaml"])

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
  "Run `electron-builder verify` on the output before publishing it to check the signatures, sha512 and size. " +
  `See ${SIZE_DOCS}, ${DOCS}, ${ALIAS_DOCS} and ${RUNTIME_CHANGES_URL}#update-requests-require-https`

type Upload = { readonly file: string; readonly safeArtifactName?: string | null }
type UploadedUpdateInfo = { readonly file: string; readonly files: Array<unknown>; readonly packages: unknown }

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

/**
 * Warns before `electron-builder publish -f` uploads update info (`latest*.yml`, a channel's `.yml`) or a file it lists, which a
 * release process may have changed after the build: the rules electron-updater applies to them once per process, then for each update
 * info in the upload, every listed file also in the upload whose size or sha512 differs from the declared one, and YAML aliases. Only
 * warns, since these are heuristics: a file it cannot read or parse, and a listed file that is not uploaded, are skipped.
 */
export async function warnAboutUpdateFilesBeforeUpload(uploads: ReadonlyArray<Upload>): Promise<void> {
  const manifests: Array<UploadedUpdateInfo> = []
  let hasUpdateFiles = false
  for (const { file } of uploads) {
    if (UPDATE_FILE_EXTENSIONS.has(path.extname(file))) {
      hasUpdateFiles = true
      continue
    }
    if (!/\.ya?ml$/.test(file) || NOT_MANIFESTS.has(path.basename(file))) {
      continue
    }
    // an alias is the only node that closes with a value but no kind (as electron-updater's parseUpdateInfo counts them)
    let hasAliases = false
    const listener = (eventType: EventType, state: State) => {
      hasAliases ||= eventType === "close" && state.kind === null && state.result != null
    }
    let info: unknown
    try {
      info = load(await readFile(file, "utf8"), { listener })
    } catch (e: any) {
      log.warn({ file: log.filePath(file), reason: e?.message ?? String(e) }, "cannot read this .yml: if it is update info, electron-updater rejects it")
      continue
    }
    if (info == null || typeof info !== "object" || !("version" in info) || !("files" in info) || !Array.isArray(info.files)) {
      continue
    }
    manifests.push({ file, files: info.files, packages: "packages" in info ? info.packages : undefined })
    if (hasAliases) {
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
  for (const manifest of manifests) {
    await warnAboutListedFileMismatches(manifest, uploads)
  }
}

/** The files of `files` (by `url`) and nsis-web `packages` (by `path`) that are also uploaded, matched by name, against their declared size and sha512; a file that cannot be read is skipped. */
async function warnAboutListedFileMismatches(manifest: UploadedUpdateInfo, uploads: ReadonlyArray<Upload>): Promise<void> {
  // a GitHub update info lists the safe artifact name, which can differ from the local file name
  const uploadsByName = new Map<string, string>()
  for (const { file, safeArtifactName } of uploads) {
    uploadsByName.set(path.basename(file), file)
    if (safeArtifactName != null) {
      uploadsByName.set(safeArtifactName, file)
    }
  }
  const { files, packages } = manifest
  const entries = packages != null && typeof packages === "object" ? [...files, ...Object.values(packages)] : files
  for (const entry of entries) {
    if (entry == null || typeof entry !== "object") {
      continue
    }
    const { url, path: packagePath, size, sha512 } = entry as { url?: unknown; path?: unknown; size?: unknown; sha512?: unknown }
    const location = typeof url === "string" ? url : packagePath
    const file = typeof location === "string" ? uploadsByName.get(path.posix.basename(location.split(/[?#]/, 1)[0])) : undefined
    // a file that cannot be read (stat or hash), or a directory, is reported by its upload
    const stats = file == null ? null : await stat(file).catch(() => null)
    if (file == null || stats == null || !stats.isFile()) {
      continue
    }
    const actualSha512 = typeof sha512 === "string" ? await hashFile(file).catch(() => null) : undefined
    if (actualSha512 === null) {
      continue
    }
    const mismatched: Array<string> = []
    if (typeof size === "number" && size !== stats.size) {
      mismatched.push("size")
    }
    if (typeof sha512 === "string" && sha512 !== actualSha512) {
      mismatched.push("sha512")
    }
    if (mismatched.length !== 0) {
      log.warn(
        { updateInfo: log.filePath(manifest.file), file: log.filePath(file), mismatched: mismatched.join(", ") },
        "the uploaded file does not match its update info: electron-updater stops a full download once it receives more bytes than the declared size " +
          "and rejects a file whose sha512 differs. Publish the update info generated together with this file: when a release step changed the file " +
          `after the build (for example signed it again), regenerate its size and sha512 together and sign the update info again. See ${SIZE_DOCS}`
      )
    }
  }
}
