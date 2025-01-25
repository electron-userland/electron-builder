// Note to the developer: In migrating away from fs-extra to node 22 w/ node:fs and node:fs/promises, some helper functions were copied from https://github.com/jprichardson/node-fs-extra to consolidate/maintain expected logic flow within electron-builder's packages

import BluebirdPromise from "bluebird-lst"
import { Stats } from "fs"
import * as isCI from "is-ci"
import { BigIntStats, Mode as FsMode, ObjectEncodingOptions, OpenMode } from "node:fs"
import { copyFile as _nodeCopyFile, access, chmod, link, lstat, mkdir, readdir, readFile, readlink, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises"
import { platform } from "os"
import * as path from "path"
import { log } from "./log"
import { orIfFileNotExist, orNullIfFileNotExist } from "./promise"
import { Mode } from "stat-mode"
import { Stream } from "node:stream"

export const MAX_FILE_REQUESTS = 8
export const CONCURRENCY = { concurrency: MAX_FILE_REQUESTS }

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
    const sortedFilePaths = await BluebirdPromise.map(
      childNames,
      name => {
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
      },
      CONCURRENCY
    )

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

const _isUseHardLink = process.platform !== "win32" && process.env.USE_HARD_LINKS !== "false" && (isCI || process.env.USE_HARD_LINKS === "true")

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
    const mode = new Mode(stats)
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
        const oldMode = new Mode({ mode: originalModeNumber })
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

function doCopyFile(src: string, dest: string, stats: Stats | null | undefined): Promise<any> {
  const promise = _nodeCopyFile(src, dest)
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
}

/**
 * Empty directories is never created.
 * Hard links is used if supported and allowed.
 */
export function copyDir(src: string, destination: string, options: CopyDirOptions = {}): Promise<any> {
  const fileCopier = new FileCopier(options.isUseHardLink, options.transformer)

  if (log.isDebugEnabled) {
    log.debug({ src, destination }, `copying${fileCopier.isUseHardLink ? " using hard links" : ""}`)
  }

  const createdSourceDirs = new Set<string>()
  const links: Array<Link> = []
  const symlinkType = platform() === "win32" ? "junction" : "file"
  return walk(src, options.filter, {
    consume: async (file, stat, parent) => {
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return
      }

      if (!createdSourceDirs.has(parent)) {
        await mkdir(parent.replace(src, destination), { recursive: true })
        createdSourceDirs.add(parent)
      }

      const destFile = file.replace(src, destination)
      if (stat.isFile()) {
        await fileCopier.copy(file, destFile, stat)
      } else {
        links.push({ file: destFile, link: await readlink(file) })
      }
    },
  }).then(() => BluebirdPromise.map(links, it => symlink(it.link, it.file, symlinkType), CONCURRENCY))
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

export type OutputOptions = ObjectEncodingOptions & {
  mode?: FsMode
  flag?: OpenMode
}

// JSON helpers

export async function readJson(file: string) {
  const data = await readFile(file, "utf-8")
  return JSON.parse(data)
}

export async function outputJson(
  file: string,
  data: any,
  jsonOptions?: {
    prettyPrintIndent: number
    replacer?: (this: any, key: string, value: any) => any
  },
  outputOptions?: OutputOptions
) {
  return outputFile(file, JSON.stringify(data, jsonOptions?.replacer, jsonOptions?.prettyPrintIndent), outputOptions)
}

// File helpers

export async function outputFile(
  file: string,
  data: string | NodeJS.ArrayBufferView | Iterable<string | NodeJS.ArrayBufferView> | AsyncIterable<string | NodeJS.ArrayBufferView> | Stream,
  options?: OutputOptions
) {
  const dir = path.dirname(file)

  if (!(await exists(dir))) {
    await mkdirs(dir)
  }

  return writeFile(file, data, options)
}

export async function move(src: string, dest: string, options?: { overwrite: boolean; dereference?: boolean }) {
  const overwrite = options?.overwrite ?? false

  let isChangingCase = false
  const { srcStat, destStat } = await checkPathsAreValid(src, dest, options)
  if (isEqualStats(srcStat, destStat)) {
    const srcBaseName = path.basename(src)
    const destBaseName = path.basename(dest)
    if (srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
      isChangingCase = true
    } else {
      throw new Error("Source and destination must not be the same.")
    }
  }

  // await stat.checkParentPaths(src, srcStat, dest, "move")

  // If the parent of dest is not root, make sure it exists before proceeding
  const destParent = path.dirname(dest)
  const parsedParentPath = path.parse(destParent)
  if (parsedParentPath.root !== destParent) {
    await mkdirs(destParent)
  }

  if (!isChangingCase) {
    if (overwrite) {
      await remove(dest)
    } else if (await exists(dest)) {
      throw new Error("dest already exists.")
    }
  }

  try {
    // Try w/ rename first, and try copy + remove if EXDEV
    await rename(src, dest)
  } catch (err: any) {
    if (err.code !== "EXDEV") {
      throw err
    }
    if (srcStat.isDirectory()) {
      return copyDir(src, dest)
    }
    if (srcStat.isFile() || srcStat.isSymbolicLink()) {
      return copyOrLinkFile(src, dest, srcStat)
    }
    return remove(src)
  }
}

// async function copy(src: string, dest: string) {
//   // Warn about using preserveTimestamps on 32-bit node: https://github.com/jprichardson/node-fs-extra/issues/269
//   if (options?.preserveTimestamps && process.arch === "ia32") {
//     log.warn(null, "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n\tsee https://github.com/jprichardson/node-fs-extra/issues/269")
//   }

//   const { srcStat } = await checkPathsAreValid(src, dest, options)

//   // await stat.checkParentPaths(src, srcStat, dest, "copy")

//   // const include = await runFilter(src, dest, options)

//   // if (!include) return

//   // check if the parent of dest exists, and create it if it doesn't exist
//   // const destParent = path.dirname(dest)
//   // if (!(await exists(destParent))) {
//   //   await mkdirs(destParent)
//   // }

//   // await getStatsAndPerformCopy(destStat, src, dest, options)
//   if (srcStat.isDirectory()) {
//     return copyDir(src, dest)
//   }
//   if (srcStat.isFile() || srcStat.isSymbolicLink()) {
//     return copyOrLinkFile(src, dest, srcStat)
//   }
// }

export async function remove(path: string) {
  return rm(path, { recursive: true, force: true })
}

// Dir helpers

export async function emptyDir(dir: string) {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir)
}

