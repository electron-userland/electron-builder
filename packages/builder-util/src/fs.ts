import { Nullish, retry, sleep } from "builder-util-runtime"
import { Stats } from "fs"
import * as fs from "fs/promises"
import fsExtra from "fs-extra"
import { access, chmod, link, lstat, mkdir, readdir, readlink, stat, symlink, unlink, writeFile } from "fs/promises"
import { platform } from "os"
import * as path from "path"
import statMode from "stat-mode"
import asyncPool from "tiny-async-pool"
import { log } from "./log.js"
import { ERR_PATH_OUTSIDE_ROOT, ExternalLinkPolicy, isPathWithin, resolvePhysicalPath, SYMLINK_CONTAINMENT_DOCS_URL, WriteContainment } from "./pathContainment.js"
import { orIfFileNotExist, orNullIfFileNotExist } from "./promise.js"
import { InvalidConfigurationError } from "./util.js"

export const MAX_FILE_REQUESTS = 8

export type AfterCopyFileTransformer = (file: string) => Promise<boolean>

export class CopyFileTransformer {
  constructor(public readonly afterCopyTransformer: AfterCopyFileTransformer) {}
}

export type FileTransformer = (file: string) => Promise<null | string | Buffer | CopyFileTransformer> | null | string | Buffer | CopyFileTransformer
export interface FilterStats extends Stats {
  // These module name and paths are mainly used for:
  // 1. File filtering
  // 2. Asar unpacking rules
  // 3. Dependency resolution

  // The name of the node module (e.g. 'express')
  moduleName?: string
  // The root path of the node module (e.g. 'node_modules/express')
  moduleRootPath?: string
  // The full file path within the node module (e.g. 'node_modules/express/lib/application.js')
  moduleFullFilePath?: string
  // deal with asar unpack sysmlink
  relativeLink?: string
  linkRelativeToFile?: string
}
export type Filter = (file: string, stat: FilterStats) => boolean

export function unlinkIfExists(file: string) {
  return unlink(file).catch(() => {
    /* ignore */
  })
}

export async function statOrNull(file: string): Promise<Stats | null> {
  return orNullIfFileNotExist(stat(file))
}

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (_e: any) {
    return false
  }
}

export interface FileConsumer {
  consume(file: string, fileStat: Stats, parent: string, siblingNames: Array<string>): any

  /**
   * @default false
   */
  isIncludeDir?: boolean
}

/**
 * Returns list of file paths (system-dependent file separator)
 */
export async function walk(initialDirPath: string, filter?: Filter | null, consumer?: FileConsumer): Promise<Array<string>> {
  let result: Array<string> = []
  const queue: Array<string> = [initialDirPath]
  let addDirToResult = false
  const isIncludeDir = consumer == null ? false : consumer.isIncludeDir === true
  while (queue.length > 0) {
    const dirPath = queue.pop()!
    if (isIncludeDir) {
      if (addDirToResult) {
        result.push(dirPath)
      } else {
        addDirToResult = true
      }
    }

    const childNames = await orIfFileNotExist(readdir(dirPath), [])
    childNames.sort()

    let nodeModuleContent: Array<string> | null = null

    const dirs: Array<string> = []
    // our handler is async, but we should add sorted files, so, we add file to result not in the mapper, but after map
    const sortedFilePaths = await asyncPool<string, string>(MAX_FILE_REQUESTS, childNames, async name => {
      if (name === ".DS_Store" || name === ".gitkeep") {
        return null
      }

      const filePath = dirPath + path.sep + name
      return lstat(filePath).then(stat => {
        if (filter != null && !filter(filePath, stat)) {
          return null
        }

        const consumerResult = consumer == null ? null : consumer.consume(filePath, stat, dirPath, childNames)
        if (consumerResult === true) {
          return null
        } else if (consumerResult === false || consumerResult == null || !("then" in consumerResult)) {
          if (stat.isDirectory()) {
            dirs.push(name)
            return null
          } else {
            return filePath
          }
        } else {
          return (consumerResult as Promise<any>).then((it): any => {
            if (it != null && Array.isArray(it)) {
              nodeModuleContent = it
              return null
            }

            // asarUtil can return modified stat (symlink handling)
            if ((it != null && "isDirectory" in it ? (it as Stats) : stat).isDirectory()) {
              dirs.push(name)
              return null
            } else {
              return filePath
            }
          })
        }
      })
    })

    for (const child of sortedFilePaths) {
      if (child != null) {
        result.push(child)
      }
    }

    dirs.sort()
    for (const child of dirs) {
      queue.push(dirPath + path.sep + child)
    }

    if (nodeModuleContent != null) {
      result = result.concat(nodeModuleContent)
    }
  }

  return result
}

