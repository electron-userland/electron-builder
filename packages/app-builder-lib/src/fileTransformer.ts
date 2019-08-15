import { debug, log, deepAssign } from "builder-util"
import { FileTransformer } from "builder-util/out/fs"
import { readFile } from "fs-extra"
import * as path from "path"
import { Configuration } from "./configuration"
import { Packager } from "./packager"

/** @internal */
export const NODE_MODULES_PATTERN = `${path.sep}node_modules${path.sep}`

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
export function createTransformer(srcDir: string, configuration: Configuration, extraMetadata: any, extraTransformer: FileTransformer | null): FileTransformer {
  const mainPackageJson = path.join(srcDir, "package.json")
  const isRemovePackageScripts = configuration.removePackageScripts !== false
  const packageJson = path.sep + "package.json"
  return file => {
    if (file === mainPackageJson) {
      return modifyMainPackageJson(file, extraMetadata, isRemovePackageScripts)
    }

    if (file.endsWith(packageJson) && file.includes(NODE_MODULES_PATTERN)) {
      return readFile(file, "utf-8")
        .then(it => cleanupPackageJson(JSON.parse(it), {
          isMain: false,
          isRemovePackageScripts,
        }))
        .catch(e => log.warn(e))
    }
    else if (extraTransformer != null) {
      return extraTransformer(file)
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

const ignoredPackageMetadataProperties = new Set(["dist", "gitHead", "keywords", "build", "jspm", "ava", "xo", "nyc", "eslintConfig", "contributors", "bundleDependencies", "tags"])

interface CleanupPackageFileOptions {
  readonly isRemovePackageScripts: boolean
  readonly isMain: boolean
}

function cleanupPackageJson(data: any, options: CleanupPackageFileOptions): any {
  const deps = data.dependencies
  // https://github.com/electron-userland/electron-builder/issues/507#issuecomment-312772099
  const isRemoveBabel = deps != null && typeof deps === "object" && !Object.getOwnPropertyNames(deps).some(it => it.startsWith("babel"))
  try {
    let changed = false
    for (const prop of Object.getOwnPropertyNames(data)) {
      // removing devDependencies from package.json breaks levelup in electron, so, remove it only from main package.json
      if (prop[0] === "_" ||
        ignoredPackageMetadataProperties.has(prop) ||
        (options.isRemovePackageScripts && prop === "scripts") ||
        (options.isMain && prop === "devDependencies") ||
        (!options.isMain && prop === "bugs") ||
        (isRemoveBabel && prop === "babel")) {
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

async function modifyMainPackageJson(file: string, extraMetadata: any, isRemovePackageScripts: boolean) {
  const mainPackageData = JSON.parse(await readFile(file, "utf-8"))
  if (extraMetadata != null) {
    deepAssign(mainPackageData, extraMetadata)
  }

  // https://github.com/electron-userland/electron-builder/issues/1212
  const serializedDataIfChanged = cleanupPackageJson(mainPackageData, {
    isMain: true,
    isRemovePackageScripts,
  })
  if (serializedDataIfChanged != null) {
    return serializedDataIfChanged
  }
  else if (extraMetadata != null) {
    return JSON.stringify(mainPackageData, null, 2)
  }
  return null
}