import { lstat, mkdir, readdir, readlink, realpath, unlink } from "fs/promises"
import * as path from "path"
import { log } from "./log.js"
import { InvalidConfigurationError } from "./util.js"

/**
 * Where the v27 change that checks copied files and symlinks by their real path is documented. Messages
 * end with this link so that a build which starts failing explains itself.
 */
export const SYMLINK_CONTAINMENT_DOCS_URL = "https://www.electron.build/docs/migration/v27-breaking-changes#symlinks-that-leave-the-app-are-refused"

/** The `code` of every error thrown here, so that callers and tests can tell it apart from other configuration errors. */
export const ERR_PATH_OUTSIDE_ROOT = "ERR_ELECTRON_BUILDER_PATH_OUTSIDE_ROOT"

const MAX_SYMLINK_HOPS = 40

/** Whether `file` is `root` or inside it. Both are compared as given (no symlink is resolved): pass real paths to compare real locations. */
export function isPathWithin(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function isMissing(e: any): boolean {
  return e?.code === "ENOENT" || e?.code === "ENOTDIR"
}

function splitComponents(file: string): Array<string> {
  // Windows accepts both separators; on POSIX a backslash is an ordinary filename character
  return file.split(path.sep === "\\" ? /[/\\]+/ : /\/+/).filter(it => it.length > 0)
}

/**
 * Resolves `file` the way the operating system would when it is opened or created: every symlink on the way is followed,
 * including one that leads to a path that does not exist (yet), and the components that do not exist are kept as they are.
 * A dangling symlink therefore resolves to where a write through it would land, which `fs.realpath` cannot tell.
 */
export async function resolvePhysicalPath(file: string): Promise<string> {
  // not path.resolve: it would apply ".." lexically, and "link/.." is not where "link" is when "link" is a symlink
  const absolute = path.isAbsolute(file) ? file : `${process.cwd()}${path.sep}${file}`
  try {
    return await realpath(absolute)
  } catch (e: any) {
    if (!isMissing(e) && e?.code !== "ELOOP") {
      throw e
    }
  }

  // component by component: what `resolved` names has no symlink in it, so ".." can be applied to it as a string
  let resolved = path.parse(absolute).root
  const pending = splitComponents(absolute.substring(resolved.length))
  let hops = 0
  while (pending.length > 0) {
    const component = pending.shift() as string
    if (component === ".") {
      continue
    }
    if (component === "..") {
      resolved = path.dirname(resolved)
      continue
    }
    const next = path.join(resolved, component)
    let isLink = false
    try {
      isLink = (await lstat(next)).isSymbolicLink()
    } catch (e: any) {
      if (!isMissing(e)) {
        throw e
      }
    }
    if (!isLink) {
      resolved = next
      continue
    }
    if (++hops > MAX_SYMLINK_HOPS) {
      throw Object.assign(new Error(`too many levels of symbolic links while resolving "${file}"`), { code: "ELOOP" })
    }
    const target = await readlink(next)
    if (path.isAbsolute(target)) {
      resolved = path.parse(target).root
      pending.unshift(...splitComponents(target.substring(resolved.length)))
    } else {
      pending.unshift(...splitComponents(target))
    }
  }

  // what exists is spelled the way realpath spells it (case and short names on Windows, /private on macOS), so that it compares with a realpath'd root
  return await realpathOfDeepestExisting(resolved)
}

async function realpathOfDeepestExisting(file: string): Promise<string> {
  const rest: Array<string> = []
  let existing = file
  for (;;) {
    try {
      return path.join(await realpath(existing), ...rest)
    } catch (e: any) {
      if (!isMissing(e) || existing === path.dirname(existing)) {
        throw e
      }
      rest.unshift(path.basename(existing))
      existing = path.dirname(existing)
    }
  }
}

function displayPath(file: string): string {
  return log.filePath(file)
}

/**
 * Checks that a write to `dest` lands inside `root`. The directory `dest` is written into is resolved by its real path at the time of
 * the call, following every symlink, also one that does not lead anywhere yet; `dest` itself is not resolved, because what is there
 * is replaced, not followed (see {@link prepareFixedNameWrite}). `root` itself is trusted: it is resolved, wherever it points.
 *
 * Only the build configuration is trusted. A symlink among copied files (the app directory, `extraResources`/`extraFiles` sources,
 * `node_modules`) can make a lexically correct destination land elsewhere on the build machine, which this refuses.
 *
 * @throws InvalidConfigurationError with code {@link ERR_PATH_OUTSIDE_ROOT}
 */
export async function assertWritableWithin(root: string, dest: string, what = "file"): Promise<void> {
  await new WriteContainment(root, what).assertDirectoryWithin(path.dirname(path.resolve(dest)), dest)
}

/**
 * Makes `dest` ready to be written as a regular file inside `root`: its directory is checked like {@link assertWritableWithin} (and
 * created when it is missing), and
 * whatever is at `dest` that is neither a regular file nor a directory, such as a symlink planted by an earlier copy, is removed so that
 * the write creates a new file instead of following it. A directory is left alone: the write fails on it.
 *
 * Use it before every write to a fixed file name (`app-update.yml`, `elevate.exe`, ...) into a directory that untrusted files were copied into.
 */
export async function prepareFixedNameWrite(root: string, dest: string, what = "file"): Promise<void> {
  // the directory is created, like outputFile would, but only once it is known to be inside the root
  await new WriteContainment(root, what).prepareFile(dest)
}

/**
 * {@link assertWritableWithin} and {@link prepareFixedNameWrite} for many writes into one root: the real path of the root is computed
 * once, and every directory is checked once.
 */
export class WriteContainment {
  private realRoot: Promise<string> | null = null
  private readonly checkedDirs = new Map<string, Promise<void>>()

  constructor(
    readonly root: string,
    /** what is written, for the error message, e.g. "extraResources file" */
    readonly what = "file"
  ) {}

  getRealRoot(): Promise<string> {
    if (this.realRoot == null) {
      this.realRoot = resolvePhysicalPath(this.root)
    }
    return this.realRoot
  }

  async assertDirectoryWithin(dir: string, dest: string = dir): Promise<void> {
    const realRoot = await this.getRealRoot()
    const resolved = await resolvePhysicalPath(dir)
    if (!isPathWithin(realRoot, resolved)) {
      throw new InvalidConfigurationError(
        `refusing to write the ${this.what} "${displayPath(dest)}": the directory it is written into resolves to "${resolved}" through a symlink, ` +
          `which is outside "${displayPath(this.root)}". A symlink among the copied files (app directory, extraResources/extraFiles source, node_modules) ` +
          `or one already in the output points outside it. electron-builder v27 checks every write by its real path: replace the symlink with ` +
          `the directory it points to, or exclude it. See ${SYMLINK_CONTAINMENT_DOCS_URL}`,
        ERR_PATH_OUTSIDE_ROOT
      )
    }
  }

  /** Checks `dir`, creates it (and its parents) and checks it again, now that it exists. Done once per directory. */
  ensureDir(dir: string): Promise<void> {
    const key = path.resolve(dir)
    let result = this.checkedDirs.get(key)
    if (result == null) {
      result = (async () => {
        // before mkdir, which would create the missing directories wherever a symlink leads
        await this.assertDirectoryWithin(key)
        await mkdir(key, { recursive: true })
        // and after: a concurrent copy may have put a symlink where a directory was still missing
        await this.assertDirectoryWithin(key)
      })()
      this.checkedDirs.set(key, result)
    }
    return result
  }

  /**
   * Makes `dest` ready to be written as a regular file: its directory is created and checked (see {@link ensureDir}), and what is at
   * `dest` that is neither a regular file nor a directory, such as a symlink, is removed, so that the write does not follow it.
   */
  async prepareFile(dest: string): Promise<void> {
    const file = path.resolve(dest)
    await this.ensureDir(path.dirname(file))
    let stat
    try {
      stat = await lstat(file)
    } catch (e: any) {
      if (isMissing(e)) {
        return
      }
      throw e
    }
    if (!stat.isFile() && !stat.isDirectory()) {
      log.debug({ file: displayPath(file), isSymbolicLink: stat.isSymbolicLink() }, "removing what is in the way of a file to write")
      await unlink(file)
    }
  }
}

export interface EscapingSymlink {
  /** the symlink */
  readonly file: string
  /** what it points to, as stored */
  readonly target: string
  /** where it leads, see {@link resolvePhysicalPath} */
  readonly resolved: string
}

/**
 * Lists the symlinks in `dir` (not followed while walking) that lead outside it and outside every `allowedRoots` entry.
 * A symlink is judged by where it finally leads, through other symlinks, also when that does not exist.
 */
export async function findEscapingSymlinks(dir: string, allowedRoots: ReadonlyArray<string> = []): Promise<Array<EscapingSymlink>> {
  const realDir = await resolvePhysicalPath(dir)
  const realAllowed = await Promise.all(allowedRoots.map(it => resolvePhysicalPath(it)))
  const result: Array<EscapingSymlink> = []
  const queue = [dir]
  while (queue.length > 0) {
    const current = queue.pop() as string
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(file)
      } else if (entry.isSymbolicLink()) {
        const resolved = await resolvePhysicalPath(file)
        if (!isPathWithin(realDir, resolved) && !realAllowed.some(it => isPathWithin(it, resolved))) {
          result.push({ file, target: await readlink(file), resolved })
        }
      }
    }
  }
  return result.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

