import { collectManifestSignatures, hashFile, UpdateInfo, verifyManifestSignatures } from "builder-util-runtime"
import { KeyObject } from "crypto"
import { stat } from "fs/promises"
import { EventType, load, State } from "js-yaml"
import * as path from "path"

const LINUX_MARKER = "-linux"

// Files with a manifest-like name that are not update info
const NOT_UPDATE_INFO = new Set(["app-update.yml", "dev-app-update.yml", "builder-debug.yml", "builder-effective-config.yaml"])

/** Whether a file can be update info (`latest*.yml`, a channel's `.yml`) by its name; {@link readUpdateInfo} tells by its content. */
export function mayBeUpdateInfo(file: string): boolean {
  return /\.ya?ml$/.test(file) && !NOT_UPDATE_INFO.has(path.basename(file))
}

/**
 * Parses update info with js-yaml's `load`, as electron-updater's `parseUpdateInfo` does, and tells whether it uses YAML aliases (the nodes
 * that function's listener charges against its budget). Null when the YAML is not update info (a mapping with `version` and a `files`
 * list); throws when it is not valid YAML.
 */
export function readUpdateInfo(content: string): { readonly info: UpdateInfo; readonly hasAliases: boolean } | null {
  let hasAliases = false
  const listener = (eventType: EventType, state: State) => {
    // an alias is the only node that closes with a value but no kind
    hasAliases ||= eventType === "close" && state.kind === null && state.result != null
  }
  const info: unknown = load(content, { listener })
  if (info == null || typeof info !== "object" || !("version" in info) || !("files" in info) || !Array.isArray(info.files)) {
    return null
  }
  return { info: info as UpdateInfo, hasAliases }
}

/** A file update info lists: a `files` entry (by `url`) or an nsis-web `packages` entry (by `path`). A value of the wrong type is null. */
export interface ListedUpdateFile {
  readonly field: "files" | "packages"
  readonly location: string | null
  readonly size: number | null
  readonly sha512: string | null
}

export type ListedFileComparison =
  | { readonly status: "matches"; readonly file: string }
  | { readonly status: "mismatch"; readonly file: string; readonly mismatched: ReadonlyArray<"size" | "sha512"> }
  | { readonly status: "not found" }

/**
 * Compares each file update info lists with a local file by the size and sha512 it declares, which electron-updater checks a download
 * against: the file of the same name in `filesByName` (the base name of the url or path, without a query), or, when there is none, any of
 * `hashCandidates` with the declared size and sha512, since a GitHub update info lists the safe artifact name, which can differ from the
 * local file name. A file found by its name is never replaced by a hash candidate. A file that is not a regular file or cannot be read is not found. Hashes are memoized in `hashes`, by file.
 */
