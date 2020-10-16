import BluebirdPromise from "bluebird-lst"
import { access, chmod, copyFile as _nodeCopyFile, ensureDir, link, lstat, readdir, readlink, stat, Stats, symlink, unlink, writeFile } from "fs-extra"
import * as path from "path"
import { Mode } from "stat-mode"
import { log } from "./log"
import { orIfFileNotExist, orNullIfFileNotExist } from "./promise"

export const MAX_FILE_REQUESTS = 8
export const CONCURRENCY = {concurrency: MAX_FILE_REQUESTS}

export type AfterCopyFileTransformer = (file: string) => Promise<void>

export class CopyFileTransformer {
  constructor(public readonly afterCopyTransformer: AfterCopyFileTransformer) {
  }
}

export type FileTransformer = (file: string) => Promise<null | string | Buffer | CopyFileTransformer> | null | string | Buffer | CopyFileTransformer
export type Filter = (file: string, stat: Stats) => boolean

export function unlinkIfExists(file: string) {
  return unlink(file)
    .catch(() => {/* ignore */})
}

export async function statOrNull(file: string): Promise<Stats | null> {
  return orNullIfFileNotExist(stat(file))
}

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  }
  catch (e) {
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
      }
      else {
        addDirToResult = true
      }
    }

    const childNames = await orIfFileNotExist(readdir(dirPath), [])
    childNames.sort()

    let nodeModuleContent: Array<string> | null = null

    const dirs: Array<string> = []
    // our handler is async, but we should add sorted files, so, we add file to result not in the mapper, but after map
    const sortedFilePaths = await BluebirdPromise.map(childNames, name => {
      if (name === ".DS_Store" || name === ".gitkeep") {
        return null
      }

      const filePath = dirPath + path.sep + name
      return lstat(filePath)
        .then(stat => {
          if (filter != null && !filter(filePath, stat)) {
            return null
          }

          const consumerResult = consumer == null ? null : consumer.consume(filePath, stat, dirPath, childNames)
          if (consumerResult === false) {
            return null
          }
          else if (consumerResult == null || !("then" in consumerResult)) {
            if (stat.isDirectory()) {
              dirs.push(name)
              return null
            }
            else {
              return filePath
            }
          }
          else {
            return (consumerResult as Promise<any>)
              .then((it): any => {
                if (it != null && Array.isArray(it)) {
                  nodeModuleContent = it
                  return null
                }

                // asarUtil can return modified stat (symlink handling)
                if ((it != null && "isDirectory" in it ? (it as Stats) : stat).isDirectory()) {
                  dirs.push(name)
                  return null
                }
                else {
                  return filePath
                }
              })
          }
        })
    }, CONCURRENCY)

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

const _isUseHardLink = process.platform !== "win32" && process.env.USE_HARD_LINKS !== "false" && (require("is-ci") || process.env.USE_HARD_LINKS === "true")

export function copyFile(src: string, dest: string, isEnsureDir = true) {
  return (isEnsureDir ? ensureDir(path.dirname(dest)) : Promise.resolve())
    .then(() => copyOrLinkFile(src, dest, null, false))
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
        const oldMode = new Mode({mode: originalModeNumber})
        log.debug({file: dest, oldMode, mode}, "permissions fixed from")
      }

      // https://helgeklein.com/blog/2009/05/hard-links-and-permissions-acls/
      // Permissions on all hard links to the same data on disk are always identical. The same applies to attributes.
      // That means if you change the permissions/owner/attributes on one hard link, you will immediately see the changes on all other hard links.
      if (isUseHardLink) {
        isUseHardLink = false
        log.debug({dest}, "copied, but not linked, because file permissions need to be fixed")
      }
    }
  }

  if (isUseHardLink) {
    return link(src, dest)
      .catch(e => {
        if (e.code === "EXDEV") {
          const isLog = exDevErrorHandler == null ? true : exDevErrorHandler()
          if (isLog && log.isDebugEnabled) {
            log.debug({error: e.message}, "cannot copy using hard link")
          }
          return doCopyFile(src, dest, stats)
        }
        else {
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

  return promise
    .then(() => chmod(dest, stats.mode))
}

export class FileCopier {
  isUseHardLink: boolean

  constructor(private readonly isUseHardLinkFunction?: ((file: string) => boolean) | null, private readonly transformer?: FileTransformer | null) {
    if (isUseHardLinkFunction === USE_HARD_LINKS) {
      this.isUseHardLink = true
    }
    else {
      this.isUseHardLink = _isUseHardLink && isUseHardLinkFunction !== DO_NOT_USE_HARD_LINKS
    }
  }

  async copy(src: string, dest: string, stat: Stats | undefined) {
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
          }
          else {
            await writeFile(dest, data)
            return
          }
        }
      }
    }

    const isUseHardLink = afterCopyTransformer == null && ((!this.isUseHardLink || this.isUseHardLinkFunction == null) ? this.isUseHardLink : this.isUseHardLinkFunction(dest))
    await copyOrLinkFile(src, dest, stat, isUseHardLink, isUseHardLink ? () => {
      // files are copied concurrently, so, we must not check here currentIsUseHardLink — our code can be executed after that other handler will set currentIsUseHardLink to false
      if (this.isUseHardLink) {
        this.isUseHardLink = false
        return true
      }
      else {
        return false
      }
    } : null)

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
    log.debug({src, destination}, `copying${fileCopier.isUseHardLink ? " using hard links" : ""}`)
  }

  const createdSourceDirs = new Set<string>()
  const links: Array<Link> = []
  return walk(src, options.filter, {
    consume: async (file, stat, parent) => {
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return
      }

      if (!createdSourceDirs.has(parent)) {
        await ensureDir(parent.replace(src, destination))
        createdSourceDirs.add(parent)
      }

      const destFile = file.replace(src, destination)
      if (stat.isFile()) {
        await fileCopier.copy(file, destFile, stat)
      }
      else {
        links.push({file: destFile, link: await readlink(file)})
      }
    }
  })
    .then(() => BluebirdPromise.map(links, it => symlink(it.link, it.file), CONCURRENCY))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const DO_NOT_USE_HARD_LINKS = (file: string) => false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const USE_HARD_LINKS = (file: string) => true

export interface Link {
  readonly link: string
  readonly file: string
}