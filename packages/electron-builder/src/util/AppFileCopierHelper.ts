import BluebirdPromise from "bluebird-lst"
import { debug, log } from "builder-util"
import { CONCURRENCY, FileTransformer, statOrNull, walk } from "builder-util/out/fs"
import { ensureDir, Stats } from "fs-extra-p"
import * as path from "path"
import { FileMatcher } from "../fileMatcher"
import { createElectronCompilerHost } from "../fileTransformer"
import { Packager } from "../packager"
import { AppFileWalker } from "./AppFileWalker"

/** @internal */
export const NODE_MODULES_PATTERN = `${path.sep}node_modules${path.sep}`

// os path separator is used
export interface ResolvedFileSet {
  src: string
  destination: string

  files: Array<string>
  metadata: Map<string, Stats>
  transformedFiles: Array<string | Buffer | true | null>
}

export async function computeFileSets(matchers: Array<FileMatcher>, transformer: FileTransformer, packager: Packager, isElectronCompile: boolean): Promise<Array<ResolvedFileSet>> {
  const fileSets: Array<ResolvedFileSet> = []
  for (const matcher of matchers) {
    const fileWalker = new AppFileWalker(matcher, packager)

    const fromStat = await statOrNull(fileWalker.matcher.from)
    if (fromStat == null) {
      debug(`Directory ${fileWalker.matcher.from} doesn't exists, skip file copying`)
      continue
    }

    const files = await walk(fileWalker.matcher.from, fileWalker.filter, fileWalker)
    const metadata = fileWalker.metadata

    const transformedFiles = await BluebirdPromise.map(files, it => {
      const fileStat = metadata.get(it)
      return fileStat != null && fileStat.isFile() ? transformer(it) : null
    }, CONCURRENCY)

    fileSets.push({src: fileWalker.matcher.from, files, metadata: fileWalker.metadata, transformedFiles, destination: fileWalker.matcher.to})
  }

  const mainFileSet = fileSets[0]
  if (isElectronCompile) {
    // cache should be first in the asar
    fileSets.unshift(await compileUsingElectronCompile(mainFileSet, packager))
  }
  return fileSets
}

const BOWER_COMPONENTS_PATTERN = `${path.sep}bower_components${path.sep}`
/** @internal */
export const ELECTRON_COMPILE_SHIM_FILENAME = "__shim.js"

async function compileUsingElectronCompile(mainFileSet: ResolvedFileSet, packager: Packager): Promise<ResolvedFileSet> {
  log("Compiling using electron-compile")

  const electronCompileCache = await packager.tempDirManager.getTempDir({prefix: "electron-compile-cache"})
  const cacheDir = path.join(electronCompileCache, ".cache")
  // clear and create cache dir
  await ensureDir(cacheDir)
  const compilerHost = await createElectronCompilerHost(mainFileSet.src, cacheDir)
  const nextSlashIndex = mainFileSet.src.length + 1
  // pre-compute electron-compile to cache dir - we need to process only subdirectories, not direct files of app dir
  await BluebirdPromise.map(mainFileSet.files, file => {
    if (file.includes(NODE_MODULES_PATTERN) || file.includes(BOWER_COMPONENTS_PATTERN)
      || !file.includes(path.sep, nextSlashIndex) // ignore not root files
      || !mainFileSet.metadata.get(file)!.isFile()) {
      return null
    }
    return compilerHost.compile(file)
      .then((it: any) => null)
  }, CONCURRENCY)

  await compilerHost.saveConfiguration()

  const metadata = new Map<string, Stats>()
  const cacheFiles = await walk(cacheDir, (file, stat) => !file.startsWith("."), {
    consume: (file, fileStat) => {
      if (fileStat.isFile()) {
        metadata.set(file, fileStat)
      }
      return null
    }
  })

  // add shim
  const shimPath = `${mainFileSet.src}/${ELECTRON_COMPILE_SHIM_FILENAME}`
  cacheFiles.push(shimPath)
  metadata.set(shimPath, {isFile: () => true, isDirectory: () => false} as any)

  const transformedFiles = new Array(cacheFiles.length)
  transformedFiles[cacheFiles.length - 1] = `
'use strict';
require('electron-compile').init(__dirname, require('path').resolve(__dirname, '${packager.metadata.main || "index"}'), true);
`
  // cache files should be first (better IO)
  return {src: electronCompileCache, files: cacheFiles, transformedFiles, metadata, destination: mainFileSet.destination}
}

// sometimes, destination may not contain path separator in the end (path to folder), but the src does. So let's ensure paths have path separators in the end
export function ensureEndSlash(s: string) {
  return s === "" || s.endsWith(path.sep) ? s : (s + path.sep)
}