export async function mkdirs(dir: string, mode?: FsMode) {
  return mkdir(dir, { mode, recursive: true })
}

// Symlink helpers

export type SymlinkType = "file" | "dir"

export async function ensureSymlink(src: string, dest: string, type?: SymlinkType): Promise<void> {
  // If destination already exists and it's the same symlink, return early
  try {
    if ((await lstat(dest))?.isSymbolicLink() && isEqualStats(await stat(src), await stat(dest))) {
      return
    }
  } catch {
    /* empty */
  }

  const dir = path.dirname(dest)
  if (!(await exists(dir))) {
    await mkdirs(dir)
  }

  const paths = await symlinkPaths(src, dest)
  return symlink(paths.target, dest, type ?? (await symlinkType(paths.toCwd)))
}

// Adapted from https://github.com/jprichardson/node-fs-extra/blob/master/lib/ensure/symlink-paths.js
async function symlinkPaths(target: string, dest: string) {
  const isTargetAbsolute = path.isAbsolute(target)
  const potentiallyRelativePathToSymlink = path.join(path.dirname(dest), target)
  if (!isTargetAbsolute && (await exists(potentiallyRelativePathToSymlink))) {
    return {
      toCwd: potentiallyRelativePathToSymlink,
      target,
    }
  }

  await lstat(target) // make sure src exists, e.g. just throw an error if not

  return {
    toCwd: target,
    target: isTargetAbsolute ? target : path.relative(dest, target),
  }
}

async function symlinkType(src: string) {
  try {
    if ((await lstat(src))?.isDirectory()) {
      return "dir"
    }
  } catch (e: any) {
    log.error({ error: e.message || e.stack }, "unable to determine symlink type, falling back to 'file'")
  }
  return "file"
}

// File helpers

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

export function isEqualStats(s1: Stats | BigIntStats, s2: Stats | BigIntStats | null) {
  return s2?.ino && s2.dev && s2.ino === s1.ino && s2.dev === s1.dev
}

