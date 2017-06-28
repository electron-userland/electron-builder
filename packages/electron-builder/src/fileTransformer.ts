import { debug, warn } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { FileTransformer } from "electron-builder-util/out/fs"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { BuildInfo } from "./packagerApi"

/** @internal */
export function isElectronCompileUsed(info: BuildInfo): boolean {
  if (info.config.electronCompile != null) {
    return info.config.electronCompile
  }
  
  // if in devDependencies - it means that babel is used for precompilation or for some reason user decided to not use electron-compile for production
  return hasDep("electron-compile", info)
}

/** @internal */
export function hasDep(name: string, info: BuildInfo) {
  const deps = info.metadata.dependencies
  return deps != null && name in deps
}

/** @internal */
export async function createTransformer(srcDir: string, extraMetadata: any): Promise<FileTransformer> {
  const mainPackageJson = path.join(srcDir, "package.json")

  return file => {
    if (file === mainPackageJson) {
      return modifyMainPackageJson(file, extraMetadata)
    }
    else if (file.endsWith("/package.json") && file.includes("/node_modules/")) {
      return readJson(file)
        .then(it => cleanupPackageJson(it, false))
        .catch(e => warn(e))
    }
    else {
      return null
    }
  }
}

/** @internal */
export interface CompilerHost {
  compile(file: string): any
  
  saveConfiguration(): Promise<any>
}

/** @internal */
export function createElectronCompilerHost(projectDir: string, cacheDir: string): Promise<CompilerHost> {
  const electronCompilePath = path.join(projectDir, "node_modules", "electron-compile", "lib")
  return require(path.join(electronCompilePath, "config-parser")).createCompilerHostFromProjectRoot(projectDir, cacheDir)
}

function cleanupPackageJson(data: any, isMain: boolean): any {
  try {
    let changed = false
    for (const prop of Object.getOwnPropertyNames(data)) {
      if (prop[0] === "_" || prop === "dist" || prop === "gitHead" || prop === "keywords" || prop === "build" || (isMain && prop === "devDependencies") || prop === "scripts") {
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
  const serializedDataIfChanged = cleanupPackageJson(mainPackageData, true)
  if (serializedDataIfChanged != null) {
    return serializedDataIfChanged
  }
  else if (extraMetadata != null) {
    return JSON.stringify(mainPackageData, null, 2)
  }
  return null
}