/**
 * For a step that stores what a symlink points to instead of the symlink (a Windows archive or installer, an AppX/MSIX package, a
 * NuGet package): refuses a symlink in `dir` that leads outside it, which would put files from elsewhere on the build machine into
 * the artifact.
 *
 * @param consumer what dereferences, for the error message, e.g. "the Windows zip archive"
 * @throws InvalidConfigurationError with code {@link ERR_PATH_OUTSIDE_ROOT}
 */
export async function assertNoSymlinkLeaves(dir: string, consumer: string): Promise<void> {
  const escaping = await findEscapingSymlinks(dir)
  if (escaping.length === 0) {
    return
  }
  const shown = escaping.slice(0, 5).map(it => `"${displayPath(it.file)}" -> "${it.target}" (resolves to "${it.resolved}")`)
  if (escaping.length > shown.length) {
    shown.push(`and ${escaping.length - shown.length} more`)
  }
  throw new InvalidConfigurationError(
    `cannot build ${consumer}: it stores the files symlinks point to, and ${escaping.length === 1 ? "a symlink leads" : "symlinks lead"} outside ` +
      `"${displayPath(dir)}": ${shown.join(", ")}. Files from elsewhere on the build machine would be packaged. electron-builder v27 refuses ` +
      `this: replace the symlink with a copy of what it points to, or exclude it. See ${SYMLINK_CONTAINMENT_DOCS_URL}`,
    ERR_PATH_OUTSIDE_ROOT
  )
}