// performance optimization. only enable hard links during unit tests on non-Windows platforms by default
// This is to optimize disk space and speed during tests, while avoiding potential issues with hard links in distribution builds
// https://github.com/electron-userland/electron-builder/issues/5721
const _isUseHardLink = process.platform !== "win32" && (process.env.USE_HARD_LINKS === "true" || process.env.VITEST != null)

export function copyFile(src: string, dest: string, isEnsureDir = true) {
  return (isEnsureDir ? mkdir(path.dirname(dest), { recursive: true }) : Promise.resolve()).then(() => copyOrLinkFile(src, dest, null, false))
}

/**
 * Hard links is used if supported and allowed.
 * File permission is fixed — allow execute for all if owner can, allow read for all if owner can.
 *
 * ensureDir is not called, dest parent dir must exists
 */
export function copyOrLinkFile(src: string, dest: string, stats?: Stats | null, isUseHardLink?: boolean, exDevErrorHandler?: (() => boolean) | null): Promise<any> {
  if (isUseHardLink === undefined) {
    isUseHardLink = _isUseHardLink
  }

  if (stats != null) {
    const originalModeNumber = stats.mode
    const mode = new statMode.Mode(stats)
    if (mode.owner.execute) {
      mode.group.execute = true
      mode.others.execute = true
    }

    mode.group.read = true
    mode.others.read = true

    mode.setuid = false
    mode.setgid = false

    if (originalModeNumber !== stats.mode) {
      if (log.isDebugEnabled) {
        const oldMode = new statMode.Mode({ mode: originalModeNumber })
        log.debug({ file: dest, oldMode, mode }, "permissions fixed from")
      }

      // https://helgeklein.com/blog/2009/05/hard-links-and-permissions-acls/
      // Permissions on all hard links to the same data on disk are always identical. The same applies to attributes.
      // That means if you change the permissions/owner/attributes on one hard link, you will immediately see the changes on all other hard links.
      if (isUseHardLink) {
        isUseHardLink = false
        log.debug({ dest }, "copied, but not linked, because file permissions need to be fixed")
      }
    }
  }

  if (isUseHardLink) {
    return link(src, dest).catch((e: any) => {
      if (e.code === "EXDEV") {
        const isLog = exDevErrorHandler == null ? true : exDevErrorHandler()
        if (isLog && log.isDebugEnabled) {
          log.debug({ error: e.message }, "cannot copy using hard link")
        }
        return doCopyFile(src, dest, stats)
      } else {
        throw e
      }
    })
  }
  return doCopyFile(src, dest, stats)
}

function doCopyFile(src: string, dest: string, stats: Stats | Nullish): Promise<any> {
  const promise = fsExtra.copyFile(src, dest)
  if (stats == null) {
    return promise
  }

  return promise.then(() => chmod(dest, stats.mode))
}

export class FileCopier {
  isUseHardLink: boolean

  constructor(
    private readonly isUseHardLinkFunction?: ((file: string) => boolean) | null,
    private readonly transformer?: FileTransformer | null
  ) {
    if (isUseHardLinkFunction === USE_HARD_LINKS) {
      this.isUseHardLink = true
    } else {
      this.isUseHardLink = _isUseHardLink && isUseHardLinkFunction !== DO_NOT_USE_HARD_LINKS
    }
  }

