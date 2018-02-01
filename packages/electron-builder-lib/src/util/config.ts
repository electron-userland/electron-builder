import { asArray, DebugLogger, InvalidConfigurationError, log, deepAssign } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { readJson } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { getConfig as _getConfig, loadParentConfig, orNullIfFileNotExist, ReadConfigRequest, validateConfig as _validateConfig } from "read-config-file"
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

export async function getConfig(projectDir: string, configPath: string | null, configFromOptions: Configuration | null | undefined, packageMetadata: Lazy<{ [key: string]: any } | null> = new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))): Promise<Configuration> {
  const configRequest: ReadConfigRequest = {packageKey: "build", configFilename: "electron-builder", projectDir, packageMetadata}
  const configAndEffectiveFile = await _getConfig<Configuration>(configRequest, configPath)
  const config = configAndEffectiveFile == null ? {} : configAndEffectiveFile.result
  if (configFromOptions != null) {
    mergePublish(config, configFromOptions)
  }

  if (configAndEffectiveFile != null) {
    log.info({file: configAndEffectiveFile.configFile == null ? 'package.json ("build" field)' : configAndEffectiveFile.configFile}, "loaded configuration")
  }

  let extendsSpec = config.extends
  if (extendsSpec == null && extendsSpec !== null) {
    const metadata = await packageMetadata.value || {}
    const devDependencies = metadata.devDependencies
    const dependencies = metadata.dependencies
    if ((dependencies != null && "react-scripts" in dependencies) || (devDependencies != null && "react-scripts" in devDependencies)) {
      extendsSpec = "react-cra"
      config.extends = extendsSpec
    }
    else if (devDependencies != null && "electron-webpack" in devDependencies) {
      extendsSpec = "electron-webpack/electron-builder.yml"
      config.extends = extendsSpec
    }
  }

  if (extendsSpec == null) {
    return deepAssign(getDefaultConfig(), config)
  }

  let parentConfig: Configuration | null
  if (extendsSpec === "react-cra") {
    parentConfig = await reactCra(projectDir)
    log.info({preset: extendsSpec}, "loaded parent configuration")
  }
  else {
    const parentConfigAndEffectiveFile = await loadParentConfig<Configuration>(configRequest, extendsSpec)
    log.info({file: parentConfigAndEffectiveFile.configFile}, "loaded parent configuration")
    parentConfig = parentConfigAndEffectiveFile.result
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

  return deepAssign(getDefaultConfig(), parentConfig, config)
}

function getDefaultConfig(): Configuration {
  return {
    directories: {
      output: "dist",
      buildResources: "build",
    },
  }
}

const schemeDataPromise = new Lazy(() => readJson(path.join(__dirname, "..", "..", "scheme.json")))

export async function validateConfig(config: Configuration, debugLogger: DebugLogger) {
  const extraMetadata = config.extraMetadata
  if (extraMetadata != null) {
    if (extraMetadata.build != null) {
      throw new InvalidConfigurationError(`--em.build is deprecated, please specify as -c"`)
    }
    if (extraMetadata.directories != null) {
      throw new InvalidConfigurationError(`--em.directories is deprecated, please specify as -c.directories"`)
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

export async function computeDefaultAppDirectory(projectDir: string, userAppDir: string | null | undefined): Promise<string> {
  if (userAppDir != null) {
    const absolutePath = path.resolve(projectDir, userAppDir)
    const stat = await statOrNull(absolutePath)
    if (stat == null) {
      throw new InvalidConfigurationError(`Application directory ${userAppDir} doesn't exists`)
    }
    else if (!stat.isDirectory()) {
      throw new InvalidConfigurationError(`Application directory ${userAppDir} is not a directory`)
    }
    else if (projectDir === absolutePath) {
      log.warn({appDirectory: userAppDir}, `Specified application directory equals to project dir — superfluous or wrong configuration`)
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