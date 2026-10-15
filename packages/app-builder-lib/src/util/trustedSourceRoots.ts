import { InvalidConfigurationError, isPathWithin, log, resolvePhysicalPath } from "builder-util"
import { readFile } from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"

/** Where the v27 narrowing of followed symlinks is documented. */
export const LINKED_FILES_DOCS_URL = "https://www.electron.build/docs/migration/v27-breaking-changes#linked-files-must-resolve-inside-the-workspace"

/** What {@link getTrustedSourceRoots} needs to know about the build: `Packager` and `PlatformPackager` both have it. */
export interface SourceRootsInfo {
  readonly projectDir: string
  readonly appDir: string
  getWorkspaceRoot(): Promise<string>
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
 * every trusted source root ({@link getTrustedSourceRoots}).
 *
 * electron-builder <= 26 refused only some system directories (`/etc`, `/usr`, `C:\Windows`, ...) and let everything else through,
 * explicitly anything under the home and temp directories. In v27 only the workspace and the package-manager store are trusted.
 */
export async function assertSourceFileInTrustedRoots(file: string, trustedRoots: ReadonlyArray<string>): Promise<void> {
  const resolved = await resolvePhysicalPath(file)
  if (trustedRoots.some(root => isPathWithin(root, resolved))) {
    return
  }
  log.error({ source: file, realPath: resolved }, "denied access to a file outside the workspace")
  throw new InvalidConfigurationError(
    `Cannot copy file [${file}] symlinked to file [${resolved}] outside the package: electron-builder v27 only packages files whose real path ` +
      `is inside the workspace root (${trustedRoots[0] ?? "unknown"}) or the package-manager store; v26 also accepted anything outside system ` +
      `directories, such as the home and temp directories. Add the linked package to the workspace (or install it from a tarball or ` +
      `the registry instead of linking it), or replace the symlink with a copy. See ${LINKED_FILES_DOCS_URL}`,
    "ERR_ELECTRON_BUILDER_FILE_OUTSIDE_WORKSPACE"
  )
}