  async copy(src: string, dest: string, stat: Stats | undefined): Promise<void> {
    let afterCopyTransformer: AfterCopyFileTransformer | null = null
    if (this.transformer != null && stat != null && stat.isFile()) {
      let data = this.transformer(src)
      if (data != null) {
        if (typeof data === "object" && "then" in data) {
          data = await data
        }

        if (data != null) {
          if (data instanceof CopyFileTransformer) {
            afterCopyTransformer = data.afterCopyTransformer
          } else {
            await writeFile(dest, data)
            return
          }
        }
      }
    }

    const isUseHardLink = afterCopyTransformer == null && (!this.isUseHardLink || this.isUseHardLinkFunction == null ? this.isUseHardLink : this.isUseHardLinkFunction(dest))
    await copyOrLinkFile(
      src,
      dest,
      stat,
      isUseHardLink,
      isUseHardLink
        ? () => {
            // files are copied concurrently, so, we must not check here currentIsUseHardLink — our code can be executed after that other handler will set currentIsUseHardLink to false
            if (this.isUseHardLink) {
              this.isUseHardLink = false
              return true
            } else {
              return false
            }
          }
        : null
    )

    if (afterCopyTransformer != null) {
      await afterCopyTransformer(dest)
    }
  }
}

export interface CopyDirOptions {
  filter?: Filter | null
  transformer?: FileTransformer | null
  isUseHardLink?: ((file: string) => boolean) | null
  /**
   * Every file, directory and symlink is written inside this directory, checked by its real path when it is written
   * (see {@link WriteContainment}). Pass the output directory the copy is part of, such as the app output directory, rather than a
   * directory that copied files may have created. Defaults to `destination`.
   */
  containmentRoot?: string | null
  /**
   * Besides the containment root, the directories a copied symlink may lead into, such as the workspace root. A symlink that leads
   * anywhere else fails the copy. A symlink is kept as it is, so one that leads into these roots points outside the output.
   */
  allowedSymlinkRoots?: ReadonlyArray<string> | null
  /**
   * The `fileOptions.allowExternalLinks` build option: a copied symlink that leads outside the containment root and the allowed roots is kept when it
   * allows it. It does not allow a write through a symlink.
   */
  externalLinks?: ExternalLinkPolicy | null
}

/**
 * Checks the symlinks `copyDir` and the app file copier recreate, once all of them exist: each must lead (through the others, also when
 * the end does not exist) into the containment root or one of `allowedRoots`, or be allowed by the `fileOptions.allowExternalLinks` build option
 * (`externalLinks`). A symlink that is not is removed and the copy fails.
 */
export async function assertCopiedSymlinksContained(
  containment: WriteContainment,
  links: ReadonlyArray<Link & { readonly source: string }>,
  allowedRoots: ReadonlyArray<string>,
  what: string,
  externalLinks: ExternalLinkPolicy | null = null
): Promise<void> {
  if (links.length === 0) {
    return
  }
  const realRoot = await containment.getRealRoot()
  const realAllowed = await Promise.all(allowedRoots.map(it => resolvePhysicalPath(it)))
  for (const it of links) {
    const resolved = await resolvePhysicalPath(it.file)
    if (isPathWithin(realRoot, resolved)) {
      continue
    }
    if (realAllowed.some(root => isPathWithin(root, resolved))) {
      log
        .once("copied-symlink-outside-output")
        .warn(
          { symlink: log.filePath(it.source), target: it.link, resolvesTo: resolved },
          `a ${what} symlink is kept, but it points outside the packaged app (into the workspace or the package-manager store), where it is ` +
            `dangling on other machines. Windows archives and installers refuse such a symlink; replace it with ` +
            `what it points to. See ${SYMLINK_CONTAINMENT_DOCS_URL}`
        )
      continue
    }
    const policy = externalLinks ?? ExternalLinkPolicy.NONE
    if (policy.allows(it.source, resolved)) {
      continue
    }
    await unlinkIfExists(it.file)
    throw new InvalidConfigurationError(
      `refusing to copy the ${what} symlink "${policy.displayPath(it.source)}" -> "${it.link}": in the output it resolves to "${resolved}", ` +
        `which is outside "${policy.displayPath(containment.root)}". electron-builder only recreates a symlink that stays inside the output ` +
        `(or leads into the workspace or the package-manager store): replace the symlink with what it points to, or exclude it with a "!" ` +
        `pattern. ${await policy.hint([resolved])} See ${SYMLINK_CONTAINMENT_DOCS_URL}`,
      ERR_PATH_OUTSIDE_ROOT
    )
  }
}

