import { debug } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { log, warn } from "electron-builder-util/out/log"
import { readJson } from "fs-extra-p"
import mime from "mime"
import * as path from "path"
import { BuildInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"

export type FileTransformer = (path: string) => Promise<null | string | Buffer> | null | string | Buffer

function isElectronCompileUsed(info: BuildInfo): boolean {
  const depList = [(<any>info.metadata).devDependencies, info.metadata.dependencies]
  if (info.isTwoPackageJsonProjectLayoutUsed) {
    depList.push((<any>info.devMetadata).devDependencies)
    depList.push(info.devMetadata.dependencies)
  }
  
  for (const deps of depList) {
    if (deps != null && "electron-compile" in deps) {
      log("electron-compile detected — files will be compiled")
      return true
    }
  }
  
  return false
}

export async function createTransformer(projectDir: string, srcDir: string, packager: PlatformPackager<any>): Promise<FileTransformer> {
  const extraMetadata = packager.packagerOptions.extraMetadata
  const mainPackageJson = path.join(srcDir, "package.json")
  
  const defaultTransformer: FileTransformer = file => {
    if (file === mainPackageJson) {
      return modifyMainPackageJson(file, extraMetadata)
    }
    else if (file.endsWith("/package.json") && file.includes("/node_modules/")) {
      return readJson(file)
        .then(it => cleanupPackageJson(it))
        .catch(e => warn(e))
    }
    else {
      return null
    }
  }
  
  return isElectronCompileUsed(packager.info) ? await createElectronCompileTransformer(projectDir, defaultTransformer) : defaultTransformer
}

async function createElectronCompileTransformer(projectDir: string, defaultTransformer: FileTransformer) {
  const electronCompilePath = path.join(projectDir, "node_modules", "electron-compile", "lib")
  const CompilerHost = require(path.join(electronCompilePath, "compiler-host")).default
  const compilerHost = await require(path.join(electronCompilePath, "config-parser")).createCompilerHostFromProjectRoot(projectDir)
  return async (file: string) => {
    const defaultResult = defaultTransformer(file)
    if (defaultResult != null) {
      return await defaultResult
    }

    const hashInfo = await compilerHost.fileChangeCache.getHashForPath(file)

    if (CompilerHost.shouldPassthrough(hashInfo)) {
      return null
    }

    // we don't use @paulcbetts/mime-types to lookup mime-type because it doesn't any value except size (@develar 20.03.17)
    // as we already depends on mime module (github publisher)
    // https://github.com/electron/electron-compile/pull/148#issuecomment-266669293
    const type = mime.lookup(file)
    const compiler = type == null ? null : compilerHost.compilersByMimeType[type]
    if (compiler == null) {
      return null
    }

    const cache = compilerHost.cachesForCompilers.get(compiler)
    const result = await cache.getOrFetch(file, (file: string, hashInfo: any) => compilerHost.compileUncached(file, hashInfo, compiler))
    const code = result.code
    if (type === "application/javascript" && code != null && (code.includes("require('electron-compile')") || code.includes('require("electron-compile")'))) {
      warn("electron-compile should be not used in the production code")
    }
    return code || result.binaryData
  }
}

function cleanupPackageJson(data: any): any {
  try {
    let changed = false
    for (const prop of Object.getOwnPropertyNames(data)) {
      if (prop[0] === "_" || prop === "dist" || prop === "gitHead" || prop === "keywords" || prop === "build" || prop === "devDependencies" || prop === "scripts") {
        delete data[prop]
        changed = true
      }
    }

    if (changed) {
      return JSON.stringify(data, null, 2)
    }
  }
  catch (e) {
    debug(e)
  }

  return null
}

async function modifyMainPackageJson(file: string, extraMetadata: any) {
  const mainPackageData = await readJson(file)
  if (extraMetadata != null) {
    deepAssign(mainPackageData, extraMetadata)
  }

  // https://github.com/electron-userland/electron-builder/issues/1212
  const serializedDataIfChanged = cleanupPackageJson(mainPackageData)
  if (serializedDataIfChanged != null) {
    return serializedDataIfChanged
  }
  else if (extraMetadata != null) {
    return JSON.stringify(mainPackageData, null, 2)
  }
  return null
}