export async function compareListedFiles(
  info: UpdateInfo,
  filesByName: ReadonlyMap<string, string>,
  hashes: Map<string, Promise<string | null>>,
  hashCandidates: ReadonlyArray<string> = []
): Promise<Array<{ readonly entry: ListedUpdateFile; readonly comparison: ListedFileComparison }>> {
  const sha512Of = (file: string) => {
    let hash = hashes.get(file)
    if (hash == null) {
      hash = hashFile(file).catch(() => null)
      hashes.set(file, hash)
    }
    return hash
  }
  // the update info is not trusted to have the declared shape
  const listed: Array<[ListedUpdateFile["field"], unknown]> = info.files.map(it => ["files", it])
  const packages: unknown = "packages" in info ? info.packages : undefined
  if (packages != null && typeof packages === "object") {
    listed.push(...Object.values(packages).map((it): [ListedUpdateFile["field"], unknown] => ["packages", it]))
  }

  const compared: Array<{ entry: ListedUpdateFile; comparison: ListedFileComparison }> = []
  for (const [field, value] of listed) {
    const { url, path: packagePath, size, sha512 } = (value != null && typeof value === "object" ? value : {}) as Record<string, unknown>
    const location = field === "files" ? url : packagePath
    const entry: ListedUpdateFile = {
      field,
      location: typeof location === "string" ? location : null,
      size: typeof size === "number" ? size : null,
      sha512: typeof sha512 === "string" ? sha512 : null,
    }

    let comparison: ListedFileComparison = { status: "not found" }
    const named = entry.location == null ? undefined : filesByName.get(path.posix.basename(entry.location.split(/[?#]/, 1)[0]))
    const stats = named == null ? null : await stat(named).catch(() => null)
    // a file whose hash cannot be computed stays not found
    const actualSha512 = named == null || stats?.isFile() !== true || entry.sha512 == null ? null : await sha512Of(named)
    if (named != null && stats?.isFile() === true && (entry.sha512 == null || actualSha512 != null)) {
      const mismatched: Array<"size" | "sha512"> = []
      if (entry.size != null && entry.size !== stats.size) {
        mismatched.push("size")
      }
      if (entry.sha512 != null && entry.sha512 !== actualSha512) {
        mismatched.push("sha512")
      }
      comparison = mismatched.length === 0 ? { status: "matches", file: named } : { status: "mismatch", file: named, mismatched }
    }
    // only for a file no local file is named as: a file found by its name keeps its result, so a byte-identical copy of the file as
    // built (an unsigned copy, a backup) cannot stand in for the changed file the manifest lists
    if (comparison.status === "not found" && entry.sha512 != null) {
      for (const candidate of hashCandidates) {
        const candidateStats = await stat(candidate).catch(() => null)
        if (candidateStats?.isFile() === true && (entry.size == null || candidateStats.size === entry.size) && (await sha512Of(candidate)) === entry.sha512) {
          comparison = { status: "matches", file: candidate }
          break
        }
      }
    }
    compared.push({ entry, comparison })
  }
  return compared
}

/**
 * The folders the files listed by `manifestFile` are looked for in, closest first, as the build writes them: the manifest's own folder,
 * the folder of its target (`<outDir>/nsis-web/`, also for a further provider's `<outDir>/nsis-web/<provider>/latest.yml`), and the
 * output folder (the artifacts of a further provider's `<outDir>/<provider>/latest.yml`).
 */
export function listedFileFolders(manifestFile: string, outDir: string): Array<string> {
  const parts = path.relative(outDir, manifestFile).split(path.sep)
  const targetDir = parts.length > 1 ? path.join(outDir, parts[0]) : outDir
  return [...new Set([path.dirname(manifestFile), targetDir, outDir])]
}

/**
 * {@link compareListedFiles} for a manifest in a build output folder: each listed file is the file of its name in the
 * {@link listedFileFolders} (the closest wins), else the file whose GitHub safe name it is (spaces replaced by `-`, as
 * computeSafeArtifactNameIfNeeded makes it), else any of them with the declared size and sha512. `files` are the regular files to consider;
 * those outside the listed-file folders, manifests and block maps are ignored.
 */
export function compareListedFilesInOutput(
  info: UpdateInfo,
  manifestFile: string,
  outDir: string,
  files: ReadonlyArray<string>,
  hashes: Map<string, Promise<string | null>>
): ReturnType<typeof compareListedFiles> {
  const dirs = listedFileFolders(manifestFile, outDir)
  const candidates = files.filter(it => dirs.includes(path.dirname(it)) && !/\.(ya?ml|blockmap)$/.test(it))
  // a file of the same name tells which value is stale; the closest one wins, and an exact name wins over a safe name
  const candidatesByName = new Map<string, string>()
  for (const nameOf of [(name: string) => name, (name: string) => name.replace(/ /g, "-")]) {
    for (const dir of dirs) {
      for (const candidate of candidates) {
        const name = nameOf(path.basename(candidate))
        if (path.dirname(candidate) === dir && !candidatesByName.has(name)) {
          candidatesByName.set(name, candidate)
        }
      }
    }
  }
  return compareListedFiles(info, candidatesByName, hashes, candidates)
}

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