/**
 * The target to recreate a copied symlink with. An absolute target inside the copied tree (`sourceRoot`) is made relative, so that the
 * copy points into the copy rather than back at the source on the build machine; any other target is kept as it is.
 */
export function rebaseCopiedSymlinkTarget(sourceRoot: string, sourceLink: string, target: string): string {
  if (!path.isAbsolute(target) || !isPathWithin(path.resolve(sourceRoot), path.resolve(target))) {
    return target
  }
  return path.relative(path.dirname(sourceLink), target) || "."
}

/**
 * Empty directories is never created.
 * Hard links is used if supported and allowed.
 *
 * Writes are checked by their real path (see {@link CopyDirOptions.containmentRoot}): a symlink at a destination is replaced, never
 * followed, and a symlink is recreated only when it stays inside the containment root, leads into an allowed root or is allowed by
 * {@link CopyDirOptions.externalLinks}.
 */
export async function copyDir(src: string, destination: string, options: CopyDirOptions = {}): Promise<any> {
  const fileCopier = new FileCopier(options.isUseHardLink, options.transformer)

  log.debug({ src, destination }, `copying${fileCopier.isUseHardLink ? " using hard links" : ""}`)

  const containment = new WriteContainment(options.containmentRoot ?? destination, "copied file")
  const links: Array<Link & { source: string }> = []
  const symlinkType = platform() === "win32" ? "junction" : "file"
  await walk(src, options.filter, {
    consume: async (file, stat) => {
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return
      }

      const destFile = file.replace(src, destination)
      if (stat.isFile()) {
        // creates the directory once, checked by its real path, and removes a symlink planted at the destination
        await containment.prepareFile(destFile)
        await fileCopier.copy(file, destFile, stat)
      } else {
        links.push({ file: destFile, link: rebaseCopiedSymlinkTarget(src, file, await readlink(file)), source: file })
      }
    },
  })
  // after the walk, so that a symlink to a file that is not copied yet works (#998), and checked once all of them exist
  await asyncPool(MAX_FILE_REQUESTS, links, async it => {
    await containment.prepareFile(it.file)
    await symlink(it.link, it.file, symlinkType)
  })
  await assertCopiedSymlinksContained(containment, links, options.allowedSymlinkRoots ?? [], "copied", options.externalLinks)
}

export async function dirSize(dirPath: string): Promise<number> {
  const entries = await readdir(dirPath, { withFileTypes: true })

  const entrySizes = entries.map(async entry => {
    const entryPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      return await dirSize(entryPath)
    }

    if (entry.isFile()) {
      const { size } = await stat(entryPath)
      return size
    }

    return 0
  })

  return (await Promise.all(entrySizes)).reduce((entrySize, totalSize) => entrySize + totalSize, 0)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const DO_NOT_USE_HARD_LINKS = (file: string) => false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const USE_HARD_LINKS = (file: string) => true

export interface Link {
  readonly link: string
  readonly file: string
}

const TRANSIENT_RENAME_CODES = new Set(["ENOENT", "EPERM", "EBUSY", "EXDEV"])

/**
 *
 * Atomically moves `src` to `dest` by rename, retrying on transient Windows errors (ENOENT,
 * EPERM, EBUSY) before falling back to a copy+delete when all retries are exhausted.
 *
 * On Windows Docker / Windows Server containers, MoveFileEx can spuriously return
 * ERROR_FILE_NOT_FOUND (ENOENT) or a sharing-violation even when both paths are valid.
 * Retrying with back-off resolves the majority of these transient failures; the copy+delete
 * fallback handles the rare case where the rename keeps failing (e.g. cross-device move).
 */
