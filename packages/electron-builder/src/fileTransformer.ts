import { debug, warn } from "builder-util"
import { FileTransformer } from "builder-util/out/fs"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { deepAssign } from "read-config-file/out/deepAssign"
import { Packager } from "./packager"

/** @internal */
export function isElectronCompileUsed(info: Packager): boolean {
  if (info.config.electronCompile != null) {
    return info.config.electronCompile
  }

  // if in devDependencies - it means that babel is used for precompilation or for some reason user decided to not use electron-compile for production
  return hasDep("electron-compile", info)
}

/** @internal */
export function hasDep(name: string, info: Packager) {
  const deps = info.metadata.dependencies
  return deps != null && name in deps
}

/** @internal */
export function createTransformer(srcDir: string, extraMetadata: any): FileTransformer {
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

const ignoredPackageMetadataProperties = new Set(["dist", "gitHead", "keywords", "build", "scripts", "jspm", "ava", "xo", "nyc", "eslintConfig"])

function cleanupPackageJson(data: any, isMain: boolean): any {
  const deps = data.dependencies
  // https://github.com/electron-userland/electron-builder/issues/507#issuecomment-312772099
  const isRemoveBabel = deps != null && typeof deps === "object" && !Object.getOwnPropertyNames(deps).some(it => it.startsWith("babel"))
  try {
    let changed = false
    for (const prop of Object.getOwnPropertyNames(data)) {
      // removing devDependencies from package.json breaks levelup in electron, so, remove it only from main package.json
      if (prop[0] === "_" || ignoredPackageMetadataProperties.has(prop) || (isMain && prop === "devDependencies") || (isRemoveBabel && prop === "babel")) {
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