async function checkPathsAreValid(src: string, dest: string, opts?: { dereference?: boolean }): Promise<{ srcStat: Stats; destStat: Stats | null }> {
  const getStats = (file: string) => (opts?.dereference ? stat(file) : lstat(file))
  const [srcStat, destStat] = await Promise.all([
    getStats(src),
    getStats(dest).catch(err => {
      // if file doesn' exist, that's fine since we're performing an fs operation (move/copy) to `dest`
      if (err.code === "ENOENT") {
        return null
      }
      throw err
    }),
  ])
  if (destStat) {
    if (srcStat.isDirectory() && !destStat.isDirectory()) {
      throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`)
    }
    if (!srcStat.isDirectory() && destStat.isDirectory()) {
      throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`)
    }
  }

  if (srcStat.isDirectory() && !path.relative(dest, src).includes("..")) {
    throw new Error(`Cannot perform operation on '${src}' to a subdirectory of itself, '${dest}'.`)
  }

  return { srcStat, destStat }
}

// async function getStatsAndPerformCopy(destStat: Stats, src: string, dest: string, opts: { dereference?: boolean }) {
//   const getStat = opts.dereference ? stat : lstat
//   const srcStat = await getStat(src)

//   if (srcStat.isDirectory()) {
//     return onDir(srcStat, destStat, src, dest, opts)
//   }
//   if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice())  {
//     return onFile(srcStat, destStat, src, dest, opts)
//   }
//   if (srcStat.isSymbolicLink()) {
//     return onLink(destStat, src, dest, opts)
//   }
//   if (srcStat.isSocket()) {
//     throw new Error(`Cannot copy a socket file: ${src}`)
//   }
//   if (srcStat.isFIFO()) {
//     throw new Error(`Cannot copy a FIFO pipe: ${src}`)
//   }
//   throw new Error(`Unknown file: ${src}`)
// }

// async function onFile(srcStat, destStat, src, dest, opts) {
//   if (!destStat) {
//   return copyFile(srcStat, src, dest, opts)
// }

//   if (opts.overwrite) {
//     await unlink(dest)
//     return copyFile(srcStat, src, dest, opts)
//   }
//   if (opts.errorOnExist) {
//     throw new Error(`'${dest}' already exists`)
//   }
// }

// async function onDir(srcStat, destStat, src, dest, opts) {
//   // the dest directory might not exist, create it
//   if (!(await exists(path.dirname(dest)))) {
//     await mkdirs(dest)
//   }

//   const promises = []

//   // loop through the files in the current directory to copy everything
//   for await (const item of await fs.opendir(src)) {
//     const srcItem = path.join(src, item.name)
//     const destItem = path.join(dest, item.name)

//     promises.push(
//       runFilter(srcItem, destItem, opts).then(include => {
//         if (include) {
//           // only copy the item if it matches the filter function
//           return stat.checkPaths(srcItem, destItem, "copy", opts).then(({ destStat }) => {
//             // If the item is a copyable file, `getStatsAndPerformCopy` will copy it
//             // If the item is a directory, `getStatsAndPerformCopy` will call `onDir` recursively
//             return getStatsAndPerformCopy(destStat, srcItem, destItem, opts)
//           })
//         }
//       })
//     )
//   }

//   await Promise.all(promises)

//   if (!destStat) {
//     await fs.chmod(dest, srcStat.mode)
//   }
// }

// async function onLink(destStat, src, dest, opts) {
//   let resolvedSrc = await fs.readlink(src)
//   if (opts.dereference) {
//     resolvedSrc = path.resolve(process.cwd(), resolvedSrc)
//   }
//   if (!destStat) {
//     return fs.symlink(resolvedSrc, dest)
//   }

//   let resolvedDest = null
//   try {
//     resolvedDest = await fs.readlink(dest)
//   } catch (e) {
//     // dest exists and is a regular file or directory,
//     // Windows may throw UNKNOWN error. If dest already exists,
//     // fs throws error anyway, so no need to guard against it here.
//     if (e.code === "EINVAL" || e.code === "UNKNOWN") return fs.symlink(resolvedSrc, dest)
//     throw e
//   }
//   if (opts.dereference) {
//     resolvedDest = path.resolve(process.cwd(), resolvedDest)
//   }
//   if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
//     throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`)
//   }

//   // do not copy if src is a subdir of dest since unlinking
//   // dest in this case would result in removing src contents
//   // and therefore a broken symlink would be created.
//   if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
//     throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`)
//   }

//   // copy the link
//   await fs.unlink(dest)
//   return fs.symlink(resolvedSrc, dest)
// }