export async function moveDirAtomic(src: string, dest: string): Promise<void> {
  // 4 retries → 5 total attempts; interval+backoff*attempt gives 250/500/750/1000 ms delays.
  let lastErr: (Error & { code?: string }) | undefined
  try {
    await retry(() => fs.rename(src, dest), {
      retries: 4,
      interval: 250,
      backoff: 250,
      shouldRetry: (err: any) => {
        if (TRANSIENT_RENAME_CODES.has(err.code ?? "")) {
          log.warn({ src: log.filePath(src), dest: log.filePath(dest), code: err.code }, "directory rename failed, retrying")
          return true
        }
        return false
      },
    })
    return
  } catch (err: any) {
    lastErr = err
    if (!TRANSIENT_RENAME_CODES.has(err.code ?? "")) {
      throw err
    }
  }
  // All rename retries exhausted on a transient error — fall back to copy + delete
  log.warn({ src: log.filePath(src), dest: log.filePath(dest) }, "directory rename failed repeatedly; falling back to copy+delete")
  try {
    await fs.cp(src, dest, { recursive: true })
    await fs.rm(src, { recursive: true, force: true })
  } catch (err: any) {
    throw new Error(`Failed to move directory from ${src} to ${dest}: ${err.message}${lastErr ? `; last rename error: ${lastErr.message}` : ""}`)
  }
}

/**
 * Recursive mkdir hardened against the long-standing Node concurrency bug where two processes
 * building overlapping directory trees at the same time spuriously throw ENOENT (a peer is
 * mid-creating a shared ancestor) or EEXIST (a peer just created this dir) — nodejs/node#27293,
 * #31481. It is rare on local filesystems but routine on Docker overlayfs, which is where CI builds
 * run and where this surfaced as a flaky `ENOENT … mkdir '<cache>/<release>/<artifact>-<hash>'`
 * whenever concurrent builds/targets (e.g. rpm x64 + rpm armv7l, or two test workers) first
 * populated a cold toolset cache. proper-lockfile serializes the *download/extract*, but the cache
 * dir is created around the lock, so the mkdir itself must tolerate the race. Both error codes are
 * transient: retry with a short backoff; by the next attempt the peer has finished.
 */
export async function ensureDir(dir: string, maxAttempts = 8, mkdir: (p: string, opts: { recursive: true }) => Promise<unknown> = fs.mkdir): Promise<void> {
  // interval+backoff*attempt gives 50/100/150/… ms delays; only the transient ENOENT race is retried.
  await retry(
    async () => {
      try {
        await mkdir(dir, { recursive: true })
      } catch (e: any) {
        // recursive mkdir is normally idempotent; a spurious EEXIST from the race is fine as long
        // as the path really is a directory now — otherwise it's a genuine file-in-the-way error.
        if (e.code === "EEXIST" && (await fs.stat(dir).catch(() => null))?.isDirectory()) {
          return
        }
        throw e
      }
    },
    {
      retries: maxAttempts,
      interval: 50,
      backoff: 50,
      shouldRetry: (e: any) => e.code === "ENOENT",
    }
  )
}

/**
 * Wait until `file` can be opened for writing, retrying while it is locked.
 *
 * On Windows a file that was just extracted, copied, or written is frequently held by an antivirus
 * scanner or a peer build with a deny-write share mode; an `fs.open(file, "r+")` against it fails with
 * `EBUSY` (a sharing violation). Trying to *spawn* or overwrite the file during that window fails too —
 * e.g. `CreateProcess` on a freshly-extracted `makeappx.exe` surfaces as `spawn UNKNOWN`. Waiting for
 * the lock to clear first avoids that whole class of transient failure under heavy concurrent builds.
 *
 * Only `EBUSY` is treated as transient. Any other open error (read-only file, ENOENT, perms) is taken
 * to mean "not lock-contended" — we return and let the caller perform its real operation and surface
 * the genuine error itself. Bounded by `maxAttempts` so it can never hang a build indefinitely.
 */
type FileOpener = (file: string, flags: string) => Promise<{ close(): Promise<void> }>

export async function ensureNotBusy(file: string, intervalMs = 2000, maxAttempts = 60, open: FileOpener = fs.open): Promise<void> {
  for (let attempt = 0, warned = false; attempt < maxAttempts; attempt++) {
    try {
      const handle = await open(file, "r+")
      await handle.close()
      return
    } catch (error: any) {
      if (error.code !== "EBUSY") {
        return
      }
      if (!warned) {
        warned = true
        log.info({ file: log.filePath(file) }, "file is locked for writing (maybe by a virus scanner) => waiting for unlock...")
      }
      await sleep(intervalMs)
    }
  }
  log.warn({ file: log.filePath(file) }, "file still reported as locked after waiting; proceeding anyway")
}
