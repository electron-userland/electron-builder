import Ajv, { AdditionalPropertiesParams, ErrorObject, TypeParams } from "ajv"
import { asArray, debug, log, warn } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { readJson } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { getConfig as _getConfig, loadParentConfig, orNullIfFileNotExist, ReadConfigRequest } from "read-config-file"
import { deepAssign } from "read-config-file/out/deepAssign"
import { Config } from "../metadata"
import { reactCra } from "../presets/rectCra"

/** @internal */
export async function getConfig(projectDir: string, configPath: string | null, configFromOptions: Config | null | undefined, packageMetadata: Lazy<{ [key: string]: any } | null> = new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))): Promise<Config> {
  const configRequest: ReadConfigRequest = {packageKey: "build", configFilename: "electron-builder", projectDir, packageMetadata, log}
  const config = await _getConfig<Config>(configRequest, configPath, configFromOptions)

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

  let parentConfig: Config | null
  if (extendsSpec === "react-cra") {
    parentConfig = await reactCra(projectDir)
  }
  else {
    parentConfig = await loadParentConfig<Config>(configRequest, extendsSpec)
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

const validatorPromise = new Lazy(async () => {
  const ajv = new Ajv({allErrors: true, coerceTypes: true})
  ajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-04.json"))
  require("ajv-keywords")(ajv, ["typeof"])
  const schema = await readJson(path.join(__dirname, "..", "..", "scheme.json"))
  return ajv.compile(schema)
})

/** @internal */
export async function validateConfig(config: Config) {
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

  const validator = await validatorPromise.value
  if (!validator(config)) {
    debug(JSON.stringify(validator.errors, null, 2))
    throw new Error(`Configuration is invalid:
${JSON.stringify(normaliseErrorMessages(validator.errors!), null, 2)}

How to fix:
  1. Open https://github.com/electron-userland/electron-builder/wiki/Options
  2. Search the option name on the page.
    * Not found? The option was deprecated or not exists (check spelling).
    * Found? Check that the option in the appropriate place. e.g. "title" only in the "dmg", not in the root.
`)
  }
}

function normaliseErrorMessages(errors: Array<ErrorObject>) {
  const result: any = Object.create(null)
  for (const e of errors) {
    if (e.keyword === "type" && (e.params as TypeParams).type === "null") {
      // ignore - no sense to report that type accepts null
      continue
    }

    const dataPath = e.dataPath.length === 0 ? [] : e.dataPath.substring(1).split(".")
    if (e.keyword === "additionalProperties") {
      dataPath.push((e.params as AdditionalPropertiesParams).additionalProperty)
    }

    let o = result
    let lastName: string | null = null
    for (const p of dataPath) {
      if (p === dataPath[dataPath.length - 1]) {
        lastName = p
        break
      }
      else {
        if (o[p] == null) {
          o[p] = Object.create(null)
        }
        else if (typeof o[p] === "string") {
          o[p] = [o[p]]
        }
        o = o[p]
      }
    }

    if (lastName == null) {
      lastName = "unknown"
    }

    let message = e.message!.toUpperCase()[0] + e.message!.substring(1)
    switch (e.keyword) {
      case "additionalProperties":
        message = "Unknown option"
        break

      case "required":
        message = "Required option"
        break

      case "anyOf":
        message = "Invalid option object"
        break
    }

    if (o[lastName] != null && !Array.isArray(o[lastName])) {
      o[lastName] = [o[lastName]]
    }

    if (Array.isArray(o[lastName])) {
      o[lastName].push(message)
    }
    else {
      o[lastName] = message
    }
  }
  return result
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