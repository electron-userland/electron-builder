import { ALLOW_EXTERNAL_LINKS_OPTION, AllowExternalLinksValue, ExternalLinkPolicy, InvalidConfigurationError, isPathWithin, log, resolvePhysicalPath } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { readFile } from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import type { FilesBuildOptions } from "../options/PlatformSpecificBuildOptions.js"

/** Where the rule for files reached through symlinks is documented. */
export const LINKED_FILES_DOCS_URL = "https://www.electron.build/docs/contents#linked-files-must-resolve-inside-the-workspace"

/** What {@link getTrustedSourceRoots} needs to know about the build: `Packager` and `PlatformPackager` both have it. */
export interface SourceRootsInfo {
  readonly projectDir: string
  readonly appDir: string
  getWorkspaceRoot(): Promise<string>
}

/** The configuration root, or a platform section (`mac`, `win`, `linux`): both may set `fileOptions`. */
interface FileOptionsHolder {
  readonly fileOptions?: FilesBuildOptions | null
}

/**
 * The effective `fileOptions.allowExternalLinks` value for a platform, read from the normalized `fileOptions` like `files`,
 * `extraResources` and `extraFiles`: the platform-level value (`mac.fileOptions.allowExternalLinks`, ...) when it is set, `false`
 * included, otherwise the root one. Unlike the file lists, the two are not combined: the platform value replaces the root one.
 *
 * `optionPath` names where the value came from, for the errors about a malformed value.
 */
export function resolveAllowExternalLinks(
  config: FileOptionsHolder,
  platformOptions: FileOptionsHolder | Nullish,
  platformKey: string
): { value: AllowExternalLinksValue; optionPath: string } {
  const platformValue = platformOptions?.fileOptions?.allowExternalLinks
  if (platformValue != null) {
    return { value: platformValue, optionPath: `${platformKey}.${ALLOW_EXTERNAL_LINKS_OPTION}` }
  }
  return { value: config.fileOptions?.allowExternalLinks, optionPath: ALLOW_EXTERNAL_LINKS_OPTION }
}

/**
 * The store directories of pnpm, read from the `node_modules/.modules.yaml` that pnpm writes: the content-addressable store and the
 * virtual store, which `enableGlobalVirtualStore` puts outside the project. Other package managers keep everything they link to
 * inside the workspace (`node_modules/.bun`, workspace packages), so they need nothing here.
 */
export async function readPackageManagerStoreDirs(nodeModulesDir: string): Promise<Array<string>> {
  let content: string
  try {
    content = await readFile(path.join(nodeModulesDir, ".modules.yaml"), "utf8")
  } catch (_e: any) {
    return []
  }
  let data: unknown
  try {
    data = load(content)
  } catch (e: any) {
    log.debug({ file: path.join(nodeModulesDir, ".modules.yaml"), error: e.message }, "cannot parse the pnpm modules file")
    return []
  }
  if (data == null || typeof data !== "object") {
    return []
  }
  const result: Array<string> = []
  for (const key of ["storeDir", "virtualStoreDir"]) {
    const value: unknown = (data as Record<string, unknown>)[key]
    if (typeof value === "string" && value.length > 0) {
      result.push(path.resolve(nodeModulesDir, value))
    }
  }
  return result
}

const cache = new WeakMap<object, Promise<Array<string>>>()

/**
 * The directories that files of the app may come from through a symlink, as real paths: the workspace root, the project and app
 * directories (chosen by the build configuration) and the package-manager store. A file whose real path is anywhere else is refused.
 * Computed once per `key` (the packager).
 */
export function getTrustedSourceRoots(info: SourceRootsInfo, key: object = info): Promise<Array<string>> {
  let result = cache.get(key)
  if (result == null) {
    result = computeTrustedSourceRoots(info)
    cache.set(key, result)
  }
  return result
}

async function computeTrustedSourceRoots(info: SourceRootsInfo): Promise<Array<string>> {
  const workspaceRoot = await info.getWorkspaceRoot()
  const dirs = Array.from(new Set([workspaceRoot, info.projectDir, info.appDir]))
  const storeDirs = (await Promise.all(dirs.map(it => readPackageManagerStoreDirs(path.join(it, "node_modules"))))).flat()
  const roots = await Promise.all([...dirs, ...storeDirs].map(it => resolvePhysicalPath(it)))
  return Array.from(new Set(roots))
}

/**
 * Refuses a file of the app (packed into the asar archive or copied with `asar: false`) whose real path, through symlinks, is outside
 * every trusted source root ({@link getTrustedSourceRoots}), unless the `fileOptions.allowExternalLinks` build option (`externalLinks`) allows it.
 *
 * Only the workspace and the package-manager store are trusted: a file reached through a symlink that leads anywhere else on the build
 * machine (the home or temp directory, a system directory) is refused.
 */
export async function assertSourceFileInTrustedRoots(file: string, trustedRoots: ReadonlyArray<string>, externalLinks: ExternalLinkPolicy | null = null): Promise<void> {
  const resolved = await resolvePhysicalPath(file)
  if (trustedRoots.some(root => isPathWithin(root, resolved))) {
    return
  }
  const policy = externalLinks ?? ExternalLinkPolicy.NONE
  if (policy.allows(file, resolved)) {
    return
  }
  log.error({ source: file, realPath: resolved }, "denied access to a file outside the workspace")
  throw new InvalidConfigurationError(
    `Cannot copy file [${policy.displayPath(file)}] symlinked to file [${resolved}] outside the package: electron-builder only packages files whose real path ` +
      `is inside the workspace root (${trustedRoots[0] ?? "unknown"}) or the package-manager store. Add the linked package to the workspace (or install it from a tarball or ` +
      `the registry instead of linking it), or replace the symlink with a copy. ${await policy.hint([await outermostOutsideTrustedRoots(file, resolved, trustedRoots)])} ` +
      `See ${LINKED_FILES_DOCS_URL}`,
    "ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE"
  )
}

/**
 * Where the linked tree that `file` (real path `resolved`) is part of starts: the real path of its highest ancestor that is still outside
 * the trusted roots, e.g. the linked package `../lib` for `node_modules/lib/src/index.js`, so that a suggested `fileOptions.allowExternalLinks` entry
 * covers the whole package rather than the one file that was checked first.
 */
async function outermostOutsideTrustedRoots(file: string, resolved: string, trustedRoots: ReadonlyArray<string>): Promise<string> {
  let result = resolved
  let current = path.resolve(file)
  for (;;) {
    const parent = path.dirname(current)
    if (parent === current) {
      // not below a trusted root at all: only the file itself is known to be linked
      return resolved
    }
    const realParent = await resolvePhysicalPath(parent)
    if (trustedRoots.some(root => isPathWithin(root, realParent))) {
      return result
    }
    result = realParent
    current = parent
  }
}

/**
 * The `copyDir` options for copying the app output directory into a staging directory (snap, AppImage): a symlink that the
 * `extraResources`/`extraFiles` copy kept, because it leads into the workspace or the store or `fileOptions.allowExternalLinks` allows it, is kept
 * again rather than failing the staging copy.
 */
export async function getStagingCopyLinkOptions(
  packager: SourceRootsInfo & { getExternalLinkPolicy(): Promise<ExternalLinkPolicy> }
): Promise<{ allowedSymlinkRoots: ReadonlyArray<string>; externalLinks: ExternalLinkPolicy }> {
  return { allowedSymlinkRoots: await getTrustedSourceRoots(packager), externalLinks: await packager.getExternalLinkPolicy() }
}
