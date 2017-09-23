import { asArray, DebugLogger, log, warn } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { readJson } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { getConfig as _getConfig, loadParentConfig, orNullIfFileNotExist, ReadConfigRequest, validateConfig as _validateConfig } from "read-config-file"
import { deepAssign } from "read-config-file/out/deepAssign"
import { Configuration } from "../configuration"
import { reactCra } from "../presets/rectCra"

// https://github.com/electron-userland/electron-builder/issues/1847
function mergePublish(config: Configuration, configFromOptions: Configuration) {
  // if config from disk doesn't have publish (or object), no need to handle, it will be simply merged by deepAssign
  const publish = Array.isArray(config.publish) ? configFromOptions.publish : null
  if (publish != null) {
    delete (configFromOptions as any).publish
  }

  deepAssign(config, configFromOptions)

  if (publish == null) {
    return
  }

  const listOnDisk = config.publish as Array<any>
  if (listOnDisk.length === 0) {
    config.publish = publish
  }
  else {
    // apply to first
    Object.assign(listOnDisk[0], publish)
  }
}

/** @internal */
export async function getConfig(projectDir: string, configPath: string | null, configFromOptions: Configuration | null | undefined, packageMetadata: Lazy<{ [key: string]: any } | null> = new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))): Promise<Configuration> {
  const configRequest: ReadConfigRequest = {packageKey: "build", configFilename: "electron-builder", projectDir, packageMetadata, log}
  const config = await _getConfig<Configuration>(configRequest, configPath)
  if (configFromOptions != null) {
    mergePublish(config, configFromOptions)
  }

  let extendsSpec = config.extends
  if (extendsSpec == null && extendsSpec !== null) {
    const devDependencies = (await packageMetadata.value || {}).devDependencies
    if (devDependencies != null) {
      if ("react-scripts" in devDependencies) {
        extendsSpec = "react-cra"
        config.extends = extendsSpec
      }
      else if ("electron-webpack" in devDependencies) {
        extendsSpec = "electron-webpack/electron-builder.yml"
        config.extends = extendsSpec
      }
    }
  }

  if (extendsSpec == null) {
    return config
  }

  let parentConfig: Configuration | null
  if (extendsSpec === "react-cra") {
    parentConfig = await reactCra(projectDir)
  }
  else {
    parentConfig = await loadParentConfig<Configuration>(configRequest, extendsSpec)
  }

  // electron-webpack and electrify client config - want to exclude some files
  // we add client files configuration to main parent file matcher
  if (parentConfig.files != null && config.files != null && (Array.isArray(config.files) || typeof config.files === "string") && Array.isArray(parentConfig.files) && parentConfig.files.length > 0) {
    const mainFileSet = parentConfig.files[0]
    if (typeof mainFileSet === "object" && (mainFileSet.from == null || mainFileSet.from === ".")) {
      mainFileSet.filter = asArray(mainFileSet.filter)
      mainFileSet.filter.push(...asArray(config.files as any))
      delete (config as any).files
    }
  }

  return deepAssign(parentConfig, config)
}

const schemeDataPromise = new Lazy(() => readJson(path.join(__dirname, "..", "..", "scheme.json")))

/** @internal */
export async function validateConfig(config: Configuration, debugLogger: DebugLogger) {
  const extraMetadata = config.extraMetadata
  if (extraMetadata != null) {
    if (extraMetadata.build != null) {
      throw new Error(`--em.build is deprecated, please specify as -c"`)
    }
    if (extraMetadata.directories != null) {
      throw new Error(`--em.directories is deprecated, please specify as -c.directories"`)
    }
  }

  // noinspection JSDeprecatedSymbols
  if (config.npmSkipBuildFromSource === false) {
    config.buildDependenciesFromSource = false
  }

  await _validateConfig(config, schemeDataPromise, (message, errors) => {
    if (debugLogger.enabled) {
      debugLogger.add("invalidConfig", JSON.stringify(errors, null, 2))
    }

    return `${message}

How to fix:
1. Open https://electron.build/configuration/configuration
2. Search the option name on the page.
  * Not found? The option was deprecated or not exists (check spelling).
  * Found? Check that the option in the appropriate place. e.g. "title" only in the "dmg", not in the root.
`
  })
}

const DEFAULT_APP_DIR_NAMES = ["app", "www"]

/** @internal */
export async function computeDefaultAppDirectory(projectDir: string, userAppDir: string | null | undefined): Promise<string> {
  if (userAppDir != null) {
    const absolutePath = path.resolve(projectDir, userAppDir)
    const stat = await statOrNull(absolutePath)
    if (stat == null) {
      throw new Error(`Application directory ${userAppDir} doesn't exists`)
    }
    else if (!stat.isDirectory()) {
      throw new Error(`Application directory ${userAppDir} is not a directory`)
    }
    else if (projectDir === absolutePath) {
      warn(`Specified application directory "${userAppDir}" equals to project dir — superfluous or wrong configuration`)
    }
    return absolutePath
  }

  for (const dir of DEFAULT_APP_DIR_NAMES) {
    const absolutePath = path.join(projectDir, dir)
    const packageJson = path.join(absolutePath, "package.json")
    const stat = await statOrNull(packageJson)
    if (stat != null && stat.isFile()) {
      return absolutePath
    }
  }
  return projectDir
}